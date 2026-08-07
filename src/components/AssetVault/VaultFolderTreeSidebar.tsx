'use client';

import { useMemo } from 'react';
import { Archive, ChevronDown, ChevronRight, Folder, FolderOpen, HardDrive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/I18nProvider';
import type { VaultFolderNode, VaultFolderTree } from '@/features/asset-vault/domain/vaultFolderTree';

/**
 * The "where the file actually lives" sidebar: the real folder tree under each
 * indexed root, as opposed to the derived lens groupings in VaultFlatSidebar.
 *
 * Only expanded branches are flattened into rows, so a catalog with hundreds of
 * folders costs the same to render as one with a handful until the user opens
 * something. Node ids are folder paths, so expansion and selection survive a
 * re-index — unlike the positional album page ids.
 */

type VaultFolderTreeSidebarProps = {
    tree: VaultFolderTree;
    totalAssetCount: number;
    activeFolderId: string | null;
    expandedFolderIds: Set<string>;
    /** Include subfolder assets in the grid for the selected folder. */
    includeSubfolders: boolean;
    onSelectAll: () => void;
    onSelectFolder: (folderId: string) => void;
    onToggleExpanded: (folderId: string) => void;
    onToggleIncludeSubfolders: () => void;
};

type FolderRow = { node: VaultFolderNode; hasChildren: boolean };

export default function VaultFolderTreeSidebar({
    tree,
    totalAssetCount,
    activeFolderId,
    expandedFolderIds,
    includeSubfolders,
    onSelectAll,
    onSelectFolder,
    onToggleExpanded,
    onToggleIncludeSubfolders,
}: VaultFolderTreeSidebarProps) {
    const { t } = useI18n();

    // Depth-first walk that descends only into expanded branches.
    const rows = useMemo(() => {
        const out: FolderRow[] = [];
        const visit = (nodeId: string) => {
            const node = tree.nodes.get(nodeId);
            if (!node) return;
            const hasChildren = node.childIds.length > 0;
            out.push({ node, hasChildren });
            if (!hasChildren || !expandedFolderIds.has(nodeId)) return;
            for (const childId of node.childIds) visit(childId);
        };
        for (const rootId of tree.rootIds) visit(rootId);
        return out;
    }, [tree, expandedFolderIds]);

    return (
        <aside
            className="w-56 shrink-0 border-r border-border/50 bg-card/50 flex flex-col min-h-0"
            data-testid="vault-folder-tree-sidebar"
        >
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/40 flex items-center justify-between gap-1">
                <span className="truncate">{t('vault.folders')}</span>
                <button
                    type="button"
                    onClick={onToggleIncludeSubfolders}
                    aria-pressed={includeSubfolders}
                    title={t('vault.includeSubfoldersHint')}
                    className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium border transition-colors',
                        includeSubfolders
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-border/60 text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                >
                    {t('vault.includeSubfolders')}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                <button
                    type="button"
                    onClick={onSelectAll}
                    className={cn(
                        'w-full h-7 px-2 rounded text-[11px] text-left inline-flex items-center gap-1.5',
                        !activeFolderId
                            ? 'bg-primary/15 text-primary'
                            : 'hover:bg-secondary text-muted-foreground',
                    )}
                >
                    <Archive size={12} className="shrink-0" />
                    <span className="truncate flex-1">{t('vault.allAssets')}</span>
                    <span className="text-[9px] opacity-70">{totalAssetCount}</span>
                </button>

                {rows.length === 0 && (
                    <p className="px-2 py-3 text-[10px] text-muted-foreground">
                        {t('vault.noFolders')}
                    </p>
                )}

                {rows.map(({ node, hasChildren }) => {
                    const isActive = node.id === activeFolderId;
                    const expanded = expandedFolderIds.has(node.id);
                    const isRoot = node.parentId === null;
                    const Icon = isRoot ? HardDrive : (expanded ? FolderOpen : Folder);
                    return (
                        <div key={node.id} className="flex items-center gap-0.5">
                            <button
                                type="button"
                                onClick={() => hasChildren && onToggleExpanded(node.id)}
                                className={cn(
                                    'h-7 w-5 shrink-0 rounded inline-flex items-center justify-center text-muted-foreground',
                                    hasChildren
                                        ? 'hover:bg-secondary hover:text-foreground'
                                        : 'opacity-25 pointer-events-none',
                                )}
                                style={{ marginLeft: `${Math.min(node.depth, 8) * 8}px` }}
                                aria-expanded={hasChildren ? expanded : undefined}
                                aria-label={expanded ? t('vault.collapseFolder') : t('vault.expandFolder')}
                                title={expanded ? t('vault.collapseFolder') : t('vault.expandFolder')}
                            >
                                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            </button>
                            <button
                                type="button"
                                onClick={() => onSelectFolder(node.id)}
                                onDoubleClick={() => hasChildren && onToggleExpanded(node.id)}
                                className={cn(
                                    'flex-1 min-w-0 h-7 px-1.5 rounded text-[11px] text-left inline-flex items-center gap-1.5',
                                    isActive
                                        ? 'bg-primary/15 text-primary'
                                        : 'hover:bg-secondary text-muted-foreground',
                                )}
                                title={node.id}
                            >
                                <Icon size={12} className="shrink-0" />
                                <span className="truncate flex-1">{node.name}</span>
                                <span className="text-[9px] opacity-70">{node.totalCount}</span>
                            </button>
                        </div>
                    );
                })}
            </div>
        </aside>
    );
}
