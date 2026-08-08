'use client';

import { HardDrive, Layers, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/I18nProvider';
import type {
    VaultAssetSource,
    VaultSourceCounts,
} from '@/features/asset-vault/domain/filterVaultAssets';

/**
 * Chooses between the assets the user brought into the app and everything a
 * drive scan found.
 *
 * This exists because the two differ by orders of magnitude. One real vault
 * held 81 assets the user had imported or generated against 239,688 indexed
 * from disk — so without a way to separate them, the things someone actually
 * works with are 0.03% of what they scroll past.
 *
 * Counts are on the buttons deliberately: the difference between the choices is
 * the whole point, and showing it saves switching just to find out.
 */
export default function VaultSourceSwitch({
    source,
    counts,
    onChange,
}: {
    source: VaultAssetSource;
    counts: VaultSourceCounts;
    onChange: (source: VaultAssetSource) => void;
}) {
    const { t } = useI18n();

    const options: Array<{
        value: VaultAssetSource;
        label: string;
        count: number;
        Icon: typeof Layers;
    }> = [
        { value: 'library', label: t('vault.sourceLibrary'), count: counts.library, Icon: Sparkles },
        { value: 'indexed', label: t('vault.sourceIndexed'), count: counts.indexed, Icon: HardDrive },
        { value: 'all', label: t('vault.sourceAll'), count: counts.all, Icon: Layers },
    ];

    const compact = (value: number) => (
        value >= 10_000 ? `${Math.round(value / 1000)}k` : value.toLocaleString()
    );

    return (
        <div
            role="group"
            aria-label={t('vault.sourceLabel')}
            className="flex items-center gap-0.5 rounded-md border border-border bg-card/60 p-0.5"
        >
            {options.map(({ value, label, count, Icon }) => {
                const active = source === value;
                return (
                    <button
                        key={value}
                        type="button"
                        onClick={() => onChange(value)}
                        aria-pressed={active}
                        title={`${label} · ${count.toLocaleString()}`}
                        className={cn(
                            'flex items-center gap-1 rounded px-2 h-6 text-[11px] transition-colors',
                            active
                                ? 'bg-primary/15 text-primary border border-primary/40'
                                : 'text-muted-foreground hover:bg-secondary border border-transparent',
                        )}
                    >
                        <Icon size={11} className="shrink-0" />
                        <span>{label}</span>
                        <span className="tabular-nums opacity-70">{compact(count)}</span>
                    </button>
                );
            })}
        </div>
    );
}
