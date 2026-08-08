'use client';

import { useCallback, useMemo, useState } from 'react';

import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import {
    assetIdsInVaultFolder,
    buildVaultFolderTree,
    vaultFolderPath,
} from '@/features/asset-vault/domain/vaultFolderTree';
import type { VaultNavMode } from '@/features/asset-vault/application/client/vaultUiState';

type UseVaultFolderNavArgs = {
    workingAssets: VaultAssetRecord[];
    initialNavMode: VaultNavMode;
    onClearContextMenu: () => void;
};

/**
 * Folder-tree navigation for the vault: "where does this file live", as
 * opposed to the derived group lenses in `useVaultBrowse`.
 *
 * Extracted from `useVaultBrowse` because the two are genuinely separate
 * concerns — this one owns no album/page state and only needs the asset list —
 * and because keeping them together pushed that file past the 500-line budget
 * enforced by `npm run audit:filesize`.
 */
export function useVaultFolderNav({
    workingAssets,
    initialNavMode,
    onClearContextMenu,
}: UseVaultFolderNavArgs) {
    const [navMode, setNavMode] = useState<VaultNavMode>(initialNavMode);
    const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
    const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set());
    const [includeSubfolders, setIncludeSubfolders] = useState(true);

    /**
     * Building the tree is a full pass over the catalog — ~550 ms for 200k
     * assets — so it depends on `workingAssets` alone and is skipped entirely
     * while the folder sidebar is closed. Deliberately NOT keyed on `t` or
     * `language`: folder names come from the filesystem and never translate,
     * and those identities change far more often than the catalog does.
     */
    const folderTree = useMemo(() => {
        if (navMode !== 'folders') return null;
        return buildVaultFolderTree(workingAssets);
    }, [navMode, workingAssets]);

    const activeFolderPath = useMemo(() => (
        folderTree && activeFolderId ? vaultFolderPath(folderTree, activeFolderId) : []
    ), [folderTree, activeFolderId]);

    const folderAssetIds = useMemo(() => {
        if (!folderTree || !activeFolderId) return null;
        return new Set(assetIdsInVaultFolder(folderTree, activeFolderId, {
            recursive: includeSubfolders,
        }));
    }, [folderTree, activeFolderId, includeSubfolders]);

    const toggleFolderExpanded = useCallback((folderId: string) => {
        setExpandedFolderIds((prev) => {
            const next = new Set(prev);
            if (next.has(folderId)) next.delete(folderId);
            else next.add(folderId);
            return next;
        });
    }, []);

    /** Select a folder and reveal it by expanding every ancestor. */
    const selectFolder = useCallback((folderId: string) => {
        setActiveFolderId(folderId);
        onClearContextMenu();
        setExpandedFolderIds((prev) => {
            const next = new Set(prev);
            const segments = folderId.split('/');
            let walked = '';
            for (const segment of segments) {
                walked = walked ? `${walked}/${segment}` : segment;
                next.add(walked);
            }
            return next;
        });
    }, [onClearContextMenu]);

    const selectAllFolders = useCallback(() => {
        setActiveFolderId(null);
        onClearContextMenu();
    }, [onClearContextMenu]);

    const toggleIncludeSubfolders = useCallback(() => {
        setIncludeSubfolders((prev) => !prev);
    }, []);

    return {
        navMode,
        setNavMode,
        activeFolderId,
        activeFolderPath,
        expandedFolderIds,
        includeSubfolders,
        folderTree,
        folderAssetIds,
        selectFolder,
        selectAllFolders,
        toggleFolderExpanded,
        toggleIncludeSubfolders,
    };
}
