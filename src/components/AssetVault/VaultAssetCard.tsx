'use client';

import { Box, Loader2, MoreVertical, Music } from 'lucide-react';
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
    onOpen: (asset: VaultAssetRecord) => void;
    onAddToCanvas: (asset: VaultAssetRecord) => void;
    onContextMenu: (asset: VaultAssetRecord, event: React.MouseEvent) => void;
    onHoverStart: (asset: VaultAssetRecord, rect: DOMRect) => void;
    onHoverEnd: (assetId: string) => void;
};

export default function VaultAssetCard({
    asset,
    thumb,
    source,
    onOpen,
    onAddToCanvas,
    onContextMenu,
    onHoverStart,
    onHoverEnd,
}: VaultAssetCardProps) {
    const { t } = useI18n();
    const supportsHoverPreview = asset.type === 'models' || asset.type === 'videos' || asset.type === 'audio';

    return (
        <div
            className="group relative rounded-md border border-border bg-card overflow-hidden hover:border-primary/40 transition-all text-left"
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
                onClick={() => onOpen(asset)}
                onDoubleClick={() => onAddToCanvas(asset)}
                className="w-full text-left"
            >
                <div className="aspect-square bg-secondary/20 flex items-center justify-center relative overflow-hidden">
                    {!thumb && !source && asset.type !== 'audio' && (
                        <Loader2 size={14} className="animate-spin text-muted-foreground" />
                    )}
                    {asset.type === 'videos' && (thumb || source) && (
                        thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt={asset.name} className="w-full h-full object-cover" />
                        ) : (
                            <video src={videoSrcWithPosterSeek(source!)} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                        )
                    )}
                    {asset.type === 'models' && (
                        thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt={asset.name} className="w-full h-full object-contain bg-secondary/30" />
                        ) : <Box size={24} className="text-muted-foreground" />
                    )}
                    {asset.type === 'images' && (thumb || source) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb || source} alt={asset.name} className="w-full h-full object-cover" />
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
