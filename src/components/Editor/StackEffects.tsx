'use client';
// Particle effects for the album stack view: pixie dust when a page or album
// is created/duplicated, and an explosion when one is deleted.
//
// The pixie dust is built like the Disney opening flourish: a glowing wisp
// sweeps a spiral around the point, and tiny dust motes are shed along its
// path — each one pops in where the wisp just passed, twinkles, then settles
// downward and fades. The swirl reading comes from the *spawn schedule*: mote
// delays follow the wisp's progress, so the trail chases it around the loop.
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

/** Wisp sweep time; motes keep twinkling/settling well after it finishes. */
const SWEEP_S = 1.3;
export const SPARKLE_DURATION_MS = 3000;
export const EXPLOSION_DURATION_MS = 1400;

// Champagne golds with the occasional cool fleck, like real pixie dust.
const DUST_COLORS = ['#ffe9a8', '#fff3c9', '#ffd76e', '#fff7e0', '#ffffff', '#bfeef2'];
const EXPLOSION_COLORS = ['#ff9d5c', '#ffce7a', '#ff6b4a', '#fff3d6', '#ffb36b'];
// Sparks run hotter than the debris they fly ahead of — white and yellow core
// shades rather than the deeper oranges.
const SPARK_COLORS = ['#fff8e2', '#ffe9a8', '#ffd166', '#ffffff', '#ffc14d'];

/**
 * The wisp's flight: an expanding spiral, squashed vertically so it reads as
 * a loop drawn in the scene's perspective, rising gently as it goes.
 */
const TURNS = 2.1;
const spiralPoint = (t: number): { x: number; y: number } => {
    const angle = -Math.PI / 2 + t * TURNS * Math.PI * 2;
    const radius = 16 + t * 92;
    return {
        x: Math.cos(angle) * radius * 1.2,
        y: Math.sin(angle) * radius * 0.55 - t * 34,
    };
};

const spiralPathD = (): string => {
    const steps = 64;
    const pts = Array.from({ length: steps + 1 }, (_, i) => spiralPoint(i / steps));
    return `M ${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')}`;
};

type Mote = {
    sx: number;   // spawn point on the spiral (with jitter)
    sy: number;
    dx: number;   // settle drift — mostly downward, dust falling
    dy: number;
    r: number;
    color: string;
    delay: number; // when the wisp passes this spot
    dur: number;
    phase: number; // twinkle offset so motes don't pulse in unison
};

const makeDust = (count: number): Mote[] => (
    Array.from({ length: count }, (_, i) => {
        const t = i / (count - 1);
        const p = spiralPoint(t);
        return {
            sx: p.x + (Math.random() - 0.5) * 10,
            sy: p.y + (Math.random() - 0.5) * 10,
            dx: (Math.random() - 0.5) * 16,
            dy: 24 + Math.random() * 42,
            r: 1.1 + Math.random() * 1.7,
            color: DUST_COLORS[Math.floor(Math.random() * DUST_COLORS.length)],
            delay: t * SWEEP_S + Math.random() * 0.05,
            dur: 1.0 + Math.random() * 0.9,
            phase: Math.random() * 0.4,
        };
    })
);

/** Four-point star path centred on the origin, the classic "sparkle" glyph. */
const starPath = (r: number): string => {
    const w = r * 0.36;
    return `M 0 ${-r} Q ${w} ${-w} ${r} 0 Q ${w} ${w} 0 ${r} Q ${-w} ${w} ${-r} 0 Q ${-w} ${-w} 0 ${-r} Z`;
};

type Debris = { dx: number; dy: number; r: number; color: string; delay: number; dur: number };

const makeDebris = (count: number, reach: number): Debris[] => (
    Array.from({ length: count }, () => {
        const angle = Math.random() * Math.PI * 2;
        const dist = reach * (0.35 + Math.random() * 0.65);
        return {
            dx: Math.cos(angle) * dist,
            dy: Math.sin(angle) * dist + 30,
            r: 1.6 + Math.random() * 3,
            color: EXPLOSION_COLORS[Math.floor(Math.random() * EXPLOSION_COLORS.length)],
            delay: Math.random() * 0.06,
            dur: 0.7 + Math.random() * 0.5,
        };
    })
);

