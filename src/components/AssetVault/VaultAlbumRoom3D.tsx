'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
    VIEW_W,
    VIEW_H,
    project as project3d,
} from '@/lib/multicanvas/stack3dMath';
import { albumGridPose, type VaultAlbum } from '@/features/asset-vault/domain/vaultAlbumTree';
import { useI18n } from '@/providers/I18nProvider';
import { useVaultSceneCamera } from '@/components/AssetVault/useVaultSceneCamera';

type VaultAlbumRoom3DProps = {
    albums: VaultAlbum[];
    activeAlbumId?: string | null;
    resolveLabel: (entry: { label: string; labelKey?: string; labelParams?: Record<string, string | number> }) => string;
    onOpenAlbum: (albumId: string) => void;
    onAlbumContextMenu?: (album: VaultAlbum, event: MouseEvent) => void;
};

const BOX_W = 78;
const BOX_H = 92;
const BOX_D = 58;

const ACCENT: Record<VaultAlbum['accent'], string> = {
    image: 'rgba(125, 211, 192, 0.95)',
    video: 'rgba(147, 197, 253, 0.95)',
    audio: 'rgba(251, 191, 36, 0.95)',
    model: 'rgba(196, 181, 253, 0.95)',
    drive: 'rgba(110, 231, 183, 0.95)',
    local: 'rgba(253, 186, 116, 0.95)',
    date: 'rgba(165, 243, 252, 0.95)',
    tag: 'rgba(249, 168, 212, 0.95)',
    mixed: 'rgba(148, 163, 184, 0.95)',
};

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

function easeOutCubic(t: number) {
    return 1 - (1 - t) ** 3;
}

type AnimPose = { cx: number; cy: number; cz: number };

