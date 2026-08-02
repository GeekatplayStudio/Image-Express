'use client';

import { Archive, ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/I18nProvider';
import type { VaultAlbum, VaultOrganizeLens } from '@/features/asset-vault/domain/vaultAlbumTree';
import { vaultLensLabelKey } from '@/components/AssetVault/vaultModalTypes';

type VaultFlatSidebarProps = {
    albums: VaultAlbum[];
    effectiveLens: VaultOrganizeLens;
    workingAssetsCount: number;
    activeAlbumId: string | null;
    activePageId: string | null;
    expandedAlbumIds: Set<string>;
    onSelectAll: () => void;
    onSelectAlbum: (album: VaultAlbum) => void;
    onSelectPage: (albumId: string, pageId: string) => void;
    onToggleExpanded: (albumId: string) => void;
    onAlbumContextMenu: (album: VaultAlbum, event: React.MouseEvent) => void;
    onPageContextMenu: (album: VaultAlbum, pageId: string, event: React.MouseEvent) => void;
    labelOf: (entry: { label: string; labelKey?: string; labelParams?: Record<string, string | number> }) => string;
};

export default function VaultFlatSidebar({
    albums,
    effectiveLens,
    workingAssetsCount,
    activeAlbumId,
    activePageId,
    expandedAlbumIds,
    onSelectAll,
    onSelectAlbum,
    onSelectPage,
    onToggleExpanded,
    onAlbumContextMenu,
    onPageContextMenu,
    labelOf,
}: VaultFlatSidebarProps) {
    const { t } = useI18n();

    return (
        <aside
            className="w-48 shrink-0 border-r border-border/50 bg-card/50 flex flex-col min-h-0"
            data-testid="vault-flat-sidebar"
        >
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/40">
                {t('vault.albums')} · {t(vaultLensLabelKey(effectiveLens))}
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                <button
                    type="button"
                    onClick={onSelectAll}
                    className={cn(
                        'w-full h-7 px-2 rounded text-[11px] text-left inline-flex items-center gap-1.5',
                        !activeAlbumId
                            ? 'bg-primary/15 text-primary'
                            : 'hover:bg-secondary text-muted-foreground',
                    )}
                >
                    <Archive size={12} className="shrink-0" />
                    <span className="truncate flex-1">{t('vault.allAssets')}</span>
                    <span className="text-[9px] opacity-70">{workingAssetsCount}</span>
                </button>
                {albums.map((album) => {
                    const albumActive = album.id === activeAlbumId;
                    const expanded = expandedAlbumIds.has(album.id);
                    const hasPages = album.pages.length > 0;
                    return (
                        <div key={album.id} className="space-y-0.5">
                            <div className="flex items-center gap-0.5">
                                <button
                                    type="button"
                                    onClick={() => hasPages && onToggleExpanded(album.id)}
                                    className={cn(
                                        'h-7 w-5 shrink-0 rounded inline-flex items-center justify-center text-muted-foreground',
                                        hasPages ? 'hover:bg-secondary hover:text-foreground' : 'opacity-30 pointer-events-none',
                                    )}
                                    aria-expanded={expanded}
                                    aria-label={expanded ? t('vault.collapseAlbum') : t('vault.expandAlbum')}
                                    title={expanded ? t('vault.collapseAlbum') : t('vault.expandAlbum')}
                                >
                                    {expanded
                                        ? <ChevronDown size={12} />
                                        : <ChevronRight size={12} />}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onSelectAlbum(album)}
                                    onDoubleClick={() => hasPages && onToggleExpanded(album.id)}
                                    onContextMenu={(event) => onAlbumContextMenu(album, event)}
                                    className={cn(
                                        'flex-1 min-w-0 h-7 px-1.5 rounded text-[11px] text-left inline-flex items-center gap-1.5',
                                        albumActive && !activePageId
                                            ? 'bg-primary/15 text-primary'
                                            : albumActive
                                                ? 'bg-secondary/80 text-foreground'
                                                : 'hover:bg-secondary text-muted-foreground',
                                    )}
                                    title={labelOf(album)}
                                >
                                    <Folder size={12} className="shrink-0" />
                                    <span className="truncate flex-1">{labelOf(album)}</span>
                                    <span className="text-[9px] opacity-70">{album.assetCount}</span>
                                </button>
                            </div>
                            {expanded && album.pages.map((page) => (
                                <button
                                    key={page.id}
                                    type="button"
                                    onClick={() => onSelectPage(album.id, page.id)}
                                    onContextMenu={(event) => onPageContextMenu(album, page.id, event)}
                                    className={cn(
                                        'w-full h-6 pl-7 pr-2 rounded text-[10px] text-left inline-flex items-center gap-1.5',
                                        page.id === activePageId
                                            ? 'bg-primary/15 text-primary'
                                            : 'hover:bg-secondary text-muted-foreground',
                                    )}
                                    title={labelOf(page)}
                                >
                                    <span className="truncate flex-1">{labelOf(page)}</span>
                                    <span className="text-[9px] opacity-70">{page.assetIds.length}</span>
                                </button>
                            ))}
                        </div>
                    );
                })}
            </div>
        </aside>
    );
}
