'use client';

import React from 'react';
import { Check, CircleDashed, Loader2, X, XCircle } from 'lucide-react';

import { useI18n } from '@/providers/I18nProvider';
import type { FoamCutProgress, FoamCutStep } from '@/components/Editor/useFoamCut';

type FoamCutStepsPanelProps = {
    progress: FoamCutProgress | null;
    onDismiss: () => void;
};

/** Enough to diagnose; the rest are counted rather than listed. */
const MAX_SHOWN_ISSUES = 4;

const formatStats = (stats: Record<string, number | string>): Record<string, string | number> => (
    Object.fromEntries(Object.entries(stats).map(([key, value]) => [
        key,
        typeof value === 'number' ? value.toLocaleString() : value,
    ]))
);

function StepStatusIcon({ status }: { status: FoamCutStep['status'] }) {
    if (status === 'running') return <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-amber-500" />;
    if (status === 'done') return <Check aria-hidden="true" className="h-4 w-4 text-emerald-500" />;
    if (status === 'error') return <XCircle aria-hidden="true" className="h-4 w-4 text-red-500" />;
    return <CircleDashed aria-hidden="true" className="h-4 w-4 text-zinc-400" />;
}

/**
 * The live monitor for the low-poly unfold pipeline, docked at the bottom of
 * the editor. Each stage reports its numbers as it finishes, and the visual
 * stages — the low-poly conversion and the unfold — show a thumbnail of what
 * they produced, so a failed or ugly result is diagnosable at a glance.
 */
export default function FoamCutStepsPanel({ progress, onDismiss }: FoamCutStepsPanelProps) {
    const { t } = useI18n();
    if (!progress) return null;

    return (
        <div
            role="status"
            aria-label={t('foamcut.progressTitle', { name: progress.modelName })}
            className="fixed bottom-3 left-1/2 z-[95] w-[min(96vw,64rem)] -translate-x-1/2 rounded-xl border border-zinc-200 bg-white/95 p-3 shadow-2xl backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95"
        >
            <div className="mb-2 flex items-center justify-between gap-3">
                <div className="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                    {t('foamcut.progressTitle', { name: progress.modelName })}
                </div>
                <button
                    type="button"
                    aria-label={t('common.close')}
                    onClick={onDismiss}
                    className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
            <ol className="flex items-stretch gap-2 overflow-x-auto pb-1">
                {progress.steps.map((step, index) => (
                    <li
                        key={step.stage}
                        className={`flex min-w-36 flex-1 flex-col gap-1.5 rounded-lg border p-2 ${step.status === 'running'
                            ? 'border-amber-400/70 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/10'
                            : step.status === 'error'
                                ? 'border-red-400/70 bg-red-50 dark:border-red-500/50 dark:bg-red-500/10'
                                : 'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/60'}`}
                    >
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500">{index + 1}</span>
                            <StepStatusIcon status={step.status} />
                            <span className="truncate text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">
                                {t(`foamcut.step.${step.stage}`)}
                            </span>
                        </div>
                        {step.stats && (
                            <div className="text-[10px] leading-4 text-zinc-500 dark:text-zinc-400">
                                {t(`foamcut.stepDetail.${step.stage}`, formatStats(step.stats))}
                            </div>
                        )}
                        {step.issues && step.issues.length > 0 && (
                            <ul className="max-h-20 space-y-0.5 overflow-y-auto text-[10px] leading-4 text-red-600 dark:text-red-400">
                                {step.issues.slice(0, MAX_SHOWN_ISSUES).map((issue) => (
                                    <li key={issue}>{issue}</li>
                                ))}
                                {step.issues.length > MAX_SHOWN_ISSUES && (
                                    <li className="text-zinc-500 dark:text-zinc-400">
                                        {t('foamcut.moreIssues', { count: step.issues.length - MAX_SHOWN_ISSUES })}
                                    </li>
                                )}
                            </ul>
                        )}
                        {step.previewSvg && (
                            // eslint-disable-next-line @next/next/no-img-element -- inline data-URI SVG; next/image cannot optimise it
                            <img
                                alt={t(`foamcut.step.${step.stage}`)}
                                src={`data:image/svg+xml;utf8,${encodeURIComponent(step.previewSvg)}`}
                                className="h-20 w-full rounded-md border border-zinc-200 bg-white object-contain dark:border-zinc-700"
                            />
                        )}
                    </li>
                ))}
            </ol>
        </div>
    );
}
