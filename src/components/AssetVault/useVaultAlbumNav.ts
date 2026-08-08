import { useCallback, type Dispatch, type SetStateAction } from 'react';

import type { VaultAlbum, VaultOrganizeLens } from '@/features/asset-vault/domain/vaultAlbumTree';

/**
 * The navigation *actions* for the album/page sidebar.
 *
 * Separated from `useVaultBrowse` for the same reason `useVaultFolderNav` was:
 * that hook derives what to show, and mixing the commands that change the
 * selection into it pushed it past the file-size limit three times. Derivation
 * and commands are different jobs.
 *
 * These are deliberately thin — each one is a composition of setters, and every
 * one of them clears the context menu, because leaving a menu floating over a
 * grid that just changed underneath it is disorienting.
 */

export type VaultDepth = 'room' | 'album' | 'page';

type Options = {
    lens: VaultOrganizeLens;
    use3d: boolean;
    onClearContextMenu: () => void;
    setLens: Dispatch<SetStateAction<VaultOrganizeLens>>;
    setDepth: Dispatch<SetStateAction<VaultDepth>>;
    setActiveAlbumId: Dispatch<SetStateAction<string | null>>;
    setActivePageId: Dispatch<SetStateAction<string | null>>;
    setUse3d: Dispatch<SetStateAction<boolean>>;
    setExpandedAlbumIds: Dispatch<SetStateAction<Set<string>>>;
    setOverflowOpen: Dispatch<SetStateAction<boolean>>;
    setPendingFlatRematch: Dispatch<SetStateAction<boolean>>;
};

export function useVaultAlbumNav({
    lens,
    use3d,
    onClearContextMenu,
    setLens,
    setDepth,
    setActiveAlbumId,
    setActivePageId,
    setUse3d,
    setExpandedAlbumIds,
    setOverflowOpen,
    setPendingFlatRematch,
}: Options) {
    const goRoom = useCallback(() => {
        setDepth('page');
        setActiveAlbumId(null);
        setActivePageId(null);
        setUse3d(false);
        onClearContextMenu();
    }, [onClearContextMenu, setDepth, setActiveAlbumId, setActivePageId, setUse3d]);

    const goAlbum = useCallback((albumId: string) => {
        setActiveAlbumId(albumId);
        setActivePageId(null);
        setDepth('page');
        setUse3d(false);
        onClearContextMenu();
    }, [onClearContextMenu, setActiveAlbumId, setActivePageId, setDepth, setUse3d]);

    const goPage = useCallback((albumId: string, pageId: string) => {
        setActiveAlbumId(albumId);
        setActivePageId(pageId);
        setDepth('page');
        setUse3d(false);
        onClearContextMenu();
    }, [onClearContextMenu, setActiveAlbumId, setActivePageId, setDepth, setUse3d]);

    /**
     * Switching lens rebuilds the album tree, so the old selection is
     * meaningless. In 3D the view returns to the room; in the flat view a
     * rematch is requested so the first album of the *new* tree is chosen once
     * it exists.
     */
    const applyOrganizeLens = useCallback((value: VaultOrganizeLens) => {
        if (value === lens) return;
        setLens(value);
        onClearContextMenu();
        setOverflowOpen(false);
        if (use3d) {
            setDepth('room');
            setActiveAlbumId(null);
            setActivePageId(null);
            return;
        }
        setPendingFlatRematch(true);
        setActiveAlbumId(null);
        setActivePageId(null);
        setDepth('page');
    }, [
        lens, use3d, onClearContextMenu, setLens, setOverflowOpen,
        setDepth, setActiveAlbumId, setActivePageId, setPendingFlatRematch,
    ]);

    const selectFlatAlbum = useCallback((album: VaultAlbum) => {
        setUse3d(false);
        setActiveAlbumId(album.id);
        setActivePageId(null);
        setDepth('page');
        setExpandedAlbumIds((prev) => new Set(prev).add(album.id));
        onClearContextMenu();
    }, [onClearContextMenu, setUse3d, setActiveAlbumId, setActivePageId, setDepth, setExpandedAlbumIds]);

    const selectFlatPage = useCallback((albumId: string, pageId: string) => {
        setUse3d(false);
        setActiveAlbumId(albumId);
        setActivePageId(pageId);
        setDepth('page');
        setExpandedAlbumIds((prev) => new Set(prev).add(albumId));
        onClearContextMenu();
    }, [onClearContextMenu, setUse3d, setActiveAlbumId, setActivePageId, setDepth, setExpandedAlbumIds]);

    const selectFlatAll = useCallback(() => {
        setUse3d(false);
        setActiveAlbumId(null);
        setActivePageId(null);
        setDepth('page');
        onClearContextMenu();
    }, [onClearContextMenu, setUse3d, setActiveAlbumId, setActivePageId, setDepth]);

    const toggleAlbumExpanded = useCallback((albumId: string) => {
        setExpandedAlbumIds((prev) => {
            const next = new Set(prev);
            if (next.has(albumId)) next.delete(albumId);
            else next.add(albumId);
            return next;
        });
    }, [setExpandedAlbumIds]);

    const requestFlatRematch = useCallback(() => {
        setPendingFlatRematch(!use3d);
    }, [use3d, setPendingFlatRematch]);

    return {
        goRoom,
        goAlbum,
        goPage,
        applyOrganizeLens,
        selectFlatAlbum,
        selectFlatPage,
        selectFlatAll,
        toggleAlbumExpanded,
        requestFlatRematch,
    };
}
