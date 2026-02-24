'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Save, Key, ShieldCheck, AlertCircle, Server, Cloud, Box, RefreshCcw, DownloadCloud, HardDrive, Loader2, HelpCircle } from 'lucide-react';
import HelpPopup from './HelpPopup';
import type { AuthUser, DesktopUpdatePayload, DesktopUpdateStatus, GoogleDriveConfig } from '@/types';
import { connectGoogleDrive, disconnectGoogleDrive, loadDriveConfig, updateDriveConfig } from '@/lib/googleDrive';
import useEscapeKey from '@/hooks/useEscapeKey';
import {
    loadAssetStorageSettings,
    saveAssetStorageSettings,
    type AssetStorageMode
} from '@/lib/assetStorageSettings';
import { requestOpenSetupWizard } from '@/lib/setupWizard';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId?: string;
    userRoles?: string[];
}

export const STORAGE_KEYS = {
    // 3D Services
    MESHY_API_KEY: 'meshy_api_key',
    TRIPO_API_KEY: 'tripo_api_key',
    HITEMS_API_KEY: 'hitems_api_key',
    HITEMS_APP_ID: 'hitems_appid',
    
    // Image Services
    STABILITY_API_KEY: 'stability_api_key',
    OPENAI_API_KEY: 'openai_api_key',
    GOOGLE_API_KEY: 'google_api_key', // Google Nano/Gemini
    BANANA_API_KEY: 'banana_api_key', // Banana.dev
    
    // Legacy / Others
    IMG_GEN_PROVIDER: 'image-express-provider',
    COMFY_UI_URL: 'image-express-comfy-url',
};

const envDriveClientId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID ?? '';

