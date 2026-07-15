'use client';

import { Box, DownloadCloud, Loader2, RefreshCcw } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import type { InstallerSettings } from '../../hooks/useInstallerSettings';
import { modalSectionClass } from '../../settingsTypes';

interface DependenciesPanelProps {
    installer: Pick<InstallerSettings,
        | 'dependencyStatus' | 'dependencyStatusState' | 'dependencyStatusMessage'
        | 'dependencyRunState' | 'dependencyRunMessage' | 'dependencyRunResult'
        | 'loadDependencyStatus' | 'handleRunDependencyMaintenance'
    >;
}

/** Outdated npm package check + one-click update-and-build for this workspace. */
export default function DependenciesPanel({ installer }: DependenciesPanelProps) {
    const { t } = useI18n();
    const {
        dependencyStatus, dependencyStatusState, dependencyStatusMessage,
        dependencyRunState, dependencyRunMessage, dependencyRunResult,
        loadDependencyStatus, handleRunDependencyMaintenance,
    } = installer;

    return (
        <section className={modalSectionClass}>
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Box size={16} className="text-primary" />
                        {t('settings.workspace.projectDependencies')}
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                        Check outdated npm packages for this workspace and run a one-click latest-version update followed by a build.
                    </p>
                </div>
                <button
                    onClick={() => void loadDependencyStatus()}
                    className="px-3 py-1.5 text-[11px] font-semibold border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-1"
                    disabled={dependencyStatusState === 'loading' || dependencyRunState === 'running'}
                >
                    <RefreshCcw size={14} className={dependencyStatusState === 'loading' ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {dependencyStatusState === 'error' && (
                <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                    {dependencyStatusMessage || 'Failed to load dependency maintenance status.'}
                </div>
            )}

            {dependencyStatus?.enabled === false && (
                <div className="text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                    {dependencyStatus.reason || 'Dependency maintenance is disabled in this runtime.'}
                </div>
            )}

            {dependencyStatus && (
                <>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2">
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Outdated</div>
                            <div className="text-sm font-semibold text-foreground">{dependencyStatus.summary.outdatedCount}</div>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2">
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Dependencies</div>
                            <div className="text-sm font-semibold text-foreground">{dependencyStatus.summary.dependencyCount}</div>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2">
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Lockfile</div>
                            <div className="text-sm font-semibold text-foreground">{dependencyStatus.packageLockPresent ? 'package-lock.json' : 'missing'}</div>
                        </div>
                    </div>

                    <div className="rounded-md border border-border/60 bg-background/70 px-3 py-2 text-[11px] text-muted-foreground space-y-1">
                        <div>Workspace: <span className="font-mono text-foreground">{dependencyStatus.projectName}@{dependencyStatus.projectVersion}</span></div>
                        <div>Package manager: <span className="font-medium text-foreground">{dependencyStatus.packageManager}</span></div>
                        <div>Last checked: <span className="font-medium text-foreground">{new Date(dependencyStatus.checkedAt).toLocaleString()}</span></div>
                    </div>

                    <div className="space-y-2">
                        {dependencyStatus.outdated.slice(0, 8).map((pkg) => (
                            <div key={pkg.name} className="rounded-md border border-border/50 bg-background/70 px-3 py-2 text-[11px]">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="font-semibold text-foreground">{pkg.name}</div>
                                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{pkg.section}</div>
                                </div>
                                <div className="text-muted-foreground">
                                    {pkg.current} → {pkg.latest}
                                </div>
                            </div>
                        ))}
                        {dependencyStatus.summary.outdatedCount === 0 && (
                            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-700">
                                No outdated top-level npm packages were found.
                            </div>
                        )}
                        {dependencyStatus.summary.outdatedCount > 8 && (
                            <div className="text-[11px] text-muted-foreground">
                                Showing 8 of {dependencyStatus.summary.outdatedCount} outdated packages.
                            </div>
                        )}
                    </div>
                </>
            )}

            <button
                onClick={() => void handleRunDependencyMaintenance()}
                disabled={dependencyRunState === 'running' || dependencyStatusState === 'loading' || dependencyStatus?.enabled === false}
                className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {dependencyRunState === 'running' ? <Loader2 size={13} className="animate-spin" /> : <DownloadCloud size={13} />}
                Update All To Latest + Build
            </button>

            {dependencyRunMessage && (
                <div className={`text-[11px] rounded-md border px-2.5 py-2 ${
                    dependencyRunState === 'success'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                        : dependencyRunState === 'error'
                            ? 'border-destructive/30 bg-destructive/10 text-destructive'
                            : 'border-border/60 bg-background/70 text-muted-foreground'
                }`}>
                    {dependencyRunMessage}
                </div>
            )}

            {dependencyRunResult && (
                <div className="rounded-md border border-border/60 bg-background/70 p-2 space-y-1">
                    <p className="text-[11px] text-muted-foreground">
                        Updated {dependencyRunResult.summary.updatedCount} package{dependencyRunResult.summary.updatedCount === 1 ? '' : 's'}; failed steps: {dependencyRunResult.summary.failedSteps}.
                    </p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                        {dependencyRunResult.steps.map((stepResult) => (
                            <div key={stepResult.id} className="rounded border border-border/50 bg-background px-2 py-1 text-[10px]">
                                <div className="font-semibold">
                                    {stepResult.label} ({stepResult.success ? 'ok' : `failed: ${stepResult.exitCode}`})
                                </div>
                                {stepResult.stderr ? (
                                    <div className="mt-0.5 text-destructive/90 whitespace-pre-wrap">{stepResult.stderr.slice(0, 500)}</div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <p className="text-[11px] text-muted-foreground">
                This action updates top-level npm package ranges in <span className="font-mono">package.json</span>, runs <span className="font-mono">npm install</span>, and then runs <span className="font-mono">npm run build</span>. It is intentionally limited to local development or the desktop shell.
            </p>
        </section>
    );
}
