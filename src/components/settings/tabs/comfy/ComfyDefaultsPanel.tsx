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
                        Launch AI tools directly into your preferred flow so you can stay in ideation mode.
                    </p>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                    Ref-style quick fill
                </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold">Default AI Provider</label>
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
                    <label className="text-xs font-semibold">Default Generative Workspace</label>
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
                    <label className="text-xs font-semibold">Comfy Connection Mode</label>
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
                    <label className="text-xs font-semibold">Local ComfyUI URL</label>
                    <input
                        type="text"
                        value={comfy.comfyServerUrl}
                        onChange={(event) => comfy.setComfyServerUrl(event.target.value)}
                        placeholder={comfy.DEFAULT_COMFY_LOCAL_URL}
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">
                        Server-side workflow scans, repo updates, and Docker host fallback use this URL first. In Docker on macOS or Windows, <code className="font-mono">localhost</code> will also retry via <code className="font-mono">host.docker.internal</code>.
                    </p>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold">Comfy Tunnel URL</label>
                    <input
                        type="text"
                        value={comfy.comfyTunnelUrl}
                        onChange={(event) => comfy.setComfyTunnelUrl(event.target.value)}
                        placeholder="https://comfy.tailnet.ts.net"
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">
                        Optional browser-reachable URL for websocket access from another device, such as Tailscale, Funnel, or a reverse proxy. The AI generator and workflow picker reuse official ComfyUI templates through this connection when needed.
                    </p>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold">Comfy Cloud URL</label>
                    <input
                        type="text"
                        value={comfy.comfyCloudUrl}
                        onChange={(event) => comfy.setComfyCloudUrl(event.target.value)}
                        placeholder="https://cloud.comfy.org"
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold">Comfy Cloud API Key</label>
                    <input
                        type="password"
                        value={comfy.comfyCloudApiKey}
                        onChange={(event) => comfy.setComfyCloudApiKey(event.target.value)}
                        placeholder="ck-..."
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">
                        Cloud requests use the <code className="font-mono">X-API-Key</code> header and websocket token auth.
                    </p>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold">ComfyUI Install Folder</label>
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
                            Verify Path
                        </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        Leave this blank to let the app try standard ComfyUI install locations visible to the current runtime and auto-fill the standard <code className="font-mono">custom_nodes</code>, <code className="font-mono">models</code>, and <code className="font-mono">user\default\workflows</code> folders. If the app runs in Docker, use the path visible inside the container, not a host-only drive letter.
                    </p>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold">Custom Nodes Folder</label>
                    <input
                        type="text"
                        value={comfy.comfyCustomNodesPath}
                        onChange={(event) => comfy.setComfyCustomNodesPath(event.target.value)}
                        placeholder="D:\\ComfyUI\\custom_nodes"
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">
                        GitHub node repos can be cloned here, and the manager will scan this folder for installed custom nodes. When this is blank, the app uses the standard <code className="font-mono">custom_nodes</code> folder under the detected install root. Relative paths like <code className="font-mono">custom_nodes</code> resolve from the install folder.
                    </p>
                </div>

                <div className="space-y-1.5 lg:col-span-2 xl:col-span-3">
                    <label className="text-xs font-semibold">Workflow Folder(s)</label>
                    <textarea
                        value={comfy.comfyWorkflowLibraryPath}
                        onChange={(event) => comfy.setComfyWorkflowLibraryPath(event.target.value)}
                        placeholder={"O:\\ComfyUI\\user\\default\\workflows\nD:\\MyComfyWorkflows"}
                        rows={3}
                        className="w-full min-h-19 px-3 py-2 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono resize-y"
                    />
                    <p className="text-[11px] text-muted-foreground">
                        Scan one or more workflow folders for official ComfyUI JSON workflows now and your own folders later. Put one folder per line, or separate folders with semicolons. When this is blank, the app uses the standard <code className="font-mono">user\default\workflows</code> folder under the detected install root. Relative paths like <code className="font-mono">user\default\workflows</code> resolve from the install folder. If the app runs in Docker, use paths visible inside the container rather than a host-only O:\ drive path.
                    </p>
                </div>

                {installerStatus?.paths?.statuses?.length ? (
                    <div className="lg:col-span-2 xl:col-span-3 rounded-md border border-border/60 bg-background/70 px-3 py-2 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-xs font-semibold text-foreground">Expected install layout verification</div>
                                <div className="text-[11px] text-muted-foreground">Checks whether the standard ComfyUI folders exist under the current install root.</div>
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
                                    <div className="mt-1 font-mono text-muted-foreground break-all">{status.path || 'Not resolved yet'}</div>
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
                        <div className="font-semibold text-foreground">Detected standard Comfy layout</div>
                        <div>Install folder: <span className="font-mono text-foreground">{installerStatus.comfyDirectory.path}</span></div>
                        <div>Models folder: <span className="font-mono text-foreground">{installerStatus.paths.modelsPath}</span></div>
                        <div>Custom nodes folder: <span className="font-mono text-foreground">{installerStatus.paths.customNodesPath}</span></div>
                        <div>
                            Workflow folder(s): <span className="font-mono text-foreground">{installerStatus.paths.workflowLibraryPaths.join(' | ')}</span>
                        </div>
                        <div>These detected defaults are only used to fill empty fields. You can still replace any path with your own custom folders.</div>
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
                        Verify Local ComfyUI + Paths
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
                        Verify Comfy Connection
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
                            <div className="font-semibold text-foreground">App-specific Comfy path verification</div>
                            <div className="text-muted-foreground">
                                Validates the configured install, custom nodes, workflow, and models folders against the{" app's "}expected Comfy layout.
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
                                        <div className="mt-1 font-mono text-muted-foreground break-all">{status.path || 'Not resolved yet'}</div>
                                        <div className="mt-1 text-muted-foreground">
                                            exists={status.exists ? 'yes' : 'no'} | readable={status.readable ? 'yes' : 'no'}
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
                        <div className="font-semibold">Missing Comfy requirements detected</div>
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
                                Install Missing Requirements
                            </button>
                        </div>
                    </div>
                )}
            </div>

        </section>
    );
}
