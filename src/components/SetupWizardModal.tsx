'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Cloud, HardDrive, Loader2, RefreshCcw, Sparkles } from 'lucide-react';
import ModalShell from '@/components/ui/ModalShell';
import SetupCollieMascot from '@/components/setup/SetupCollieMascot';
import { useI18n } from '@/providers/I18nProvider';
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
    { id: 'welcome', titleKey: 'wizard.step.welcome', descriptionKey: 'wizard.step.welcomeDesc' },
    { id: 'storage', titleKey: 'wizard.step.storage', descriptionKey: 'wizard.step.storageDesc' },
    { id: 'drive', titleKey: 'wizard.step.cloud', descriptionKey: 'wizard.step.cloudDesc' },
    { id: 'api', titleKey: 'wizard.step.keys', descriptionKey: 'wizard.step.keysDesc' },
    { id: 'runtime', titleKey: 'wizard.step.runtime', descriptionKey: 'wizard.step.runtimeDesc' },
    { id: 'support', titleKey: 'wizard.step.extras', descriptionKey: 'wizard.step.extrasDesc' },
    { id: 'finish', titleKey: 'wizard.step.finish', descriptionKey: 'wizard.step.finishDesc' },
] as const;

type SetupWizardStepId = (typeof STEPS)[number]['id'];

