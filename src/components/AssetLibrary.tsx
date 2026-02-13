'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Image as ImageIcon, Box, Trash2, CheckCircle, Loader2, RotateCw, Pen, X, Video, Music, Search, Users, User, Globe, Lock, Download, HardDrive, Cloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import Asset3DPreview from './Asset3DPreview';
import { AssetDescriptor, AssetType, AssetCategory } from '@/types';
import { useDialog } from '@/providers/DialogProvider';
import { useToast } from '@/providers/ToastProvider';
import DraggableResizablePanel from '@/components/ui/DraggableResizablePanel';
import useEscapeKey from '@/hooks/useEscapeKey';
import {
    deleteDriveAsset,
    downloadDriveAssetBlob,
    listDriveAssets,
    loadDriveConfig,
    renameDriveAsset,
    setDriveAssetVisibility,
    uploadDriveAsset,
} from '@/lib/googleDrive';
import {
    deleteLocalAsset,
    getLocalAssetBlob,
    listLocalAssets,
    renameLocalAsset,
    saveLocalAsset,
    setLocalAssetVisibility,
} from '@/lib/localAssetStore';
import {
    loadAssetStorageSettings,
    onAssetStorageSettingsChanged,
    type AssetStorageSettings,
} from '@/lib/assetStorageSettings';

const ACCEPTED_FILE_TYPES = 'image/*,video/*,audio/*,.glb,.gltf,.obj,.fbx,.stl,.ply';

/**
 * Media tab configuration describing available asset categories and upload behavior.
 */
const LIBRARY_TABS = [
    {
        key: 'images',
        label: 'Uploads',
        icon: Upload,
        type: 'images' as AssetType,
        category: 'uploads' as AssetCategory,
        accept: 'image/*'
    },
    {
        key: 'videos',
        label: 'Videos',
        icon: Video,
        type: 'videos' as AssetType,
        category: 'uploads' as AssetCategory,
        accept: 'video/*'
    },
    {
        key: 'audio',
        label: 'Audio',
        icon: Music,
        type: 'audio' as AssetType,
        category: 'uploads' as AssetCategory,
        accept: 'audio/*'
    },
    {
        key: 'models',
        label: '3D',
        icon: Box,
        type: 'models' as AssetType,
        category: 'uploads' as AssetCategory,
        accept: '.glb,.gltf'
    },
    {
        key: 'generated',
        label: 'Generated',
        icon: ImageIcon,
        type: 'images' as AssetType,
        category: 'generated' as AssetCategory,
        accept: 'image/*'
    }
] as const;

type LibraryTab = typeof LIBRARY_TABS[number]['key'];

const TAB_CONFIG: Record<LibraryTab, typeof LIBRARY_TABS[number]> = LIBRARY_TABS.reduce(
    (acc, tab) => {
        acc[tab.key] = tab;
        return acc;
    },
    {} as Record<LibraryTab, typeof LIBRARY_TABS[number]>
);

const typeToTabKey: Record<AssetType, LibraryTab> = {
    images: 'images',
    videos: 'videos',
    audio: 'audio',
    models: 'models'
};

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.tif', '.tiff', '.heic']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.ogv']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.oga']);
const MODEL_EXTENSIONS = new Set(['.glb', '.gltf', '.obj', '.fbx', '.stl', '.ply']);

const inferAssetType = (filename: string, mimeType?: string): AssetType => {
    const lowerName = filename.toLowerCase();
    const dotIndex = lowerName.lastIndexOf('.');
    const extension = dotIndex >= 0 ? lowerName.slice(dotIndex) : '';

    if (mimeType) {
        if (mimeType.startsWith('video/')) return 'videos';
        if (mimeType.startsWith('audio/')) return 'audio';
        if (mimeType === 'model/gltf-binary' || mimeType === 'model/gltf+json') return 'models';
        if (mimeType.startsWith('image/')) return 'images';
    }

    if (VIDEO_EXTENSIONS.has(extension)) return 'videos';
    if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
    if (MODEL_EXTENSIONS.has(extension)) return 'models';
    if (IMAGE_EXTENSIONS.has(extension)) return 'images';

    return 'images';
};

