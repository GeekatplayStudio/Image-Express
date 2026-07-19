'use client';

import { useEffect, useRef, useState } from 'react';
import {
    UI_THEME_CHANGED_EVENT,
    type InstalledUiTheme,
    type SpriteActorRef,
    type SpriteScene,
} from '@/lib/ui-themes-shared';
import { listUiThemes, loadStoredUiTheme } from '@/lib/ui-themes';

/**
 * Sprite Theater — the "extended themes" overlay engine. Theme packs ship
 * sprite sheets (png), declarative scene configs, AND the scene behavior
 * modules themselves (scenes/<type>.mjs, plain ES modules). The app only
 * provides this loader/runtime: a full-screen pass-through canvas, sheet
 * loading, actor drawing, and scene scheduling. The per-scene choreography
 * lives entirely inside the theme pack and is dynamic-imported on demand,
 * so no animation code is prebuilt into the app.
 *
 * Deliberately non-distracting: one scene at a time, long random gaps between
 * scenes, everything pauses in hidden tabs, and prefers-reduced-motion disables
 * the theater entirely.
 *
 * Dev/testing hook: dispatch
 *   window.dispatchEvent(new CustomEvent('image-express:sprite-theater-demo', { detail: { scene: 0 } }))
 * to force a scene immediately (uses a timer loop so it also runs in hidden tabs).
 */

export const SPRITE_THEATER_DEMO_EVENT = 'image-express:sprite-theater-demo';

/** User-tunable scene frequency: 0 = "Occasionally" (pack defaults) … 1 = "Annoying". */
export const SPRITE_FREQUENCY_STORAGE_KEY = 'image-express-sprite-frequency';
export const SPRITE_FREQUENCY_CHANGED_EVENT = 'image-express:sprite-frequency-changed';

export const loadSpriteFrequency = (): number => {
    if (typeof window === 'undefined') return 0;
    const raw = Number(window.localStorage.getItem(SPRITE_FREQUENCY_STORAGE_KEY));
    return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
};

export const saveSpriteFrequency = (value: number) => {
    window.localStorage.setItem(SPRITE_FREQUENCY_STORAGE_KEY, String(Math.min(1, Math.max(0, value))));
    window.dispatchEvent(new Event(SPRITE_FREQUENCY_CHANGED_EVENT));
};

/** Delay multiplier: 2.5x at "Occasionally" (rarer than the pack's own defaults)
 *  shrinking to ~1/6x at "Annoying". */
const frequencyDelayFactor = (value: number) => 2.5 / (1 + 13 * value);

type LoadedSheet = {
    image: HTMLImageElement;
    frameWidth: number;
    frameHeight: number;
    animations: Record<string, { frames: number[]; fps: number }>;
};

type Actor = {
    sheet: string;
    anim: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    flip: boolean;
    animTime: number;
    visible: boolean;
};

type SceneRuntime = {
    actors: Actor[];
    /** Advance the scene; return false when finished. */
    update: (dt: number, width: number, height: number) => boolean;
    /** Optional extra drawing on top of the actors (confetti, musical notes). */
    overlay?: () => void;
};

/** Environment handed to a theme pack's scene module. */
type SceneEnv = {
    width: number;
    height: number;
    scale: number;
    rand: (min: number, max: number) => number;
    makeActor: (ref: SpriteActorRef, x: number, y: number, vx: number, flip: boolean) => Actor;
    actorSize: (actor: Actor) => { w: number; h: number };
    mouse: { x: number; y: number };
    /** performance.now() timestamp of the last mouse move. */
    lastMouseMove: () => number;
    ctx2d: CanvasRenderingContext2D;
};

type SceneModule = { default: (cfg: SpriteScene, env: SceneEnv) => SceneRuntime };

const rand = (min: number, max: number) => min + Math.random() * (max - min);

