'use client';
// Shown when the saved Local AI model cannot read images.
//
// The old behaviour was a dead end: it named the problem and told the user to
// go to Settings and pick a different model — without saying which of their
// models would work, or what to install if none would. Both answers are
// knowable, so this offers them as buttons.
//
// Installed models are classified by Ollama's own capabilities, and the
// install list is checked against the live Ollama library, so neither
// depends on this file knowing today's model names.

import { useCallback, useEffect, useState } from 'react';
import { Download, Check, Loader2, Eye } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import { requestOllamaModelInstall } from '@/lib/ollamaModelInstall';
import {
    fetchOllamaVisionModels,
    type VisionModelSuggestion,
} from '@/lib/ollamaVisionModels';

type VisionModelPickerProps = {
    baseUrl: string;
    /** Applies the chosen model as the saved Local AI Runtime model. */
    onChooseModel: (model: string) => void;
};

export default function VisionModelPicker({ baseUrl, onChooseModel }: VisionModelPickerProps) {
    const { t } = useI18n();
    const [installed, setInstalled] = useState<string[]>([]);
    const [suggestions, setSuggestions] = useState<VisionModelSuggestion[]>([]);
    const [newerInLibrary, setNewerInLibrary] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [installing, setInstalling] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        void fetchOllamaVisionModels(baseUrl)
            .then((result) => {
                if (cancelled) return;
                setInstalled(result.installed);
                setSuggestions(result.suggestions);
                setNewerInLibrary(result.newerInLibrary);
            })
            .catch(() => {
                if (!cancelled) setError(t('critique.visionCatalogFailed'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [baseUrl, t]);

    const install = useCallback(async (model: string) => {
        setInstalling(model);
        setError(null);
        try {
            await requestOllamaModelInstall({ baseUrl, model });
            // Installing is only useful if we then use it.
            onChooseModel(model);
            setInstalled((prev) => (prev.includes(model) ? prev : [...prev, model]));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : t('critique.visionInstallFailed'));
        } finally {
            setInstalling(null);
        }
    }, [baseUrl, onChooseModel, t]);

    if (loading) {
        return (
            <div className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 size={12} className="animate-spin" /> {t('critique.visionLoading')}
            </div>
        );
    }

    return (
        <div className="mt-3 space-y-3" data-testid="vision-model-picker">
            {error ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {error}
                </div>
            ) : null}

            {installed.length > 0 ? (
                <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('critique.visionInstalledTitle')}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {installed.map((model) => (
                            <button
                                key={model}
                                type="button"
                                onClick={() => onChooseModel(model)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-100 transition hover:bg-emerald-500/20"
                                data-testid={`vision-use-${model}`}
                            >
                                <Eye size={11} /> {model}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {installed.length > 0 ? t('critique.visionInstallMoreTitle') : t('critique.visionInstallTitle')}
                </div>
                <div className="mt-1.5 space-y-1.5">
                    {suggestions.map((entry) => {
                        const alreadyInstalled = installed.includes(entry.model);
                        const busy = installing === entry.model;
                        return (
                            <div
                                key={entry.model}
                                className="flex items-start gap-2 rounded-lg border border-border bg-secondary/20 px-2 py-1.5"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                                        <span className="font-mono truncate">{entry.model}</span>
                                        <span className="shrink-0 text-muted-foreground">{entry.size}</span>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">{entry.note}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void install(entry.model)}
                                    disabled={Boolean(installing) || alreadyInstalled}
                                    className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                                    data-testid={`vision-install-${entry.model}`}
                                >
                                    {alreadyInstalled ? <Check size={10} /> : busy ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                                    {alreadyInstalled
                                        ? t('critique.visionInstalled')
                                        : busy ? t('critique.visionInstalling') : t('critique.visionInstall')}
                                </button>
                            </div>
                        );
                    })}
                </div>
                {installing ? (
                    <p className="mt-1.5 text-[10px] text-muted-foreground">{t('critique.visionInstallSlow')}</p>
                ) : null}
            </div>

            {newerInLibrary.length > 0 ? (
                <p className="text-[10px] text-muted-foreground">
                    {t('critique.visionNewer', { models: newerInLibrary.slice(0, 6).join(', ') })}
                </p>
            ) : null}
        </div>
    );
}
