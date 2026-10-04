'use client';

import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import type { CritiqueJump, CritiqueReport, CritiqueSeverity } from '@/lib/critique/critiqueReport';

interface CritiqueReportViewProps {
    report: CritiqueReport;
    /** Take the user to where an action is carried out. Omit to hide the buttons. */
    onJump?: (jump: Exclude<CritiqueJump, 'none'>) => void;
}

const SEVERITY_CLASS: Record<CritiqueSeverity, string> = {
    high: 'border-red-500/50 text-red-400',
    medium: 'border-amber-500/50 text-amber-400',
    low: 'border-border text-muted-foreground',
};

const scoreTone = (score: number) => (score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500');

/** A structured critique: score, criteria, issues by severity, and actions. */
export default function CritiqueReportView({ report, onJump }: CritiqueReportViewProps) {
    const { t } = useI18n();

    // The model did not return usable structure: show what it said, as text.
    if (!report.structured) {
        return (
            <div className="space-y-3" data-testid="critique-report">
                <p className="whitespace-pre-wrap text-sm leading-6">{report.summary}</p>
                <p className="text-[11px] text-muted-foreground">{t('critique.report.unstructured')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 text-sm" data-testid="critique-report">
            <div className="flex items-start gap-3">
                {report.score !== null && (
                    <div className="shrink-0 rounded-xl border border-border px-3 py-1.5 text-center" aria-label={t('critique.report.score')}>
                        <div className="text-xl font-semibold tabular-nums leading-6">{report.score}</div>
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">/ 100</div>
                    </div>
                )}
                <p className="leading-6">{report.summary}</p>
            </div>

            <ul className="space-y-1.5">
                {report.criteria.map((criterion) => (
                    <li key={criterion.name} className="flex items-center gap-2 text-xs">
                        <span className="w-36 shrink-0 truncate text-muted-foreground">{criterion.name}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                            {criterion.score !== null && (
                                <span className={`block h-full ${scoreTone(criterion.score)}`} style={{ width: `${criterion.score}%` }} />
                            )}
                        </span>
                        <span className="w-7 shrink-0 text-right tabular-nums text-muted-foreground">{criterion.score ?? '–'}</span>
                    </li>
                ))}
            </ul>

            {report.issues.length > 0 && (
                <section>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('critique.report.issues')}</h4>
                    <ul className="mt-1.5 space-y-1.5">
                        {report.issues.map((issue, index) => (
                            <li key={`${issue.title}-${index}`} className="flex items-start gap-2">
                                <span className={`mt-0.5 shrink-0 rounded border px-1.5 py-px text-[9px] font-semibold uppercase ${SEVERITY_CLASS[issue.severity]}`}>
                                    {t(`critique.report.severity.${issue.severity}`)}
                                </span>
                                <span><span className="font-medium">{issue.title}</span>{issue.detail && <span className="text-muted-foreground"> — {issue.detail}</span>}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('critique.report.actions')}</h4>
                <ul className="mt-1.5 space-y-1.5">
                    {report.actions.map((action, index) => (
                        <li key={`${action.title}-${index}`} className="flex items-start justify-between gap-2 rounded-lg border border-border/60 px-2.5 py-1.5">
                            <span><span className="font-medium">{action.title}</span>{action.detail && <span className="text-muted-foreground"> — {action.detail}</span>}</span>
                            {onJump && action.jump !== 'none' && (
                                <button
                                    type="button"
                                    onClick={() => onJump(action.jump as Exclude<CritiqueJump, 'none'>)}
                                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold hover:bg-secondary transition-colors"
                                >
                                    {t(`critique.report.jump.${action.jump}`)} <ArrowRight size={11} />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}
