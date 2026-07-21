'use client';

import { Key } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import { requestOpenSetupWizard } from '@/lib/setupWizard';
import { modalSectionClass } from '../../settingsTypes';

/** Preferences card: setup wizard entry point. */
export default function PreferencesPanel() {
    const { t } = useI18n();
    return (
        <section className={modalSectionClass}>
            <div>
                <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Key size={16} className="text-primary" />
                    {t('settings.preferences')}
                </h4>
                <p className="text-[11px] text-muted-foreground">
                    {t('settings.workspace.preferencesHint')}
                </p>
            </div>
            <button
                onClick={() => requestOpenSetupWizard()}
                className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 self-start"
            >
                <Key size={13} />
                {t('settings.openSetupWizard')}
            </button>
        </section>
    );
}
