'use client';

import { useMemo, type MouseEvent } from 'react';
import {
    VIEW_W,
    VIEW_H,
    project as project3d,
    DEFAULT_STACK_CAMERA,
} from '@/lib/multicanvas/stack3dMath';
import type { VaultAlbum, VaultPage } from '@/features/asset-vault/domain/vaultAlbumTree';
import { useI18n } from '@/providers/I18nProvider';
import { useVaultSceneCamera } from '@/components/AssetVault/useVaultSceneCamera';

type VaultPageStack3DProps = {
    album: VaultAlbum;
    activePageId?: string | null;
    resolveLabel: (entry: { label: string; labelKey?: string; labelParams?: Record<string, string | number> }) => string;
    onOpenPage: (pageId: string) => void;
    onPageContextMenu?: (page: VaultPage, event: MouseEvent) => void;
    onBack?: () => void;
};

const PAGE_W = 220;
const PAGE_H = 150;
const PAGE_GAP = 22;

export default function VaultPageStack3D({
    album,
    activePageId,
    resolveLabel,
    onOpenPage,
    onPageContextMenu,
    onBack,
}: VaultPageStack3DProps) {
    const { t } = useI18n();
    const {
        cam,
        depthShift,
        dragRef,
        spaceDown,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        finishPointerGesture,
        onWheel,
        resetView,
    } = useVaultSceneCamera({ ...DEFAULT_STACK_CAMERA, yaw: -0.28, pitch: 0.5, zoom: 1.12, panX: 0, panY: 20 });

    const pages = album.pages;

    const drawOrder = useMemo(() => {
        return pages
            .map((page, index) => {
                const yWorld = (index - (pages.length - 1) / 2) * PAGE_GAP;
                const z = -index * 10 + depthShift;
                const center = project3d(0, yWorld, z, cam);
                return { page, index, yWorld, z, depth: center.depth };
            })
            .sort((a, b) => b.depth - a.depth);
    }, [pages, cam, depthShift]);

    return (
        <div
            className="w-full h-full min-h-[380px] rounded-md overflow-hidden relative select-none"
            style={{
                background:
                    'radial-gradient(ellipse at 40% 30%, rgba(45,70,90,0.5), transparent 50%), linear-gradient(180deg, #0c1422 0%, #0f172a 100%)',
                cursor: spaceDown ? 'grab' : 'default',
            }}
            data-testid="vault-page-stack"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
        >
            {onBack && (
                <button
                    type="button"
                    onClick={onBack}
                    className="absolute top-2 left-2 z-10 h-7 px-2.5 rounded-md text-[11px] bg-black/40 border border-white/15 text-slate-100 hover:bg-black/55"
                >
                    ← {resolveLabel(album)}
                </button>
            )}

            <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid slice">
                {drawOrder.map(({ page, yWorld, z }) => {
                    const displayName = resolveLabel(page);
                    const hw = PAGE_W / 2;
                    const hh = PAGE_H / 2;
                    const corners = [
                        project3d(-hw, yWorld - hh, z, cam),
                        project3d(hw, yWorld - hh, z, cam),
                        project3d(hw, yWorld + hh, z, cam),
                        project3d(-hw, yWorld + hh, z, cam),
                    ];
                    const active = page.id === activePageId;
                    const points = corners.map((p) => `${p.x},${p.y}`).join(' ');
                    const cx = (corners[0].x + corners[1].x) / 2;
                    const cy = (corners[0].y + corners[2].y) / 2;

                    const slots = Math.min(6, page.assetIds.length);
                    const slotNodes = Array.from({ length: slots }, (_, i) => {
                        const col = i % 3;
                        const row = Math.floor(i / 3);
                        const sx = -hw + 28 + col * 58;
                        const sy = yWorld - hh + 36 + row * 48;
                        const a = project3d(sx - 20, sy - 16, z - 1, cam);
                        const b = project3d(sx + 20, sy - 16, z - 1, cam);
                        const c = project3d(sx + 20, sy + 16, z - 1, cam);
                        const d = project3d(sx - 20, sy + 16, z - 1, cam);
                        return `${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`;
                    });

                    return (
                        <g
                            key={page.id}
                            className="cursor-pointer"
                            onPointerUp={(event) => {
                                event.stopPropagation();
                                if (!finishPointerGesture()) return;
                                onOpenPage(page.id);
                            }}
                            onContextMenu={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                onPageContextMenu?.(page, event);
                            }}
                        >
                            <polygon
                                points={points}
                                fill={active ? 'rgba(30,58,78,0.92)' : 'rgba(15,23,42,0.88)'}
                                stroke={active ? 'rgba(125,211,192,0.95)' : 'rgba(203,213,225,0.4)'}
                                strokeWidth={active ? 2 : 1.2}
                            />
                            {slotNodes.map((pts, index) => (
                                <polygon
                                    key={`${page.id}-slot-${index}`}
                                    points={pts}
                                    fill="rgba(51,65,85,0.75)"
                                    stroke="rgba(148,163,184,0.35)"
                                    strokeWidth={1}
                                    className="pointer-events-none"
                                />
                            ))}
                            <text
                                x={cx}
                                y={cy + hh * 0.55}
                                textAnchor="middle"
                                fontSize={12}
                                fontWeight={600}
                                fill="rgba(248,250,252,0.95)"
                                className="pointer-events-none"
                            >
                                {displayName.length > 28 ? `${displayName.slice(0, 27)}…` : displayName}
                            </text>
                            <text
                                x={cx}
                                y={cy + hh * 0.55 + 16}
                                textAnchor="middle"
                                fontSize={10}
                                fill="rgba(148,163,184,0.95)"
                                className="pointer-events-none"
                            >
                                {t('vault.assetsCount', { count: page.assetIds.length })}
                            </text>
                        </g>
                    );
                })}
            </svg>

            <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2 pointer-events-none">
                <div className="text-[10px] text-slate-300/85 bg-black/40 border border-white/10 rounded px-2 py-1 backdrop-blur-sm">
                    {t('vault.pageStackHint')}
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
