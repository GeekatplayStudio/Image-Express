'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Cloud, HardDrive, Loader2, RefreshCcw, Sparkles, X } from 'lucide-react';
import useEscapeKey from '@/hooks/useEscapeKey';
import { connectGoogleDrive, loadDriveConfig, updateDriveConfig } from '@/lib/googleDrive';
import {
    ASSET_CLOUD_PROVIDER_OPTIONS,
    getAssetCloudProviderLabel,
    isImplementedAssetCloudProvider,
    loadAssetStorageSettings,
    saveAssetStorageSettings,
    type AssetCloudProvider,
    type AssetStorageMode,
} from '@/lib/assetStorageSettings';
import {
    GENERATIVE_PROVIDER_OPTIONS,
    GENERATIVE_WORKFLOW_OPTIONS,
    isGenerativeProviderReady,
    isWorkflowSupportedByProvider,
    loadGenerativePreferences,
    resolveCompatibleWorkflowForProvider,
    saveGenerativePreferences,
    type GenerativeProviderId,
    type GenerativeWorkflowId,
} from '@/lib/generative-preferences';
import { loadUiPreferences, saveUiPreferences } from '@/lib/ui-preferences';
import { DEFAULT_COMFY_LOCAL_URL } from '@/lib/comfyui/connection';
import {
    fetchInstallerRuntimeStatus,
    type InstallerRuntimeStatus,
} from '@/lib/installerRuntimeStatus';
import {
    runInstallerRuntime,
    type InstallerRunResult,
} from '@/lib/installerRuntimeRun';

interface SetupWizardModalProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete: () => void;
}

const STORAGE_KEYS = {
    STABILITY_API_KEY: 'stability_api_key',
    OPENAI_API_KEY: 'openai_api_key',
    GOOGLE_API_KEY: 'google_api_key',
    BANANA_API_KEY: 'banana_api_key',
};

const ENV_DRIVE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID ?? '';

const STEPS = [
    { id: 'welcome', title: 'Welcome', description: 'Understand what gets configured.' },
    { id: 'storage', title: 'Asset Storage', description: 'Choose local, hybrid, or cloud mode.' },
    { id: 'drive', title: 'Cloud Connection', description: 'Connect your selected provider or review planned-provider status.' },
    { id: 'api', title: 'API Keys', description: 'Optional AI key setup.' },
    { id: 'runtime', title: 'Runtime Check', description: 'Verify local AI dependencies are ready.' },
    { id: 'finish', title: 'Finish', description: 'Review and start creating.' },
] as const;

type SetupWizardStepId = (typeof STEPS)[number]['id'];

