'use client';

import { LayoutGrid } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import {
    VAULT_THUMB_SIZES,
    type VaultThumbSize,
} from '@/features/asset-vault/application/client/vaultUiState';

type VaultThumbSizeSliderProps = {
    value: VaultThumbSize;
    onChange: (value: VaultThumbSize) => void;
};

/**
 * Tile-size control for the grid.
 *
 * The slider moves over *step indices*, not pixels, so every position lands on
 * a size whose rendition width the thumbnail cache already keeps. Sliding
 * through a continuous pixel range would ask the server for a new width on
 * every frame and fill the cache with near-identical renditions.
 */
export default function VaultThumbSizeSlider({ value, onChange }: VaultThumbSizeSliderProps) {
    const { t } = useI18n();
    const index = Math.max(0, VAULT_THUMB_SIZES.indexOf(value));

    return (
        <div className="flex items-center gap-1.5" title={t('vault.thumbSize')}>
            <LayoutGrid size={11} className="text-muted-foreground shrink-0" aria-hidden />
            <input
                type="range"
                min={0}
                max={VAULT_THUMB_SIZES.length - 1}
                step={1}
                value={index}
                onChange={(event) => {
                    const next = VAULT_THUMB_SIZES[Number(event.target.value)];
                    if (next) onChange(next);
                }}
                className="h-7 w-20 accent-primary cursor-pointer"
                aria-label={t('vault.thumbSize')}
                // Announces "160 pixels" rather than "step 3", which on its own
                // tells a screen-reader user nothing about what changed.
                aria-valuetext={`${value}px`}
            />
        </div>
    );
}
