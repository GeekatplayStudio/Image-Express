'use client';
// Particle effects for the album stack view: a sparkling dust burst when a
// page or album is created/duplicated, and an explosion when one is deleted.
//
// CSS animations, deliberately not SMIL: SMIL `begin` offsets are measured
// from the SVG document's load time, so an <animate> inserted minutes into a
// session mounts already past its end and renders frozen-invisible. CSS
// animations start when the element enters the DOM, which is exactly the
// semantics a spawned burst needs.
//
// Particle parameters are frozen at creation (useMemo per fx.id) so parent
// re-renders — camera drags happen every frame — never reshuffle a burst.

import React, { useMemo } from 'react';

export type StackFx = {
    id: number;
    kind: 'sparkle' | 'explosion';
    x: number;
    y: number;
};

export const SPARKLE_DURATION_MS = 2100;
export const EXPLOSION_DURATION_MS = 1400;

const SPARKLE_COLORS = ['#ffe9a8', '#fff7e0', '#7FDCE8', '#f6c86a', '#ffffff'];
const EXPLOSION_COLORS = ['#ff9d5c', '#ffce7a', '#ff6b4a', '#fff3d6', '#ffb36b'];

type Particle = {
    dx: number;
    dy: number;
    r: number;
    color: string;
    delay: number;
    dur: number;
    spin: number;
};

const makeParticles = (count: number, colors: string[], reach: number, upBias: number): Particle[] => (
    Array.from({ length: count }, () => {
        const angle = Math.random() * Math.PI * 2;
        const dist = reach * (0.35 + Math.random() * 0.65);
        return {
            dx: Math.cos(angle) * dist,
            dy: Math.sin(angle) * dist - upBias * Math.random(),
            r: 1.6 + Math.random() * 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            delay: Math.random() * 0.15,
            dur: 0.9 + Math.random() * 0.9,
            spin: Math.random() < 0.5 ? 1 : -1,
        };
    })
);

/** Four-point star path centred on the origin, the classic "sparkle" glyph. */
const starPath = (r: number): string => {
    const w = r * 0.36;
    return `M 0 ${-r} Q ${w} ${-w} ${r} 0 Q ${w} ${w} 0 ${r} Q ${-w} ${w} ${-r} 0 Q ${-w} ${-w} 0 ${-r} Z`;
};

/**
 * Shared keyframes. Rendered once inside the parent <svg>; `transform-box:
 * fill-box` makes scale/rotate resolve around each particle, not the SVG
 * origin. Custom properties (--dx/--dy) carry each particle's own vector.
 */
export function StackFxStyles() {
    return (
        <style>{`
            .csv-fx-p {
                opacity: 0;
                transform-box: fill-box;
                transform-origin: center;
                animation: csvFxFly var(--dur) cubic-bezier(0.12, 0.8, 0.25, 1) var(--delay) forwards;
            }
            @keyframes csvFxFly {
                0%   { transform: translate(0px, 0px); opacity: 0; }
                8%   { opacity: 1; }
                62%  { opacity: 1; }
                100% { transform: translate(var(--dx), var(--dy)); opacity: 0; }
            }
            .csv-fx-twinkle {
                transform-box: fill-box;
                transform-origin: center;
                animation: csvFxTwinkle 0.42s ease-in-out infinite alternate;
            }
            @keyframes csvFxTwinkle {
                from { transform: scale(0.55); }
                to   { transform: scale(1.55); }
            }
            .csv-fx-star {
                transform-box: fill-box;
                transform-origin: center;
                animation: csvFxSpin var(--dur) linear var(--delay) forwards;
            }
            @keyframes csvFxSpin {
                from { transform: rotate(0deg) scale(0.3); }
                to   { transform: rotate(var(--spin)) scale(1.15); }
            }
            .csv-fx-bloom {
                transform-box: fill-box;
                transform-origin: center;
                animation: csvFxBloom 0.9s cubic-bezier(0.16, 0.84, 0.3, 1) forwards;
            }
            @keyframes csvFxBloom {
                0%   { transform: scale(0.15); opacity: 0.55; }
                100% { transform: scale(1);    opacity: 0; }
            }
            .csv-fx-flash {
                transform-box: fill-box;
                transform-origin: center;
                animation: csvFxFlash 0.32s ease-out forwards;
            }
            @keyframes csvFxFlash {
                0%   { transform: scale(0.1); opacity: 1; }
                100% { transform: scale(1);   opacity: 0; }
            }
            .csv-fx-ring {
                transform-box: fill-box;
                transform-origin: center;
                animation: csvFxRing 0.7s cubic-bezier(0.1, 0.8, 0.2, 1) forwards;
            }
            @keyframes csvFxRing {
                0%   { transform: scale(0.08); opacity: 0.85; }
                100% { transform: scale(1);    opacity: 0; }
            }
            .csv-fx-debris {
                opacity: 0;
                transform-box: fill-box;
                transform-origin: center;
                animation: csvFxDebris var(--dur) cubic-bezier(0.05, 0.7, 0.3, 1) var(--delay) forwards;
            }
            @keyframes csvFxDebris {
                0%   { transform: translate(0px, 0px) scale(1); opacity: 0; }
                5%   { opacity: 1; }
                55%  { opacity: 1; }
                100% { transform: translate(var(--dx), var(--dy)) scale(0.15); opacity: 0; }
            }
        `}</style>
    );
}

