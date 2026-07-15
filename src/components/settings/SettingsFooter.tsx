'use client';

import { Loader2, Save } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';

interface SettingsFooterProps {
    saveStatusMessage: string;
    status: 'idle' | 'saved' | 'saving' | 'error';
    onCancel: () => void;
    onSave: () => void;
}

/** Sticky footer: save status text, Cancel, and Save Configurations. */
export default function SettingsFooter({ saveStatusMessage, status, onCancel, onSave }: SettingsFooterProps) {
    const { t } = useI18n();
    return (
        <div className="shrink-0 border-t border-border/60 bg-card/95 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">{saveStatusMessage}</p>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
                    >
                        {t('settings.cancel')}
                    </button>
                    <button
                        onClick={onSave}
                        disabled={status === 'saving'}
                        className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-lg shadow-primary/20 flex items-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {status === 'saving' ? t('settings.saving') : status === 'saved' ? t('settings.saved') : t('settings.saveConfigurations')}
                        {status === 'saving' ? <Loader2 size={16} className="animate-spin" /> : status !== 'saved' && <Save size={16} />}
                    </button>
                </div>
            </div>
        </div>
    );
}