interface AssetLibraryProps {
    /** Callback when user selects an asset to add to canvas */
    onSelect: (path: string, type: AssetType, name?: string) => void;
    /** Callback to close the library window */
    onClose: () => void;
    /** Current signed in user for personal/shared filtering */
    currentUser?: string;
}

type AssetScopeTab = 'personal' | 'shared';
type VisibilityFilter = 'all' | 'public' | 'private';
type AssetStorageProvider = 'server' | 'local' | 'google-drive';

type LibraryAsset = AssetDescriptor & {
    storageProvider: AssetStorageProvider;
    storageId?: string;
    previewPath?: string;
};

/**
 * AssetLibrary Component
 * 
 * Displays a gallery of assets (Images, Video, Audio, 3D Models, Generated Content).
 * Allows users to Upload, Delete, Rename, and Select assets.
 * 
 * Assets are organized into dedicated tabs driven by configuration:
 * - Uploads: User uploaded imagery (public/assets/uploads/images)
 * - Videos: User uploaded video clips (public/assets/uploads/videos)
 * - Audio: User uploaded audio clips (public/assets/uploads/audio)
 * - 3D: User uploaded 3D models (public/assets/uploads/models)
 * - Generated: AI generated images (public/assets/generated/images)
 */
export default function AssetLibrary({ onSelect, onClose, currentUser }: AssetLibraryProps) {
    const normalizedUser = currentUser?.trim() || 'Guest';
    const driveClientId = (process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID || '').trim();
    // Current active view tab
    const [activeTab, setActiveTab] = useState<LibraryTab>('images');
    const [scopeTab, setScopeTab] = useState<AssetScopeTab>('personal');
    
    // List of assets currently displayed
    const [assets, setAssets] = useState<LibraryAsset[]>([]);
    
    // UI Loading States
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    
    const [storageSettings, setStorageSettings] = useState<AssetStorageSettings>(() => loadAssetStorageSettings());
    const [uploadToCloud, setUploadToCloud] = useState(storageSettings.hybridUploadToCloudByDefault);
    const [showPublicAssets, setShowPublicAssets] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');
    
    // State for renaming assets inline
    const [editingAsset, setEditingAsset] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    
    // Preview popup state
    const [hoveredAsset, setHoveredAsset] = useState<string | null>(null);
    const [updatingVisibilityPath, setUpdatingVisibilityPath] = useState<string | null>(null);

    const dialog = useDialog();
    const { toast } = useToast();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const objectUrlsRef = useRef<string[]>([]);

    const registerObjectUrl = useCallback((url: string) => {
        objectUrlsRef.current.push(url);
        return url;
    }, []);

    const clearObjectUrls = useCallback(() => {
        objectUrlsRef.current.forEach((url) => {
            URL.revokeObjectURL(url);
        });
        objectUrlsRef.current = [];
    }, []);

    const getAssetKey = useCallback((asset: LibraryAsset) => {
        return `${asset.storageProvider}:${asset.storageId || asset.path}`;
    }, []);

    /**
     * Fetches assets from enabled storage providers based on storage mode.
     */
    const fetchAssets = useCallback(async () => {
        setIsLoading(true);
        const config = TAB_CONFIG[activeTab];
        const settings = loadAssetStorageSettings();
        setStorageSettings(settings);

        const includePublic = scopeTab === 'shared' ? true : showPublicAssets;
        const search = searchQuery.trim();

        try {
            const shouldLoadLocal = settings.mode === 'local' || settings.mode === 'hybrid';
            const shouldLoadCloud = settings.mode === 'cloud' || settings.mode === 'hybrid';
            const shouldLoadServer = settings.mode === 'hybrid' && settings.includeLegacyServerAssetsInHybrid;

            const loadLocalPromise = shouldLoadLocal
                ? listLocalAssets({
                    type: config.type,
                    category: config.category,
                    owner: normalizedUser,
                    scope: scopeTab,
                    includePublic,
                    visibility: visibilityFilter,
                    search,
                })
                : Promise.resolve([]);

            const driveConnected = loadDriveConfig().enabled;
            const resolvedDriveClientId = (loadDriveConfig().clientId || driveClientId || '').trim();
            const loadCloudPromise = shouldLoadCloud && driveConnected && resolvedDriveClientId
                ? listDriveAssets(resolvedDriveClientId, {
                    owner: normalizedUser,
                    scope: scopeTab,
                    includePublic,
                    visibility: visibilityFilter,
                    search,
                    type: config.type,
                    category: config.category,
                })
                : Promise.resolve([]);

            const loadServerPromise = shouldLoadServer
                ? fetch(`/api/assets/list?${new URLSearchParams({
                    type: config.type,
                    category: config.category,
                    owner: normalizedUser,
                    scope: scopeTab,
                    includePublic: String(includePublic),
                    visibility: visibilityFilter,
                    search,
                }).toString()}`)
                    .then((res) => res.json())
                    .then((data) => (data.success ? (data.files || []) as AssetDescriptor[] : []))
                    .catch((error) => {
                        console.error('Failed loading legacy server assets', error);
                        return [] as AssetDescriptor[];
                    })
                : Promise.resolve([]);

            const [localAssets, cloudAssets, serverAssets] = await Promise.all([
                loadLocalPromise,
                loadCloudPromise,
                loadServerPromise,
            ]);

            clearObjectUrls();

            const localNormalized: LibraryAsset[] = localAssets.map((item) => {
                const previewPath = registerObjectUrl(URL.createObjectURL(item.data));
                return {
                    path: `local-file://${item.id}`,
                    previewPath,
                    name: item.name,
                    type: item.type,
                    category: item.category,
                    owner: item.owner,
                    isPublic: item.isPublic,
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                    storageProvider: 'local',
                    storageId: item.id,
                };
            });

            const cloudNormalized: LibraryAsset[] = cloudAssets.map((item) => ({
                path: `gdrive-file://${item.id}`,
                name: item.name,
                type: item.type,
                category: item.category,
                owner: item.owner,
                isPublic: item.isPublic,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
                storageProvider: 'google-drive',
                storageId: item.id,
            }));

            const serverNormalized: LibraryAsset[] = serverAssets.map((file) => ({
                ...file,
                category: file.category || config.category,
                type: file.type || config.type,
                storageProvider: 'server',
            }));

            setAssets([...localNormalized, ...cloudNormalized, ...serverNormalized]);
        } catch (error) {
            console.error('Failed to load assets', error);
        } finally {
            setIsLoading(false);
        }
    }, [activeTab, clearObjectUrls, driveClientId, normalizedUser, registerObjectUrl, scopeTab, searchQuery, showPublicAssets, visibilityFilter]);

    // Re-fetch when tabs/filters change
    useEffect(() => {
        const timer = window.setTimeout(() => {
            fetchAssets();
        }, 150);
        return () => window.clearTimeout(timer);
    }, [fetchAssets]);

    useEffect(() => {
        if (scopeTab === 'shared' && visibilityFilter === 'private') {
            setVisibilityFilter('public');
        }
    }, [scopeTab, visibilityFilter]);

    useEffect(() => {
        const unsubscribe = onAssetStorageSettingsChanged(() => {
            const next = loadAssetStorageSettings();
            setStorageSettings(next);
            setUploadToCloud(next.hybridUploadToCloudByDefault);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        return () => {
            clearObjectUrls();
        };
    }, [clearObjectUrls]);

    useEscapeKey(onClose);

    /**
     * Handles file selection from system dialog.
     * Uploads to local, cloud, or both depending on storage settings.
     */
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const config = TAB_CONFIG[activeTab];
        const detectedType = inferAssetType(file.name, file.type);
        setIsUploading(true);

        try {
            const settings = loadAssetStorageSettings();
            const uploadLocal = settings.mode === 'local' || settings.mode === 'hybrid';
            const uploadCloud = settings.mode === 'cloud' || (settings.mode === 'hybrid' && uploadToCloud);

            const driveConfig = loadDriveConfig();
            const resolvedDriveClientId = (driveConfig.clientId || driveClientId || '').trim();
            if (uploadCloud && (!driveConfig.enabled || !resolvedDriveClientId)) {
                toast({
                    title: 'Google Drive required',
                    description: 'Connect Google Drive in Settings before cloud upload.',
                    variant: 'warning'
                });
                if (!uploadLocal) {
                    return;
                }
            }

            if (uploadLocal) {
                await saveLocalAsset({
                    file,
                    filename: file.name,
                    type: detectedType,
                    category: config.category,
                    owner: normalizedUser,
                    isPublic: false,
                    mimeType: file.type || undefined
                });
            }

            if (uploadCloud && driveConfig.enabled && resolvedDriveClientId) {
                await uploadDriveAsset(resolvedDriveClientId, {
                    file,
                    filename: file.name,
                    type: detectedType,
                    category: config.category,
                    owner: normalizedUser,
                    isPublic: false,
                });
            }

            const targetTab = typeToTabKey[detectedType];
            if (targetTab && targetTab !== activeTab) {
                setActiveTab(targetTab);
            }
            await fetchAssets();
        } catch (error) {
            console.error(error);
            toast({ title: 'Upload error', description: 'Could not upload asset.', variant: 'destructive' });
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    /**
     * Handles renaming an existing asset across storage providers.
     */
    const handleRename = async (asset: LibraryAsset) => {
        const nextName = editName.trim();
        if (!nextName || nextName === asset.name) {
            setEditingAsset(null);
            return;
        }

        try {
            if (asset.storageProvider === 'local') {
                if (!asset.storageId) throw new Error('Missing local asset id.');
                await renameLocalAsset(asset.storageId, nextName);
                await fetchAssets();
            } else if (asset.storageProvider === 'google-drive') {
                if (!asset.storageId) throw new Error('Missing Google Drive asset id.');
                const driveConfig = loadDriveConfig();
                const resolvedDriveClientId = (driveConfig.clientId || driveClientId || '').trim();
                if (!driveConfig.enabled || !resolvedDriveClientId) {
                    throw new Error('Google Drive is not connected.');
                }
                await renameDriveAsset(resolvedDriveClientId, asset.storageId, nextName);
                await fetchAssets();
            } else {
                const config = TAB_CONFIG[activeTab];
                const res = await fetch('/api/assets/rename', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: config.type,
                        category: config.category,
                        oldName: asset.name,
                        newName: nextName,
                        owner: normalizedUser
                    })
                });
                const data = await res.json();
                if (!data.success) {
                    throw new Error(data.message || 'Unknown error');
                }
                await fetchAssets();
            }
        } catch (error) {
            console.error('Rename error:', error);
            toast({ title: 'Rename failed', description: 'Could not rename asset.', variant: 'destructive' });
        } finally {
            setEditingAsset(null);
        }
    };

    /**
     * Handles deletion of an asset.
     * Works for local, cloud, and legacy server providers.
     * @param e Event to stop propagation
     */
    const deleteAsset = async (asset: LibraryAsset, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent selection when clicking delete
        const confirmed = await dialog.confirm('Are you sure you want to delete this asset?', { title: 'Delete Asset', variant: 'destructive' });
        if (!confirmed) return;

        try {
            if (asset.storageProvider === 'local') {
                if (!asset.storageId) throw new Error('Missing local asset id.');
                await deleteLocalAsset(asset.storageId);
                await fetchAssets();
            } else if (asset.storageProvider === 'google-drive') {
                if (!asset.storageId) throw new Error('Missing Google Drive asset id.');
                const driveConfig = loadDriveConfig();
                const resolvedDriveClientId = (driveConfig.clientId || driveClientId || '').trim();
                if (!driveConfig.enabled || !resolvedDriveClientId) {
                    throw new Error('Google Drive is not connected.');
                }
                await deleteDriveAsset(resolvedDriveClientId, asset.storageId);
                await fetchAssets();
            } else {
                const res = await fetch('/api/assets/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filePath: asset.path, owner: normalizedUser }),
                });

                const data = await res.json();
                if (data.success || res.ok) {
                    await fetchAssets();
                } else {
                    toast({
                        title: 'Delete failed',
                        description: data.message || 'Unknown error',
                        variant: 'destructive'
                    });
                }
            }
        } catch (error) {
            console.error('Error deleting asset:', error);
            toast({ title: 'Delete failed', description: 'Could not delete asset.', variant: 'destructive' });
        }
    };

    const canManageAsset = useCallback((asset: LibraryAsset) => {
        if (!asset.owner) return true;
        return asset.owner === normalizedUser;
    }, [normalizedUser]);

    const toggleAssetVisibility = async (asset: LibraryAsset, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        if (!canManageAsset(asset)) {
            toast({
                title: 'Read only asset',
                description: 'Only the asset owner can change visibility.',
                variant: 'warning'
            });
            return;
        }

        const nextPublicState = !Boolean(asset.isPublic);
        setUpdatingVisibilityPath(asset.path);
        try {
            if (asset.storageProvider === 'local') {
                if (!asset.storageId) throw new Error('Missing local asset id.');
                await setLocalAssetVisibility(asset.storageId, nextPublicState);
                await fetchAssets();
            } else if (asset.storageProvider === 'google-drive') {
                if (!asset.storageId) throw new Error('Missing Google Drive asset id.');
                const driveConfig = loadDriveConfig();
                const resolvedDriveClientId = (driveConfig.clientId || driveClientId || '').trim();
                if (!driveConfig.enabled || !resolvedDriveClientId) {
                    throw new Error('Google Drive is not connected.');
                }
                await setDriveAssetVisibility(resolvedDriveClientId, asset.storageId, nextPublicState);
                await fetchAssets();
            } else {
                const res = await fetch('/api/assets/visibility', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: asset.type,
                        category: asset.category,
                        name: asset.name,
                        isPublic: nextPublicState,
                        owner: normalizedUser
                    })
                });

                const data = await res.json();
                if (!data.success) {
                    toast({
                        title: 'Visibility update failed',
                        description: data.message || 'Unknown error',
                        variant: 'destructive'
                    });
                    return;
                }

                setAssets((prev) => prev.map((item) => (
                    item.path === asset.path
                        ? { ...item, isPublic: nextPublicState, owner: item.owner || normalizedUser }
                        : item
                )));
            }

            toast({
                title: nextPublicState ? 'Asset is now public' : 'Asset is now private',
                description: nextPublicState ? 'Shared users can now see this asset.' : 'Visible only in your personal area.'
            });
        } catch (error) {
            console.error('Visibility update failed', error);
            toast({
                title: 'Visibility update failed',
                description: 'Could not update asset visibility.',
                variant: 'destructive'
            });
        } finally {
            setUpdatingVisibilityPath(null);
        }
    };

    const resolveAssetSelectionPath = useCallback(async (asset: LibraryAsset) => {
        if (asset.storageProvider === 'local') {
            if (!asset.storageId) {
                throw new Error('Missing local asset id.');
            }
            const blob = await getLocalAssetBlob(asset.storageId);
            return URL.createObjectURL(blob);
        }

        if (asset.storageProvider === 'google-drive') {
            if (!asset.storageId) {
                throw new Error('Missing Google Drive asset id.');
            }
            const driveConfig = loadDriveConfig();
            const resolvedDriveClientId = (driveConfig.clientId || driveClientId || '').trim();
            if (!driveConfig.enabled || !resolvedDriveClientId) {
                throw new Error('Google Drive is not connected.');
            }
            const blob = await downloadDriveAssetBlob(resolvedDriveClientId, asset.storageId);
            return URL.createObjectURL(blob);
        }
        return asset.path;
    }, [driveClientId]);

    const handleAssetSelect = useCallback(async (asset: LibraryAsset) => {
        try {
            const path = await resolveAssetSelectionPath(asset);
            onSelect(path, asset.type, asset.name);
            onClose();
        } catch (error) {
            console.error('Failed to load selected asset', error);
            toast({
                title: 'Asset open failed',
                description: 'Could not load this asset from storage.',
                variant: 'destructive'
            });
        }
    }, [onClose, onSelect, resolveAssetSelectionPath, toast]);

    const downloadAsset = async (asset: LibraryAsset, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        try {
            let blob: Blob;

            if (asset.storageProvider === 'local') {
                if (!asset.storageId) throw new Error('Missing local asset id.');
                blob = await getLocalAssetBlob(asset.storageId);
            } else if (asset.storageProvider === 'google-drive') {
                if (!asset.storageId) throw new Error('Missing Google Drive asset id.');
                const driveConfig = loadDriveConfig();
                const resolvedDriveClientId = (driveConfig.clientId || driveClientId || '').trim();
                if (!driveConfig.enabled || !resolvedDriveClientId) {
                    throw new Error('Google Drive is not connected.');
                }
                blob = await downloadDriveAssetBlob(resolvedDriveClientId, asset.storageId);
            } else {
                const response = await fetch(asset.path);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                blob = await response.blob();
            }

            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = asset.name || 'asset';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(objectUrl);
        } catch (error) {
            console.error('Download failed', error);
            toast({
                title: 'Download failed',
                description: 'Could not download this asset right now.',
                variant: 'destructive'
            });
        }
    };

    return (
        <DraggableResizablePanel
            className="bg-card border border-border rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-left-4 duration-200"
            initialPosition={{ x: 80, y: 140 }}
            initialSize={{ width: 560, height: 680 }}
            minWidth={420}
            minHeight={460}
        >
            {/* Header Section */}
            <div className="p-3 border-b border-border flex items-center justify-between bg-secondary/10 rounded-t-lg draggable-handle cursor-move">
                <h3 className="font-semibold text-sm">Asset Library</h3>
                <div className="flex items-center gap-1">
                     <button 
                        onClick={() => fetchAssets()}
                        className="p-1.5 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors"
                        title="Refresh"
                     >
                        <RotateCw size={14} className={isLoading ? "animate-spin" : ""} />
                    </button>
                    <button onClick={onClose} className="p-1.5 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground">✕</button>
                </div>
            </div>

            {/* Ownership Area Tabs */}
            <div className="p-3 border-b border-border/50 space-y-3 bg-secondary/5">
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => setScopeTab('personal')}
                        className={cn(
                            "flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-md border transition-colors",
                            scopeTab === 'personal'
                                ? "bg-primary/10 border-primary/40 text-primary"
                                : "bg-background border-border text-muted-foreground hover:bg-secondary"
                        )}
                    >
                        <User size={14} />
                        Personal
                    </button>
                    <button
                        onClick={() => setScopeTab('shared')}
                        className={cn(
                            "flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-md border transition-colors",
                            scopeTab === 'shared'
                                ? "bg-primary/10 border-primary/40 text-primary"
                                : "bg-background border-border text-muted-foreground hover:bg-secondary"
                        )}
                    >
                        <Users size={14} />
                        Shared
                    </button>
                </div>

                <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search assets or owner..."
                        className="w-full h-8 rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus:border-primary/50"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <select
                        value={visibilityFilter}
                        onChange={(e) => setVisibilityFilter(e.target.value as VisibilityFilter)}
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary/50"
                    >
                        <option value="all">All Visibility</option>
                        <option value="public">Public Only</option>
                        <option value="private">Private Only</option>
                    </select>
                    {scopeTab === 'personal' && (
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={showPublicAssets}
                                onChange={(e) => setShowPublicAssets(e.target.checked)}
                                className="rounded border-border text-primary focus:ring-primary/20"
                            />
                            Show public assets
                        </label>
                    )}
                </div>
            </div>

            {/* Media Type Tabs */}
            <div className="flex p-2 gap-1 border-b border-border/50 overflow-x-auto">
                {LIBRARY_TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                "flex-1 min-w-20 flex items-center justify-center gap-1 py-1.5 text-xs font-medium rounded-md transition-colors",
                                activeTab === tab.key ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground"
                            )}
                        >
                            <Icon size={14} /> {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Upload Controls */}
            <div className="p-3 border-b border-border/50 space-y-3 bg-secondary/5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <HardDrive size={13} className="text-primary" />
                    <span>Storage mode: <span className="font-semibold text-foreground/90 capitalize">{storageSettings.mode}</span></span>
                </div>
                {storageSettings.mode === 'hybrid' && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={uploadToCloud}
                            onChange={(event) => setUploadToCloud(event.target.checked)}
                            className="rounded border-border text-primary focus:ring-primary/20"
                        />
                        Also upload this file to Google Drive
                    </label>
                )}
                {storageSettings.mode === 'cloud' && (
                    <div className="text-[11px] text-muted-foreground bg-secondary/20 border border-border/40 rounded-md px-3 py-2 flex items-center gap-2">
                        <Cloud size={12} className="text-primary" />
                        Uploads are sent to Google Drive only.
                    </div>
                )}
                {storageSettings.mode !== 'local' && !loadDriveConfig().enabled && (
                    <div className="text-[11px] text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                        Google Drive is not connected. Open Settings to connect before cloud uploads.
                    </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                    Signed in as <span className="font-semibold text-foreground/80">{normalizedUser}</span>
                </p>
                
                <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden"
                    // Allow all supported asset types; backend will classify them
                    accept={ACCEPTED_FILE_TYPES}
                    onChange={handleUpload}
                />
                
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-full py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-md flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-all"
                >
                    {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {isUploading ? 'Uploading...' : 'Upload Asset'}
                </button>
            </div>

            {/* Asset Grid Display */}
            <div className="flex-1 overflow-y-auto p-3">
                {isLoading ? (
                    <div className="flex justify-center py-8 text-muted-foreground">
                        <Loader2 className="animate-spin" size={20} />
                    </div>
                ) : assets.length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted-foreground">
                        No assets found. Upload one to get started.
                    </div>
                ) : (
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-2.5">
                        {assets.map((asset, index) => {
                            const assetKey = getAssetKey(asset);
                            const managedByUser = canManageAsset(asset);
                            const isUpdatingVisibility = updatingVisibilityPath === asset.path;
                            const imagePreviewUrl = asset.previewPath || (asset.storageProvider === 'server' ? asset.path : undefined);
                            const modelPreviewUrl = asset.previewPath || (asset.storageProvider === 'server' ? asset.path : undefined);
                            const storageLabel = asset.storageProvider === 'local'
                                ? 'Local'
                                : asset.storageProvider === 'google-drive'
                                ? 'Drive'
                                : 'Server';

                            return (
                                <div
                                    key={`${assetKey}-${index}`}
                                    className="group relative aspect-square bg-secondary/30 rounded-md overflow-hidden border border-border/50 hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer"
                                    title={asset.name}
                                    onMouseEnter={() => {
                                        if (asset.type === 'models' && modelPreviewUrl) {
                                            setHoveredAsset(assetKey);
                                        }
                                    }}
                                    onMouseLeave={() => setHoveredAsset(null)}
                                    onDoubleClick={(e) => {
                                        if (!managedByUser) return;
                                        e.stopPropagation();
                                        e.preventDefault();
                                        setEditingAsset(assetKey);
                                        setEditName(asset.name);
                                    }}
                                >
                                    {editingAsset === assetKey ? (
                                        <div className="absolute inset-0 z-30 bg-background/95 flex flex-col items-center justify-center p-1" onClick={(e) => e.stopPropagation()}>
                                            <div className="w-full flex items-center justify-center gap-1 mb-1">
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') void handleRename(asset);
                                                        if (e.key === 'Escape') setEditingAsset(null);
                                                    }}
                                                    className="w-full text-xs p-1 border border-primary rounded bg-background text-foreground text-center focus:outline-none h-6"
                                                />
                                            </div>
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => void handleRename(asset)}
                                                    className="p-1 bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded"
                                                    title="Save"
                                                >
                                                    <CheckCircle size={12} />
                                                </button>
                                                <button
                                                    onClick={() => setEditingAsset(null)}
                                                    className="p-1 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded"
                                                    title="Cancel"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="absolute left-1 top-1 z-20 flex flex-col gap-1 pointer-events-none">
                                                <span className={cn(
                                                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold",
                                                    asset.isPublic ? 'bg-emerald-500/80 text-white' : 'bg-zinc-800/80 text-zinc-100'
                                                )}>
                                                    {asset.isPublic ? <Globe size={9} /> : <Lock size={9} />}
                                                    {asset.isPublic ? 'Public' : 'Private'}
                                                </span>
                                                {asset.owner && (
                                                    <span className="inline-flex items-center rounded bg-black/65 px-1.5 py-0.5 text-[9px] text-white max-w-[90px] truncate">
                                                        {asset.owner}
                                                    </span>
                                                )}
                                                <span className="inline-flex items-center rounded bg-black/65 px-1.5 py-0.5 text-[9px] text-white">
                                                    {storageLabel}
                                                </span>
                                            </div>

                                            <div
                                                className="w-full h-full"
                                                onClick={() => {
                                                    if (editingAsset !== assetKey) {
                                                        void handleAssetSelect(asset);
                                                    }
                                                }}
                                            >
                                                {asset.type === 'images' && (
                                                    imagePreviewUrl ? (
                                                        <div className="w-full h-full relative">
                                                            {/* eslint-disable-next-line @next/next/no-img-element -- User-uploaded assets can be arbitrary formats (including SVG/data URLs). */}
                                                            <img
                                                                src={imagePreviewUrl}
                                                                alt={asset.name}
                                                                className="w-full h-full object-cover"
                                                                loading="lazy"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                                            <ImageIcon size={24} />
                                                        </div>
                                                    )
                                                )}
                                                {asset.type === 'videos' && (
                                                    imagePreviewUrl ? (
                                                        <div className="w-full h-full relative flex items-center justify-center bg-black/60">
                                                            <video
                                                                src={imagePreviewUrl}
                                                                className="w-full h-full object-cover"
                                                                muted
                                                                loop
                                                                playsInline
                                                                preload="metadata"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                                            <Video size={24} />
                                                        </div>
                                                    )
                                                )}
                                                {asset.type === 'audio' && (
                                                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                                        <Music size={24} />
                                                    </div>
                                                )}
                                                {asset.type === 'models' && (
                                                    <div className="relative w-full h-full flex items-center justify-center">
                                                        {hoveredAsset === assetKey && modelPreviewUrl ? (
                                                            <Asset3DPreview url={modelPreviewUrl} />
                                                        ) : (
                                                            <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground h-full w-full">
                                                                <Box size={20} />
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[9px] truncate px-1.5 py-1 text-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                {asset.name}
                                            </div>

                                            <div className="absolute inset-x-0 top-0 p-1 flex justify-between items-start opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
                                                <button
                                                    onClick={(e) => toggleAssetVisibility(asset, e)}
                                                    className="pointer-events-auto p-1.5 bg-background/80 hover:bg-background text-foreground rounded-md shadow-sm transition-colors border border-border/50"
                                                    title={asset.isPublic ? 'Set private' : 'Set public'}
                                                >
                                                    {isUpdatingVisibility ? (
                                                        <Loader2 size={10} className="animate-spin" />
                                                    ) : asset.isPublic ? (
                                                        <Globe size={10} />
                                                    ) : (
                                                        <Lock size={10} />
                                                    )}
                                                </button>

                                                <div className="flex items-center gap-1 pointer-events-auto">
                                                    <button
                                                        onClick={(e) => downloadAsset(asset, e)}
                                                        className="p-1.5 bg-background/80 hover:bg-background text-foreground rounded-md shadow-sm transition-colors border border-border/50"
                                                        title="Download Asset"
                                                    >
                                                        <Download size={10} />
                                                    </button>
                                                    {managedByUser && (
                                                        <>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                                setEditingAsset(assetKey);
                                                                setEditName(asset.name);
                                                            }}
                                                            className="p-1.5 bg-background/80 hover:bg-background text-foreground rounded-md shadow-sm transition-colors border border-border/50"
                                                            title="Rename Asset"
                                                        >
                                                            <Pen size={10} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => void deleteAsset(asset, e)}
                                                            className="p-1.5 bg-red-500/90 hover:bg-red-600 text-white rounded-md shadow-sm transition-colors border border-red-600/50"
                                                            title="Delete Asset"
                                                        >
                                                            <Trash2 size={10} />
                                                        </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </DraggableResizablePanel>
    );
}
