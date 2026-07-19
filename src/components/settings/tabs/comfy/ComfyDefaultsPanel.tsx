'use client';

import { DownloadCloud, Loader2, RefreshCcw, Server, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import type { ComfyConnectionMode } from '@/lib/comfyui/connection';
import type { GenerativeProviderId, GenerativeWorkflowId } from '@/lib/generative-preferences';
import type { ComfyConnectionSettings } from '../../hooks/useComfyConnectionSettings';
import type { InstallerSettings } from '../../hooks/useInstallerSettings';
import type { ComfyLibrarySettings } from '../../hooks/useComfyLibrarySettings';
import { accentSectionClass } from '../../settingsTypes';

interface ComfyDefaultsPanelProps {
    comfy: ComfyConnectionSettings;
    installer: Pick<InstallerSettings, 'installerStatus' | 'installerStatusState' | 'loadInstallerStatus'>;
    library: Pick<ComfyLibrarySettings, 'comfyLibraryCheck' | 'handleInstallMissingComfyRequirements'>;
    onVerifyLocalSetup: () => void;
}

/** Generative provider/workflow defaults, Comfy connection fields, path verification, and diagnostics. */
export default function ComfyDefaultsPanel({ comfy, installer, library, onVerifyLocalSetup }: ComfyDefaultsPanelProps) {
    const { t } = useI18n();
    const { installerStatus, installerStatusState, loadInstallerStatus } = installer;
    const { comfyLibraryCheck, handleInstallMissingComfyRequirements } = library;

    return (
        <section className={`${accentSectionClass} xl:col-span-12`}>
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-foreground/90">
                        {t('settings.comfy.generativeDefaults')}
                    </h5>
                    <p className="text-[11px] text-muted-foreground mt-1">
                        {t('comfy.defaultsIntro')}
                    </p>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                    {t('comfy.refQuickFill')}
                </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold">{t('comfy.defaultProvider')}</label>
                    <select
                        value={comfy.defaultGenerativeProvider}
                        onChange={(event) => comfy.setDefaultGenerativeProvider(event.target.value as GenerativeProviderId)}
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs"
                    >
                        {comfy.GENERATIVE_PROVIDER_OPTIONS.map((provider) => (
                            <option key={provider.id} value={provider.id}>
                                {provider.label}{provider.status === 'coming-soon' ? ' (Coming soon)' : ''}
                            </option>
                        ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                        {comfy.GENERATIVE_PROVIDER_OPTIONS.find((provider) => provider.id === comfy.defaultGenerativeProvider)?.description}
                    </p>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold">{t('comfy.defaultWorkspace')}</label>
                    <select
                        value={comfy.defaultGenerativeWorkflow}
                        onChange={(event) => comfy.setDefaultGenerativeWorkflow(event.target.value as GenerativeWorkflowId)}
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs"
                    >
                        {comfy.GENERATIVE_WORKFLOW_OPTIONS
                            .filter((workflow) => comfy.isWorkflowSupportedByProvider(comfy.defaultGenerativeProvider, workflow.id))
                            .map((workflow) => (
                                <option key={workflow.id} value={workflow.id}>
                                    {workflow.label}
                                </option>
                            ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                        {comfy.GENERATIVE_WORKFLOW_OPTIONS.find((workflow) => workflow.id === comfy.defaultGenerativeWorkflow)?.description}
                    </p>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold">{t('comfy.connectionMode')}</label>
                    <select
                        value={comfy.comfyConnectionMode}
                        onChange={(event) => comfy.setComfyConnectionMode(event.target.value as ComfyConnectionMode)}
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs"
                    >
                        {comfy.COMFY_CONNECTION_MODE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                        {comfy.getComfyConnectionModeDescription(comfy.comfyConnectionMode)}
                    </p>
                </div>

                <div className="space-y-1.5 xl:col-span-2">
                    <label className="text-xs font-semibold">{t('comfy.localUrl')}</label>
                    <input
                        type="text"
                        value={comfy.comfyServerUrl}
                        onChange={(event) => comfy.setComfyServerUrl(event.target.value)}
                        placeholder={comfy.DEFAULT_COMFY_LOCAL_URL}
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">
                        {t('comfy.localUrlHint', { localhost: 'localhost', dockerHost: 'host.docker.internal' })}
                    </p>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold">{t('comfy.tunnelUrl')}</label>
                    <input
                        type="text"
                        value={comfy.comfyTunnelUrl}
                        onChange={(event) => comfy.setComfyTunnelUrl(event.target.value)}
                        placeholder="https://comfy.tailnet.ts.net"
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">
                        {t('comfy.tunnelUrlHint')}
                    </p>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold">{t('comfy.cloudUrl')}</label>
                    <input
                        type="text"
                        value={comfy.comfyCloudUrl}
                        onChange={(event) => comfy.setComfyCloudUrl(event.target.value)}
                        placeholder="https://cloud.comfy.org"
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold">{t('comfy.cloudApiKey')}</label>
                    <input
                        type="password"
                        value={comfy.comfyCloudApiKey}
                        onChange={(event) => comfy.setComfyCloudApiKey(event.target.value)}
                        placeholder="ck-..."
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">
                        {t('comfy.cloudAuthHint', { header: 'X-API-Key' })}
                    </p>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold">{t('comfy.installFolder')}</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={comfy.comfyInstallPath}
                            onChange={(event) => comfy.setComfyInstallPath(event.target.value)}
                            placeholder="D:\\ComfyUI"
                            className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                        />
                        <button
                            type="button"
                            onClick={() => void loadInstallerStatus()}
                            disabled={installerStatusState === 'loading'}
                            className="shrink-0 h-9 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {installerStatusState === 'loading' ? (
                                <Loader2 size={13} className="animate-spin" />
                            ) : (
                                <RefreshCcw size={13} />
                            )}
                            {t('comfy.verifyPath')}
                        </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        {t('comfy.installFolderHint', { customNodes: 'custom_nodes', models: 'models', workflows: 'user\default\workflows' })}
                    </p>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold">{t('comfy.customNodesFolder')}</label>
                    <input
                        type="text"
                        value={comfy.comfyCustomNodesPath}
                        onChange={(event) => comfy.setComfyCustomNodesPath(event.target.value)}
                        placeholder="D:\\ComfyUI\\custom_nodes"
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">
                        {t('comfy.customNodesHint', { customNodes: 'custom_nodes' })}
                    </p>
                </div>

                <div className="space-y-1.5 lg:col-span-2 xl:col-span-3">
                    <label className="text-xs font-semibold">{t('comfy.workflowFolders')}</label>
                    <textarea
                        value={comfy.comfyWorkflowLibraryPath}
                        onChange={(event) => comfy.setComfyWorkflowLibraryPath(event.target.value)}
                        placeholder={"O:\\ComfyUI\\user\\default\\workflows\nD:\\MyComfyWorkflows"}
                        rows={3}
                        className="w-full min-h-19 px-3 py-2 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono resize-y"
                    />
                    <p className="text-[11px] text-muted-foreground">
                        {t('comfy.workflowFoldersHint', { workflows: 'user\default\workflows' })}
                    </p>
                </div>

                {installerStatus?.paths?.statuses?.length ? (
                    <div className="lg:col-span-2 xl:col-span-3 rounded-md border border-border/60 bg-background/70 px-3 py-2 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-xs font-semibold text-foreground">{t('comfy.layoutVerification')}</div>
                                <div className="text-[11px] text-muted-foreground">{t('comfy.layoutVerificationHint')}</div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {installerStatus.paths.statuses.map((status) => (
                                <div key={`${status.label}:${status.path}`} className="rounded-md border border-border/50 bg-background/80 px-3 py-2 text-[11px]">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="font-semibold text-foreground">{status.label}</div>
                                        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${status.exists ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700'}`}>
                                            {status.exists ? 'Found' : 'Missing'}
                                        </span>
                                    </div>
                                    <div className="mt-1 font-mono text-muted-foreground break-all">{status.path || t('comfy.notResolvedYet')}</div>
                                    {status.note ? (
                                        <div className="mt-1 text-muted-foreground">{status.note}</div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {installerStatus?.comfyDirectory.exists && installerStatus.paths ? (
                    <div className="lg:col-span-2 xl:col-span-3 rounded-md border border-border/60 bg-secondary/10 px-3 py-2 text-[11px] text-muted-foreground space-y-1">
                        <div className="font-semibold text-foreground">{t('comfy.detectedLayout')}</div>
                        <div>{t('comfy.installFolderLabel')} <span className="font-mono text-foreground">{installerStatus.comfyDirectory.path}</span></div>
                        <div>{t('comfy.modelsFolderLabel')} <span className="font-mono text-foreground">{installerStatus.paths.modelsPath}</span></div>
                        <div>{t('comfy.customNodesFolderLabel')} <span className="font-mono text-foreground">{installerStatus.paths.customNodesPath}</span></div>
                        <div>
                            {t('comfy.workflowFoldersLabel')} <span className="font-mono text-foreground">{installerStatus.paths.workflowLibraryPaths.join(' | ')}</span>
                        </div>
                        <div>{t('comfy.detectedDefaultsHint')}</div>
                    </div>
                ) : null}
            </div>

            <div className="space-y-3 rounded-xl border border-border/60 bg-background/60 p-3">
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={onVerifyLocalSetup}
                        disabled={comfy.comfySetupCheck.state === 'checking'}
                        className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {comfy.comfySetupCheck.state === 'checking' ? (
                            <Loader2 size={13} className="animate-spin" />
                        ) : (
                            <ShieldCheck size={13} />
                        )}
                        {t('comfy.verifyLocalAndPaths')}
                    </button>

                    <button
                        onClick={() => void comfy.handleVerifyComfyConnection()}
                        disabled={comfy.comfyConnectionCheck.state === 'checking'}
                        className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {comfy.comfyConnectionCheck.state === 'checking' ? (
                            <Loader2 size={13} className="animate-spin" />
                        ) : (
                            <Server size={13} />
                        )}
                        {t('comfy.verifyConnection')}
                    </button>
                </div>

                {comfy.comfySetupCheck.message && (
                    <div
                        className={`text-[11px] rounded-md border px-2.5 py-2 ${
                            comfy.comfySetupCheck.state === 'success'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                                : comfy.comfySetupCheck.state === 'error'
                                    ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                    : 'border-border/60 bg-background/70 text-muted-foreground'
                        }`}
                    >
                        {comfy.comfySetupCheck.message}
                    </div>
                )}

                {comfy.comfyConnectionCheck.message && (
                    <div
                        className={`text-[11px] rounded-md border px-2.5 py-2 ${
                            comfy.comfyConnectionCheck.state === 'success'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                                : comfy.comfyConnectionCheck.state === 'error'
                                    ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                    : 'border-border/60 bg-background/70 text-muted-foreground'
                        }`}
                    >
                        {comfy.comfyConnectionCheck.message}
                    </div>
                )}

                {comfy.comfyDiagnostics?.paths?.statuses?.length ? (
                    <div className="rounded-md border border-border/60 bg-background/70 px-3 py-2 space-y-2 text-[11px]">
                        <div>
                            <div className="font-semibold text-foreground">{t('comfy.appPathVerification')}</div>
                            <div className="text-muted-foreground">
                                {t('comfy.appPathVerificationHint')}
                            </div>
                        </div>
                        <div className="space-y-2">
                            {comfy.comfyDiagnostics.paths.statuses.map((status) => {
                                const ready = status.exists && status.readable;
                                return (
                                    <div key={`${status.label}:${status.path}`} className="rounded-md border border-border/50 bg-background/80 px-3 py-2">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="font-semibold text-foreground">{status.label}</div>
                                            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${ready ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700'}`}>
                                                {ready ? 'Ready' : status.exists ? 'Unreadable' : 'Missing'}
                                            </span>
                                        </div>
                                        <div className="mt-1 font-mono text-muted-foreground break-all">{status.path || t('comfy.notResolvedYet')}</div>
                                        <div className="mt-1 text-muted-foreground">
                                            {t('comfy.pathStatus', { exists: status.exists ? t('comfy.yes') : t('comfy.no'), readable: status.readable ? t('comfy.yes') : t('comfy.no') })}
                                        </div>
                                        {status.note ? (
                                            <div className="mt-1 text-muted-foreground">{status.note}</div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : null}

                {comfy.comfyMissingRequirements && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-100 space-y-2">
                        <div className="font-semibold">{t('comfy.missingRequirements')}</div>
                        <div>
                            {comfy.comfyMissingRequirements.workflows.slice(0, 3).map((workflow) => (
                                <div key={workflow.workflowName}>
                                    {workflow.workflowName}: {workflow.missingNodeTypes.length > 0 ? `nodes ${workflow.missingNodeTypes.slice(0, 3).join(', ')}` : ''}{workflow.missingNodeTypes.length > 0 && workflow.missingModels.length > 0 ? ' | ' : ''}{workflow.missingModels.length > 0 ? `models ${workflow.missingModels.slice(0, 3).join(', ')}` : ''}
                                </div>
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => void handleInstallMissingComfyRequirements()}
                                disabled={comfyLibraryCheck.state === 'checking' || (!comfy.comfyMissingRequirements.updateInstall && comfy.comfyMissingRequirements.models.length === 0)}
                                className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <DownloadCloud size={13} />
                                {t('comfy.installMissing')}
                            </button>
                        </div>
                    </div>
                )}
            </div>

        </section>
    );
}
