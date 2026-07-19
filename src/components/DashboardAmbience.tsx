'use client';

import { useEffect, useRef, useState } from 'react';
import {
    AMBIENCE_CHANGED_EVENT,
    DEFAULT_AMBIENCE_ID,
    type InstalledAmbience,
} from '@/lib/ambience-shared';
import { loadStoredAmbience, syncStoredAmbience } from '@/lib/ambience';

/**
 * Dashboard-only background eye-candy loader. Each ambience pack ships its
 * own effect engine as effect.mjs (a plain ES module:
 * `export default function start(canvas, pack) { ... return { stop() }; }`).
 * The app only resolves the active pack and dynamic-imports its module —
 * no effect code is prebuilt into the app. Packs whose module is missing
 * or crashes simply render nothing.
 */

type EngineState = {
    stop: () => void;
};

type EffectModule = { default: (canvas: HTMLCanvasElement, pack: InstalledAmbience) => EngineState };

const startEngine = async (canvas: HTMLCanvasElement, pack: InstalledAmbience): Promise<EngineState> => {
    const url = new URL(`${pack.baseUrl}effect.mjs`, window.location.origin).href;
    try {
        const mod = (await import(/* webpackIgnore: true */ url)) as EffectModule;
        if (typeof mod?.default !== 'function') throw new Error('effect.mjs has no default export');
        return mod.default(canvas, pack);
    } catch (error) {
        console.warn(`[DashboardAmbience] Pack "${pack.id}" has no loadable effect.mjs — no effect shown.`, error);
        return { stop: () => {} };
    }
};

export default function DashboardAmbience() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [pack, setPack] = useState<InstalledAmbience | null>(null);

    useEffect(() => {
        // syncStoredAmbience resolves to the stored pack if the server is unreachable.
        void syncStoredAmbience().then(setPack);
        const onChange = () => setPack(loadStoredAmbience());
        window.addEventListener(AMBIENCE_CHANGED_EVENT, onChange);
        return () => window.removeEventListener(AMBIENCE_CHANGED_EVENT, onChange);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !pack || pack.id === DEFAULT_AMBIENCE_ID) return;
        let disposed = false;
        let engine: EngineState | null = null;
        void startEngine(canvas, pack).then((started) => {
            if (disposed) started.stop();
            else engine = started;
        });
        return () => {
            disposed = true;
            engine?.stop();
        };
    }, [pack]);

    if (!pack || pack.id === DEFAULT_AMBIENCE_ID) return null;

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 h-full w-full"
            style={{ opacity: pack.options.opacity, zIndex: 0 }}
        />
    );
}