export default function SettingsModal({ isOpen, onClose, userId, userRoles }: SettingsModalProps) {
    // 3D Keys
    const [meshyKey, setMeshyKey] = useState('');
    const [tripoKey, setTripoKey] = useState('');
    const [hitemsKey, setHitemsKey] = useState(''); // Stores either "token" or "ak:sk"
    
    // UI state for splitting Hitems key
    const [hitemsMode, setHitemsMode] = useState<'token' | 'ak_sk'>('ak_sk');
    const [hitemsAk, setHitemsAk] = useState('');
    const [hitemsSk, setHitemsSk] = useState('');
    
    const [hitemsAppId, setHitemsAppId] = useState('');

    // Image Keys
    const [stabilityKey, setStabilityKey] = useState('');
    const [openaiKey, setOpenaiKey] = useState('');
    const [googleKey, setGoogleKey] = useState('');
    const [bananaKey, setBananaKey] = useState('');

    const [status, setStatus] = useState<'idle' | 'saved' | 'saving' | 'error'>('idle');
    const [syncStatus, setSyncStatus] = useState<'local' | 'synced' | 'syncing'>('local');
    const [helpType, setHelpType] = useState<'comfy' | 'api' | null>(null);
    const [isLogVisible, setIsLogVisible] = useState(false);
    const [logContent, setLogContent] = useState('');
    const [isLogLoading, setIsLogLoading] = useState(false);
    const [logError, setLogError] = useState<string | null>(null);
    const [isDesktopApp, setIsDesktopApp] = useState(false);
    const [updateStatus, setUpdateStatus] = useState<DesktopUpdateStatus>('idle');
    const [updateMessage, setUpdateMessage] = useState<string | null>(null);
    const [driveConfig, setDriveConfig] = useState<GoogleDriveConfig>(() => loadDriveConfig());
    const [isDriveBusy, setIsDriveBusy] = useState(false);
    const [driveError, setDriveError] = useState<string | null>(null);
    const [clientIdInput, setClientIdInput] = useState(envDriveClientId);
    const [showDriveHelp, setShowDriveHelp] = useState(false);
    const [assetStorageMode, setAssetStorageMode] = useState<AssetStorageMode>('hybrid');
    const [hybridUploadToCloudByDefault, setHybridUploadToCloudByDefault] = useState(false);
    const [includeLegacyServerAssetsInHybrid, setIncludeLegacyServerAssetsInHybrid] = useState(true);
    const [adminUsers, setAdminUsers] = useState<AuthUser[]>([]);
    const [isAdminUsersLoading, setIsAdminUsersLoading] = useState(false);
    const [adminError, setAdminError] = useState<string | null>(null);
    const [adminDraftRoles, setAdminDraftRoles] = useState<Record<string, string>>({});
    const [adminDraftRights, setAdminDraftRights] = useState<Record<string, string>>({});
    const [adminBusyUser, setAdminBusyUser] = useState<string | null>(null);

    const isAdmin = !!userRoles?.includes('admin') && !!userId && userId.includes('@');

    useEscapeKey(onClose, { enabled: isOpen });

    // Load keys on mount
    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const bridge = window.desktop;
        let unsubscribe: (() => void) | undefined;

        if (bridge?.isDesktop) {
            setIsDesktopApp(true);
            setUpdateStatus('idle');
            setUpdateMessage(null);
            unsubscribe = bridge.onUpdateStatus?.((payload: DesktopUpdatePayload) => {
                if (!payload) {
                    return;
                }
                setUpdateStatus(payload.status || 'idle');
                setUpdateMessage(payload.message || null);
            });
        }

        const storedDrive = loadDriveConfig();
        setDriveConfig(storedDrive);
        if (storedDrive.clientId) {
            setClientIdInput(storedDrive.clientId);
        } else {
            setClientIdInput(envDriveClientId || '');
        }

        // Always load from local storage first for immediate UI
        setMeshyKey(localStorage.getItem(STORAGE_KEYS.MESHY_API_KEY) || '');
        setTripoKey(localStorage.getItem(STORAGE_KEYS.TRIPO_API_KEY) || '');
        setHitemsKey(localStorage.getItem(STORAGE_KEYS.HITEMS_API_KEY) || '');
        setHitemsAppId(localStorage.getItem(STORAGE_KEYS.HITEMS_APP_ID) || '');
        
        // Parse Hitem Key
        const rawHitemKey = localStorage.getItem(STORAGE_KEYS.HITEMS_API_KEY) || '';
        setHitemsKey(rawHitemKey);
        
        if (rawHitemKey.includes(':') && !rawHitemKey.startsWith('Bearer')) {
            setHitemsMode('ak_sk');
            const [ak, sk] = rawHitemKey.split(':');
            setHitemsAk(ak || '');
            setHitemsSk(sk || '');
        } else {
            // Default to AK/SK if empty, or Token if it looks like a token
            if (!rawHitemKey) setHitemsMode('ak_sk');
            else setHitemsMode('token');
        }
        
        setStabilityKey(localStorage.getItem(STORAGE_KEYS.STABILITY_API_KEY) || '');
        setOpenaiKey(localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY) || '');
        setGoogleKey(localStorage.getItem(STORAGE_KEYS.GOOGLE_API_KEY) || '');
        setBananaKey(localStorage.getItem(STORAGE_KEYS.BANANA_API_KEY) || '');

        // If user is logged in, fetch from server
        if (userId && userId !== 'Guest') {
            setSyncStatus('syncing');
            fetch(`/api/user/keys?userId=${encodeURIComponent(userId)}`)
                .then(res => {
                    if (res.ok) return res.json();
                    throw new Error('Failed to fetch keys');
                })
                .then(data => {
                    if (data && data.keys) {
                        if (data.keys.meshy) setMeshyKey(data.keys.meshy);
                        if (data.keys.tripo) setTripoKey(data.keys.tripo);
                        if (data.keys.hitems) {
                             const raw = data.keys.hitems;
                             setHitemsKey(raw);
                             if (raw.includes(':') && !raw.startsWith('Bearer')) {
                                setHitemsMode('ak_sk');
                                const [ak, sk] = raw.split(':');
                                setHitemsAk(ak || '');
                                setHitemsSk(sk || '');
                             } else {
                                setHitemsMode(raw ? 'token' : 'ak_sk');
                             }
                        }
                        if (data.keys.stability) setStabilityKey(data.keys.stability);
                        if (data.keys.openai) setOpenaiKey(data.keys.openai);
                        if (data.keys.google) setGoogleKey(data.keys.google);
                        if (data.keys.banana) setBananaKey(data.keys.banana);
                        setSyncStatus('synced');
                    } else {
                         setSyncStatus('local'); // No keys on server yet
                    }
                })
                .catch(err => {
                    console.error("Failed to sync keys:", err);
                    setSyncStatus('local');
                });
        } else {
            setSyncStatus('local');
        }

        const assetStorageSettings = loadAssetStorageSettings();
        setAssetStorageMode(assetStorageSettings.mode);
        setHybridUploadToCloudByDefault(assetStorageSettings.hybridUploadToCloudByDefault);
        setIncludeLegacyServerAssetsInHybrid(assetStorageSettings.includeLegacyServerAssetsInHybrid);

        return () => {
            unsubscribe?.();
        };
    }, [isOpen, userId]);

    const loadAdminUsers = useCallback(async () => {
        if (!isAdmin || !userId || userId === 'Guest') return;
        setIsAdminUsersLoading(true);
        setAdminError(null);
        try {
            const res = await fetch(`/api/user/admin/users?requesterEmail=${encodeURIComponent(userId)}`);
            const data = await res.json();
            if (!res.ok || !data.success) {
                setAdminError(data.message || 'Failed to load users.');
                setAdminUsers([]);
                return;
            }
            const users = (Array.isArray(data.users) ? data.users : []) as AuthUser[];
            setAdminUsers(users);
            setAdminDraftRoles(
                Object.fromEntries(users.map((user) => [user.email, (user.roles || []).join(', ')]))
            );
            setAdminDraftRights(
                Object.fromEntries(users.map((user) => [user.email, (user.rights || []).join(', ')]))
            );
        } catch (error) {
            console.error('Failed to load admin users', error);
            setAdminError('Failed to load users.');
            setAdminUsers([]);
        } finally {
            setIsAdminUsersLoading(false);
        }
    }, [isAdmin, userId]);

    useEffect(() => {
        if (!isOpen) return;
        if (!isAdmin || !userId || userId === 'Guest') return;
        void loadAdminUsers();
    }, [isOpen, isAdmin, userId, loadAdminUsers]);

    const handleSave = async () => {
        setStatus('saving');

        // 1. Save Local
        localStorage.setItem(STORAGE_KEYS.MESHY_API_KEY, meshyKey);
        localStorage.setItem(STORAGE_KEYS.TRIPO_API_KEY, tripoKey);
        localStorage.setItem(STORAGE_KEYS.HITEMS_API_KEY, hitemsKey);
        localStorage.setItem(STORAGE_KEYS.HITEMS_APP_ID, hitemsAppId);
        
        localStorage.setItem(STORAGE_KEYS.STABILITY_API_KEY, stabilityKey);
        localStorage.setItem(STORAGE_KEYS.OPENAI_API_KEY, openaiKey);
        localStorage.setItem(STORAGE_KEYS.GOOGLE_API_KEY, googleKey);
        localStorage.setItem(STORAGE_KEYS.BANANA_API_KEY, bananaKey);
        saveAssetStorageSettings({
            mode: assetStorageMode,
            cloudProvider: 'google-drive',
            hybridUploadToCloudByDefault,
            includeLegacyServerAssetsInHybrid
        });

        // 2. Save Server (if logged in)
        if (userId && userId !== 'Guest') {
            try {
                const keysToSave = {
                    meshy: meshyKey,
                    tripo: tripoKey,
                    stability: stabilityKey,
                    openai: openaiKey,
                    google: googleKey,
                    banana: bananaKey
                };

                const res = await fetch('/api/user/keys', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: userId,
                        keys: keysToSave
                    })
                });

                if (res.ok) {
                    setSyncStatus('synced');
                } else {
                    console.error("Failed to save to server, status:", res.status);
                    setSyncStatus('local');
                }
            } catch (e) {
                console.error("Exception saving to server", e);
                setSyncStatus('local');
            }
        }
        
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2000);
    };

    // Helper to mask key for display if it comes from env (not implemented here per se, but good for UX)
    // Here we just input what is in local storage.

    const handleToggleLog = async () => {
        if (!isLogVisible) {
            setIsLogLoading(true);
            setLogError(null);
            try {
                const res = await fetch('/api/logs/login');
                if (!res.ok) {
                    throw new Error(`Status ${res.status}`);
                }
                const text = await res.text();
                setLogContent(text);
            } catch (error) {
                console.error('Failed to load login log', error);
                setLogError('Failed to load log. Please try again later.');
                setLogContent('');
            } finally {
                setIsLogLoading(false);
            }
        }
        setIsLogVisible(prev => !prev);
    };

    const handleManualUpdateCheck = async () => {
        if (!isDesktopApp) return;
        const api = typeof window !== 'undefined' ? window.desktop : undefined;
        if (!api?.checkForUpdates) return;
        setUpdateStatus('checking');
        setUpdateMessage('Checking for updates…');
        try {
            const result = await api.checkForUpdates();
            if (result?.message) {
                setUpdateMessage(result.message);
            }
            if (result?.status && result.status !== 'restarting') {
                setUpdateStatus(result.status as DesktopUpdateStatus);
            }
        } catch (error) {
            setUpdateStatus('error');
            setUpdateMessage(error instanceof Error ? error.message : 'Unable to check for updates.');
        }
    };

    const handleInstallUpdate = async () => {
        if (!isDesktopApp) return;
        const api = typeof window !== 'undefined' ? window.desktop : undefined;
        if (!api?.installUpdate) return;
        try {
            setUpdateStatus('ready');
            setUpdateMessage('Restarting to apply update…');
            await api.installUpdate();
        } catch (error) {
            setUpdateStatus('error');
            setUpdateMessage(error instanceof Error ? error.message : 'Failed to install update.');
        }
    };

    const handleConnectDrive = async () => {
        const resolvedClientId = (driveConfig.clientId || clientIdInput || envDriveClientId || '').trim();
        if (!resolvedClientId) {
            setDriveError('Add a Google OAuth client ID before connecting.');
            return;
        }
        setIsDriveBusy(true);
        setDriveError(null);
        try {
            const config = await connectGoogleDrive(resolvedClientId);
            setDriveConfig(config);
            setClientIdInput(resolvedClientId);
        } catch (error) {
            setDriveError(error instanceof Error ? error.message : 'Failed to connect Google Drive.');
        } finally {
            setIsDriveBusy(false);
        }
    };

    const handleDisconnectDrive = async () => {
        setIsDriveBusy(true);
        setDriveError(null);
        try {
            await disconnectGoogleDrive();
            const updated = loadDriveConfig();
            setDriveConfig(updated);
            setClientIdInput(updated.clientId || envDriveClientId || '');
        } catch (error) {
            setDriveError(error instanceof Error ? error.message : 'Failed to disconnect Google Drive.');
        } finally {
            setIsDriveBusy(false);
        }
    };

    const executeAdminAction = async (
        targetEmail: string,
        action: 'approve' | 'reject' | 'disable' | 'enable' | 'set-roles' | 'set-rights',
        payload?: { roles?: string[]; rights?: string[] }
    ) => {
        if (!userId || userId === 'Guest') return;
        setAdminBusyUser(targetEmail);
        setAdminError(null);
        try {
            const res = await fetch('/api/user/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requesterEmail: userId,
                    targetEmail,
                    action,
                    ...(payload || {})
                })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setAdminError(data.message || 'Admin action failed.');
                return;
            }
            await loadAdminUsers();
        } catch (error) {
            console.error('Admin action failed', error);
            setAdminError('Admin action failed.');
        } finally {
            setAdminBusyUser(null);
        }
    };

    const parseDraftList = (value: string) =>
        value
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card w-full max-w-md max-h-[85vh] rounded-xl border border-border shadow-2xl p-6 relative animate-in zoom-in-95 duration-200 flex flex-col">
                <button 
                    onClick={onClose}
                    className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <Key size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold">API Configurations</h2>
                        <div className="flex flex-col">
                             <p className="text-xs text-muted-foreground">Manage your keys for external AI services</p>
                             {userId && userId !== 'Guest' && (
                                 <span className={`text-[10px] flex items-center gap-1 mt-1 ${syncStatus === 'synced' ? 'text-green-500' : 'text-amber-500'}`}>
                                     <Server size={10} />
                                     {syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'synced' ? 'Synced with Account' : 'Local Storage Only'}
                                 </span>
                             )}
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                    {/* 3D Generation Section */}
                    <div className="space-y-4">
                         <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground/90 uppercase tracking-wider">
                             <Box size={16} className="text-indigo-500"/>
                             3D Services
                        </h4>
                        
                        <div className="grid gap-3">
                            {/* Meshy */}
                            <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <label className="text-xs font-semibold mb-1.5 block">Meshy AI</label>
                                <input 
                                    type="password"
                                    value={meshyKey}
                                    onChange={(e) => setMeshyKey(e.target.value)}
                                    placeholder="Enter Meshy API Key"
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-mono placeholder:font-sans"
                                />
                            </div>

                            {/* Tripo */}
                            <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <label className="text-xs font-semibold mb-1.5 block">Tripo AI</label>
                                <input 
                                    type="password"
                                    value={tripoKey}
                                    onChange={(e) => setTripoKey(e.target.value)}
                                    placeholder="Enter Tripo API Key"
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-mono placeholder:font-sans"
                                />
                            </div>

                            {/* Hitem3D */}
                             <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <div className="flex justify-between mb-1.5 items-center">
                                    <label className="text-xs font-semibold">Hitem3D</label>
                                    <div className="flex gap-2 text-[10px] bg-secondary rounded p-0.5">
                                        <button 
                                            type="button"
                                            onClick={() => setHitemsMode('ak_sk')}
                                            className={`px-2 py-0.5 rounded transition-colors ${hitemsMode === 'ak_sk' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                                        >
                                            AK/SK
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setHitemsMode('token')}
                                            className={`px-2 py-0.5 rounded transition-colors ${hitemsMode === 'token' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                                        >
                                            Token
                                        </button>
                                    </div>
                                </div>
                                
                                {hitemsMode === 'ak_sk' ? (
                                    <div className="space-y-2">
                                        <input 
                                            type="text"
                                            value={hitemsAk}
                                            onChange={(e) => setHitemsAk(e.target.value)}
                                            placeholder="App ID (ak_...)"
                                            className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-mono placeholder:font-sans"
                                        />
                                        <input 
                                            type="password"
                                            value={hitemsSk}
                                            onChange={(e) => setHitemsSk(e.target.value)}
                                            placeholder="Secret Key (sk_...)"
                                            className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-mono placeholder:font-sans"
                                        />
                                    </div>
                                ) : (
                                    <input 
                                        type="password"
                                        value={hitemsKey}
                                        onChange={(e) => setHitemsKey(e.target.value)}
                                        placeholder="Access Token (Bearer ...)"
                                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-mono placeholder:font-sans"
                                    />
                                )}

                                <input 
                                    type="text"
                                    value={hitemsAppId}
                                    onChange={(e) => setHitemsAppId(e.target.value)}
                                    placeholder="Optional Appid (if required)"
                                    className="mt-2 w-full h-9 px-3 rounded-md bg-background border border-border focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-mono placeholder:font-sans"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-border/50" />

                    {/* Image Generation Config */}
                    <div className="space-y-4">
                        <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground/90 uppercase tracking-wider">
                             <Cloud size={16} className="text-pink-500"/> 
                             Image & Vision
                        </h4>
                        
                        <div className="grid gap-3">
                            {/* Stability AI */}
                            <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <div className="flex justify-between mb-1.5">
                                    <label className="text-xs font-semibold">Stability AI</label>
                                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">SD3 / Core</span>
                                </div>
                                <input 
                                    type="password"
                                    value={stabilityKey}
                                    onChange={(e) => setStabilityKey(e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none text-xs font-mono placeholder:font-sans"
                                />
                            </div>

                            {/* OpenAI */}
                             <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <div className="flex justify-between mb-1.5">
                                    <label className="text-xs font-semibold">OpenAI</label>
                                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">DALL-E 3</span>
                                </div>
                                <input 
                                    type="password"
                                    value={openaiKey}
                                    onChange={(e) => setOpenaiKey(e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none text-xs font-mono placeholder:font-sans"
                                />
                            </div>

                            {/* Google Nano */}
                            <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <div className="flex justify-between mb-1.5">
                                    <label className="text-xs font-semibold">Google Gemini / Vertex</label>
                                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">Nano / Imagen</span>
                                </div>
                                <input 
                                    type="password"
                                    value={googleKey}
                                    onChange={(e) => setGoogleKey(e.target.value)}
                                    placeholder="Enter API Key"
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none text-xs font-mono placeholder:font-sans"
                                />
                            </div>

                             {/* Banana.dev */}
                            <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <div className="flex justify-between mb-1.5">
                                    <label className="text-xs font-semibold">Banana.dev</label>
                                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">GPU Cloud</span>
                                </div>
                                <input 
                                    type="password"
                                    value={bananaKey}
                                    onChange={(e) => setBananaKey(e.target.value)}
                                    placeholder="Enter API Key"
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none text-xs font-mono placeholder:font-sans"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md flex items-start gap-3">
                        <AlertCircle size={16} className="text-yellow-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground">
                            Keys are stored locally in your browser. We never transmit them to our servers, only directly to the AI providers.
                        </p>
                    </div>

                    {isDesktopApp && (
                        <div className="border-t border-border/40 pt-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-semibold flex items-center gap-2">
                                        <ShieldCheck size={16} className="text-primary" />
                                        Desktop Updates
                                    </h4>
                                    <p className="text-[11px] text-muted-foreground">
                                        Stay current with the latest Image Express desktop features.
                                    </p>
                                </div>
                                <button
                                    onClick={handleManualUpdateCheck}
                                    className="px-3 py-1.5 text-[11px] font-semibold border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-1"
                                    disabled={updateStatus === 'checking'}
                                >
                                    <RefreshCcw size={14} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
                                    Check Now
                                </button>
                            </div>
                            {updateMessage && (
                                <div className="text-[11px] text-muted-foreground bg-secondary/20 border border-border/40 rounded-md px-3 py-2">
                                    {updateMessage}
                                </div>
                            )}
                            {updateStatus === 'ready' && (
                                <button
                                    onClick={handleInstallUpdate}
                                    className="w-full py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-md flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
                                >
                                    <DownloadCloud size={14} />
                                    Restart & Install Update
                                </button>
                            )}
                        </div>
                    )}

                    <div className="border-t border-border/40 pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-semibold flex items-center gap-2">
                                    <HardDrive size={16} className="text-primary" />
                                    Google Drive Backup
                                </h4>
                                <p className="text-[11px] text-muted-foreground">
                                    Optional backup for saved designs to your Drive.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowDriveHelp((prev) => !prev)}
                                    className="px-2 py-1 text-[11px] font-semibold border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-1.5"
                                >
                                    <HelpCircle size={14} />
                                    Help
                                </button>
                            {driveConfig.enabled ? (
                                <button
                                    onClick={handleDisconnectDrive}
                                    className="px-3 py-1.5 text-[11px] font-semibold border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-1.5"
                                    disabled={isDriveBusy}
                                >
                                    {isDriveBusy ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
                                            Disconnecting...
                                        </>
                                    ) : (
                                        'Disconnect'
                                    )}
                                </button>
                            ) : (
                                <button
                                    onClick={handleConnectDrive}
                                    className="px-3 py-1.5 text-[11px] font-semibold border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-1.5"
                                    disabled={isDriveBusy}
                                >
                                    {isDriveBusy ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
                                            Connecting...
                                        </>
                                    ) : (
                                        'Connect'
                                    )}
                                </button>
                            )}
                            </div>
                        </div>
                        {showDriveHelp && (
                            <div className="text-[11px] text-muted-foreground bg-secondary/20 border border-border/40 rounded-md px-3 py-3 space-y-2">
                                <p className="font-semibold text-foreground">How to create a Google OAuth Client ID</p>
                                <ol className="list-decimal list-inside space-y-1">
                                    <li>Visit Google Cloud Console and create (or select) a project.</li>
                                    <li>Enable the Drive API under APIs and Services.</li>
                                    <li>Configure the OAuth consent screen (External) and add your app domains.</li>
                                    <li>Create OAuth credentials: choose Web application, add your origins (for example http://localhost:3000), and copy the Client ID.</li>
                                    <li>Paste the Client ID here or set NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID before running the app.</li>
                                </ol>
                                <p>If you publish the app, submit the OAuth consent screen for verification so users see the Google account picker without warnings.</p>
                            </div>
                        )}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold block">Google OAuth Client ID</label>
                            <input
                                type="text"
                                value={clientIdInput}
                                onChange={(event) => {
                                    const value = event.target.value.trim();
                                    setClientIdInput(value);
                                    const updated = updateDriveConfig({ clientId: value || undefined });
                                    setDriveConfig(updated);
                                }}
                                placeholder="1234567890-abcdef.apps.googleusercontent.com"
                                className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                            />
                            {!envDriveClientId && (
                                <p className="text-[11px] text-muted-foreground">
                                    Paste the Client ID from your Google Cloud OAuth credentials. Enable the Drive API and include the <span className="font-mono">drive.file</span> scope.
                                </p>
                            )}
                        </div>
                        {driveConfig.enabled && (
                            <div className="text-[11px] text-muted-foreground bg-secondary/20 border border-border/40 rounded-md px-3 py-2">
                                <p className="font-semibold">Status: Connected</p>
                                {driveConfig.folderName && <p>Folder: {driveConfig.folderName}</p>}
                                <p className="text-muted-foreground/80">Backups run after each successful save.</p>
                            </div>
                        )}
                        {driveError && (
                            <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                                {driveError}
                            </div>
                        )}
                    </div>

                    <div className="border-t border-border/40 pt-4 space-y-3">
                        <div>
                            <h4 className="text-sm font-semibold flex items-center gap-2">
                                <HardDrive size={16} className="text-primary" />
                                Asset Storage Strategy
                            </h4>
                            <p className="text-[11px] text-muted-foreground">
                                Choose where uploaded assets are stored: browser-local, hybrid, or Google Drive only.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold block">Storage Mode</label>
                            <select
                                value={assetStorageMode}
                                onChange={(event) => setAssetStorageMode(event.target.value as AssetStorageMode)}
                                className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs"
                            >
                                <option value="local">Local only (browser)</option>
                                <option value="hybrid">Hybrid (local + optional cloud per upload)</option>
                                <option value="cloud">Cloud only (Google Drive)</option>
                            </select>
                            <p className="text-[11px] text-muted-foreground">
                                {assetStorageMode === 'local' && 'Files stay in your browser storage (IndexedDB).'}
                                {assetStorageMode === 'hybrid' && 'Files save locally by default; you can check per-upload cloud copy.'}
                                {assetStorageMode === 'cloud' && 'All uploads go to your connected Google Drive assets folder.'}
                            </p>
                        </div>

                        {assetStorageMode === 'hybrid' && (
                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={hybridUploadToCloudByDefault}
                                    onChange={(event) => setHybridUploadToCloudByDefault(event.target.checked)}
                                    className="rounded border-border text-primary focus:ring-primary/20"
                                />
                                In hybrid mode, check cloud upload by default
                            </label>
                        )}

                        {assetStorageMode === 'hybrid' && (
                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={includeLegacyServerAssetsInHybrid}
                                    onChange={(event) => setIncludeLegacyServerAssetsInHybrid(event.target.checked)}
                                    className="rounded border-border text-primary focus:ring-primary/20"
                                />
                                Include legacy server assets in Asset Library lists
                            </label>
                        )}

                        {assetStorageMode !== 'local' && !driveConfig.enabled && (
                            <div className="text-[11px] text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                                Connect Google Drive above to use cloud or hybrid cloud uploads.
                            </div>
                        )}

                        <button
                            onClick={() => requestOpenSetupWizard()}
                            className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5"
                        >
                            <Key size={13} />
                            Launch Setup Wizard
                        </button>
                    </div>

                    <div className="border-t border-border/40 pt-4">
                        {isAdmin && userId && userId !== 'Guest' && (
                            <div className="mb-6 border-b border-border/40 pb-6 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-sm font-semibold flex items-center gap-2">
                                            <ShieldCheck size={16} className="text-primary" />
                                            User Management
                                        </h4>
                                        <p className="text-[11px] text-muted-foreground">
                                            Admin roles, approval queue, and per-user rights.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => void loadAdminUsers()}
                                        className="px-3 py-1.5 text-[11px] font-semibold border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-1"
                                        disabled={isAdminUsersLoading}
                                    >
                                        <RefreshCcw size={14} className={isAdminUsersLoading ? 'animate-spin' : ''} />
                                        Refresh
                                    </button>
                                </div>

                                {adminError && (
                                    <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                                        {adminError}
                                    </div>
                                )}

                                {isAdminUsersLoading ? (
                                    <div className="text-xs text-muted-foreground">Loading users...</div>
                                ) : (
                                    <div className="space-y-2">
                                        {adminUsers.map((user) => {
                                            const busy = adminBusyUser === user.email;
                                            const rolesText = adminDraftRoles[user.email] ?? (user.roles || []).join(', ');
                                            const rightsText = adminDraftRights[user.email] ?? (user.rights || []).join(', ');
                                            const isPending = user.status === 'pending';
                                            const isDisabled = user.status === 'disabled';

                                            return (
                                                <div key={user.email} className="rounded-md border border-border/60 bg-secondary/20 p-3 space-y-2">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-semibold text-foreground truncate">{user.displayName}</p>
                                                            <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                                                        </div>
                                                        <span className={`text-[10px] px-2 py-0.5 rounded ${
                                                            user.status === 'approved'
                                                                ? 'bg-emerald-500/15 text-emerald-600'
                                                                : user.status === 'pending'
                                                                ? 'bg-amber-500/15 text-amber-600'
                                                                : 'bg-red-500/15 text-red-600'
                                                        }`}>
                                                            {user.status}
                                                        </span>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button
                                                            onClick={() => void executeAdminAction(user.email, isPending ? 'approve' : 'enable')}
                                                            disabled={busy}
                                                            className="h-8 text-[11px] font-semibold rounded border border-border hover:bg-secondary transition-colors"
                                                        >
                                                            {isPending ? 'Approve' : 'Enable'}
                                                        </button>
                                                        <button
                                                            onClick={() => void executeAdminAction(user.email, isPending ? 'reject' : 'disable')}
                                                            disabled={busy}
                                                            className="h-8 text-[11px] font-semibold rounded border border-border hover:bg-secondary transition-colors"
                                                        >
                                                            {isPending ? 'Reject' : (isDisabled ? 'Disabled' : 'Disable')}
                                                        </button>
                                                    </div>

                                                    <div className="space-y-1">
                                                        <label className="text-[10px] uppercase text-muted-foreground">Roles</label>
                                                        <input
                                                            value={rolesText}
                                                            onChange={(e) => setAdminDraftRoles((prev) => ({ ...prev, [user.email]: e.target.value }))}
                                                            className="w-full h-8 px-2 rounded-md bg-background border border-border text-[11px]"
                                                            placeholder="admin, creator"
                                                        />
                                                        <button
                                                            onClick={() => void executeAdminAction(user.email, 'set-roles', { roles: parseDraftList(rolesText) })}
                                                            disabled={busy}
                                                            className="h-7 px-2 text-[10px] font-semibold rounded border border-border hover:bg-secondary transition-colors"
                                                        >
                                                            Save Roles
                                                        </button>
                                                    </div>

                                                    <div className="space-y-1">
                                                        <label className="text-[10px] uppercase text-muted-foreground">Rights</label>
                                                        <input
                                                            value={rightsText}
                                                            onChange={(e) => setAdminDraftRights((prev) => ({ ...prev, [user.email]: e.target.value }))}
                                                            className="w-full h-8 px-2 rounded-md bg-background border border-border text-[11px]"
                                                            placeholder="users:manage, assets:own"
                                                        />
                                                        <button
                                                            onClick={() => void executeAdminAction(user.email, 'set-rights', { rights: parseDraftList(rightsText) })}
                                                            disabled={busy}
                                                            className="h-7 px-2 text-[10px] font-semibold rounded border border-border hover:bg-secondary transition-colors"
                                                        >
                                                            Save Rights
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        <button 
                            onClick={handleToggleLog}
                            className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                        >
                            {isLogVisible ? 'Hide Login Activity Log' : 'View Login Activity Log'}
                        </button>

                        {isLogVisible && (
                            <div className="mt-3 bg-secondary/20 border border-border/60 rounded-lg p-3 max-h-48 overflow-y-auto">
                                {isLogLoading ? (
                                    <p className="text-xs text-muted-foreground">Loading log...</p>
                                ) : logError ? (
                                    <p className="text-xs text-destructive">{logError}</p>
                                ) : (
                                    <pre className="text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">{logContent}</pre>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-8 flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSave}
                        className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-lg shadow-primary/20 flex items-center gap-2 transition-all"
                    >
                        {status === 'saved' ? 'Saved!' : 'Save Configurations'}
                        {status !== 'saved' && <Save size={16} />}
                    </button>
                </div>
                
                <HelpPopup 
                    isOpen={!!helpType} 
                    onClose={() => setHelpType(null)} 
                    type={helpType || 'comfy'} 
                />
            </div>
        </div>
    );
}

// Utility to get the key from anywhere
export const getApiKey = (provider: 'meshy' | 'tripo' | 'hitems') => {
    if (typeof window === 'undefined') return '';
    
    switch (provider) {
        case 'meshy':
             return localStorage.getItem(STORAGE_KEYS.MESHY_API_KEY) || process.env.NEXT_PUBLIC_MESHY_API_KEY || '';
        case 'tripo':
             return localStorage.getItem(STORAGE_KEYS.TRIPO_API_KEY) || '';
        case 'hitems':
             return localStorage.getItem(STORAGE_KEYS.HITEMS_API_KEY) || '';
        default:
            return '';
    }
};
