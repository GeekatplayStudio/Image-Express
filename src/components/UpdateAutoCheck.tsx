'use client';

import { useEffect, useRef } from 'react';
import { useDialog } from '@/providers/DialogProvider';
import { useToast } from '@/providers/ToastProvider';
import { useI18n } from '@/providers/I18nProvider';

export const UPDATE_AUTOCHECK_STORAGE_KEY = 'image-express-update-autocheck';

export const loadUpdateAutoCheck = (): boolean => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(UPDATE_AUTOCHECK_STORAGE_KEY) !== 'off';
};

export const saveUpdateAutoCheck = (enabled: boolean) => {
    window.localStorage.setItem(UPDATE_AUTOCHECK_STORAGE_KEY, enabled ? 'on' : 'off');
};

/**
 * On app load (when the user hasn't disabled it), quietly checks whether a
 * newer version exists on the git remote. If so, asks the user whether to
 * update now; accepting pulls the update in place and prompts for a restart.
 */
export default function UpdateAutoCheck() {
    const { t } = useI18n();
    const { confirm, alert } = useDialog();
    const { toast } = useToast();
    const ranRef = useRef(false);

    useEffect(() => {
        if (ranRef.current) return;
        ranRef.current = true;
        if (!loadUpdateAutoCheck()) return;

        const timer = window.setTimeout(async () => {
            try {
                const response = await fetch('/api/system/update');
                const status = await response.json() as { supported?: boolean; updateAvailable?: boolean; behind?: number; dirty?: boolean };
                if (!status.supported || !status.updateAvailable || status.dirty) return;

                const wantsUpdate = await confirm(
                    t('updates.availableBody', { behind: t('updates.behind', { count: status.behind ?? 1 }) }),
                    { title: t('updates.availableTitle'), confirmText: t('updates.updateNowConfirm'), cancelText: t('updates.later') }
                );
                if (!wantsUpdate) return;

                toast({ title: t('updates.updating'), description: t('updates.updatingBody') });
                const apply = await fetch('/api/system/update', { method: 'POST' });
                const result = await apply.json() as { success: boolean; commit?: string; error?: string };
                if (result.success) {
                    await alert(
                        t('updates.installedBody', { commit: result.commit ?? '' }),
                        { title: t('updates.installedTitle') }
                    );
                } else {
                    toast({ title: t('updates.updateFailedTitle'), description: result.error || t('pack.unknownError'), variant: 'destructive' });
                }
            } catch {
                // Network hiccup — stay quiet; the user can check manually in Settings.
            }
        }, 6000);

        return () => window.clearTimeout(timer);
    }, [alert, confirm, t, toast]);

    return null;
}
