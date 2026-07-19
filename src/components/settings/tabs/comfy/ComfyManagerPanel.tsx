'use client';

import { DownloadCloud, Loader2, RefreshCcw, Server } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import { RichText } from '@/lib/i18n/RichText';
import type { ComfyLibraryRepoKind } from '@/lib/comfyui/libraryTypes';
import type { InstallerSettings } from '../../hooks/useInstallerSettings';
import type { ComfyLibrarySettings } from '../../hooks/useComfyLibrarySettings';

interface ComfyManagerPanelProps {
    installer: InstallerSettings;
    library: ComfyLibrarySettings;
    comfyInstallPath: string;
    onRunInstallerWorkflow: (payload: {
        installComfy: boolean;
        installCustomBundles: boolean;
        installComfyModels: boolean;
        installOllamaModels: boolean;
        runQa: boolean;
        autoFix: boolean;
        skipTests: boolean;
        dryRun: boolean;
    }) => void;
}

/** Side-by-side ComfyUI installer status and workflow/custom-node library manager. */
export default function ComfyManagerPanel({ installer, library, comfyInstallPath, onRunInstallerWorkflow }: ComfyManagerPanelProps) {
    const { t } = useI18n();
    const {
        installerStatus, installerStatusState, installerStatusMessage,
        installerRunState, installerRunMessage, installerRunResult,
        loadInstallerStatus,
    } = installer;
    const {
        comfyLibrarySnapshot, comfyLibraryCheck, comfyRepoUrl, setComfyRepoUrl, comfyRepoKind, setComfyRepoKind,
        handleRefreshComfyLibrary, handleInstallComfyRepo, handleUpdateComfyInstall, handleUpdateManagedRepo,
    } = library;

    return (
        <div className="grid gap-4 2xl:grid-cols-2 xl:col-span-12">
            <div className="space-y-2 rounded-xl border border-border/60 bg-secondary/10 p-3 h-full">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h5 className="text-xs font-semibold">{t('settings.comfy.installer')}</h5>
                        <p className="text-[11px] text-muted-foreground">
                            {t('comfyMgr.validateHint')}
                        </p>
                    </div>
                    <button
                        onClick={() => void loadInstallerStatus()}
                        disabled={installerStatusState === 'loading'}
                        className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {installerStatusState === 'loading' ? (
                            <Loader2 size={13} className="animate-spin" />
                        ) : (
                            <RefreshCcw size={13} />
                        )}
                        {t('comfyMgr.refreshStatus')}
                    </button>
                </div>

                {installerStatusState === 'error' && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
                        {installerStatusMessage || 'Failed to load installer runtime status.'}
                    </div>
                )}

                {installerStatus && (
                    <>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-md border border-border/50 bg-background/70 px-2 py-2">
                                <div className="text-[10px] uppercase text-muted-foreground">{t('comfyMgr.runtime')}</div>
                                <div
                                    className={`text-sm font-semibold ${installerStatus.summary.ready ? 'text-emerald-600' : 'text-amber-600'}`}
                                    data-testid="settings-installer-ready"
                                >
                                    {installerStatus.summary.ready ? 'Ready' : `${installerStatus.summary.missing.length} missing`}
                                </div>
                            </div>
                            <div className="rounded-md border border-border/50 bg-background/70 px-2 py-2">
                                <div className="text-[10px] uppercase text-muted-foreground">{t('comfyMgr.installerTarget')}</div>
                                <div className="text-sm font-semibold">
                                    {installerStatus.comfyDirectory.gitRepo ? 'Detected' : 'Missing'}
                                </div>
                            </div>
                            <div className="rounded-md border border-border/50 bg-background/70 px-2 py-2">
                                <div className="text-[10px] uppercase text-muted-foreground">{t('comfyMgr.bundles')}</div>
                                <div className="text-sm font-semibold">
                                    {installerStatus.customBundles.filter((bundle) => bundle.exists).length}/{installerStatus.customBundles.length}
                                </div>
                            </div>
                            <div className="rounded-md border border-border/50 bg-background/70 px-2 py-2">
                                <div className="text-[10px] uppercase text-muted-foreground">{t('comfyMgr.workflowDropFolder')}</div>
                                <div className="text-sm font-semibold">
                                    {installerStatus.localWorkspace.workflowFileCount} file{installerStatus.localWorkspace.workflowFileCount === 1 ? '' : 's'}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-md border border-border/60 bg-background/70 px-3 py-2 text-[11px] text-muted-foreground space-y-1">
                            <div>{t('comfyMgr.installTargetLabel')} <span className="font-mono text-foreground">{installerStatus.comfyDirectory.path}</span></div>
                            <div>{t('comfyMgr.workflowDropLabel')} <span className="font-mono text-foreground">{installerStatus.localWorkspace.path}</span></div>
                            <div>{t('comfyMgr.autoSyncLabel')} <span className="font-medium text-foreground">{installerStatus.localWorkspace.syncedDirectories.length > 0 ? installerStatus.localWorkspace.syncedDirectories.join(', ') : t('comfyMgr.defaultSyncFolders')}</span></div>
                        </div>

                        {installerStatus.summary.missing.length > 0 ? (
                            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 space-y-1">
                                <div className="font-semibold">{t('comfyMgr.missingDeps')}</div>
                                {installerStatus.summary.missing.map((item) => (
                                    <div key={item}>- {item}</div>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[11px] text-emerald-700">
                                {t('comfyMgr.allDepsInstalled')}
                            </div>
                        )}

                        <div className="rounded-md border border-border/60 bg-background/70 p-2 space-y-2">
                            <div className="text-[11px] font-semibold text-foreground">{t('comfyMgr.trackedModelPacks')}</div>
                            <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                                {installerStatus.comfyModels.map((model) => (
                                    <div key={model.id} className="rounded border border-border/50 bg-background px-2 py-1 text-[10px]">
                                        <div className="font-semibold text-foreground">
                                            {model.displayName} {model.exists ? '(installed)' : '(missing)'}
                                        </div>
                                        <div className="text-muted-foreground">
                                            {(model.category || 'Model')} · {model.recommendedFor && model.recommendedFor.length > 0 ? model.recommendedFor.join(', ') : 'General local workflow support'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <p className="text-[11px] text-muted-foreground">
                            {t('comfyMgr.syncHint')}
                        </p>

                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => onRunInstallerWorkflow({
                                    installComfy: true, installCustomBundles: true, installComfyModels: false, installOllamaModels: false,
                                    runQa: false, autoFix: false, skipTests: false, dryRun: true,
                                })}
                                disabled={installerRunState === 'running'}
                                className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {installerRunState === 'running' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />}
                                {t('comfyMgr.dryRun')}
                            </button>
                            <button
                                onClick={() => onRunInstallerWorkflow({
                                    installComfy: true, installCustomBundles: true, installComfyModels: true, installOllamaModels: true,
                                    runQa: true, autoFix: true, skipTests: false, dryRun: false,
                                })}
                                disabled={installerRunState === 'running'}
                                className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {installerRunState === 'running' ? <Loader2 size={13} className="animate-spin" /> : <DownloadCloud size={13} />}
                                {t('comfyMgr.runInstallerQa')}
                            </button>
                            <button
                                onClick={() => onRunInstallerWorkflow({
                                    installComfy: false, installCustomBundles: false, installComfyModels: false, installOllamaModels: false,
                                    runQa: true, autoFix: true, skipTests: false, dryRun: false,
                                })}
                                disabled={installerRunState === 'running'}
                                className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {installerRunState === 'running' ? <Loader2 size={13} className="animate-spin" /> : <Server size={13} />}
                                {t('comfyMgr.runQaAutofix')}
                            </button>
                        </div>

                        {installerRunMessage && (
                            <div
                                className={`text-[11px] rounded-md border px-2.5 py-2 ${
                                    installerRunState === 'success'
                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                                        : installerRunState === 'error'
                                            ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                            : 'border-border/60 bg-background/70 text-muted-foreground'
                                }`}
                                data-testid="settings-installer-run-message"
                            >
                                {installerRunMessage}
                            </div>
                        )}

                        {installerRunResult && (
                            <div className="rounded-md border border-border/60 bg-background/70 p-2 space-y-1">
                                <p className="text-[11px] text-muted-foreground">
                                    {t('comfyMgr.runSummary', { completed: installerRunResult.summary.completedSteps, failed: installerRunResult.summary.failedSteps })}
                                </p>
                                <div className="max-h-40 overflow-y-auto space-y-1">
                                    {installerRunResult.steps.map((stepResult) => (
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
                    </>
                )}
            </div>

            <div className="space-y-2 rounded-xl border border-border/60 bg-secondary/10 p-3 h-full">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h5 className="text-xs font-semibold">{t('settings.comfy.workflowManager')}</h5>
                        <p className="text-[11px] text-muted-foreground">
                            {t('comfyMgr.libraryHint')}
                        </p>
                    </div>
                    <button
                        onClick={() => void handleRefreshComfyLibrary()}
                        disabled={comfyLibraryCheck.state === 'checking'}
                        className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {comfyLibraryCheck.state === 'checking' ? (
                            <Loader2 size={13} className="animate-spin" />
                        ) : (
                            <RefreshCcw size={13} />
                        )}
                        {t('comfyMgr.refreshLibrary')}
                    </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md border border-border/50 bg-background/70 px-2 py-2">
                        <div className="text-[10px] uppercase text-muted-foreground">{t('comfyMgr.serverTemplates')}</div>
                        <div className="text-sm font-semibold">{comfyLibrarySnapshot?.serverTemplates.length || 0}</div>
                    </div>
                    <div className="rounded-md border border-border/50 bg-background/70 px-2 py-2">
                        <div className="text-[10px] uppercase text-muted-foreground">{t('comfyMgr.workflowFiles')}</div>
                        <div className="text-sm font-semibold">{comfyLibrarySnapshot?.customFolderWorkflows.length || 0}</div>
                    </div>
                    <div className="rounded-md border border-border/50 bg-background/70 px-2 py-2">
                        <div className="text-[10px] uppercase text-muted-foreground">{t('comfyMgr.managedRepos')}</div>
                        <div className="text-sm font-semibold">{comfyLibrarySnapshot?.nodeRepos.length || 0}</div>
                    </div>
                </div>

                <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                    <input
                        type="text"
                        value={comfyRepoUrl}
                        onChange={(event) => setComfyRepoUrl(event.target.value)}
                        placeholder="https://github.com/owner/repo"
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                    />
                    <select
                        value={comfyRepoKind}
                        onChange={(event) => setComfyRepoKind(event.target.value as ComfyLibraryRepoKind)}
                        className="h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs"
                    >
                        <option value="custom-nodes">{t('comfyMgr.customNodes')}</option>
                        <option value="workflow-library">{t('comfyMgr.workflowFolder')}</option>
                    </select>
                    <button
                        onClick={() => void handleInstallComfyRepo()}
                        disabled={comfyLibraryCheck.state === 'checking'}
                        className="h-9 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <DownloadCloud size={13} />
                        {t('comfyMgr.installRepo')}
                    </button>
                </div>

                <p className="text-[11px] text-muted-foreground">
                    {t('comfyMgr.installRepoHint')}
                </p>

                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => void handleUpdateComfyInstall()}
                        disabled={comfyLibraryCheck.state === 'checking' || !comfyInstallPath.trim()}
                        className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <RefreshCcw size={13} />
                        {t('comfyMgr.updateComfy')}
                    </button>
                </div>

                {comfyLibraryCheck.message && (
                    <div
                        className={`text-[11px] rounded-md border px-2.5 py-2 ${
                            comfyLibraryCheck.state === 'success'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                                : comfyLibraryCheck.state === 'error'
                                    ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                    : 'border-border/60 bg-background/70 text-muted-foreground'
                        }`}
                    >
                        {comfyLibraryCheck.message}
                    </div>
                )}

                {comfyLibrarySnapshot?.warnings?.length ? (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700">
                        {comfyLibrarySnapshot.warnings[0]}
                    </div>
                ) : null}

                {comfyLibrarySnapshot?.localWorkspace ? (
                    <div className="rounded-md border border-border/60 bg-background/70 px-2.5 py-2 text-[11px] text-muted-foreground">
                        <RichText
                            template={t('comfyMgr.localWorkspace', { count: comfyLibrarySnapshot.localWorkspace.workflowFileCount })}
                            values={{
                                path: <span className="font-mono text-foreground">{comfyLibrarySnapshot.localWorkspace.path}</span>,
                                mode: comfyLibrarySnapshot.localWorkspace.syncedIntoInstall ? t('comfyMgr.syncedIntoInstall') : t('comfyMgr.syncedStandalone'),
                                count: comfyLibrarySnapshot.localWorkspace.workflowFileCount,
                            }}
                        />
                    </div>
                ) : null}

                <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                    {(comfyLibrarySnapshot?.nodeRepos || []).map((repo) => (
                        <div key={`${repo.repoKind}:${repo.path}`} className="rounded-md border border-border/50 bg-background/70 px-2 py-2">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="truncate text-xs font-semibold">{repo.name}</div>
                                    <div className="truncate text-[10px] text-muted-foreground">{repo.path}</div>
                                    <div className="text-[10px] text-muted-foreground">
                                        {t('comfyMgr.repoMeta', {
                                            kind: repo.repoKind === 'custom-nodes' ? t('comfyMgr.customNodes') : t('comfyMgr.workflowFolder'),
                                            managed: repo.gitManaged ? t('comfyMgr.gitRepo') : t('comfyMgr.plainFolder'),
                                            hints: repo.workflowHintCount,
                                        })}
                                    </div>
                                </div>
                                {repo.gitManaged && (
                                    <button
                                        onClick={() => void handleUpdateManagedRepo(repo.path)}
                                        disabled={comfyLibraryCheck.state === 'checking'}
                                        className="h-7 px-2 text-[10px] font-semibold rounded border border-border hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {t('comfyMgr.update')}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    {!comfyLibrarySnapshot?.nodeRepos?.length && (
                        <div className="rounded-md border border-dashed border-border/60 px-2 py-3 text-[11px] text-muted-foreground">
                            {t('comfyMgr.noRepos')}
                        </div>
                    )}
                </div>

                <p className="text-[11px] text-muted-foreground">
                    {t('comfyMgr.restartHint')}
                </p>
            </div>
        </div>
    );
}
