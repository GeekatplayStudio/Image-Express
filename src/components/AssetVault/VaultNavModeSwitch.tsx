'use client';

import { FolderTree, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/I18nProvider';
import type { VaultNavMode } from '@/features/asset-vault/application/client/vaultUiState';

/**
 * Switches the left sidebar between the two ways people look for an asset:
 * what it is (derived groups) and where it lives (the real folder tree).
 * The choice persists, because it reflects how someone thinks rather than
 * what they are doing right now.
 */
export default function VaultNavModeSwitch({
    navMode,
    onChange,
}: {
    navMode: VaultNavMode;
    onChange: (mode: VaultNavMode) => void;
}) {
    const { t } = useI18n();

    const options: Array<{ mode: VaultNavMode; label: string; Icon: typeof LayoutGrid }> = [
        { mode: 'groups', label: t('vault.navGroups'), Icon: LayoutGrid },
        { mode: 'folders', label: t('vault.navFolders'), Icon: FolderTree },
    ];

    return (
        <div
            className="flex shrink-0 border-r border-b border-border/50 bg-card/70"
            role="tablist"
            aria-label={t('vault.navMode')}
            data-testid="vault-nav-mode-switch"
        >
            {options.map(({ mode, label, Icon }) => {
                const active = navMode === mode;
                return (
                    <button
                        key={mode}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(mode)}
                        title={label}
                        className={cn(
                            'flex-1 h-7 inline-flex items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                            active
                                ? 'bg-primary/15 text-primary'
                                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                        )}
                    >
                        <Icon size={11} className="shrink-0" />
                        <span className="truncate">{label}</span>
                    </button>
                );
            })}
        </div>
    );
}
