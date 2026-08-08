import type { AssetType } from '@/types';
import type { BookcaseFilter } from '@/features/asset-vault/contracts/bookcase';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import type { VaultAlbum, VaultOrganizeLens, VaultPage } from '@/features/asset-vault/domain/vaultAlbumTree';

export const CONNECTOR_KEYS: Record<string, string> = {
    server: 'vault.connector.server',
    'indexeddb-legacy': 'vault.connector.localLibrary',
    'google-drive': 'vault.connector.googleDrive',
    local: 'vault.connector.localDrive',
    network: 'vault.connector.network',
};

export type AssetVaultModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (path: string, type: AssetType, name?: string) => void;
    onOpenClassicLibrary?: () => void;
    currentUser?: string;
    initialFilter?: BookcaseFilter;
    initialBookcaseId?: string;
    focusSearch?: boolean;
};

export type NavDepth = 'room' | 'album' | 'page';

export type ContextTarget =
    | { kind: 'asset'; asset: VaultAssetRecord }
    | { kind: 'album'; album: VaultAlbum }
    | { kind: 'page'; page: VaultPage; album: VaultAlbum };

export type PreviewPopup = {
    key: string;
    asset: VaultAssetRecord;
    url: string;
    x: number;
    y: number;
    width: number;
    height: number;
    /**
     * Models use a still thumbnail on hover to avoid spawning a second WebGL
     * context (browsers cap ~8–16 and emit THREE.WebGLRenderer: Context Lost).
     * Live Spin/Light preview stays on click → classic 3D viewer.
     */
    display: 'media' | 'model-still';
};

export function revokeRemovedBlobs(previous: Record<string, string>, next: Record<string, string>) {
    const kept = new Set(Object.values(next));
    for (const url of Object.values(previous)) {
        if (url.startsWith('blob:') && !kept.has(url)) URL.revokeObjectURL(url);
    }
}

export function videoSrcWithPosterSeek(url: string) {
    if (url.startsWith('blob:') || url.includes('#')) return url;
    return `${url}#t=0.1`;
}

export function vaultLensLabelKey(value: VaultOrganizeLens): string {
    switch (value) {
        case 'type': return 'vault.lensType';
        case 'date': return 'vault.lensDate';
        case 'location': return 'vault.lensLocation';
        case 'subject': return 'vault.lensSubject';
        default: return 'vault.lensType';
    }
}

/** Why a search returned a given asset, kept per hit for the details panel. */
export type VaultSearchMatch = {
    score: number;
    matchReasons: string[];
};
