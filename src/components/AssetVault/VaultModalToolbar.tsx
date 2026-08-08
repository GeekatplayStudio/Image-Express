'use client';

import {
    Archive, ChevronRight, FolderPlus, HardDrive, Loader2, MoreVertical,
    RefreshCw, Search, Sparkles, Wand2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/I18nProvider';
import { VAULT_ORGANIZE_LENSES, type VaultOrganizeLens } from '@/features/asset-vault/domain/vaultAlbumTree';
import type { VaultSortMode } from '@/features/asset-vault/domain/vaultNaturalQuery';
import type { VaultAlbum, VaultPage } from '@/features/asset-vault/domain/vaultAlbumTree';
import { vaultLensLabelKey } from '@/components/AssetVault/vaultModalTypes';
import VaultThumbSizeSlider from '@/components/AssetVault/VaultThumbSizeSlider';
import type { VaultThumbSize } from '@/features/asset-vault/application/client/vaultUiState';

type VaultModalToolbarProps = {
    searchRef: React.RefObject<HTMLInputElement | null>;
    query: string;
    onQueryChange: (value: string) => void;
    isSearching: boolean;
    smartSearch: boolean;
    onSmartSearchChange: (value: boolean) => void;
    sortMode: VaultSortMode;
    onSortModeChange: (value: VaultSortMode) => void;
    thumbSize: VaultThumbSize;
    onThumbSizeChange: (value: VaultThumbSize) => void;
    effectiveLens: VaultOrganizeLens;
    onApplyLens: (value: VaultOrganizeLens) => void;
    sourcesOpen: boolean;
    onToggleSources: () => void;
    isEnriching: boolean;
    onEnrich: () => void;
    isSyncing: boolean;
    onSync: () => void;
    onOpenClassicLibrary?: () => void;
    onClose: () => void;
    overflowOpen: boolean;
    onOverflowOpenChange: (open: boolean) => void;
    onCreateAlbum: () => void;
    onOpenSources: () => void;
    activeAlbum: VaultAlbum | null | undefined;
    activePage: VaultPage | null | undefined;
    use3d: boolean;
    onGoRoom: () => void;
    onGoAlbum: (albumId: string) => void;
    onSelectFlatAlbum: (album: VaultAlbum) => void;
    labelOf: (entry: { label: string; labelKey?: string; labelParams?: Record<string, string | number> }) => string;
};

export default function VaultModalToolbar({
    searchRef,
    query,
    onQueryChange,
    isSearching,
    smartSearch,
    onSmartSearchChange,
    sortMode,
    onSortModeChange,
    thumbSize,
    onThumbSizeChange,
    effectiveLens,
    onApplyLens,
    sourcesOpen,
    onToggleSources,
    isEnriching,
    onEnrich,
    isSyncing,
    onSync,
    onOpenClassicLibrary,
    onClose,
    overflowOpen,
    onOverflowOpenChange,
    onCreateAlbum,
    onOpenSources,
    activeAlbum,
    activePage,
    use3d,
    onGoRoom,
    onGoAlbum,
    onSelectFlatAlbum,
    labelOf,
}: VaultModalToolbarProps) {
    const { t } = useI18n();

    return (
        <>
            <div className="h-8 px-2 border-b border-border flex items-center gap-2 bg-secondary/10 draggable-handle cursor-move shrink-0">
                <Archive size={12} className="text-primary shrink-0" />
                <span className="text-xs font-semibold shrink-0">{t('vault.title')}</span>
                <div className="flex items-center gap-0.5 min-w-0 text-[10px] text-muted-foreground">
                    <button type="button" className="hover:text-foreground truncate" onClick={onGoRoom}>
                        {t('vault.title')}
                    </button>
                    {activeAlbum && (
                        <>
                            <ChevronRight size={10} className="shrink-0 opacity-60" />
                            <button
                                type="button"
                                className="hover:text-foreground truncate max-w-[120px]"
                                onClick={() => {
                                    if (use3d) onGoAlbum(activeAlbum.id);
                                    else onSelectFlatAlbum(activeAlbum);
                                }}
                            >
                                {labelOf(activeAlbum)}
                            </button>
                        </>
                    )}
                    {activePage && (
                        <>
                            <ChevronRight size={10} className="shrink-0 opacity-60" />
                            <span className="truncate max-w-[120px] text-foreground/80">{labelOf(activePage)}</span>
                        </>
                    )}
                </div>
                <div className="flex-1" />
                <button
                    type="button"
                    onClick={onClose}
                    className="h-6 w-6 rounded inline-flex items-center justify-center text-muted-foreground hover:bg-secondary"
                    aria-label={t('common.close')}
                >
                    <X size={12} />
                </button>
            </div>

            <div className="h-9 px-2 border-b border-border flex items-center gap-1.5 bg-secondary/5 shrink-0">
                <div className="relative flex-1 min-w-[120px] max-w-xs">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        ref={searchRef}
                        value={query}
                        onChange={(event) => onQueryChange(event.target.value)}
                        placeholder={t('vault.searchPlaceholderContext')}
                        className="w-full h-7 pl-7 pr-2 rounded-md bg-background border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                    {isSearching && (
                        <Loader2 size={11} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                </div>

                <label
                    className={cn(
                        'h-7 px-2 rounded-md border text-[10px] inline-flex items-center gap-1 cursor-pointer select-none shrink-0',
                        smartSearch ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-secondary',
                    )}
                    title={t('vault.smartSearch')}
                >
                    <input
                        type="checkbox"
                        className="sr-only"
                        checked={smartSearch}
                        onChange={(event) => onSmartSearchChange(event.target.checked)}
                    />
                    <Sparkles size={11} />
                    {t('vault.smart')}
                </label>

                <select
                    value={sortMode}
                    onChange={(event) => onSortModeChange(event.target.value as VaultSortMode)}
                    className="h-7 max-w-[112px] rounded-md border border-border bg-background px-1.5 text-[10px] text-foreground"
                    title={t('vault.sortLabel')}
                    aria-label={t('vault.sortLabel')}
                >
                    <option value="relevance">{t('vault.sortRelevance')}</option>
                    <option value="name-asc">{t('vault.sortNameAsc')}</option>
                    <option value="name-desc">{t('vault.sortNameDesc')}</option>
                    <option value="newest">{t('vault.sortNewest')}</option>
                    <option value="oldest">{t('vault.sortOldest')}</option>
                    <option value="largest">{t('vault.sortLargest')}</option>
                    <option value="smallest">{t('vault.sortSmallest')}</option>
                    <option value="type">{t('vault.sortType')}</option>
                </select>

                <VaultThumbSizeSlider value={thumbSize} onChange={onThumbSizeChange} />

                <div className="flex items-center rounded-md border border-border overflow-hidden">
                    {VAULT_ORGANIZE_LENSES.map((value) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => onApplyLens(value)}
                            className={cn(
                                'h-7 px-2 text-[10px] font-medium',
                                effectiveLens === value ? 'bg-primary/15 text-primary' : 'hover:bg-secondary text-muted-foreground',
                            )}
                            title={t(vaultLensLabelKey(value))}
                        >
                            {t(vaultLensLabelKey(value))}
                        </button>
                    ))}
                </div>

                <button
                    type="button"
                    onClick={onToggleSources}
                    className={cn(
                        'h-7 px-2 rounded-md border text-[10px] inline-flex items-center gap-1',
                        sourcesOpen ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border hover:bg-secondary text-muted-foreground',
                    )}
                    title={t('vault.browseDriveFolder')}
                >
                    <HardDrive size={11} />
                    <span className="hidden sm:inline">{t('vault.browseDriveFolder')}</span>
                </button>

                <button
                    type="button"
                    onClick={onEnrich}
                    disabled={isEnriching}
                    className="h-7 px-2 rounded-md border border-border text-[10px] inline-flex items-center gap-1 hover:bg-secondary text-muted-foreground disabled:opacity-50"
                    title={t('vault.aiIndex')}
                >
                    {isEnriching ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
                    <span className="hidden md:inline">{t('vault.aiIndex')}</span>
                </button>

                <button
                    type="button"
                    onClick={onSync}
                    disabled={isSyncing}
                    className="h-7 px-2 rounded-md border border-border text-[10px] inline-flex items-center gap-1 hover:bg-secondary text-muted-foreground disabled:opacity-50"
                    title={t('vault.sync')}
                >
                    {isSyncing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                </button>

                {onOpenClassicLibrary && (
                    <button
                        type="button"
                        onClick={() => { onOpenClassicLibrary(); onClose(); }}
                        className="h-7 px-2 rounded-md border border-border text-[10px] inline-flex items-center gap-1 hover:bg-secondary text-muted-foreground"
                        title={t('vault.classicLibrary')}
                    >
                        <Archive size={11} />
                        <span className="hidden sm:inline">{t('vault.classicLibrary')}</span>
                    </button>
                )}

                <div className="relative">
                    <button
                        type="button"
                        onClick={() => onOverflowOpenChange(!overflowOpen)}
                        className="h-7 w-7 rounded-md border border-border inline-flex items-center justify-center hover:bg-secondary text-muted-foreground"
                        title={t('vault.moreActions')}
                    >
                        <MoreVertical size={12} />
                    </button>
                    {overflowOpen && (
                        <div className="absolute right-0 top-8 z-20 w-48 rounded-md border border-border bg-popover shadow-lg p-1">
                            <button type="button" className="w-full h-7 px-2 rounded text-[11px] text-left hover:bg-secondary inline-flex items-center gap-2" onClick={() => { onOverflowOpenChange(false); onOpenSources(); }}>
                                <HardDrive size={12} /> {t('vault.sourcesTitle')}
                            </button>
                            <button type="button" className="w-full h-7 px-2 rounded text-[11px] text-left hover:bg-secondary inline-flex items-center gap-2" onClick={onCreateAlbum}>
                                <FolderPlus size={12} /> {t('vault.newAlbum')}
                            </button>
                            <button type="button" className="w-full h-7 px-2 rounded text-[11px] text-left hover:bg-secondary inline-flex items-center gap-2" onClick={onEnrich} disabled={isEnriching}>
                                {isEnriching ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />} {t('vault.aiIndex')}
                            </button>
                            <button type="button" className="w-full h-7 px-2 rounded text-[11px] text-left hover:bg-secondary inline-flex items-center gap-2" onClick={onSync} disabled={isSyncing}>
                                {isSyncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} {t('vault.sync')}
                            </button>
                            {onOpenClassicLibrary && (
                                <button
                                    type="button"
                                    className="w-full h-7 px-2 rounded text-[11px] text-left hover:bg-secondary inline-flex items-center gap-2"
                                    onClick={() => { onOverflowOpenChange(false); onOpenClassicLibrary(); onClose(); }}
                                >
                                    <Archive size={12} /> {t('vault.classicLibrary')}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
