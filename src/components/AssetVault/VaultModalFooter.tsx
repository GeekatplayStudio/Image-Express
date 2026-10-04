'use client';

import { HardDrive } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import type { VaultPageSize } from '@/features/asset-vault/application/client/vaultUiState';

type VaultModalFooterProps = {
    statusMessage: string | null;
    resultCount: number;
    pageSize: VaultPageSize;
    onPageSizeChange: (size: VaultPageSize) => void;
    /** Paging of the browse view: how much of the index is loaded, and a way to get more. */
    loadedCount?: number;
    totalCount?: number;
    hasMore?: boolean;
    isLoadingMore?: boolean;
    onLoadMore?: () => void;
};

export default function VaultModalFooter({
    statusMessage,
    resultCount,
    pageSize,
    onPageSizeChange,
    loadedCount = 0,
    totalCount = 0,
    hasMore = false,
    isLoadingMore = false,
    onLoadMore,
}: VaultModalFooterProps) {
    const { t } = useI18n();

    return (
        <div className="h-6 px-2 border-t border-border text-[10px] text-muted-foreground flex items-center justify-between gap-2 shrink-0">
            <span className="truncate">
                {statusMessage || t('vault.resultCount', { count: resultCount })}
            </span>
            <div className="inline-flex items-center gap-2 shrink-0">
                {hasMore && onLoadMore && (
                    <span className="inline-flex items-center gap-1.5" data-testid="vault-load-more">
                        <span className="hidden sm:inline tabular-nums">{t('vault.loadedOfTotal', { loaded: loadedCount, total: totalCount })}</span>
                        <button
                            type="button"
                            onClick={onLoadMore}
                            disabled={isLoadingMore}
                            className="h-5 rounded border border-border bg-background px-1.5 text-[10px] text-foreground hover:bg-secondary disabled:opacity-50"
                        >
                            {isLoadingMore ? t('vault.loadingMore') : t('vault.loadMore')}
                        </button>
                    </span>
                )}
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
