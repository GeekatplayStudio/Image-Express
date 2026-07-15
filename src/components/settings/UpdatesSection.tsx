'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, DownloadCloud, Loader2, RefreshCcw, TriangleAlert } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';

type UpdateStatus = {
    supported: boolean;
    reason?: string;
    branch?: string;
    currentCommit?: string;
    behind?: number;
    updateAvailable?: boolean;
    dirty?: boolean;
    fetchFailed?: boolean;
};

/**
 * "Updates" block for the Settings window.
 *
 * Shows the running commit and whether the git remote has newer code.
 * Applying the update is intentionally done from a terminal
 * (`npm run update`) so the running server is never killed mid-request;
 * this section surfaces that command with copy-to-clipboard.
 */
export default function UpdatesSection({ className }: { className?: string }) {
    const { t } = useI18n();
    const [status, setStatus] = useState<UpdateStatus | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

    const checkForUpdates = useCallback(async () => {
        setIsChecking(true);
        try {
            const response = await fetch('/api/system/update');
            const data = (await response.json()) as UpdateStatus;
            setStatus(data);
        } catch (error) {
            console.error('Update check failed', error);
            setStatus({ supported: false, reason: 'Could not reach the update endpoint.' });
        } finally {
            setIsChecking(false);
        }
    }, []);

    useEffect(() => {
        void checkForUpdates();
    }, [checkForUpdates]);

    const copyUpdateCommand = async () => {
        try {
            await navigator.clipboard.writeText('npm run update');
            setCopyFeedback('Copied "npm run update" — run it in the app folder, then restart.');
        } catch {
            setCopyFeedback('Copy failed — type "npm run update" manually.');
        }
    };

    return (
        <section className={className}>
            <div>
                <h4 className="text-sm font-semibold flex items-center gap-2">
                    <DownloadCloud size={16} className="text-primary" />
                    {t('settings.updates')}
                </h4>
                <p className="text-[11px] text-muted-foreground">
                    Keep Image Express current with the latest code from GitHub.
                </p>
            </div>

            <div className="space-y-2 text-xs">
                {status?.supported && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="font-mono rounded bg-secondary/40 px-1.5 py-0.5">
                            {status.branch} @ {status.currentCommit}
                        </span>
                    </div>
                )}

                {isChecking && (
                    <div className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Loader2 size={13} className="animate-spin" />
                        {t('common.loading')}
                    </div>
                )}

                {!isChecking && status && !status.supported && (
                    <div className="inline-flex items-center gap-1.5 text-amber-600">
                        <TriangleAlert size={13} />
                        {status.reason || 'Updates are not available for this install.'}
                    </div>
                )}

                {!isChecking && status?.supported && !status.updateAvailable && (
                    <div className="inline-flex items-center gap-1.5 text-emerald-500">
                        <CheckCircle2 size={13} />
                        {t('settings.upToDate')}
                        {status.fetchFailed && (
                            <span className="text-amber-600">(offline — showing last known state)</span>
                        )}
                    </div>
                )}

                {!isChecking && status?.supported && status.updateAvailable && (
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-1.5 text-primary font-semibold">
                            <DownloadCloud size={13} />
                            {t('settings.updateAvailable')} ({status.behind} commit{status.behind === 1 ? '' : 's'} behind)
                        </div>
                        {status.dirty && (
                            <div className="text-amber-600 text-[11px]">
                                Local file changes detected — commit or stash them before updating.
                            </div>
                        )}
                        <div className="text-[11px] text-muted-foreground">
                            To update: close the app, run <code className="font-mono bg-secondary/40 rounded px-1">npm run update</code> in
                            the install folder, then start it again.
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={() => void checkForUpdates()}
                    disabled={isChecking}
                    className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                    <RefreshCcw size={13} className={isChecking ? 'animate-spin' : ''} />
                    {t('settings.checkForUpdates')}
                </button>
                {status?.supported && status.updateAvailable && (
                    <button
                        onClick={() => void copyUpdateCommand()}
                        className="h-8 px-3 text-[11px] font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
                    >
                        <DownloadCloud size={13} />
                        {t('settings.updateNow')}
                    </button>
                )}
            </div>
            {copyFeedback && (
                <div className="text-[11px] text-muted-foreground">{copyFeedback}</div>
            )}
        </section>
    );
}