export default function SetupWizardModal({ isOpen, onClose, onComplete }: SetupWizardModalProps) {
    const [stepIndex, setStepIndex] = useState(0);
    const [storageMode, setStorageMode] = useState<AssetStorageMode>('hybrid');
    const [cloudProvider, setCloudProvider] = useState<AssetCloudProvider>('google-drive');
    const [hybridUploadToCloudByDefault, setHybridUploadToCloudByDefault] = useState(false);
    const [includeLegacyServerAssetsInHybrid, setIncludeLegacyServerAssetsInHybrid] = useState(true);

    const [driveClientId, setDriveClientId] = useState(ENV_DRIVE_CLIENT_ID);
    const [isDriveBusy, setIsDriveBusy] = useState(false);
    const [driveError, setDriveError] = useState<string | null>(null);
    const [driveConnected, setDriveConnected] = useState(false);

    const [stabilityKey, setStabilityKey] = useState('');
    const [openaiKey, setOpenaiKey] = useState('');
    const [googleKey, setGoogleKey] = useState('');
    const [bananaKey, setBananaKey] = useState('');
    const [defaultGenerativeProvider, setDefaultGenerativeProvider] = useState<GenerativeProviderId>('comfy');
    const [defaultGenerativeWorkflow, setDefaultGenerativeWorkflow] = useState<GenerativeWorkflowId>('zone');
    const [comfyServerUrl, setComfyServerUrl] = useState(DEFAULT_COMFY_LOCAL_URL);
    const [autoStartInpaintMasking, setAutoStartInpaintMasking] = useState(false);
    const [showInpaintPromptDock, setShowInpaintPromptDock] = useState(true);
    const [suppressNumberDragHints, setSuppressNumberDragHints] = useState(false);
    const [appOrigin, setAppOrigin] = useState('http://localhost:3000');
    const [installerStatus, setInstallerStatus] = useState<InstallerRuntimeStatus | null>(null);
    const [installerStatusState, setInstallerStatusState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [installerStatusMessage, setInstallerStatusMessage] = useState('');
    const [runInstallerDryRun, setRunInstallerDryRun] = useState(true);
    const [runInstallerComfy, setRunInstallerComfy] = useState(true);
    const [runInstallerBundles, setRunInstallerBundles] = useState(true);
    const [runInstallerComfyModels, setRunInstallerComfyModels] = useState(false);
    const [runInstallerOllamaModels, setRunInstallerOllamaModels] = useState(false);
    const [runInstallerQa, setRunInstallerQa] = useState(true);
    const [runInstallerAutoFix, setRunInstallerAutoFix] = useState(true);
    const [runInstallerForce, setRunInstallerForce] = useState(false);
    const [runInstallerSkipTests, setRunInstallerSkipTests] = useState(false);
    const [runInstallerContinueOnError, setRunInstallerContinueOnError] = useState(false);
    const [selectedComfyModelIds, setSelectedComfyModelIds] = useState<string[]>([]);
    const [selectedOllamaModelIds, setSelectedOllamaModelIds] = useState<string[]>([]);
    const [installerRunState, setInstallerRunState] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
    const [installerRunMessage, setInstallerRunMessage] = useState('');
    const [installerRunResult, setInstallerRunResult] = useState<InstallerRunResult | null>(null);

    useEscapeKey(onClose, { enabled: isOpen });

    const loadInstallerStatus = useCallback(async () => {
        setInstallerStatusState('loading');
        setInstallerStatusMessage('');
        try {
            const status = await fetchInstallerRuntimeStatus();
            setInstallerStatus(status);
            setInstallerStatusState('success');
        } catch (error) {
            setInstallerStatusState('error');
            setInstallerStatusMessage(
                error instanceof Error ? error.message : 'Failed to load runtime readiness.',
            );
        }
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        setStepIndex(0);
        setRunInstallerDryRun(true);
        setRunInstallerComfy(true);
        setRunInstallerBundles(true);
        setRunInstallerComfyModels(false);
        setRunInstallerOllamaModels(false);
        setRunInstallerQa(true);
        setRunInstallerAutoFix(true);
        setRunInstallerForce(false);
        setRunInstallerSkipTests(false);
        setRunInstallerContinueOnError(false);
        setSelectedComfyModelIds([]);
        setSelectedOllamaModelIds([]);
        setInstallerRunState('idle');
        setInstallerRunMessage('');
        setInstallerRunResult(null);

        const storageSettings = loadAssetStorageSettings();
        setStorageMode(storageSettings.mode);
        setCloudProvider(storageSettings.cloudProvider);
        setHybridUploadToCloudByDefault(storageSettings.hybridUploadToCloudByDefault);
        setIncludeLegacyServerAssetsInHybrid(storageSettings.includeLegacyServerAssetsInHybrid);

        const drive = loadDriveConfig();
        setDriveClientId(drive.clientId || ENV_DRIVE_CLIENT_ID || '');
        setDriveConnected(Boolean(drive.enabled));
        setDriveError(null);

        const uiPrefs = loadUiPreferences();
        setSuppressNumberDragHints(uiPrefs.suppressNumberDragHints);
        const generativePreferences = loadGenerativePreferences();
        setDefaultGenerativeProvider(generativePreferences.defaultProvider);
        setDefaultGenerativeWorkflow(generativePreferences.defaultWorkflow);
        setComfyServerUrl(generativePreferences.comfyServerUrl);
        setAutoStartInpaintMasking(generativePreferences.autoStartInpaintMasking);
        setShowInpaintPromptDock(generativePreferences.showInpaintPromptDock);

        if (typeof window !== 'undefined') {
            setAppOrigin(window.location.origin);
            setStabilityKey(window.localStorage.getItem(STORAGE_KEYS.STABILITY_API_KEY) || '');
            setOpenaiKey(window.localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY) || '');
            setGoogleKey(window.localStorage.getItem(STORAGE_KEYS.GOOGLE_API_KEY) || '');
            setBananaKey(window.localStorage.getItem(STORAGE_KEYS.BANANA_API_KEY) || '');
        }
        void loadInstallerStatus();
    }, [isOpen, loadInstallerStatus]);

    useEffect(() => {
        if (!installerStatus) {
            return;
        }
        if (selectedComfyModelIds.length === 0) {
            setSelectedComfyModelIds(installerStatus.comfyModels.map((model) => model.id));
        }
        if (selectedOllamaModelIds.length === 0) {
            setSelectedOllamaModelIds(installerStatus.ollama.configuredModels.map((model) => model.id));
        }
    }, [installerStatus, selectedComfyModelIds.length, selectedOllamaModelIds.length]);

    const handleToggleComfyModel = useCallback((modelId: string, checked: boolean) => {
        setSelectedComfyModelIds((current) => {
            if (checked) {
                return current.includes(modelId) ? current : [...current, modelId];
            }
            return current.filter((id) => id !== modelId);
        });
    }, []);

    const handleToggleOllamaModel = useCallback((modelId: string, checked: boolean) => {
        setSelectedOllamaModelIds((current) => {
            if (checked) {
                return current.includes(modelId) ? current : [...current, modelId];
            }
            return current.filter((id) => id !== modelId);
        });
    }, []);

    const handleRunInstaller = useCallback(async () => {
        setInstallerRunState('running');
        setInstallerRunMessage('');
        setInstallerRunResult(null);
        try {
            const result = await runInstallerRuntime({
                dryRun: runInstallerDryRun,
                installComfy: runInstallerComfy,
                installCustomBundles: runInstallerBundles,
                installComfyModels: runInstallerComfyModels,
                comfyModelIds: selectedComfyModelIds,
                installOllamaModels: runInstallerOllamaModels,
                ollamaModelIds: selectedOllamaModelIds,
                runQa: runInstallerQa,
                autoFix: runInstallerAutoFix,
                force: runInstallerForce,
                skipTests: runInstallerSkipTests,
                continueOnError: runInstallerContinueOnError,
            });
            setInstallerRunResult(result);
            if (result.success) {
                setInstallerRunState('success');
                setInstallerRunMessage('Installer workflow completed successfully.');
            } else {
                setInstallerRunState('error');
                setInstallerRunMessage(`Installer completed with ${result.summary.failedSteps} failed step${result.summary.failedSteps === 1 ? '' : 's'}.`);
            }
            await loadInstallerStatus();
        } catch (error) {
            setInstallerRunState('error');
            setInstallerRunMessage(error instanceof Error ? error.message : 'Installer workflow failed.');
        }
    }, [
        loadInstallerStatus,
        runInstallerAutoFix,
        runInstallerBundles,
        runInstallerComfy,
        runInstallerComfyModels,
        runInstallerContinueOnError,
        runInstallerDryRun,
        runInstallerForce,
        runInstallerOllamaModels,
        runInstallerQa,
        runInstallerSkipTests,
        selectedComfyModelIds,
        selectedOllamaModelIds,
    ]);

    useEffect(() => {
        if (isWorkflowSupportedByProvider(defaultGenerativeProvider, defaultGenerativeWorkflow)) return;
        setDefaultGenerativeWorkflow(
            resolveCompatibleWorkflowForProvider(defaultGenerativeProvider, defaultGenerativeWorkflow)
        );
    }, [defaultGenerativeProvider, defaultGenerativeWorkflow]);

    const canGoBack = stepIndex > 0;
    const isLastStep = stepIndex === STEPS.length - 1;
    const step = STEPS[stepIndex];

    const isDriveStepOptional = storageMode === 'local';
    const shouldNudgeDriveConnection = useMemo(() => {
        if (storageMode === 'local') return false;
        if (!isImplementedAssetCloudProvider(cloudProvider)) return false;
        return !driveConnected;
    }, [cloudProvider, storageMode, driveConnected]);

    useEffect(() => {
        if (!isImplementedAssetCloudProvider(cloudProvider) && storageMode === 'cloud') {
            setStorageMode('hybrid');
        }
    }, [cloudProvider, storageMode]);

    const selectedCloudProviderOption = ASSET_CLOUD_PROVIDER_OPTIONS.find((provider) => provider.id === cloudProvider)
        || ASSET_CLOUD_PROVIDER_OPTIONS[0];
    const selectedCloudProviderLabel = getAssetCloudProviderLabel(cloudProvider);
    const selectedCloudProviderIsImplemented = isImplementedAssetCloudProvider(cloudProvider);

    const persistStorageSettings = () => {
        saveAssetStorageSettings({
            mode: storageMode,
            cloudProvider,
            hybridUploadToCloudByDefault,
            includeLegacyServerAssetsInHybrid,
        });
    };

    const persistApiKeys = () => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(STORAGE_KEYS.STABILITY_API_KEY, stabilityKey.trim());
        window.localStorage.setItem(STORAGE_KEYS.OPENAI_API_KEY, openaiKey.trim());
        window.localStorage.setItem(STORAGE_KEYS.GOOGLE_API_KEY, googleKey.trim());
        window.localStorage.setItem(STORAGE_KEYS.BANANA_API_KEY, bananaKey.trim());
        saveGenerativePreferences({
            defaultProvider: defaultGenerativeProvider,
            defaultWorkflow: defaultGenerativeWorkflow,
            comfyServerUrl: comfyServerUrl.trim(),
            autoStartInpaintMasking,
            showInpaintPromptDock,
        });
        saveUiPreferences({ suppressNumberDragHints });
    };

    const handleConnectDrive = async () => {
        const resolvedClientId = driveClientId.trim();
        if (!resolvedClientId) {
            setDriveError('Add a Google OAuth Client ID first.');
            return;
        }
        setIsDriveBusy(true);
        setDriveError(null);
        try {
            const config = await connectGoogleDrive(resolvedClientId);
            updateDriveConfig({ clientId: resolvedClientId });
            setDriveConnected(Boolean(config.enabled));
            setDriveError(null);
        } catch (error) {
            setDriveError(error instanceof Error ? error.message : 'Failed to connect Google Drive.');
        } finally {
            setIsDriveBusy(false);
        }
    };

    const goNext = () => {
        if (step.id === 'storage') {
            persistStorageSettings();
        }
        if (step.id === 'api') {
            persistApiKeys();
        }
        if (!isLastStep) {
            setStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
            return;
        }
        persistStorageSettings();
        persistApiKeys();
        onComplete();
    };

    const goBack = () => {
        if (!canGoBack) return;
        setStepIndex((prev) => Math.max(prev - 1, 0));
    };

    const visitedStepIds = new Set<SetupWizardStepId>(STEPS.slice(0, stepIndex + 1).map((item) => item.id));

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-3xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-border/60 bg-secondary/20 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <Sparkles size={18} className="text-primary" />
                            First-Time Setup Wizard
                        </h2>
                        <p className="text-xs text-muted-foreground mt-1">
                            Step {stepIndex + 1} of {STEPS.length}: {step.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">{step.description}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        title="Close setup wizard"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="px-6 py-4 border-b border-border/50">
                    <div
                        className="grid gap-2"
                        style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))` }}
                    >
                        {STEPS.map((item, index) => (
                            <div key={item.id} className="space-y-1">
                                <div
                                    className={`h-1.5 rounded-full ${visitedStepIds.has(item.id) ? 'bg-primary' : 'bg-secondary/60'}`}
                                />
                                <p className={`text-[10px] ${index === stepIndex ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                                    {item.title}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-6 min-h-[340px]">
                    {step.id === 'welcome' && (
                        <div className="space-y-4">
                            <p className="text-sm text-foreground/90">
                                This wizard helps you configure storage and API access in safe defaults.
                            </p>
                            <div className="rounded-lg border border-border/70 bg-secondary/15 p-4 space-y-2 text-xs text-muted-foreground">
                                <p><span className="font-semibold text-foreground">What happens:</span> you choose where assets are stored, connect Google Drive if needed, and optionally add AI keys.</p>
                                <p><span className="font-semibold text-foreground">What does not happen:</span> no keys are sent to Image Express servers. They stay in your browser and are used directly with providers.</p>
                            </div>
                        </div>
                    )}

                    {step.id === 'storage' && (
                        <div className="space-y-4">
                            <p className="text-sm text-foreground/90">Choose your default asset storage strategy.</p>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold block">Cloud Provider</label>
                                <select
                                    value={cloudProvider}
                                    onChange={(event) => setCloudProvider(event.target.value as AssetCloudProvider)}
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border text-xs"
                                >
                                    {ASSET_CLOUD_PROVIDER_OPTIONS.map((provider) => (
                                        <option key={provider.id} value={provider.id}>
                                            {provider.label}{provider.availability === 'planned' ? ' (planned)' : ''}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-[11px] text-muted-foreground">
                                    {selectedCloudProviderOption.description}
                                </p>
                            </div>
                            <div className="grid gap-3">
                                <button
                                    onClick={() => setStorageMode('local')}
                                    className={`text-left rounded-lg border p-4 transition-colors ${
                                        storageMode === 'local' ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/30'
                                    }`}
                                >
                                    <p className="text-sm font-semibold flex items-center gap-2"><HardDrive size={14} /> Local only</p>
                                    <p className="text-xs text-muted-foreground mt-1">Assets stay in this browser (IndexedDB).</p>
                                </button>
                                <button
                                    onClick={() => setStorageMode('hybrid')}
                                    className={`text-left rounded-lg border p-4 transition-colors ${
                                        storageMode === 'hybrid' ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/30'
                                    }`}
                                >
                                    <p className="text-sm font-semibold flex items-center gap-2"><Cloud size={14} /> Hybrid (recommended)</p>
                                    <p className="text-xs text-muted-foreground mt-1">Save locally by default with optional {selectedCloudProviderLabel} copy per upload when supported.</p>
                                </button>
                                <button
                                    onClick={() => setStorageMode('cloud')}
                                    disabled={!selectedCloudProviderIsImplemented}
                                    className={`text-left rounded-lg border p-4 transition-colors ${
                                        storageMode === 'cloud' ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/30'
                                    } ${!selectedCloudProviderIsImplemented ? 'opacity-60 cursor-not-allowed' : ''}`}
                                >
                                    <p className="text-sm font-semibold flex items-center gap-2"><Cloud size={14} /> Cloud only</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {selectedCloudProviderIsImplemented
                                            ? `All assets are uploaded to ${selectedCloudProviderLabel}.`
                                            : `${selectedCloudProviderLabel} cloud-only mode will unlock when that provider adapter ships.`}
                                    </p>
                                </button>
                            </div>
                            {storageMode === 'hybrid' && (
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={hybridUploadToCloudByDefault}
                                            onChange={(event) => setHybridUploadToCloudByDefault(event.target.checked)}
                                            className="rounded border-border text-primary focus:ring-primary/20"
                                        />
                                        Pre-check “upload to {selectedCloudProviderLabel}” on each asset upload
                                    </label>
                                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={includeLegacyServerAssetsInHybrid}
                                            onChange={(event) => setIncludeLegacyServerAssetsInHybrid(event.target.checked)}
                                            className="rounded border-border text-primary focus:ring-primary/20"
                                        />
                                        Include legacy server assets in hybrid library view
                                    </label>
                                </div>
                            )}
                            {!selectedCloudProviderIsImplemented && storageMode !== 'local' && (
                                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                                    {selectedCloudProviderLabel} is planned, so this setup will keep assets local for now.
                                </div>
                            )}
                        </div>
                    )}

                    {step.id === 'drive' && (
                        <div className="space-y-4">
                            {isDriveStepOptional ? (
                                <div className="rounded-lg border border-border/70 bg-secondary/15 p-4 text-sm text-muted-foreground">
                                    You selected local-only storage, so cloud connection is optional right now.
                                </div>
                            ) : !selectedCloudProviderIsImplemented ? (
                                <div className="space-y-3">
                                    <div className="rounded-lg border border-border/70 bg-secondary/15 p-4 text-sm text-muted-foreground">
                                        {selectedCloudProviderLabel} is selected as your future cloud provider.
                                    </div>
                                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                                        This provider adapter is not implemented yet, so Image Express will continue using local storage until support lands.
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <p className="text-sm text-foreground/90">
                                        Connect {selectedCloudProviderLabel} so assets can be stored in your personal cloud.
                                    </p>
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold block">Google OAuth Client ID</label>
                                        <input
                                            value={driveClientId}
                                            onChange={(event) => setDriveClientId(event.target.value)}
                                            placeholder="1234567890-abcdef.apps.googleusercontent.com"
                                            className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                                        />
                                        <p className="text-[11px] text-muted-foreground">
                                            Create this in Google Cloud Console, enable Drive API, and add your app origin.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => void handleConnectDrive()}
                                        disabled={isDriveBusy}
                                        className="h-9 px-4 text-xs font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-2"
                                    >
                                        {isDriveBusy ? <Loader2 size={14} className="animate-spin" /> : <Cloud size={14} />}
                                        {driveConnected ? `Reconnect ${selectedCloudProviderLabel}` : `Connect ${selectedCloudProviderLabel}`}
                                    </button>
                                    {driveConnected && (
                                        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                                            {selectedCloudProviderLabel} connected successfully.
                                        </div>
                                    )}
                                    {driveError && (
                                        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                            {driveError}
                                        </div>
                                    )}
                                    {shouldNudgeDriveConnection && (
                                        <p className="text-xs text-amber-600">
                                            Cloud/hybrid mode works best with Drive connected. You can still continue and connect later in Settings.
                                        </p>
                                    )}
                                    <div className="rounded-lg border border-border/70 bg-secondary/15 p-4 text-[11px] text-muted-foreground space-y-2">
                                        <p className="font-semibold text-foreground">Step-by-step in Google Cloud Console</p>
                                        <ol className="list-decimal list-inside space-y-1">
                                            <li>Create or select a Google Cloud project.</li>
                                            <li>Enable the Google Drive API.</li>
                                            <li>Set up OAuth Consent Screen (External) and add test users during development.</li>
                                            <li>Create OAuth Client ID for Web App and add <span className="font-mono">{appOrigin}</span> as an authorized origin.</li>
                                            <li>Paste the client ID here, then click Connect {selectedCloudProviderLabel}.</li>
                                        </ol>
                                        <p>Image Express requests <span className="font-mono">drive.file</span> scope and stores files in your Drive space.</p>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {step.id === 'api' && (
                        <div className="space-y-4">
                            <p className="text-sm text-foreground/90">Optional: add AI provider keys now (you can edit later in Settings).</p>
                            <div className="grid gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Stability API Key</label>
                                    <input value={stabilityKey} onChange={(e) => setStabilityKey(e.target.value)} className="w-full h-9 px-3 rounded-md bg-background border border-border text-xs font-mono" placeholder="sk-..." />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">OpenAI API Key</label>
                                    <input value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} className="w-full h-9 px-3 rounded-md bg-background border border-border text-xs font-mono" placeholder="sk-..." />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Google Gemini API Key</label>
                                    <input value={googleKey} onChange={(e) => setGoogleKey(e.target.value)} className="w-full h-9 px-3 rounded-md bg-background border border-border text-xs font-mono" placeholder="AIza..." />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Banana API Key</label>
                                    <input value={bananaKey} onChange={(e) => setBananaKey(e.target.value)} className="w-full h-9 px-3 rounded-md bg-background border border-border text-xs font-mono" placeholder="..." />
                                </div>
                            </div>

                            <div className="rounded-lg border border-border/70 bg-secondary/15 p-3 space-y-3">
                                <p className="text-xs font-semibold text-foreground">Generative Defaults</p>
                                <div className="grid gap-2">
                                    <label className="text-xs text-muted-foreground">Default Provider</label>
                                    <select
                                        value={defaultGenerativeProvider}
                                        onChange={(event) => setDefaultGenerativeProvider(event.target.value as GenerativeProviderId)}
                                        className="w-full h-9 px-3 rounded-md bg-background border border-border text-xs"
                                    >
                                        {GENERATIVE_PROVIDER_OPTIONS.map((provider) => (
                                            <option key={provider.id} value={provider.id}>
                                                {provider.label}{provider.status === 'coming-soon' ? ' (Coming soon)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="grid gap-2">
                                    <label className="text-xs text-muted-foreground">Startup Workspace</label>
                                    <select
                                        value={defaultGenerativeWorkflow}
                                        onChange={(event) => setDefaultGenerativeWorkflow(event.target.value as GenerativeWorkflowId)}
                                        className="w-full h-9 px-3 rounded-md bg-background border border-border text-xs"
                                    >
                                        {GENERATIVE_WORKFLOW_OPTIONS
                                            .filter((workflow) => isWorkflowSupportedByProvider(defaultGenerativeProvider, workflow.id))
                                            .map((workflow) => (
                                                <option key={workflow.id} value={workflow.id}>{workflow.label}</option>
                                            ))}
                                    </select>
                                </div>
                                <div className="grid gap-2">
                                    <label className="text-xs text-muted-foreground">ComfyUI URL</label>
                                    <input
                                        value={comfyServerUrl}
                                        onChange={(event) => setComfyServerUrl(event.target.value)}
                                        className="w-full h-9 px-3 rounded-md bg-background border border-border text-xs font-mono"
                                        placeholder={DEFAULT_COMFY_LOCAL_URL}
                                    />
                                </div>
                                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <input
                                        type="checkbox"
                                        checked={autoStartInpaintMasking}
                                        onChange={(event) => setAutoStartInpaintMasking(event.target.checked)}
                                        className="rounded border-border text-primary focus:ring-primary/20"
                                    />
                                    Auto-start Generative Fill masking
                                </label>
                                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <input
                                        type="checkbox"
                                        checked={showInpaintPromptDock}
                                        onChange={(event) => setShowInpaintPromptDock(event.target.checked)}
                                        className="rounded border-border text-primary focus:ring-primary/20"
                                    />
                                    Show quick fill prompt dock
                                </label>
                                <p className="text-[11px] text-muted-foreground">
                                    Provider runtime status: {isGenerativeProviderReady(defaultGenerativeProvider) ? 'ready' : 'coming soon'}
                                </p>
                            </div>

                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={suppressNumberDragHints}
                                    onChange={(event) => setSuppressNumberDragHints(event.target.checked)}
                                    className="rounded border-border text-primary focus:ring-primary/20"
                                />
                                Don’t remind me about number-drag tips
                            </label>
                        </div>
                    )}

                    {step.id === 'runtime' && (
                        <div className="space-y-4">
                            <p className="text-sm text-foreground/90">
                                Check whether local ComfyUI, bundled workflows/nodes, models, and Ollama are ready.
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
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
                                    Refresh Runtime Status
                                </button>
                                {installerStatus && (
                                    <span
                                        className={`text-[11px] px-2 py-1 rounded border ${
                                            installerStatus.summary.ready
                                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                                                : 'border-amber-500/30 bg-amber-500/10 text-amber-700'
                                        }`}
                                        data-testid="wizard-runtime-status-pill"
                                    >
                                        {installerStatus.summary.ready ? 'Runtime ready' : `${installerStatus.summary.missing.length} missing requirement${installerStatus.summary.missing.length === 1 ? '' : 's'}`}
                                    </span>
                                )}
                            </div>

                            {installerStatusState === 'error' && (
                                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                    {installerStatusMessage || 'Failed to load runtime readiness.'}
                                </div>
                            )}

                            <div className="rounded-lg border border-border/70 bg-secondary/15 p-4 space-y-3 text-xs">
                                <p className="font-semibold text-foreground">Super Installer Actions</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerDryRun}
                                            onChange={(event) => setRunInstallerDryRun(event.target.checked)}
                                            className="rounded border-border text-primary focus:ring-primary/20"
                                        />
                                        Dry run (preview only)
                                    </label>
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerComfy}
                                            onChange={(event) => setRunInstallerComfy(event.target.checked)}
                                            className="rounded border-border text-primary focus:ring-primary/20"
                                        />
                                        Install/update ComfyUI
                                    </label>
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerBundles}
                                            onChange={(event) => setRunInstallerBundles(event.target.checked)}
                                            className="rounded border-border text-primary focus:ring-primary/20"
                                        />
                                        Install/update bundled nodes/workflows
                                    </label>
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerComfyModels}
                                            onChange={(event) => setRunInstallerComfyModels(event.target.checked)}
                                            className="rounded border-border text-primary focus:ring-primary/20"
                                        />
                                        Download selected Comfy models
                                    </label>
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerOllamaModels}
                                            onChange={(event) => setRunInstallerOllamaModels(event.target.checked)}
                                            className="rounded border-border text-primary focus:ring-primary/20"
                                        />
                                        Download selected Ollama models
                                    </label>
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerQa}
                                            onChange={(event) => setRunInstallerQa(event.target.checked)}
                                            className="rounded border-border text-primary focus:ring-primary/20"
                                        />
                                        Run post-install QA checks
                                    </label>
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerAutoFix}
                                            onChange={(event) => setRunInstallerAutoFix(event.target.checked)}
                                            disabled={!runInstallerQa}
                                            className="rounded border-border text-primary focus:ring-primary/20 disabled:opacity-50"
                                        />
                                        Enable QA auto-fix
                                    </label>
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerSkipTests}
                                            onChange={(event) => setRunInstallerSkipTests(event.target.checked)}
                                            disabled={!runInstallerQa}
                                            className="rounded border-border text-primary focus:ring-primary/20 disabled:opacity-50"
                                        />
                                        Skip QA tests
                                    </label>
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerForce}
                                            onChange={(event) => setRunInstallerForce(event.target.checked)}
                                            className="rounded border-border text-primary focus:ring-primary/20"
                                        />
                                        Force model re-download
                                    </label>
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerContinueOnError}
                                            onChange={(event) => setRunInstallerContinueOnError(event.target.checked)}
                                            className="rounded border-border text-primary focus:ring-primary/20"
                                        />
                                        Continue on step errors
                                    </label>
                                </div>

                                {runInstallerComfyModels && installerStatus && installerStatus.comfyModels.length > 0 && (
                                    <div className="rounded-md border border-border/60 bg-background/70 px-3 py-2 space-y-1">
                                        <p className="text-[11px] font-semibold text-foreground">Comfy model selection</p>
                                        {installerStatus.comfyModels.map((model) => (
                                            <label key={model.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedComfyModelIds.includes(model.id)}
                                                    onChange={(event) => handleToggleComfyModel(model.id, event.target.checked)}
                                                    className="rounded border-border text-primary focus:ring-primary/20"
                                                />
                                                {model.displayName} ({model.id})
                                            </label>
                                        ))}
                                    </div>
                                )}

                                {runInstallerOllamaModels && installerStatus && installerStatus.ollama.configuredModels.length > 0 && (
                                    <div className="rounded-md border border-border/60 bg-background/70 px-3 py-2 space-y-1">
                                        <p className="text-[11px] font-semibold text-foreground">Ollama model selection</p>
                                        {installerStatus.ollama.configuredModels.map((model) => (
                                            <label key={model.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedOllamaModelIds.includes(model.id)}
                                                    onChange={(event) => handleToggleOllamaModel(model.id, event.target.checked)}
                                                    className="rounded border-border text-primary focus:ring-primary/20"
                                                />
                                                {model.displayName} ({model.id})
                                            </label>
                                        ))}
                                    </div>
                                )}

                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        onClick={() => void handleRunInstaller()}
                                        disabled={installerRunState === 'running'}
                                        className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {installerRunState === 'running' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                        Run Selected Installer Actions
                                    </button>
                                    {installerRunMessage && (
                                        <span
                                            className={`text-[11px] ${
                                                installerRunState === 'success' ? 'text-emerald-700' : installerRunState === 'error' ? 'text-destructive' : 'text-muted-foreground'
                                            }`}
                                            data-testid="wizard-installer-run-message"
                                        >
                                            {installerRunMessage}
                                        </span>
                                    )}
                                </div>

                                {installerRunResult && (
                                    <div className="rounded-md border border-border/60 bg-background/70 p-2 space-y-2">
                                        <p className="text-[11px] text-muted-foreground">
                                            Steps completed: {installerRunResult.summary.completedSteps} | Failed: {installerRunResult.summary.failedSteps}
                                        </p>
                                        <div className="max-h-56 overflow-y-auto space-y-2">
                                            {installerRunResult.steps.map((stepResult) => (
                                                <div key={stepResult.id} className="rounded border border-border/50 bg-background px-2 py-1.5 text-[11px]">
                                                    <p className="font-semibold">
                                                        {stepResult.label} ({stepResult.success ? 'ok' : `failed: ${stepResult.exitCode}`})
                                                    </p>
                                                    {stepResult.stdout ? (
                                                        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-[10px] text-muted-foreground">
                                                            {stepResult.stdout}
                                                        </pre>
                                                    ) : null}
                                                    {stepResult.stderr ? (
                                                        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-[10px] text-destructive/90">
                                                            {stepResult.stderr}
                                                        </pre>
                                                    ) : null}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {installerStatus && (
                                <div className="rounded-lg border border-border/70 bg-secondary/15 p-4 space-y-3 text-xs">
                                    <p>
                                        <span className="font-semibold">Comfy directory:</span> <span className="font-mono">{installerStatus.comfyDirectory.path}</span>
                                    </p>
                                    <p>
                                        <span className="font-semibold">Comfy git checkout:</span> {installerStatus.comfyDirectory.gitRepo ? 'Detected' : 'Missing'}
                                    </p>
                                    <p>
                                        <span className="font-semibold">Custom bundles installed:</span>{' '}
                                        {installerStatus.customBundles.filter((bundle) => bundle.exists).length}/{installerStatus.customBundles.length}
                                    </p>
                                    <p>
                                        <span className="font-semibold">Comfy models installed:</span>{' '}
                                        {installerStatus.comfyModels.filter((model) => model.exists).length}/{installerStatus.comfyModels.length}
                                    </p>
                                    <p>
                                        <span className="font-semibold">Ollama CLI:</span> {installerStatus.ollama.cliAvailable ? 'Available' : 'Not found'}
                                    </p>

                                    {installerStatus.summary.missing.length > 0 ? (
                                        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 space-y-1">
                                            <p className="font-semibold">Missing items</p>
                                            {installerStatus.summary.missing.map((item) => (
                                                <p key={item}>- {item}</p>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-700">
                                            All tracked local runtime dependencies are ready.
                                        </div>
                                    )}

                                    <div className="rounded-md border border-border/60 bg-background/70 px-3 py-2 text-[11px] text-muted-foreground space-y-1">
                                        <p className="font-semibold text-foreground">Recommended next commands</p>
                                        <p><code className="font-mono">npm run install:super -- --yes</code></p>
                                        <p><code className="font-mono">npm run qa:install -- --auto-fix</code></p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {step.id === 'finish' && (
                        <div className="space-y-4">
                            <p className="text-sm text-foreground/90">Review your setup and finish onboarding.</p>
                            <div className="rounded-lg border border-border/70 bg-secondary/15 p-4 space-y-2 text-xs">
                                <p><span className="font-semibold">Storage mode:</span> {storageMode}</p>
                                <p><span className="font-semibold">Cloud provider:</span> {selectedCloudProviderLabel}</p>
                                <p><span className="font-semibold">Cloud connection:</span> {selectedCloudProviderIsImplemented ? (driveConnected ? 'Connected' : (storageMode === 'local' ? 'Not required (local mode)' : 'Not connected yet')) : 'Planned provider (not yet available)'}</p>
                                <p><span className="font-semibold">AI keys set:</span> {[stabilityKey, openaiKey, googleKey, bananaKey].filter((value) => value.trim().length > 0).length}</p>
                                <p><span className="font-semibold">Default Generative Provider:</span> {GENERATIVE_PROVIDER_OPTIONS.find((provider) => provider.id === defaultGenerativeProvider)?.label || defaultGenerativeProvider}</p>
                                <p><span className="font-semibold">Default Generative Workflow:</span> {GENERATIVE_WORKFLOW_OPTIONS.find((workflow) => workflow.id === defaultGenerativeWorkflow)?.label || defaultGenerativeWorkflow}</p>
                                <p>
                                    <span className="font-semibold">Runtime readiness:</span>{' '}
                                    {installerStatus
                                        ? (installerStatus.summary.ready
                                            ? 'Ready'
                                            : `Needs attention (${installerStatus.summary.missing.length} missing)`)
                                        : 'Not checked yet'}
                                </p>
                            </div>
                            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 flex items-center gap-2">
                                <CheckCircle2 size={14} />
                                You can reopen this wizard anytime from Settings.
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-border/60 bg-secondary/10 flex items-center justify-between">
                    <button
                        onClick={goBack}
                        disabled={!canGoBack}
                        className="h-9 px-4 rounded-md border border-border text-xs font-semibold hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
                    >
                        <ChevronLeft size={14} />
                        Back
                    </button>
                    <button
                        onClick={goNext}
                        className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors inline-flex items-center gap-1"
                    >
                        {isLastStep ? (
                            <>
                                <CheckCircle2 size={14} />
                                Finish Setup
                            </>
                        ) : (
                            <>
                                Next
                                <ChevronRight size={14} />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
