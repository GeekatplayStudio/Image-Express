'use client';

import { Cloud, MonitorSmartphone, Sparkles, Wand2 } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';

interface GeneratorSetupGateProps {
    /** Opens the guided Setup Wizard. */
    onOpenWizard: () => void;
    /** Opens the full settings window (AI services tab). */
    onOpenSettings?: () => void;
    /** Lets the user browse the generator UI without a configured service. */
    onContinueAnyway: () => void;
}

/**
 * Friendly first-run explainer shown when the Generative AI window opens
 * and no AI service is configured yet. Explains the difference between
 * online API providers (may require purchased credits) and local ComfyUI
 * (free but more advanced), and routes the user into the Setup Wizard.
 */
export default function GeneratorSetupGate({
    onOpenWizard,
    onOpenSettings,
    onContinueAnyway,
}: GeneratorSetupGateProps) {
    const { t } = useI18n();

    return (
        <div className="mx-auto flex h-full max-w-xl flex-col items-stretch justify-center gap-4 p-6">
            <div className="space-y-1 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Sparkles size={22} />
                </div>
                <h3 className="text-base font-semibold text-foreground">{t('generator.gate.title')}</h3>
                <p className="text-xs text-muted-foreground">{t('generator.gate.intro')}</p>
            </div>

            <div className="space-y-3">
                <div className="flex gap-3 rounded-lg border border-border/70 bg-secondary/10 p-3">
                    <Cloud size={18} className="mt-0.5 shrink-0 text-sky-500" />
                    <div className="space-y-1">
                        <div className="text-xs font-semibold text-foreground">{t('generator.gate.cloudTitle')}</div>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">{t('generator.gate.cloudBody')}</p>
                    </div>
                </div>

                <div className="flex gap-3 rounded-lg border border-border/70 bg-secondary/10 p-3">
                    <MonitorSmartphone size={18} className="mt-0.5 shrink-0 text-emerald-500" />
                    <div className="space-y-1">
                        <div className="text-xs font-semibold text-foreground">{t('generator.gate.localTitle')}</div>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">{t('generator.gate.localBody')}</p>
                        <p className="text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">{t('generator.gate.localWarning')}</p>
                    </div>
                </div>
            </div>

            <div className="space-y-2 pt-1">
                <p className="text-center text-xs font-medium text-foreground">{t('generator.gate.question')}</p>
                <button
                    type="button"
                    onClick={onOpenWizard}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                    <Wand2 size={15} />
                    {t('generator.gate.wizard')}
                </button>
                <div className="grid grid-cols-2 gap-2">
                    {onOpenSettings && (
                        <button
                            type="button"
                            onClick={onOpenSettings}
                            className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                        >
                            {t('generator.gate.settings')}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onContinueAnyway}
                        className={`rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground ${onOpenSettings ? '' : 'col-span-2'}`}
                    >
                        {t('generator.gate.continue')}
                    </button>
                </div>
            </div>
        </div>
    );
}