const vecStyle = (p: Particle, extra?: Record<string, string>): React.CSSProperties => ({
    ['--dx' as string]: `${p.dx}px`,
    ['--dy' as string]: `${p.dy}px`,
    ['--dur' as string]: `${p.dur}s`,
    ['--delay' as string]: `${p.delay}s`,
    ...extra,
});

function SparkleBurst({ fx }: { fx: StackFx }) {
    const dust = useMemo(() => makeParticles(34, SPARKLE_COLORS, 150, 70), []);
    const stars = useMemo(() => makeParticles(9, SPARKLE_COLORS, 100, 50), []);
    return (
        <g transform={`translate(${fx.x} ${fx.y})`} pointerEvents="none" data-testid="stack-fx-sparkle">
            <circle r={80} fill="url(#csv-fx-bloom-grad)" className="csv-fx-bloom" />
            {dust.map((p, i) => (
                <g key={i} className="csv-fx-p" style={vecStyle(p)}>
                    <circle r={p.r} fill={p.color} className="csv-fx-twinkle" />
                </g>
            ))}
            {stars.map((p, i) => (
                <g key={`s${i}`} className="csv-fx-p" style={vecStyle({ ...p, dur: p.dur + 0.25 })}>
                    <path
                        d={starPath(p.r * 3.4)}
                        fill={p.color}
                        filter="url(#csv-glow)"
                        className="csv-fx-star"
                        style={vecStyle(p, { ['--spin' as string]: `${p.spin * 200}deg` })}
                    />
                </g>
            ))}
        </g>
    );
}

function ExplosionBurst({ fx }: { fx: StackFx }) {
    const debris = useMemo(() => makeParticles(40, EXPLOSION_COLORS, 240, -40), []);
    return (
        <g transform={`translate(${fx.x} ${fx.y})`} pointerEvents="none" data-testid="stack-fx-explosion">
            <circle r={52} fill="#fff7e0" className="csv-fx-flash" />
            <circle r={160} fill="none" stroke="#ffb36b" strokeWidth={3} className="csv-fx-ring" />
            {debris.map((p, i) => (
                <g key={i} className="csv-fx-debris" style={vecStyle({ ...p, dur: p.dur * 0.8 })}>
                    <circle r={p.r * 1.5} fill={p.color} />
                </g>
            ))}
        </g>
    );
}

/** Renders the active bursts; the parent owns the fx list and its expiry. */
export default function StackEffects({ effects }: { effects: StackFx[] }) {
    return (
        <>
            <defs>
                <radialGradient id="csv-fx-bloom-grad">
                    <stop offset="0%" stopColor="#ffe9a8" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#ffe9a8" stopOpacity="0" />
                </radialGradient>
            </defs>
            <StackFxStyles />
            {effects.map((fx) => (
                fx.kind === 'sparkle' ? <SparkleBurst key={fx.id} fx={fx} /> : <ExplosionBurst key={fx.id} fx={fx} />
            ))}
        </>
    );
}