export default function SpriteTheater() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [theme, setTheme] = useState<InstalledUiTheme | null>(null);
    // Slider only renders after the theme resolves client-side, so reading
    // localStorage in the initializer can't cause a hydration mismatch.
    const [frequency, setFrequency] = useState(() => loadSpriteFrequency());

    // Resolve the active theme (and re-resolve when the user switches themes).
    useEffect(() => {
        let cancelled = false;
        const resolve = async () => {
            const storedId = loadStoredUiTheme().id;
            try {
                const themes = await listUiThemes();
                if (!cancelled) setTheme(themes.find((t) => t.id === storedId) || null);
            } catch {
                if (!cancelled) setTheme(null);
            }
        };
        void resolve();
        const onChange = () => void resolve();
        window.addEventListener(UI_THEME_CHANGED_EVENT, onChange);
        return () => {
            cancelled = true;
            window.removeEventListener(UI_THEME_CHANGED_EVENT, onChange);
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        const config = theme?.spriteTheater;
        if (!canvas || !theme || !config) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;

        let disposed = false;
        let frame = 0;
        let demoTimer = 0;
        let scheduleTimer = 0;
        let scene: SceneRuntime | null = null;
        let lastTick = performance.now();
        let lastMouseMove = performance.now();
        const mouse = { x: -9999, y: -9999 };
        const sheets = new Map<string, LoadedSheet>();
        // Scene behavior modules shipped with the theme pack, keyed by scene type.
        const sceneModules = new Map<string, SceneModule>();

        const resize = () => {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
            ctx.imageSmoothingEnabled = false;
        };
        resize();

        const onResize = () => resize();
        const onMouse = (event: MouseEvent) => {
            mouse.x = event.clientX;
            mouse.y = event.clientY;
            lastMouseMove = performance.now();
        };
        window.addEventListener('resize', onResize);
        window.addEventListener('mousemove', onMouse, { passive: true });

        // ---- sheet loading -----------------------------------------------------
        const loadSheets = async () => {
            await Promise.all(Object.entries(config.sheets).map(([name, sheet]) => new Promise<void>((done) => {
                const image = new Image();
                image.onload = () => {
                    sheets.set(name, {
                        image,
                        frameWidth: sheet.frameWidth,
                        frameHeight: sheet.frameHeight,
                        animations: sheet.animations,
                    });
                    done();
                };
                image.onerror = () => done();
                image.src = theme.baseUrl + sheet.src;
            })));
        };

        // ---- scene module loading ---------------------------------------------
        // Each scene type maps to scenes/<type>.mjs inside the theme pack. Types
        // whose module fails to load are simply never scheduled.
        const loadSceneModules = async () => {
            const types = [...new Set(config.scenes.map((cfg) => cfg.type))];
            await Promise.all(types.map(async (type) => {
                const url = new URL(`${theme.baseUrl}scenes/${type}.mjs`, window.location.origin).href;
                try {
                    const mod = (await import(/* webpackIgnore: true */ url)) as SceneModule;
                    if (typeof mod?.default === 'function') sceneModules.set(type, mod);
                } catch {
                    console.warn(`[SpriteTheater] Theme "${theme.id}" has no loadable scene module for "${type}" — skipping.`);
                }
            }));
        };

        const scale = config.scale;
        const actorSize = (actor: Actor) => {
            const sheet = sheets.get(actor.sheet);
            return sheet
                ? { w: sheet.frameWidth * scale, h: sheet.frameHeight * scale }
                : { w: 0, h: 0 };
        };

        const makeActor = (ref: SpriteActorRef, x: number, y: number, vx: number, flip: boolean): Actor => ({
            sheet: ref.sheet, anim: ref.anim, x, y, vx, vy: 0, flip, animTime: rand(0, 1), visible: true,
        });

        const buildScene = (cfg: SpriteScene, width: number, height: number): SceneRuntime | null => {
            const mod = sceneModules.get(cfg.type);
            if (!mod) return null;
            const env: SceneEnv = {
                width,
                height,
                scale,
                rand,
                makeActor,
                actorSize,
                mouse,
                lastMouseMove: () => lastMouseMove,
                ctx2d: ctx,
            };
            try {
                const runtime = mod.default(cfg, env);
                return runtime && Array.isArray(runtime.actors) && typeof runtime.update === 'function' ? runtime : null;
            } catch (error) {
                console.warn(`[SpriteTheater] Scene "${cfg.type}" from theme "${theme.id}" crashed on build:`, error);
                return null;
            }
        };

        // ---- scheduling ----------------------------------------------------------
        const pickScene = (): SpriteScene | null => {
            const idleFor = (performance.now() - lastMouseMove) / 1000;
            const eligible = config.scenes.filter((cfg) => {
                if (!sceneModules.has(cfg.type)) return false;
                // Scenes that visit the idle cursor only fire after the mouse has rested.
                const idleSeconds = (cfg as { idleSeconds?: number }).idleSeconds;
                if (cfg.type === 'idleVisit' || idleSeconds !== undefined) return idleFor >= (idleSeconds ?? 25);
                return true;
            });
            if (eligible.length === 0) return null;
            const total = eligible.reduce((sum, cfg) => sum + (cfg.weight ?? 1), 0);
            let roll = Math.random() * total;
            for (const cfg of eligible) {
                roll -= cfg.weight ?? 1;
                if (roll <= 0) return cfg;
            }
            return eligible[eligible.length - 1];
        };

        const scheduleNext = () => {
            window.clearTimeout(scheduleTimer);
            const factor = frequencyDelayFactor(loadSpriteFrequency());
            const delay = Math.max(3, rand(config.minDelaySeconds, config.maxDelaySeconds) * factor) * 1000;
            scheduleTimer = window.setTimeout(() => {
                if (disposed) return;
                if (!scene && !document.hidden) {
                    const cfg = pickScene();
                    if (cfg) startScene(cfg);
                }
                scheduleNext();
            }, delay);
        };
        const onFrequencyChange = () => scheduleNext();
        window.addEventListener(SPRITE_FREQUENCY_CHANGED_EVENT, onFrequencyChange);

        // ---- render loop -----------------------------------------------------------
        const drawActor = (actor: Actor) => {
            const sheet = sheets.get(actor.sheet);
            if (!sheet || !actor.visible) return;
            const anim = sheet.animations[actor.anim];
            if (!anim) return;
            const frameIndex = anim.frames[Math.floor(actor.animTime * anim.fps) % anim.frames.length];
            const sx = frameIndex * sheet.frameWidth;
            const dw = sheet.frameWidth * scale;
            const dh = sheet.frameHeight * scale;
            ctx.save();
            if (actor.flip) {
                ctx.translate(actor.x + dw, actor.y);
                ctx.scale(-1, 1);
            } else {
                ctx.translate(actor.x, actor.y);
            }
            ctx.drawImage(sheet.image, sx, 0, sheet.frameWidth, sheet.frameHeight, 0, 0, dw, dh);
            ctx.restore();
        };

        const tick = (now: number, maxDt = 0.05) => {
            const dt = Math.min(maxDt, (now - lastTick) / 1000);
            lastTick = now;
            if (scene) {
                for (const actor of scene.actors) actor.animTime += dt;
                let alive = false;
                try {
                    alive = scene.update(dt, canvas.width, canvas.height);
                } catch (error) {
                    console.warn('[SpriteTheater] Scene update crashed — ending scene:', error);
                }
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                for (const actor of scene.actors) drawActor(actor);
                scene.overlay?.();
                if (!alive) {
                    scene = null;
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
            }
        };

        const loop = (now: number) => {
            if (disposed) return;
            tick(now);
            if (scene) frame = window.requestAnimationFrame(loop);
        };

        const startScene = (cfg: SpriteScene, forceTimerLoop = false) => {
            if (sheets.size === 0) return;
            scene = buildScene(cfg, canvas.width, canvas.height);
            if (!scene) return;
            lastTick = performance.now();
            tick(lastTick + 16); // draw the first frame immediately
            window.cancelAnimationFrame(frame);
            window.clearInterval(demoTimer);
            if (forceTimerLoop || document.hidden) {
                // Timer loop for the demo hook (rAF doesn't fire in hidden tabs).
                demoTimer = window.setInterval(() => {
                    if (disposed || !scene) {
                        window.clearInterval(demoTimer);
                        return;
                    }
                    // Hidden tabs throttle timers to >=1s, so allow large dt here.
                    tick(performance.now(), 1.5);
                }, 50);
            } else {
                frame = window.requestAnimationFrame(loop);
            }
        };

        const onVisibility = () => {
            if (document.hidden) {
                window.cancelAnimationFrame(frame);
            } else if (scene) {
                lastTick = performance.now();
                frame = window.requestAnimationFrame(loop);
            }
        };
        document.addEventListener('visibilitychange', onVisibility);

        const onDemo = (event: Event) => {
            const detail = (event as CustomEvent).detail as { scene?: number } | undefined;
            const index = detail?.scene ?? 0;
            const cfg = config.scenes[index] || config.scenes[0];
            if (cfg) startScene(cfg, true);
        };
        window.addEventListener(SPRITE_THEATER_DEMO_EVENT, onDemo);

        void Promise.all([loadSheets(), loadSceneModules()]).then(() => {
            if (!disposed) scheduleNext();
        });

        return () => {
            disposed = true;
            window.cancelAnimationFrame(frame);
            window.clearTimeout(scheduleTimer);
            window.clearInterval(demoTimer);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('mousemove', onMouse);
            window.removeEventListener(SPRITE_THEATER_DEMO_EVENT, onDemo);
            window.removeEventListener(SPRITE_FREQUENCY_CHANGED_EVENT, onFrequencyChange);
            document.removeEventListener('visibilitychange', onVisibility);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        };
    }, [theme]);

    if (!theme?.spriteTheater) return null;

    return (
        <>
            <canvas
                ref={canvasRef}
                aria-hidden="true"
                className="pointer-events-none fixed inset-0 h-full w-full"
                style={{ zIndex: 9998, imageRendering: 'pixelated' }}
            />
            {/* Frequency slider: only shown while an animated theme is active. */}
            <div
                className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[9997] flex items-center gap-2 rounded-full border border-border bg-card/85 px-3 py-1.5 shadow-lg backdrop-blur-sm opacity-40 hover:opacity-100 focus-within:opacity-100 transition-opacity"
            >
                <span className="text-[10px] text-muted-foreground whitespace-nowrap select-none">Occasionally</span>
                <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(frequency * 100)}
                    aria-label="Theme animation frequency"
                    onChange={(event) => {
                        const value = Number(event.target.value) / 100;
                        setFrequency(value);
                        saveSpriteFrequency(value);
                    }}
                    className="ui-slider w-28 cursor-pointer"
                />
                <span className="text-[10px] text-muted-foreground whitespace-nowrap select-none">Annoying</span>
            </div>
        </>
    );
}