/**
 * Sparks, as distinct from debris: a spark is a hot streak that flies fast,
 * stretches along its own direction of travel, and burns out. Debris is
 * round, slower, and falls. Having both is what makes the burst read as
 * something igniting rather than a puff of dots.
 */
type Spark = {
    angle: number;  // degrees, so the streak can be rotated to face its travel
    dist: number;
    length: number;
    width: number;
    color: string;
    delay: number;
    dur: number;
};

const makeSparks = (count: number, reach: number): Spark[] => (
    Array.from({ length: count }, () => {
        const angle = Math.random() * Math.PI * 2;
        return {
            angle: (angle * 180) / Math.PI,
            // Sparks outrun the debris, so the leading edge of the burst is hot.
            dist: reach * (0.55 + Math.random() * 0.8),
            length: 14 + Math.random() * 30,
            width: 1.1 + Math.random() * 1.6,
            color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)],
            delay: Math.random() * 0.05,
            dur: 0.45 + Math.random() * 0.4,
        };
    })
);

/**
 * Shared keyframes. Rendered once inside the parent <svg>; `transform-box:
 * fill-box` makes scale/rotate resolve around each particle, not the SVG
 * origin. Custom properties carry each particle's own vectors.
 */
export function StackFxStyles() {
    return (
        <style>{`
            .csv-fx-mote {
                opacity: 0;
                animation: csvFxMote var(--dur) ease-out var(--delay) forwards;
            }
            @keyframes csvFxMote {
                0%   { transform: translate(var(--sx), var(--sy)); opacity: 0; }
                6%   { opacity: 1; }
                55%  { opacity: 0.95; }
                100% { transform: translate(calc(var(--sx) + var(--dx)), calc(var(--sy) + var(--dy))); opacity: 0; }
            }
            .csv-fx-twinkle {
                transform-box: fill-box;
                transform-origin: center;
                animation: csvFxTwinkle 0.34s ease-in-out var(--phase) infinite alternate;
            }
            @keyframes csvFxTwinkle {
                from { transform: scale(0.4); }
                to   { transform: scale(1.9); }
            }
            .csv-fx-wisp {
                offset-path: path(var(--spiral));
                offset-rotate: 0deg;
                animation: csvFxWisp ${SWEEP_S}s cubic-bezier(0.35, 0, 0.3, 1) forwards;
            }
            @keyframes csvFxWisp {
                0%   { offset-distance: 0%; opacity: 0; }
                5%   { opacity: 1; }
                88%  { opacity: 1; }
                100% { offset-distance: 100%; opacity: 0; }
            }
            .csv-fx-wisp-pulse {
                transform-box: fill-box;
                transform-origin: center;
                animation: csvFxTwinkle 0.22s ease-in-out infinite alternate;
            }
            .csv-fx-starlet {
                opacity: 0;
                transform-box: fill-box;
                transform-origin: center;
                animation: csvFxStarlet 0.9s ease-out var(--delay) forwards;
            }
            @keyframes csvFxStarlet {
                0%   { transform: translate(var(--sx), var(--sy)) scale(0.2) rotate(0deg); opacity: 0; }
                15%  { opacity: 1; }
                100% { transform: translate(var(--sx), var(--sy)) scale(1.1) rotate(140deg); opacity: 0; }
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
                animation: csvFxDebris var(--dur) cubic-bezier(0.05, 0.7, 0.3, 1) var(--delay) forwards;
            }
            @keyframes csvFxDebris {
                0%   { transform: translate(0px, 0px) scale(1); opacity: 0; }
                5%   { opacity: 1; }
                55%  { opacity: 1; }
                100% { transform: translate(var(--dx), var(--dy)) scale(0.15); opacity: 0; }
            }
            /*
             * A spark is drawn as a horizontal streak on the +x axis and the
             * whole group is rotated to its flight angle, so travel and
             * stretch always agree. It shortens as it burns out.
             */
            .csv-fx-spark {
                opacity: 0;
                animation: csvFxSpark var(--dur) cubic-bezier(0.02, 0.75, 0.25, 1) var(--delay) forwards;
            }
            @keyframes csvFxSpark {
                0%   { transform: rotate(var(--angle)) translateX(0px) scaleX(0.3); opacity: 0; }
                8%   { opacity: 1; }
                60%  { opacity: 1; }
                100% { transform: rotate(var(--angle)) translateX(var(--dist)) scaleX(1.35); opacity: 0; }
            }
        `}</style>
    );
}

