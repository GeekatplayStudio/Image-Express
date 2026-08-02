'use client';

import { HardDrive } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import type { VaultPageSize } from '@/features/asset-vault/application/client/vaultUiState';

type VaultModalFooterProps = {
    statusMessage: string | null;
    resultCount: number;
    pageSize: VaultPageSize;
    onPageSizeChange: (size: VaultPageSize) => void;
};

export default function VaultModalFooter({
    statusMessage,
    resultCount,
    pageSize,
    onPageSizeChange,
}: VaultModalFooterProps) {
    const { t } = useI18n();

    return (
        <div className="h-6 px-2 border-t border-border text-[10px] text-muted-foreground flex items-center justify-between gap-2 shrink-0">
            <span className="truncate">
                {statusMessage || t('vault.resultCount', { count: resultCount })}
            </span>
            <div className="inline-flex items-center gap-2 shrink-0">
                <label className="inline-flex items-center gap-1" title={t('vault.pageSize')}>
                    <span className="hidden sm:inline">{t('vault.pageSize')}</span>
                    <select
                        value={String(pageSize)}
                        onChange={(event) => {
                            const value = event.target.value;
                            onPageSizeChange(value === 'all' ? 'all' : Number(value) as 24 | 48 | 96);
                        }}
                        className="h-5 max-w-[72px] rounded border border-border bg-background px-1 text-[10px] text-foreground"
                        aria-label={t('vault.pageSize')}
                    >
                        <option value="24">24</option>
                        <option value="48">48</option>
                        <option value="96">96</option>
                        <option value="all">{t('vault.pageSizeAll')}</option>
                    </select>
                </label>
                <span className="inline-flex items-center gap-1">
                    <HardDrive size={10} /> {t('vault.betaNote')}
                </span>
            </div>
        </div>
    );
}
