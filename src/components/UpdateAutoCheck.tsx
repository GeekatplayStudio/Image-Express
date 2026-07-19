'use client';

import { useEffect, useRef } from 'react';
import { useDialog } from '@/providers/DialogProvider';
import { useToast } from '@/providers/ToastProvider';

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
                    `A newer version of Image Express is available (${status.behind} update${status.behind === 1 ? '' : 's'} behind). Download and install it now? The app keeps running while it updates; you restart when it's done.`,
                    { title: 'Update available', confirmText: 'Update now', cancelText: 'Later' }
                );
                if (!wantsUpdate) return;

                toast({ title: 'Updating…', description: 'Pulling the latest version. This can take a minute.' });
                const apply = await fetch('/api/system/update', { method: 'POST' });
                const result = await apply.json() as { success: boolean; commit?: string; error?: string };
                if (result.success) {
                    await alert(
                        `Updated to ${result.commit}. Restart Image Express to finish applying the update.`,
                        { title: 'Update installed' }
                    );
                } else {
                    toast({ title: 'Update failed', description: result.error || 'Unknown error.', variant: 'destructive' });
                }
            } catch {
                // Network hiccup — stay quiet; the user can check manually in Settings.
            }
        }, 6000);

        return () => window.clearTimeout(timer);
    }, [alert, confirm, toast]);

    return null;
}
