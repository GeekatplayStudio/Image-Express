'use client';

import { useState } from 'react';
import { Box, FileWarning, Loader2, MoreVertical, Music } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import {
    CONNECTOR_KEYS,
    videoSrcWithPosterSeek,
} from '@/components/AssetVault/vaultModalTypes';

type VaultAssetCardProps = {
    asset: VaultAssetRecord;
    thumb?: string;
    source?: string;
    /** Double click. Opens the full preview — the 3D viewer for models. */
    onOpen: (asset: VaultAssetRecord) => void;
    /** Single click. Shows the asset in the details panel. */
    onSelect: (asset: VaultAssetRecord) => void;
    isSelected: boolean;
    onContextMenu: (asset: VaultAssetRecord, event: React.MouseEvent) => void;
    onHoverStart: (asset: VaultAssetRecord, rect: DOMRect) => void;
    onHoverEnd: (assetId: string) => void;
};

export default function VaultAssetCard({
    asset,
    thumb,
    source,
    onOpen,
    onSelect,
    isSelected,
    onContextMenu,
    onHoverStart,
    onHoverEnd,
}: VaultAssetCardProps) {
    const { t } = useI18n();
    const supportsHoverPreview = asset.type === 'models' || asset.type === 'videos' || asset.type === 'audio';
    /**
     * Set when the artwork itself fails to load — an unreadable file, a codec
     * the browser will not decode. Without it the tile kept whatever it had
     * before, which for a still meant a spinner that never stopped and gave the
     * user no way to tell a slow file from a broken one.
     */
    const [artworkFailed, setArtworkFailed] = useState(false);

    // Reset the moment the artwork changes. A video tile shows the raw file
    // first and swaps to a poster once one is captured; without this, a failure
    // on the first would keep the warning glyph even after the poster arrived.
    const artworkUrl = thumb || source;
    const [failedUrl, setFailedUrl] = useState(artworkUrl);
    if (failedUrl !== artworkUrl) {
        setFailedUrl(artworkUrl);
        setArtworkFailed(false);
    }

    const showArtwork = Boolean(artworkUrl) && !artworkFailed;

    return (
        <div
            className={`group relative rounded-md border bg-card overflow-hidden transition-all text-left ${
                isSelected
                    ? 'border-primary ring-1 ring-primary/50'
                    : 'border-border hover:border-primary/40'
            }`}
            aria-selected={isSelected}
            onContextMenu={(event) => onContextMenu(asset, event)}
            onMouseEnter={(event) => {
                if (!supportsHoverPreview) return;
                onHoverStart(asset, event.currentTarget.getBoundingClientRect());
            }}
            onMouseLeave={() => {
                if (!supportsHoverPreview) return;
                onHoverEnd(asset.id);
            }}
        >
            <button
                type="button"
                onClick={() => onSelect(asset)}
                // Double click opens the preview — for a model that is the 3D
                // viewer, which is the only way to inspect it without dropping
                // it on a canvas. Adding to the canvas lives on the context
                // menu and the details panel.
                onDoubleClick={() => onOpen(asset)}
                className="w-full text-left"
            >
                <div className="aspect-square bg-secondary/20 flex items-center justify-center relative overflow-hidden">
                    {artworkFailed && asset.type !== 'audio' && (
                        <FileWarning size={20} className="text-muted-foreground/60" />
                    )}
                    {!thumb && !source && !artworkFailed && asset.type !== 'audio' && (
                        <Loader2 size={14} className="animate-spin text-muted-foreground" />
                    )}
                    {asset.type === 'videos' && showArtwork && (
                        thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt={asset.name} className="w-full h-full object-cover" onError={() => setArtworkFailed(true)} />
                        ) : (
                            <video src={videoSrcWithPosterSeek(source!)} className="w-full h-full object-cover" muted playsInline preload="metadata" onError={() => setArtworkFailed(true)} />
                        )
                    )}
                    {asset.type === 'models' && (
                        thumb && !artworkFailed ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt={asset.name} className="w-full h-full object-contain bg-secondary/30" onError={() => setArtworkFailed(true)} />
                        ) : <Box size={24} className="text-muted-foreground" />
                    )}
                    {asset.type === 'images' && showArtwork && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb || source} alt={asset.name} className="w-full h-full object-cover" onError={() => setArtworkFailed(true)} />
                    )}
                    {asset.type === 'audio' && <Music size={24} className="text-muted-foreground" />}
                    <span className="absolute bottom-1 left-1 text-[9px] px-1 py-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100">
                        {t(CONNECTOR_KEYS[asset.origin.connector] || 'vault.connector.server')}
                    </span>
                </div>
                <div className="p-1.5 pr-6">
                    <p className="text-[11px] font-medium truncate" title={asset.name}>{asset.name}</p>
                </div>
            </button>
            <button
                type="button"
                onClick={(event) => onContextMenu(asset, event)}
                className="absolute top-1 right-1 h-5 w-5 rounded bg-black/45 text-white opacity-0 group-hover:opacity-100 inline-flex items-center justify-center"
                aria-label={t('vault.assetActions')}
            >
                <MoreVertical size={11} />
            </button>
        </div>
    );
}