export default function SetupWizardModal({ isOpen, onClose, onComplete }: SetupWizardModalProps) {
    const { t } = useI18n();
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
    const [comfyTunnelUrl, setComfyTunnelUrl] = useState('');
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
    const installerStatusRequestIdRef = useRef(0);
    const isOpenRef = useRef(isOpen);
    const step = STEPS[stepIndex];

    useEffect(() => {
        isOpenRef.current = isOpen;
        if (!isOpen) {
            installerStatusRequestIdRef.current += 1;
        }
    }, [isOpen]);

    const loadInstallerStatus = useCallback(async () => {
        if (!isOpenRef.current) {
            return;
        }

        const requestId = installerStatusRequestIdRef.current + 1;
        installerStatusRequestIdRef.current = requestId;
        setInstallerStatusState('loading');
        setInstallerStatusMessage('');
        try {
            const status = await fetchInstallerRuntimeStatus();
            if (!isOpenRef.current || installerStatusRequestIdRef.current !== requestId) {
                return;
            }
            setInstallerStatus(status);
            setInstallerStatusState('success');
        } catch (error) {
            if (!isOpenRef.current || installerStatusRequestIdRef.current !== requestId) {
                return;
            }
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
        setInstallerStatus(null);
        setInstallerStatusState('idle');
        setInstallerStatusMessage('');

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
        setComfyTunnelUrl(generativePreferences.comfyTunnelUrl);
        setAutoStartInpaintMasking(generativePreferences.autoStartInpaintMasking);
        setShowInpaintPromptDock(generativePreferences.showInpaintPromptDock);

        if (typeof window !== 'undefined') {
            setAppOrigin(window.location.origin);
            setStabilityKey(window.localStorage.getItem(STORAGE_KEYS.STABILITY_API_KEY) || '');
            setOpenaiKey(window.localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY) || '');
            setGoogleKey(window.localStorage.getItem(STORAGE_KEYS.GOOGLE_API_KEY) || '');
            setBananaKey(window.localStorage.getItem(STORAGE_KEYS.BANANA_API_KEY) || '');
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || step.id !== 'runtime' || installerStatus || installerStatusState !== 'idle') {
            return;
        }
        void loadInstallerStatus();
    }, [installerStatus, installerStatusState, isOpen, loadInstallerStatus, step.id]);

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
            comfyTunnelUrl: comfyTunnelUrl.trim(),
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
        <ModalShell
            isOpen={isOpen}
            onClose={onClose}
            title={t('settings.setupWizard')}
            icon={<Sparkles size={14} className="text-primary" />}
            initialWidth={780}
            initialHeight={720}
            minWidth={480}
            minHeight={400}
            zIndex={110}
            bodyClassName="overflow-hidden flex flex-col"
        >
            <div data-testid="setup-wizard-modal-shell" className="flex flex-col flex-1 min-h-0">
                <div className="shrink-0 px-6 py-3 border-b border-border/60 bg-secondary/20">
                    <p className="text-xs text-muted-foreground">
                        {t('wizard.stepLabel', { current: stepIndex + 1, total: STEPS.length })} <span className="font-semibold text-foreground">{t(step.titleKey)}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">{t(step.descriptionKey)}</p>
                </div>

                <div className="shrink-0 px-6 py-4 border-b border-border/50">
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
                                    {t(item.titleKey)}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                <div data-testid="setup-wizard-modal-content" className="flex-1 min-h-0 overflow-y-auto p-6">
                    {step.id === 'welcome' && (
                        <div className="space-y-4">
                            <p className="text-sm text-foreground/90">
                                {t('wizard.intro')}
                            </p>
                            <div className="rounded-lg border border-border/70 bg-secondary/15 p-4 space-y-2 text-xs text-muted-foreground">
                                <p><span className="font-semibold text-foreground">{t('wizard.whatHappens')}</span> {t('wizard.whatHappensBody')}</p>
                                <p><span className="font-semibold text-foreground">{t('wizard.whatNot')}</span> {t('wizard.whatNotBody')}</p>
                            </div>
                        </div>
                    )}

                    {step.id === 'storage' && (
                        <div className="space-y-4">
                            <p className="text-sm text-foreground/90">{t('wizard.storageIntro')}</p>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold block">{t('wizard.cloudProvider')}</label>
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
                                    <p className="text-sm font-semibold flex items-center gap-2"><HardDrive size={14} /> {t('wizard.localOnly')}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{t('wizard.localOnlyDesc')}</p>
                                </button>
                                <button
                                    onClick={() => setStorageMode('hybrid')}
                                    className={`text-left rounded-lg border p-4 transition-colors ${
                                        storageMode === 'hybrid' ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/30'
                                    }`}
                                >
                                    <p className="text-sm font-semibold flex items-center gap-2"><Cloud size={14} /> {t('wizard.hybrid')}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{t('wizard.hybridDesc', { provider: selectedCloudProviderLabel })}</p>
                                </button>
                                <button
                                    onClick={() => setStorageMode('cloud')}
                                    disabled={!selectedCloudProviderIsImplemented}
                                    className={`text-left rounded-lg border p-4 transition-colors ${
                                        storageMode === 'cloud' ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/30'
                                    } ${!selectedCloudProviderIsImplemented ? 'opacity-60 cursor-not-allowed' : ''}`}
                                >
                                    <p className="text-sm font-semibold flex items-center gap-2"><Cloud size={14} /> {t('wizard.cloudOnly')}</p>
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
                                        {t('wizard.preCheckUpload', { provider: selectedCloudProviderLabel })}
                                    </label>
                                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={includeLegacyServerAssetsInHybrid}
                                            onChange={(event) => setIncludeLegacyServerAssetsInHybrid(event.target.checked)}
                                            className="rounded border-border text-primary focus:ring-primary/20"
                                        />
                                        {t('wizard.includeLegacy')}
                                    </label>
                                </div>
                            )}
                            {!selectedCloudProviderIsImplemented && storageMode !== 'local' && (
                                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                                    {t('wizard.providerPlanned', { provider: selectedCloudProviderLabel })}
                                </div>
                            )}
                        </div>
                    )}

                    {step.id === 'drive' && (
                        <div className="space-y-4">
                            {isDriveStepOptional ? (
                                <div className="rounded-lg border border-border/70 bg-secondary/15 p-4 text-sm text-muted-foreground">
                                    {t('wizard.localSelectedHint')}
                                </div>
                            ) : !selectedCloudProviderIsImplemented ? (
                                <div className="space-y-3">
                                    <div className="rounded-lg border border-border/70 bg-secondary/15 p-4 text-sm text-muted-foreground">
                                        {t('wizard.providerSelected', { provider: selectedCloudProviderLabel })}
                                    </div>
                                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                                        {t('wizard.adapterNotImplemented')}
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <p className="text-sm text-foreground/90">
                                        {t('wizard.connectProvider', { provider: selectedCloudProviderLabel })}
                                    </p>
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold block">{t('wizard.oauthClientId')}</label>
                                        <input
                                            value={driveClientId}
                                            onChange={(event) => setDriveClientId(event.target.value)}
                                            placeholder={t('wizard.oauthPlaceholder')}
                                            className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                                        />
                                        <p className="text-[11px] text-muted-foreground">
                                            {t('wizard.oauthHint')}
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
                                            {t('wizard.providerConnected', { provider: selectedCloudProviderLabel })}
                                        </div>
                                    )}
                                    {driveError && (
                                        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                            {driveError}
                                        </div>
                                    )}
                                    {shouldNudgeDriveConnection && (
                                        <p className="text-xs text-amber-600">
                                            {t('wizard.driveRecommended')}
                                        </p>
                                    )}
                                    <div className="rounded-lg border border-border/70 bg-secondary/15 p-4 text-[11px] text-muted-foreground space-y-2">
                                        <p className="font-semibold text-foreground">{t('wizard.stepByStep')}</p>
                                        <ol className="list-decimal list-inside space-y-1">
                                            <li>{t('wizard.gcp1')}</li>
                                            <li>{t('wizard.gcp2')}</li>
                                            <li>{t('wizard.gcp3')}</li>
                                            <li>{t('wizard.gcp4', { origin: appOrigin })}</li>
                                            <li>{t('wizard.gcp5', { provider: selectedCloudProviderLabel })}</li>
                                        </ol>
                                        <p>{t('wizard.driveScope', { scope: 'drive.file' })}</p>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {step.id === 'api' && (
                        <div className="space-y-4">
                            <p className="text-sm text-foreground/90">{t('wizard.keysIntro')}</p>
                            <div className="grid gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">{t('wizard.stabilityKey')}</label>
                                    <input value={stabilityKey} onChange={(e) => setStabilityKey(e.target.value)} className="w-full h-9 px-3 rounded-md bg-background border border-border text-xs font-mono" placeholder="sk-..." />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">{t('wizard.openaiKey')}</label>
                                    <input value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} className="w-full h-9 px-3 rounded-md bg-background border border-border text-xs font-mono" placeholder="sk-..." />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">{t('wizard.geminiKey')}</label>
                                    <input value={googleKey} onChange={(e) => setGoogleKey(e.target.value)} className="w-full h-9 px-3 rounded-md bg-background border border-border text-xs font-mono" placeholder="AIza..." />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">{t('wizard.bananaKey')}</label>
                                    <input value={bananaKey} onChange={(e) => setBananaKey(e.target.value)} className="w-full h-9 px-3 rounded-md bg-background border border-border text-xs font-mono" placeholder="..." />
                                </div>
                            </div>

                            <div className="rounded-lg border border-border/70 bg-secondary/15 p-3 space-y-3">
                                <p className="text-xs font-semibold text-foreground">{t('wizard.generativeDefaults')}</p>
                                <div className="grid gap-2">
                                    <label className="text-xs text-muted-foreground">{t('wizard.defaultProvider')}</label>
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
                                    <label className="text-xs text-muted-foreground">{t('wizard.startupWorkspace')}</label>
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
                                    <label className="text-xs text-muted-foreground">{t('wizard.localComfyUrl')}</label>
                                    <input
                                        value={comfyServerUrl}
                                        onChange={(event) => setComfyServerUrl(event.target.value)}
                                        className="w-full h-9 px-3 rounded-md bg-background border border-border text-xs font-mono"
                                        placeholder={DEFAULT_COMFY_LOCAL_URL}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <label className="text-xs text-muted-foreground">{t('wizard.comfyTunnelUrl')}</label>
                                    <input
                                        value={comfyTunnelUrl}
                                        onChange={(event) => setComfyTunnelUrl(event.target.value)}
                                        className="w-full h-9 px-3 rounded-md bg-background border border-border text-xs font-mono"
                                        placeholder="https://comfy.tailnet.ts.net"
                                    />
                                </div>
                                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <input
                                        type="checkbox"
                                        checked={autoStartInpaintMasking}
                                        onChange={(event) => setAutoStartInpaintMasking(event.target.checked)}
                                        className="rounded border-border text-primary focus:ring-primary/20"
                                    />
                                    {t('wizard.autoStartFill')}
                                </label>
                                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <input
                                        type="checkbox"
                                        checked={showInpaintPromptDock}
                                        onChange={(event) => setShowInpaintPromptDock(event.target.checked)}
                                        className="rounded border-border text-primary focus:ring-primary/20"
                                    />
                                    {t('wizard.showFillDock')}
                                </label>
                                <p className="text-[11px] text-muted-foreground">
                                    {t('wizard.providerRuntimeStatus')} {isGenerativeProviderReady(defaultGenerativeProvider) ? t('wizard.ready') : t('wizard.comingSoon')}
                                </p>
                            </div>

                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={suppressNumberDragHints}
                                    onChange={(event) => setSuppressNumberDragHints(event.target.checked)}
                                    className="rounded border-border text-primary focus:ring-primary/20"
                                />
                                {t('wizard.noDragTips')}
                            </label>
                        </div>
                    )}

                    {step.id === 'runtime' && (
                        <div className="space-y-4">
                            <p className="text-sm text-foreground/90">
                                {t('wizard.runtimeIntro')}
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
                                    {t('wizard.refreshRuntime')}
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
                                <p className="font-semibold text-foreground">{t('wizard.superInstallerActions')}</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerDryRun}
                                            onChange={(event) => setRunInstallerDryRun(event.target.checked)}
                                            className="rounded border-border text-primary focus:ring-primary/20"
                                        />
                                        {t('wizard.dryRun')}
                                    </label>
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerComfy}
                                            onChange={(event) => setRunInstallerComfy(event.target.checked)}
                                            className="rounded border-border text-primary focus:ring-primary/20"
                                        />
                                        {t('wizard.installComfy')}
                                    </label>
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerBundles}
                                            onChange={(event) => setRunInstallerBundles(event.target.checked)}
                                            className="rounded border-border text-primary focus:ring-primary/20"
                                        />
                                        {t('wizard.installNodes')}
                                    </label>
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerComfyModels}
                                            onChange={(event) => setRunInstallerComfyModels(event.target.checked)}
                                            className="rounded border-border text-primary focus:ring-primary/20"
                                        />
                                        {t('wizard.downloadComfyModels')}
                                    </label>
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerOllamaModels}
                                            onChange={(event) => setRunInstallerOllamaModels(event.target.checked)}
                                            className="rounded border-border text-primary focus:ring-primary/20"
                                        />
                                        {t('wizard.downloadOllamaModels')}
                                    </label>
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerQa}
                                            onChange={(event) => setRunInstallerQa(event.target.checked)}
                                            className="rounded border-border text-primary focus:ring-primary/20"
                                        />
                                        {t('wizard.runQa')}
                                    </label>
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerAutoFix}
                                            onChange={(event) => setRunInstallerAutoFix(event.target.checked)}
                                            disabled={!runInstallerQa}
                                            className="rounded border-border text-primary focus:ring-primary/20 disabled:opacity-50"
                                        />
                                        {t('wizard.qaAutoFix')}
                                    </label>
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerSkipTests}
                                            onChange={(event) => setRunInstallerSkipTests(event.target.checked)}
                                            disabled={!runInstallerQa}
                                            className="rounded border-border text-primary focus:ring-primary/20 disabled:opacity-50"
                                        />
                                        {t('wizard.skipQa')}
                                    </label>
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerForce}
                                            onChange={(event) => setRunInstallerForce(event.target.checked)}
                                            className="rounded border-border text-primary focus:ring-primary/20"
                                        />
                                        {t('wizard.forceRedownload')}
                                    </label>
                                    <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            checked={runInstallerContinueOnError}
                                            onChange={(event) => setRunInstallerContinueOnError(event.target.checked)}
                                            className="rounded border-border text-primary focus:ring-primary/20"
                                        />
                                        {t('wizard.continueOnError')}
                                    </label>
                                </div>

                                {runInstallerComfyModels && installerStatus && installerStatus.comfyModels.length > 0 && (
                                    <div className="rounded-md border border-border/60 bg-background/70 px-3 py-2 space-y-1">
                                        <p className="text-[11px] font-semibold text-foreground">{t('wizard.comfyModelSelection')}</p>
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
                                        <p className="text-[11px] font-semibold text-foreground">{t('wizard.ollamaModelSelection')}</p>
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
                                        {t('wizard.runInstaller')}
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
                                            {t('wizard.stepsSummary', { completed: installerRunResult.summary.completedSteps, failed: installerRunResult.summary.failedSteps })}
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
                                        <span className="font-semibold">{t('wizard.comfyDirectory')}</span> <span className="font-mono">{installerStatus.comfyDirectory.path}</span>
                                    </p>
                                    <p>
                                        <span className="font-semibold">{t('wizard.comfyCheckout')}</span> {installerStatus.comfyDirectory.gitRepo ? 'Detected' : 'Missing'}
                                    </p>
                                    <p>
                                        <span className="font-semibold">{t('wizard.customBundles')}</span>{' '}
                                        {installerStatus.customBundles.filter((bundle) => bundle.exists).length}/{installerStatus.customBundles.length}
                                    </p>
                                    <p>
                                        <span className="font-semibold">{t('wizard.comfyModelsInstalled')}</span>{' '}
                                        {installerStatus.comfyModels.filter((model) => model.exists).length}/{installerStatus.comfyModels.length}
                                    </p>
                                    <p>
                                        <span className="font-semibold">{t('wizard.ollamaCli')}</span> {installerStatus.ollama.cliAvailable ? 'Available' : 'Not found'}
                                    </p>

                                    {installerStatus.summary.missing.length > 0 ? (
                                        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 space-y-1">
                                            <p className="font-semibold">{t('wizard.missingItems')}</p>
                                            {installerStatus.summary.missing.map((item) => (
                                                <p key={item}>- {item}</p>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-700">
                                            {t('wizard.allReady')}
                                        </div>
                                    )}

                                    <div className="rounded-md border border-border/60 bg-background/70 px-3 py-2 text-[11px] text-muted-foreground space-y-1">
                                        <p className="font-semibold text-foreground">{t('wizard.nextCommands')}</p>
                                        <p><code className="font-mono">npm run install:super -- --yes</code></p>
                                        <p><code className="font-mono">npm run qa:install -- --auto-fix</code></p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {step.id === 'support' && (
                        <div className="space-y-4">
                            <p className="text-sm text-foreground/90">
                                {t('wizard.supportIntro', { highlight: t('wizard.animatedSuperPacks') })}
                            </p>
                            <div className="grid gap-3 sm:grid-cols-3">
                                {/* Miniature previews of the pack families — original inline artwork. */}
                                <div className="rounded-lg border border-border/70 overflow-hidden">
                                    <svg viewBox="0 0 160 90" className="w-full block" aria-hidden="true">
                                        <rect width="160" height="90" fill="#10142b" />
                                        <rect x="20" y="26" width="120" height="44" fill="#181d3a" stroke="#4a5391" strokeWidth="2" />
                                        <rect x="28" y="34" width="56" height="6" fill="#ffd66b" />
                                        <rect x="28" y="46" width="84" height="4" fill="#8f97c9" />
                                        <g transform="translate(104,8)">
                                            <rect x="0" y="4" width="12" height="4" fill="#3fae4a" />
                                            <rect x="4" y="0" width="6" height="4" fill="#7ed957" />
                                            <rect x="12" y="3" width="7" height="4" fill="#3fae4a" />
                                            <rect x="19" y="3" width="3" height="2" fill="#ffa63f" />
                                        </g>
                                        <g transform="translate(30,74)">
                                            <rect x="0" y="0" width="5" height="6" fill="#b2bec5" /><rect x="1" y="-2" width="2" height="2" fill="#e63c46" />
                                        </g>
                                    </svg>
                                    <p className="px-2 py-1.5 text-[10px] text-muted-foreground">{t('wizard.packRpg')}</p>
                                </div>
                                <div className="rounded-lg border border-border/70 overflow-hidden">
                                    <svg viewBox="0 0 160 90" className="w-full block" aria-hidden="true">
                                        <rect width="160" height="90" fill="#140b26" />
                                        <g transform="translate(58,10)">
                                            <rect x="6" y="0" width="8" height="3" fill="#7de8ff" />
                                            <rect x="0" y="3" width="20" height="5" fill="#9aa7b8" />
                                            <rect x="3" y="5" width="2" height="1" fill="#ffd66b" /><rect x="9" y="5" width="2" height="1" fill="#ffd66b" /><rect x="15" y="5" width="2" height="1" fill="#ffd66b" />
                                        </g>
                                        <rect y="66" width="160" height="24" fill="#3f3354" />
                                        <g transform="translate(28,54)">
                                            <rect x="1" y="0" width="8" height="7" fill="#5ce65c" /><rect x="3" y="2" width="3" height="3" fill="#181425" />
                                            <rect x="3" y="7" width="5" height="5" fill="#5ce65c" />
                                            <rect x="9" y="8" width="6" height="2" fill="#5e6b7c" /><rect x="17" y="8" width="4" height="2" fill="#66ff66" />
                                        </g>
                                        <g transform="translate(96,40)">
                                            <rect x="2" y="3" width="10" height="5" fill="#2c2137" /><rect x="10" y="3" width="4" height="4" fill="#2c2137" />
                                            <rect x="12" y="4" width="2" height="2" fill="#ff4a4a" /><rect x="4" y="0" width="6" height="3" fill="#bcd0e8" />
                                        </g>
                                    </svg>
                                    <p className="px-2 py-1.5 text-[10px] text-muted-foreground">{t('wizard.packCosmos')}</p>
                                </div>
                                <div className="rounded-lg border border-border/70 overflow-hidden">
                                    <svg viewBox="0 0 160 90" className="w-full block" aria-hidden="true">
                                        <rect width="160" height="90" fill="#a8c8de" />
                                        <path d="M0 46 Q40 30 80 42 T160 40 V90 H0 Z" fill="#5f9a5f" />
                                        <path d="M0 64 Q50 50 105 62 T160 60 V90 H0 Z" fill="#4d8a48" />
                                        <g fill="#efe9db">
                                            <circle cx="52" cy="62" r="3" /><circle cx="52" cy="70" r="3" /><circle cx="52" cy="78" r="3" />
                                            <circle cx="60" cy="70" r="3" />
                                            <circle cx="68" cy="62" r="3" /><circle cx="68" cy="70" r="3" /><circle cx="68" cy="78" r="3" />
                                        </g>
                                        <g transform="translate(98,64)">
                                            <rect x="0" y="4" width="14" height="6" fill="#26262c" /><rect x="1" y="9" width="12" height="2" fill="#f7f6f2" />
                                            <rect x="11" y="-1" width="7" height="6" fill="#26262c" /><rect x="15" y="1" width="4" height="3" fill="#f7f6f2" />
                                            <rect x="2" y="11" width="2" height="4" fill="#26262c" /><rect x="9" y="11" width="2" height="4" fill="#26262c" />
                                        </g>
                                    </svg>
                                    <p className="px-2 py-1.5 text-[10px] text-muted-foreground">{t('wizard.packCollie')}</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <a
                                    href="https://geekatplay.gumroad.com/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
                                >
                                    {t('wizard.browsePacks')}
                                </a>
                                <p className="text-[11px] text-muted-foreground">
                                    {t('wizard.packsFooter')}
                                </p>
                            </div>
                        </div>
                    )}

                    {step.id === 'finish' && (
                        <div className="space-y-4">
                            <p className="text-sm text-foreground/90">{t('wizard.finishIntro')}</p>
                            <div className="rounded-lg border border-border/70 bg-secondary/15 p-4 space-y-2 text-xs">
                                <p><span className="font-semibold">{t('wizard.summary.storageMode')}</span> {storageMode}</p>
                                <p><span className="font-semibold">{t('wizard.summary.cloudProvider')}</span> {selectedCloudProviderLabel}</p>
                                <p><span className="font-semibold">{t('wizard.summary.cloudConnection')}</span> {selectedCloudProviderIsImplemented ? (driveConnected ? 'Connected' : (storageMode === 'local' ? 'Not required (local mode)' : 'Not connected yet')) : 'Planned provider (not yet available)'}</p>
                                <p><span className="font-semibold">{t('wizard.summary.aiKeys')}</span> {[stabilityKey, openaiKey, googleKey, bananaKey].filter((value) => value.trim().length > 0).length}</p>
                                <p><span className="font-semibold">{t('wizard.summary.defaultProvider')}</span> {GENERATIVE_PROVIDER_OPTIONS.find((provider) => provider.id === defaultGenerativeProvider)?.label || defaultGenerativeProvider}</p>
                                <p><span className="font-semibold">{t('wizard.summary.defaultWorkflow')}</span> {GENERATIVE_WORKFLOW_OPTIONS.find((workflow) => workflow.id === defaultGenerativeWorkflow)?.label || defaultGenerativeWorkflow}</p>
                                <p>
                                    <span className="font-semibold">{t('wizard.summary.runtime')}</span>{' '}
                                    {installerStatus
                                        ? (installerStatus.summary.ready
                                            ? 'Ready'
                                            : `Needs attention (${installerStatus.summary.missing.length} missing)`)
                                        : 'Not checked yet'}
                                </p>
                            </div>
                            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 flex items-center gap-2">
                                <CheckCircle2 size={14} />
                                {t('wizard.reopenHint')}
                            </div>
                        </div>
                    )}
                </div>

                <div className="shrink-0 px-6 py-4 border-t border-border/60 bg-secondary/10 flex items-center justify-between">
                    <button
                        onClick={goBack}
                        disabled={!canGoBack}
                        className="h-9 px-4 rounded-md border border-border text-xs font-semibold hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
                    >
                        <ChevronLeft size={14} />
                        {t('wizard.back')}
                    </button>
                    <SetupCollieMascot
                        stepId={step.id}
                        mood={installerRunState === 'running' ? 'run' : installerRunState === 'success' && step.id === 'runtime' ? 'wave' : undefined}
                    />
                    <button
                        onClick={goNext}
                        className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors inline-flex items-center gap-1"
                    >
                        {isLastStep ? (
                            <>
                                <CheckCircle2 size={14} />
                                {t('wizard.finishSetup')}
                            </>
                        ) : (
                            <>
                                {t('wizard.next')}
                                <ChevronRight size={14} />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </ModalShell>
    );
}