function PixieDust({ fx }: { fx: StackFx }) {
    const dust = useMemo(() => makeDust(80), []);
    // A few tiny stars flare where the trail has just passed.
    const starlets = useMemo(() => makeDust(10).map((m) => ({ ...m, delay: m.delay + 0.1 })), []);
    const spiral = useMemo(() => spiralPathD(), []);
    return (
        <g transform={`translate(${fx.x} ${fx.y})`} pointerEvents="none" data-testid="stack-fx-sparkle">
            {/* The wisp: a glowing comet head flying the spiral. */}
            <g className="csv-fx-wisp" style={{ ['--spiral' as string]: `"${spiral}"` }}>
                <circle r={11} fill="#ffe9a8" opacity={0.3} filter="url(#csv-glow)" />
                <circle r={4} fill="#fff7e0" filter="url(#csv-glow)" className="csv-fx-wisp-pulse" />
            </g>
            {dust.map((m, i) => (
                <g
                    key={i}
                    className="csv-fx-mote"
                    style={{
                        ['--sx' as string]: `${m.sx}px`,
                        ['--sy' as string]: `${m.sy}px`,
                        ['--dx' as string]: `${m.dx}px`,
                        ['--dy' as string]: `${m.dy}px`,
                        ['--dur' as string]: `${m.dur}s`,
                        ['--delay' as string]: `${m.delay}s`,
                    }}
                >
                    <circle r={m.r} fill={m.color} className="csv-fx-twinkle" style={{ ['--phase' as string]: `${m.phase}s` }} />
                </g>
            ))}
            {starlets.map((m, i) => (
                <path
                    key={`s${i}`}
                    d={starPath(4.5 + m.r * 2.2)}
                    fill={m.color}
                    filter="url(#csv-glow)"
                    className="csv-fx-starlet"
                    style={{
                        ['--sx' as string]: `${m.sx}px`,
                        ['--sy' as string]: `${m.sy}px`,
                        ['--delay' as string]: `${m.delay}s`,
                    }}
                />
            ))}
        </g>
    );
}

function ExplosionBurst({ fx }: { fx: StackFx }) {
    const debris = useMemo(() => makeDebris(40, 240), []);
    const sparks = useMemo(() => makeSparks(34, 260), []);
    return (
        <g transform={`translate(${fx.x} ${fx.y})`} pointerEvents="none" data-testid="stack-fx-explosion">
            <circle r={52} fill="#fff7e0" className="csv-fx-flash" />
            <circle r={160} fill="none" stroke="#ffb36b" strokeWidth={3} className="csv-fx-ring" />
            {/* Sparks first, so the slower debris draws over their tails. */}
            {sparks.map((s, i) => (
                <g
                    key={`spark-${i}`}
                    className="csv-fx-spark"
                    style={{
                        ['--angle' as string]: `${s.angle}deg`,
                        ['--dist' as string]: `${s.dist}px`,
                        ['--dur' as string]: `${s.dur}s`,
                        ['--delay' as string]: `${s.delay}s`,
                    }}
                >
                    <rect
                        x={-s.length}
                        y={-s.width / 2}
                        width={s.length}
                        height={s.width}
                        rx={s.width / 2}
                        fill={s.color}
                        filter="url(#csv-glow)"
                    />
                </g>
            ))}
            {debris.map((p, i) => (
                <g
                    key={i}
                    className="csv-fx-debris"
                    style={{
                        ['--dx' as string]: `${p.dx}px`,
                        ['--dy' as string]: `${p.dy}px`,
                        ['--dur' as string]: `${p.dur}s`,
                        ['--delay' as string]: `${p.delay}s`,
                    }}
                >
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
            <StackFxStyles />
            {effects.map((fx) => (
                fx.kind === 'sparkle' ? <PixieDust key={fx.id} fx={fx} /> : <ExplosionBurst key={fx.id} fx={fx} />
            ))}
        </>
    );
}
