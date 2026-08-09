'use client';

import { AlertTriangle } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Shown in place of the 3D canvas when a model cannot be loaded.
 *
 * The alternative is what used to happen: the loader threw, nothing caught it,
 * and the browser replaced the whole app with its own crash page. A dead end
 * with a way out is strictly better than a dead app.
 */
export default function ModelLoadFailure({ onClose }: { onClose: () => void }) {
    const { t } = useI18n();
    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
            <AlertTriangle size={22} className="text-muted-foreground" />
            <p className="text-sm font-medium">{t('view3d.loadFailed')}</p>
            <p className="text-[11px] text-muted-foreground max-w-xs">{t('view3d.loadFailedHint')}</p>
            <button
                type="button"
                onClick={onClose}
                className="mt-1 h-7 px-3 rounded-md border border-border text-[11px] hover:bg-secondary"
            >
                {t('common.close')}
            </button>
        </div>
    );
}
