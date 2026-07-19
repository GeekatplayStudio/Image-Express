'use client';

import { useEffect, useRef, useState } from 'react';
import {
    COLLIE_MASCOT_DATA_URI,
    COLLIE_MASCOT_FRAME_HEIGHT,
    COLLIE_MASCOT_FRAME_WIDTH,
} from './collie-mascot-data';

/**
 * The setup wizard's border collie assistant: a little sprite that trots along
 * the bottom of the wizard, sits down when you're reading, and waves when a
 * step goes well — plus a speech bubble with a step-appropriate quip.
 * Fully self-contained (sprite is an inline data URI), works in every install
 * mode, and respects prefers-reduced-motion.
 */

const ANIMS: Record<string, { frames: number[]; fps: number }> = {
    run: { frames: [0, 1], fps: 8 },
    sit: { frames: [2, 2, 2, 3], fps: 3 },
    wave: { frames: [4, 5], fps: 4 },
};

export type CollieMood = 'run' | 'sit' | 'wave';

const STEP_TIPS: Record<string, string> = {
    welcome: 'Woof! New flock member! I’ll herd you through setup.',
    storage: 'Local, hybrid, or cloud — I bury my bones locally, personally.',
    drive: 'Cloud connections are optional. The cloud is just a big sheep anyway.',
    api: 'AI keys are optional too — you can add them any time later.',
    runtime: 'Sit. Stay. I’ll fetch Ollama and ComfyUI for you — one click, all silent.',
    support: 'Psst — the theme packs fund my kibble. No pressure. (Some pressure.)',
    finish: 'Good human! Setup complete. Now go make something worth herding.',
};

export default function SetupCollieMascot({ stepId, mood }: { stepId: string; mood?: CollieMood }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Tip re-shows whenever the step changes; the user can dismiss it early,
    // and it auto-hides after a few seconds.
    const [dismissedFor, setDismissedFor] = useState<string | null>(null);
    const [expiredFor, setExpiredFor] = useState<string | null>(null);
    const tipVisible = dismissedFor !== stepId && expiredFor !== stepId;
    const scale = 2;

    useEffect(() => {
        const timer = window.setTimeout(() => setExpiredFor(stepId), 9000);
        return () => window.clearTimeout(timer);
    }, [stepId]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const image = new Image();
        image.src = COLLIE_MASCOT_DATA_URI;

        const width = canvas.width;
        const spriteW = COLLIE_MASCOT_FRAME_WIDTH * scale;
        const spriteH = COLLIE_MASCOT_FRAME_HEIGHT * scale;
        let disposed = false;
        let frame = 0;
        let time = 0;
        let last = performance.now();
        // Behavior loop: trot back and forth, pause to sit, occasionally wave.
        let behavior: CollieMood = mood ?? 'run';
        let behaviorTime = 0;
        let x = 10;
        let dir = 1;

        const draw = (now: number) => {
            if (disposed) return;
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            time += dt;
            behaviorTime += dt;

            if (!mood) {
                // autonomous mode: run 3-5s, sit 2-3s, wave 2s, repeat
                if (behavior === 'run' && behaviorTime > 3.5) { behavior = Math.random() < 0.5 ? 'sit' : 'wave'; behaviorTime = 0; }
                else if (behavior !== 'run' && behaviorTime > 2.4) { behavior = 'run'; behaviorTime = 0; }
            } else {
                behavior = mood;
            }

            if (behavior === 'run') {
                x += dir * 46 * dt;
                if (x > width - spriteW - 4) dir = -1;
                if (x < 4) dir = 1;
            }

            const anim = ANIMS[behavior];
            const frameIndex = anim.frames[Math.floor(time * anim.fps) % anim.frames.length];
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (image.complete && image.naturalWidth > 0) {
                ctx.save();
                if (dir < 0 && behavior === 'run') {
                    ctx.translate(x + spriteW, canvas.height - spriteH);
                    ctx.scale(-1, 1);
                } else {
                    ctx.translate(x, canvas.height - spriteH);
                }
                ctx.drawImage(
                    image,
                    frameIndex * COLLIE_MASCOT_FRAME_WIDTH, 0,
                    COLLIE_MASCOT_FRAME_WIDTH, COLLIE_MASCOT_FRAME_HEIGHT,
                    0, 0, spriteW, spriteH
                );
                ctx.restore();
            }
            if (!reducedMotion) frame = window.requestAnimationFrame(draw);
        };

        image.onload = () => {
            last = performance.now();
            draw(last + 16);
        };

        return () => {
            disposed = true;
            window.cancelAnimationFrame(frame);
        };
    }, [mood, stepId]);

    const tip = STEP_TIPS[stepId] || STEP_TIPS.welcome;

    return (
        <div className="relative flex items-end gap-2 select-none" aria-hidden="true">
            <canvas
                ref={canvasRef}
                width={180}
                height={COLLIE_MASCOT_FRAME_HEIGHT * 2 + 4}
                className="shrink-0"
                style={{ imageRendering: 'pixelated' }}
            />
            {tipVisible && (
                <button
                    type="button"
                    onClick={() => setDismissedFor(stepId)}
                    className="mb-2 max-w-55 rounded-xl rounded-bl-sm border border-border bg-popover px-3 py-1.5 text-left text-[11px] text-muted-foreground shadow-md"
                >
                    {tip}
                </button>
            )}
        </div>
    );
}
