'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Cloud, HardDrive, Loader2, Sparkles, X } from 'lucide-react';
import useEscapeKey from '@/hooks/useEscapeKey';
import { connectGoogleDrive, loadDriveConfig, updateDriveConfig } from '@/lib/googleDrive';
import { loadAssetStorageSettings, saveAssetStorageSettings, type AssetStorageMode } from '@/lib/assetStorageSettings';
import { loadUiPreferences, saveUiPreferences } from '@/lib/ui-preferences';

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
    { id: 'drive', title: 'Google Drive', description: 'Connect your personal cloud.' },
    { id: 'api', title: 'API Keys', description: 'Optional AI key setup.' },
    { id: 'finish', title: 'Finish', description: 'Review and start creating.' },
] as const;

export default function SetupWizardModal({ isOpen, onClose, onComplete }: SetupWizardModalProps) {
    const [stepIndex, setStepIndex] = useState(0);
    const [storageMode, setStorageMode] = useState<AssetStorageMode>('hybrid');
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
    const [suppressNumberDragHints, setSuppressNumberDragHints] = useState(false);
    const [appOrigin, setAppOrigin] = useState('http://localhost:3000');

    useEscapeKey(onClose, { enabled: isOpen });

    useEffect(() => {
        if (!isOpen) return;
        setStepIndex(0);

        const storageSettings = loadAssetStorageSettings();
        setStorageMode(storageSettings.mode);
        setHybridUploadToCloudByDefault(storageSettings.hybridUploadToCloudByDefault);
        setIncludeLegacyServerAssetsInHybrid(storageSettings.includeLegacyServerAssetsInHybrid);

        const drive = loadDriveConfig();
        setDriveClientId(drive.clientId || ENV_DRIVE_CLIENT_ID || '');
        setDriveConnected(Boolean(drive.enabled));
        setDriveError(null);

        const uiPrefs = loadUiPreferences();
        setSuppressNumberDragHints(uiPrefs.suppressNumberDragHints);

        if (typeof window !== 'undefined') {
            setAppOrigin(window.location.origin);
            setStabilityKey(window.localStorage.getItem(STORAGE_KEYS.STABILITY_API_KEY) || '');
            setOpenaiKey(window.localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY) || '');
            setGoogleKey(window.localStorage.getItem(STORAGE_KEYS.GOOGLE_API_KEY) || '');
            setBananaKey(window.localStorage.getItem(STORAGE_KEYS.BANANA_API_KEY) || '');
        }
    }, [isOpen]);

    const canGoBack = stepIndex > 0;
    const isLastStep = stepIndex === STEPS.length - 1;
    const step = STEPS[stepIndex];

    const isDriveStepOptional = storageMode === 'local';
    const shouldNudgeDriveConnection = useMemo(() => {
        if (storageMode === 'local') return false;
        return !driveConnected;
    }, [storageMode, driveConnected]);

    const persistStorageSettings = () => {
        saveAssetStorageSettings({
            mode: storageMode,
            cloudProvider: 'google-drive',
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
                    <div className="grid grid-cols-5 gap-2">
                        {STEPS.map((item, index) => (
                            <div key={item.id} className="space-y-1">
                                <div className={`h-1.5 rounded-full ${index <= stepIndex ? 'bg-primary' : 'bg-secondary/60'}`} />
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
                                    <p className="text-xs text-muted-foreground mt-1">Save locally by default with optional Google Drive copy per upload.</p>
                                </button>
                                <button
                                    onClick={() => setStorageMode('cloud')}
                                    className={`text-left rounded-lg border p-4 transition-colors ${
                                        storageMode === 'cloud' ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/30'
                                    }`}
                                >
                                    <p className="text-sm font-semibold flex items-center gap-2"><Cloud size={14} /> Cloud only</p>
                                    <p className="text-xs text-muted-foreground mt-1">All assets are uploaded to Google Drive.</p>
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
                                        Pre-check “upload to Google Drive” on each asset upload
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
                        </div>
                    )}

                    {step.id === 'drive' && (
                        <div className="space-y-4">
                            {isDriveStepOptional ? (
                                <div className="rounded-lg border border-border/70 bg-secondary/15 p-4 text-sm text-muted-foreground">
                                    You selected local-only storage, so Google Drive is optional right now.
                                </div>
                            ) : (
                                <>
                                    <p className="text-sm text-foreground/90">
                                        Connect Google Drive so assets can be stored in your personal cloud.
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
                                        {driveConnected ? 'Reconnect Google Drive' : 'Connect Google Drive'}
                                    </button>
                                    {driveConnected && (
                                        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                                            Google Drive connected successfully.
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
                                            <li>Paste the client ID here, then click Connect Google Drive.</li>
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

                    {step.id === 'finish' && (
                        <div className="space-y-4">
                            <p className="text-sm text-foreground/90">Review your setup and finish onboarding.</p>
                            <div className="rounded-lg border border-border/70 bg-secondary/15 p-4 space-y-2 text-xs">
                                <p><span className="font-semibold">Storage mode:</span> {storageMode}</p>
                                <p><span className="font-semibold">Google Drive:</span> {driveConnected ? 'Connected' : (storageMode === 'local' ? 'Not required (local mode)' : 'Not connected yet')}</p>
                                <p><span className="font-semibold">AI keys set:</span> {[stabilityKey, openaiKey, googleKey, bananaKey].filter((value) => value.trim().length > 0).length}</p>
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