export default function VaultAlbumRoom3D({
    albums,
    activeAlbumId,
    resolveLabel,
    onOpenAlbum,
    onAlbumContextMenu,
}: VaultAlbumRoom3DProps) {
    const { t } = useI18n();
    const {
        cam,
        depthShift,
        spaceDown,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        finishPointerGesture,
        onWheel,
        resetView,
    } = useVaultSceneCamera();
    const [poses, setPoses] = useState<Record<string, AnimPose>>({});
    const posesRef = useRef(poses);
    posesRef.current = poses;
    const animRef = useRef<number | null>(null);

    // Animate into a clean axis-aligned grid when album set / order changes.
    useEffect(() => {
        const targets: Record<string, AnimPose> = {};
        albums.forEach((album, index) => {
            targets[album.id] = albumGridPose(index, albums.length);
        });

        const from: Record<string, AnimPose> = {};
        for (const album of albums) {
            from[album.id] = posesRef.current[album.id] || targets[album.id];
        }

        if (animRef.current) cancelAnimationFrame(animRef.current);
        const start = performance.now();
        const duration = 480;

        const tick = (now: number) => {
            const progress = easeOutCubic(Math.min(1, (now - start) / duration));
            const next: Record<string, AnimPose> = {};
            for (const album of albums) {
                const a = from[album.id];
                const b = targets[album.id];
                next[album.id] = {
                    cx: lerp(a.cx, b.cx, progress),
                    cy: lerp(a.cy, b.cy, progress),
                    cz: lerp(a.cz, b.cz, progress),
                };
            }
            setPoses(next);
            if (progress < 1) animRef.current = requestAnimationFrame(tick);
            else animRef.current = null;
        };
        animRef.current = requestAnimationFrame(tick);
        return () => {
            if (animRef.current) cancelAnimationFrame(animRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [albums.map((album) => album.id).join('|')]);

    const drawOrder = useMemo(() => {
        return albums
            .map((album, index) => {
                const base = poses[album.id] || albumGridPose(index, albums.length);
                const pose = { ...base, cz: base.cz + depthShift };
                const center = project3d(pose.cx, pose.cy, pose.cz, cam);
                return { album, pose, depth: center.depth };
            })
            .sort((a, b) => b.depth - a.depth);
    }, [albums, poses, cam, depthShift]);

    return (
        <div
            className="w-full h-full min-h-[380px] rounded-md overflow-hidden relative select-none"
            style={{
                background:
                    'radial-gradient(ellipse at 50% 18%, rgba(30,58,78,0.5), transparent 52%), linear-gradient(180deg, #0b1220 0%, #111827 55%, #0a0f1a 100%)',
                cursor: spaceDown ? 'grab' : 'default',
            }}
            data-testid="vault-album-room"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            onDoubleClick={(event) => {
                if (event.target === event.currentTarget) resetView();
            }}
        >
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-25" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid slice">
                {Array.from({ length: 11 }, (_, i) => {
                    const z = -280 + i * 56 + depthShift;
                    const a = project3d(-360, 56, z, cam);
                    const b = project3d(360, 56, z, cam);
                    return (
                        <line key={`hz-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(148,163,184,0.35)" strokeWidth={1} />
                    );
                })}
                {Array.from({ length: 11 }, (_, i) => {
                    const x = -360 + i * 72;
                    const a = project3d(x, 56, -280 + depthShift, cam);
                    const b = project3d(x, 56, 280 + depthShift, cam);
                    return (
                        <line key={`vx-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(148,163,184,0.22)" strokeWidth={1} />
                    );
                })}
            </svg>

            <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid slice">
                {drawOrder.map(({ album, pose }) => {
                    const displayName = resolveLabel(album);
                    const hw = BOX_W / 2;
                    const hh = BOX_H / 2;
                    const hd = BOX_D / 2;
                    const { cx, cy, cz } = pose;
                    const front = [
                        project3d(cx - hw, cy - hh, cz - hd, cam),
                        project3d(cx + hw, cy - hh, cz - hd, cam),
                        project3d(cx + hw, cy + hh, cz - hd, cam),
                        project3d(cx - hw, cy + hh, cz - hd, cam),
                    ];
                    const top = [
                        project3d(cx - hw, cy - hh, cz - hd, cam),
                        project3d(cx + hw, cy - hh, cz - hd, cam),
                        project3d(cx + hw, cy - hh, cz + hd, cam),
                        project3d(cx - hw, cy - hh, cz + hd, cam),
                    ];
                    const side = [
                        project3d(cx + hw, cy - hh, cz - hd, cam),
                        project3d(cx + hw, cy - hh, cz + hd, cam),
                        project3d(cx + hw, cy + hh, cz + hd, cam),
                        project3d(cx + hw, cy + hh, cz - hd, cam),
                    ];
                    const label = project3d(cx, cy + hh + 16, cz, cam);
                    const accent = ACCENT[album.accent];
                    const active = album.id === activeAlbumId;
                    const poly = (pts: ReturnType<typeof project3d>[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

                    const pageEdges = Array.from({ length: Math.min(4, Math.max(1, album.pageCount)) }, (_, i) => {
                        const inset = 12 + i * 5;
                        const y0 = cy - hh + 16 + i * 7;
                        const a = project3d(cx - hw + inset, y0, cz - hd - 0.5, cam);
                        const b = project3d(cx + hw - inset, y0, cz - hd - 0.5, cam);
                        return { a, b };
                    });

                    return (
                        <g
                            key={album.id}
                            className="cursor-pointer"
                            onPointerUp={(event) => {
                                event.stopPropagation();
                                // Open on pointer-up so slight orbit jitter still counts as a click into the box.
                                if (!finishPointerGesture()) return;
                                onOpenAlbum(album.id);
                            }}
                            onContextMenu={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                onAlbumContextMenu?.(album, event);
                            }}
                        >
                            <polygon
                                points={poly(top)}
                                fill="rgba(30,41,59,0.78)"
                                stroke={active ? accent : 'rgba(148,163,184,0.4)'}
                                strokeWidth={active ? 1.8 : 1}
                            />
                            <polygon
                                points={poly(side)}
                                fill="rgba(15,23,42,0.82)"
                                stroke={active ? accent : 'rgba(148,163,184,0.32)'}
                                strokeWidth={1}
                            />
                            <polygon
                                points={poly(front)}
                                fill="rgba(17,24,39,0.92)"
                                stroke={active ? accent : 'rgba(203,213,225,0.5)'}
                                strokeWidth={active ? 2 : 1.2}
                            />
                            <line
                                x1={front[0].x}
                                y1={front[0].y}
                                x2={front[3].x}
                                y2={front[3].y}
                                stroke={accent}
                                strokeWidth={3}
                                strokeLinecap="round"
                            />
                            {pageEdges.map((edge, index) => (
                                <line
                                    key={`${album.id}-page-${index}`}
                                    x1={edge.a.x}
                                    y1={edge.a.y}
                                    x2={edge.b.x}
                                    y2={edge.b.y}
                                    stroke="rgba(226,232,240,0.35)"
                                    strokeWidth={1.2}
                                />
                            ))}
                            <text
                                x={(front[0].x + front[1].x) / 2}
                                y={(front[0].y + front[2].y) / 2 - 4}
                                textAnchor="middle"
                                fontSize={11}
                                fontWeight={600}
                                fill="rgba(248,250,252,0.95)"
                                className="pointer-events-none"
                            >
                                {displayName.length > 14 ? `${displayName.slice(0, 13)}…` : displayName}
                            </text>
                            <text
                                x={(front[0].x + front[1].x) / 2}
                                y={(front[0].y + front[2].y) / 2 + 12}
                                textAnchor="middle"
                                fontSize={9}
                                fill="rgba(148,163,184,0.95)"
                                className="pointer-events-none"
                            >
                                {t('vault.boxMeta', { pages: album.pageCount, assets: album.assetCount })}
                            </text>
                            <text
                                x={label.x}
                                y={label.y}
                                textAnchor="middle"
                                fontSize={10}
                                fill={accent}
                                className="pointer-events-none"
                            >
                                {displayName}
                            </text>
                        </g>
                    );
                })}
            </svg>

            <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2 pointer-events-none">
                <div className="text-[10px] text-slate-300/85 bg-black/40 border border-white/10 rounded px-2 py-1 backdrop-blur-sm max-w-[75%]">
                    {t('vault.roomHint')}
                </div>
                <button
                    type="button"
                    className="pointer-events-auto h-6 px-2 rounded border border-white/15 bg-black/45 text-[10px] text-slate-100 hover:bg-black/60"
                    onClick={resetView}
                >
                    {t('vault.resetView')}
                </button>
            </div>
        </div>
    );
}
