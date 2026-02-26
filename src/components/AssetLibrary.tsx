'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Image as ImageIcon, Box, Trash2, CheckCircle, Loader2, RotateCw, Pen, X, Video, Music, Search, Users, User, Globe, Lock, Download, HardDrive, Cloud, Play, Pause, Square } from 'lucide-react';
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
type AssetStorageProvider = 'server' | 'local' | 'google-drive' | 'merged';

type LibraryAsset = AssetDescriptor & {
    storageProvider: AssetStorageProvider;
    storageId?: string;
    previewPath?: string;
    sourceAssets?: LibraryAsset[];
};

type ModelPreviewPopupState = {
    key: string;
    name: string;
    url: string;
    x: number;
    y: number;
    width: number;
    height: number;
};

const SOURCE_PRIORITY: Record<Exclude<AssetStorageProvider, 'merged'>, number> = {
    local: 0,
    'google-drive': 1,
    server: 2,
};

const getAssetMergeKey = (asset: LibraryAsset) => [
    asset.type,
    asset.category,
    (asset.owner || '').toLowerCase(),
    asset.isPublic ? 'public' : 'private',
    asset.name.trim().toLowerCase(),
].join('|');

const getSourceAssets = (asset: LibraryAsset): LibraryAsset[] => (
    Array.isArray(asset.sourceAssets) && asset.sourceAssets.length > 0
        ? asset.sourceAssets
        : [asset]
);

const pickRepresentativeAsset = (asset: LibraryAsset): LibraryAsset => {
    const sourceAssets = getSourceAssets(asset).filter((entry) => entry.storageProvider !== 'merged');
    if (sourceAssets.length === 0) return asset;
    return [...sourceAssets].sort((a, b) => {
        const aPriority = SOURCE_PRIORITY[a.storageProvider as Exclude<AssetStorageProvider, 'merged'>] ?? 99;
        const bPriority = SOURCE_PRIORITY[b.storageProvider as Exclude<AssetStorageProvider, 'merged'>] ?? 99;
        return aPriority - bPriority;
    })[0];
};

const mergeDuplicateAssets = (items: LibraryAsset[]): LibraryAsset[] => {
    const groups = new Map<string, LibraryAsset[]>();

    items.forEach((item) => {
        const key = getAssetMergeKey(item);
        const bucket = groups.get(key);
        if (bucket) {
            bucket.push(item);
        } else {
            groups.set(key, [item]);
        }
    });

    const merged = Array.from(groups.entries()).map(([key, grouped]) => {
        if (grouped.length === 1) {
            return grouped[0];
        }
        const representative = pickRepresentativeAsset({
            ...grouped[0],
            storageProvider: 'merged',
            sourceAssets: grouped,
        } as LibraryAsset);
        return {
            ...representative,
            path: `merged://${encodeURIComponent(key)}`,
            storageProvider: 'merged',
            sourceAssets: grouped,
        } as LibraryAsset;
    });

    return merged.sort((a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || ''));
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
    const [modelPreviewPopup, setModelPreviewPopup] = useState<ModelPreviewPopupState | null>(null);
    const [loadingModelPreviewKey, setLoadingModelPreviewKey] = useState<string | null>(null);
    const [previewHoverKey, setPreviewHoverKey] = useState<string | null>(null);
    const [playingMediaKey, setPlayingMediaKey] = useState<string | null>(null);
    const [updatingVisibilityKey, setUpdatingVisibilityKey] = useState<string | null>(null);

    const dialog = useDialog();
    const { toast } = useToast();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const objectUrlsRef = useRef<string[]>([]);
    const mediaPreviewRefs = useRef<Map<string, HTMLMediaElement>>(new Map());

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

    const bindMediaPreviewRef = useCallback((assetKey: string) => (element: HTMLMediaElement | null) => {
        if (!element) {
            mediaPreviewRefs.current.delete(assetKey);
            return;
        }
        mediaPreviewRefs.current.set(assetKey, element);
    }, []);

    const handleMediaPreviewAction = useCallback((assetKey: string, action: 'play' | 'pause' | 'stop', event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const target = mediaPreviewRefs.current.get(assetKey);
        if (!target) return;

        if (action === 'play') {
            if (playingMediaKey && playingMediaKey !== assetKey) {
                const previous = mediaPreviewRefs.current.get(playingMediaKey);
                if (previous) {
                    previous.pause();
                    previous.currentTime = 0;
                }
            }
            void target.play();
            setPlayingMediaKey(assetKey);
            return;
        }

        if (action === 'pause') {
            target.pause();
            if (playingMediaKey === assetKey) {
                setPlayingMediaKey(null);
            }
            return;
        }

        target.pause();
        target.currentTime = 0;
        if (playingMediaKey === assetKey) {
            setPlayingMediaKey(null);
        }
    }, [playingMediaKey]);

    useEffect(() => {
        return () => {
            mediaPreviewRefs.current.forEach((media) => {
                media.pause();
            });
            mediaPreviewRefs.current.clear();
        };
    }, []);

    const getAssetKey = useCallback((asset: LibraryAsset) => {
        if (asset.storageProvider === 'merged') {
            return `merged:${getAssetMergeKey(asset)}`;
        }
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

            setAssets(mergeDuplicateAssets([...localNormalized, ...cloudNormalized, ...serverNormalized]));
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
            const targetSources = getSourceAssets(asset).filter(canManageSingleAsset);
            if (targetSources.length === 0) {
                throw new Error('No writable source available for rename.');
            }

            const driveConfig = loadDriveConfig();
            const resolvedDriveClientId = (driveConfig.clientId || driveClientId || '').trim();

            const results = await Promise.allSettled(targetSources.map(async (entry) => {
                if (entry.storageProvider === 'local') {
                    if (!entry.storageId) throw new Error('Missing local asset id.');
                    await renameLocalAsset(entry.storageId, nextName);
                    return;
                }
                if (entry.storageProvider === 'google-drive') {
                    if (!entry.storageId) throw new Error('Missing Google Drive asset id.');
                    if (!driveConfig.enabled || !resolvedDriveClientId) {
                        throw new Error('Google Drive is not connected.');
                    }
                    await renameDriveAsset(resolvedDriveClientId, entry.storageId, nextName);
                    return;
                }
                const config = TAB_CONFIG[activeTab];
                const res = await fetch('/api/assets/rename', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: config.type,
                        category: config.category,
                        oldName: entry.name,
                        newName: nextName,
                        owner: normalizedUser
                    })
                });
                const data = await res.json();
                if (!data.success) {
                    throw new Error(data.message || 'Unknown error');
                }
            }));

            const successCount = results.filter((result) => result.status === 'fulfilled').length;
            if (successCount === 0) {
                throw new Error('Rename failed for all linked sources.');
            }

            await fetchAssets();

            if (successCount !== targetSources.length) {
                toast({
                    title: 'Rename partially applied',
                    description: 'Some linked storage sources could not be renamed.',
                    variant: 'warning'
                });
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
    const deleteAsset = async (asset: LibraryAsset, e?: React.MouseEvent) => {
        e?.stopPropagation(); // Prevent selection when clicking delete
        const confirmed = await dialog.confirm('Are you sure you want to delete this asset?', { title: 'Delete Asset', variant: 'destructive' });
        if (!confirmed) return;

        try {
            const targetSources = getSourceAssets(asset).filter(canManageSingleAsset);
            if (targetSources.length === 0) {
                throw new Error('No writable source available for delete.');
            }

            const driveConfig = loadDriveConfig();
            const resolvedDriveClientId = (driveConfig.clientId || driveClientId || '').trim();

            const results = await Promise.allSettled(targetSources.map(async (entry) => {
                if (entry.storageProvider === 'local') {
                    if (!entry.storageId) throw new Error('Missing local asset id.');
                    await deleteLocalAsset(entry.storageId);
                    return;
                }
                if (entry.storageProvider === 'google-drive') {
                    if (!entry.storageId) throw new Error('Missing Google Drive asset id.');
                    if (!driveConfig.enabled || !resolvedDriveClientId) {
                        throw new Error('Google Drive is not connected.');
                    }
                    await deleteDriveAsset(resolvedDriveClientId, entry.storageId);
                    return;
                }
                const res = await fetch('/api/assets/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filePath: entry.path, owner: normalizedUser }),
                });
                const data = await res.json();
                if (!(data.success || res.ok)) {
                    throw new Error(data.message || 'Unknown error');
                }
            }));

            const successCount = results.filter((result) => result.status === 'fulfilled').length;
            if (successCount === 0) {
                throw new Error('Delete failed for all linked sources.');
            }

            await fetchAssets();

            if (successCount !== targetSources.length) {
                toast({
                    title: 'Delete partially applied',
                    description: 'Some linked storage sources could not be deleted.',
                    variant: 'warning'
                });
            }
        } catch (error) {
            console.error('Error deleting asset:', error);
            toast({ title: 'Delete failed', description: 'Could not delete asset.', variant: 'destructive' });
        }
    };

    const canManageAsset = useCallback((asset: LibraryAsset) => {
        return getSourceAssets(asset).some((entry) => {
            if (!entry.owner) return true;
            return entry.owner === normalizedUser;
        });
    }, [normalizedUser]);

    const canManageSingleAsset = useCallback((asset: LibraryAsset) => {
        if (!asset.owner) return true;
        return asset.owner === normalizedUser;
    }, [normalizedUser]);

    const toggleAssetVisibility = async (asset: LibraryAsset, e?: React.MouseEvent) => {
        e?.stopPropagation();
        e?.preventDefault();

        if (!canManageAsset(asset)) {
            toast({
                title: 'Read only asset',
                description: 'Only the asset owner can change visibility.',
                variant: 'warning'
            });
            return;
        }

        const nextPublicState = !Boolean(asset.isPublic);
        const targetSources = getSourceAssets(asset).filter(canManageSingleAsset);
        if (targetSources.length === 0) {
            toast({
                title: 'Read only asset',
                description: 'Only the asset owner can change visibility.',
                variant: 'warning'
            });
            return;
        }

        setUpdatingVisibilityKey(getAssetKey(asset));
        try {
            const driveConfig = loadDriveConfig();
            const resolvedDriveClientId = (driveConfig.clientId || driveClientId || '').trim();

            const results = await Promise.allSettled(targetSources.map(async (entry) => {
                if (entry.storageProvider === 'local') {
                    if (!entry.storageId) throw new Error('Missing local asset id.');
                    await setLocalAssetVisibility(entry.storageId, nextPublicState);
                    return;
                }
                if (entry.storageProvider === 'google-drive') {
                    if (!entry.storageId) throw new Error('Missing Google Drive asset id.');
                    if (!driveConfig.enabled || !resolvedDriveClientId) {
                        throw new Error('Google Drive is not connected.');
                    }
                    await setDriveAssetVisibility(resolvedDriveClientId, entry.storageId, nextPublicState);
                    return;
                }
                const res = await fetch('/api/assets/visibility', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: entry.type,
                        category: entry.category,
                        name: entry.name,
                        isPublic: nextPublicState,
                        owner: normalizedUser
                    })
                });
                const data = await res.json();
                if (!data.success) {
                    throw new Error(data.message || 'Unknown error');
                }
            }));

            const successCount = results.filter((result) => result.status === 'fulfilled').length;
            if (successCount === 0) {
                throw new Error('Could not update any linked source.');
            }

            await fetchAssets();

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
            setUpdatingVisibilityKey(null);
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

    const resolveModelPreviewUrl = useCallback(async (asset: LibraryAsset) => {
        const representative = pickRepresentativeAsset(asset);
        if (representative.previewPath) {
            return representative.previewPath;
        }

        if (representative.storageProvider === 'server') {
            return representative.path;
        }

        if (representative.storageProvider === 'local') {
            if (!representative.storageId) return null;
            const blob = await getLocalAssetBlob(representative.storageId);
            return registerObjectUrl(URL.createObjectURL(blob));
        }

        if (representative.storageProvider === 'google-drive') {
            if (!representative.storageId) return null;
            const driveConfig = loadDriveConfig();
            const resolvedDriveClientId = (driveConfig.clientId || driveClientId || '').trim();
            if (!driveConfig.enabled || !resolvedDriveClientId) {
                return null;
            }
            const blob = await downloadDriveAssetBlob(resolvedDriveClientId, representative.storageId);
            return registerObjectUrl(URL.createObjectURL(blob));
        }

        return null;
    }, [driveClientId, registerObjectUrl]);

    const openModelPreviewPopup = useCallback(async (asset: LibraryAsset, assetKey: string, anchorRect: DOMRect) => {
        if (loadingModelPreviewKey === assetKey) return;
        if (modelPreviewPopup?.key === assetKey) return;
        try {
            setLoadingModelPreviewKey(assetKey);
            const previewUrl = await resolveModelPreviewUrl(asset);
            if (!previewUrl) return;

            const previewWidth = Math.max(240, Math.round(anchorRect.width * 2));
            const previewHeight = Math.max(240, Math.round(anchorRect.height * 2));
            const viewportPadding = 12;
            const maxX = Math.max(viewportPadding, window.innerWidth - previewWidth - viewportPadding);
            const maxY = Math.max(viewportPadding, window.innerHeight - previewHeight - viewportPadding);

            const x = Math.min(maxX, anchorRect.right + 12);
            const y = Math.max(
                viewportPadding,
                Math.min(maxY, anchorRect.top + Math.round((anchorRect.height - previewHeight) / 2))
            );

            setModelPreviewPopup({
                key: assetKey,
                name: asset.name,
                url: previewUrl,
                x,
                y,
                width: previewWidth,
                height: previewHeight,
            });
        } catch (error) {
            console.error('Failed to open model preview', error);
        } finally {
            setLoadingModelPreviewKey((current) => (current === assetKey ? null : current));
        }
    }, [loadingModelPreviewKey, modelPreviewPopup?.key, resolveModelPreviewUrl]);

    const handleAssetSelect = useCallback(async (asset: LibraryAsset) => {
        try {
            const path = await resolveAssetSelectionPath(pickRepresentativeAsset(asset));
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

    const downloadAsset = async (asset: LibraryAsset, e?: React.MouseEvent) => {
        e?.stopPropagation();
        e?.preventDefault();

        try {
            const selectedAsset = pickRepresentativeAsset(asset);
            let blob: Blob;

            if (selectedAsset.storageProvider === 'local') {
                if (!selectedAsset.storageId) throw new Error('Missing local asset id.');
                blob = await getLocalAssetBlob(selectedAsset.storageId);
            } else if (selectedAsset.storageProvider === 'google-drive') {
                if (!selectedAsset.storageId) throw new Error('Missing Google Drive asset id.');
                const driveConfig = loadDriveConfig();
                const resolvedDriveClientId = (driveConfig.clientId || driveClientId || '').trim();
                if (!driveConfig.enabled || !resolvedDriveClientId) {
                    throw new Error('Google Drive is not connected.');
                }
                blob = await downloadDriveAssetBlob(resolvedDriveClientId, selectedAsset.storageId);
            } else {
                const response = await fetch(selectedAsset.path);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                blob = await response.blob();
            }

            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = selectedAsset.name || 'asset';
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
        <>
        <DraggableResizablePanel
            className="bg-card border border-border rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-left-4 duration-200"
            initialPosition={{ x: 80, y: 140 }}
            initialSize={{ width: 560, height: 680 }}
            minWidth={420}
            minHeight={460}
        >
            {/* Header Section */}
            <div className="p-2.5 border-b border-border flex items-center justify-between bg-secondary/10 rounded-t-lg draggable-handle cursor-move">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                    <ImageIcon size={14} className="text-primary" />
                    Asset Library
                </h3>
                <div className="flex items-center gap-1">
                     <button 
                        onClick={() => fetchAssets()}
                        className="p-1.5 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors"
                        title="Refresh"
                     >
                        <RotateCw size={14} className={isLoading ? "animate-spin" : ""} />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground"
                        aria-label="Close asset library"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Compact Control Bar */}
            <div className="p-2 border-b border-border/50 space-y-1.5 bg-secondary/5">
                <div className="flex items-center gap-1.5">
                    <div className="grid grid-cols-2 gap-1.5 w-[220px] shrink-0">
                        <button
                            onClick={() => setScopeTab('personal')}
                            className={cn(
                                "flex items-center justify-center gap-1.5 h-7 text-[11px] font-semibold rounded-md border transition-colors",
                                scopeTab === 'personal'
                                    ? "bg-primary/10 border-primary/40 text-primary"
                                    : "bg-background border-border text-muted-foreground hover:bg-secondary"
                            )}
                        >
                            <User size={13} />
                            Personal
                        </button>
                        <button
                            onClick={() => setScopeTab('shared')}
                            className={cn(
                                "flex items-center justify-center gap-1.5 h-7 text-[11px] font-semibold rounded-md border transition-colors",
                                scopeTab === 'shared'
                                    ? "bg-primary/10 border-primary/40 text-primary"
                                    : "bg-background border-border text-muted-foreground hover:bg-secondary"
                            )}
                        >
                            <Users size={13} />
                            Shared
                        </button>
                    </div>

                    <div className="relative flex-1 min-w-0">
                        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search assets or owner..."
                            className="w-full h-7 rounded-md border border-border bg-background pl-7 pr-2 text-[11px] outline-none focus:border-primary/50"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    <select
                        value={visibilityFilter}
                        onChange={(e) => setVisibilityFilter(e.target.value as VisibilityFilter)}
                        className="h-7 rounded-md border border-border bg-background px-2 text-[11px] text-foreground outline-none focus:border-primary/50 shrink-0"
                    >
                        <option value="all">All Visibility</option>
                        <option value="public">Public Only</option>
                        <option value="private">Private Only</option>
                    </select>

                    {scopeTab === 'personal' && (
                        <label className="h-7 px-2 flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none rounded-md border border-border/50 bg-background/70 shrink-0">
                            <input
                                type="checkbox"
                                checked={showPublicAssets}
                                onChange={(e) => setShowPublicAssets(e.target.checked)}
                                className="rounded border-border text-primary focus:ring-primary/20"
                            />
                            Show public assets
                        </label>
                    )}

                    <span className="h-7 px-2 inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-background/70 text-[11px] text-muted-foreground shrink-0">
                        <HardDrive size={12} className="text-primary" />
                        Storage: <span className="font-semibold text-foreground/90 capitalize">{storageSettings.mode}</span>
                    </span>

                    <span className="h-7 px-2 inline-flex items-center rounded-md border border-border/50 bg-background/70 text-[11px] text-muted-foreground shrink-0">
                        Signed in as <span className="font-semibold text-foreground/80 ml-1">{normalizedUser}</span>
                    </span>
                </div>
            </div>

            {/* Media Type Tabs */}
            <div className="flex p-1.5 gap-1 border-b border-border/50 overflow-x-auto bg-card/50">
                {LIBRARY_TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                "flex-1 min-w-20 flex items-center justify-center gap-1 py-1 text-[11px] font-medium rounded-md transition-colors",
                                activeTab === tab.key ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground"
                            )}
                        >
                            <Icon size={14} /> {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Upload Row */}
            <div className="p-2 border-b border-border/50 bg-secondary/5">
                <div className="flex items-center gap-2 flex-wrap">
                {storageSettings.mode === 'hybrid' && (
                    <label className="h-7 px-2 rounded-md border border-border/50 bg-background/70 flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none shrink-0">
                        <input
                            type="checkbox"
                            checked={uploadToCloud}
                            onChange={(event) => setUploadToCloud(event.target.checked)}
                            className="rounded border-border text-primary focus:ring-primary/20"
                        />
                        Also upload to Google Drive
                    </label>
                )}
                {storageSettings.mode === 'cloud' && (
                    <div className="h-7 px-2 text-[11px] text-muted-foreground bg-secondary/20 border border-border/40 rounded-md inline-flex items-center gap-1.5 shrink-0">
                        <Cloud size={12} className="text-primary" />
                        Uploads go to Google Drive only.
                    </div>
                )}
                {storageSettings.mode !== 'local' && !loadDriveConfig().enabled && (
                    <div className="h-7 px-2 text-[11px] text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-md inline-flex items-center shrink-0">
                        Google Drive not connected.
                    </div>
                )}
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
                    className="ml-auto h-8 px-4 bg-primary text-primary-foreground text-xs font-semibold rounded-md inline-flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-all shrink-0"
                >
                    {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {isUploading ? 'Uploading...' : 'Upload Asset'}
                </button>
                </div>
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
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {assets.map((asset, index) => {
                            const assetKey = getAssetKey(asset);
                            const sourceAssets = getSourceAssets(asset);
                            const representative = pickRepresentativeAsset(asset);
                            const managedByUser = canManageAsset(asset);
                            const isUpdatingVisibility = updatingVisibilityKey === assetKey;
                            const imagePreviewUrl = representative.previewPath || (representative.storageProvider === 'server' ? representative.path : undefined);
                            const sourceLabels = Array.from(new Set(sourceAssets.map((entry) => (
                                entry.storageProvider === 'local'
                                    ? 'Local'
                                    : entry.storageProvider === 'google-drive'
                                        ? 'Drive'
                                        : 'Server'
                            ))));
                            const ownerShort = (asset.owner || 'Unknown').trim();
                            const sourceCountLabel = sourceLabels.length > 1 ? `${sourceLabels.length} sources` : null;

                            return (
                                <div
                                    key={assetKey || `${asset.path}-${index}`}
                                    className="group relative aspect-square bg-secondary/25 rounded-lg overflow-hidden border border-border/60 hover:border-primary/50 hover:shadow-md transition-all cursor-pointer"
                                    title={asset.name}
                                    onMouseEnter={(event) => {
                                        if (asset.type === 'models') {
                                            void openModelPreviewPopup(asset, assetKey, event.currentTarget.getBoundingClientRect());
                                        }
                                    }}
                                    onMouseLeave={() => {
                                        if (asset.type !== 'models') return;
                                        window.setTimeout(() => {
                                            setModelPreviewPopup((current) => {
                                                if (!current || current.key !== assetKey) return current;
                                                if (previewHoverKey === assetKey) return current;
                                                return null;
                                            });
                                        }, 60);
                                    }}
                                    onClick={() => {
                                        if (editingAsset !== assetKey) {
                                            void handleAssetSelect(asset);
                                        }
                                    }}
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
                                            <div className="w-full h-full">
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
                                                                ref={bindMediaPreviewRef(assetKey)}
                                                                className="w-full h-full object-cover"
                                                                onPlay={() => setPlayingMediaKey(assetKey)}
                                                                onPause={() => setPlayingMediaKey((current) => (current === assetKey ? null : current))}
                                                                onEnded={() => setPlayingMediaKey((current) => (current === assetKey ? null : current))}
                                                                playsInline
                                                                preload="metadata"
                                                            />
                                                            <div className="absolute left-1.5 top-1.5 z-20 flex items-center gap-1 rounded-md bg-black/65 p-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={(event) => handleMediaPreviewAction(assetKey, 'play', event)}
                                                                    className="h-6 w-6 rounded text-white/90 hover:bg-white/20 inline-flex items-center justify-center"
                                                                    title="Play preview"
                                                                    aria-label="Play preview"
                                                                >
                                                                    <Play size={12} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(event) => handleMediaPreviewAction(assetKey, 'pause', event)}
                                                                    className="h-6 w-6 rounded text-white/90 hover:bg-white/20 inline-flex items-center justify-center"
                                                                    title="Pause preview"
                                                                    aria-label="Pause preview"
                                                                >
                                                                    <Pause size={12} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(event) => handleMediaPreviewAction(assetKey, 'stop', event)}
                                                                    className="h-6 w-6 rounded text-white/90 hover:bg-white/20 inline-flex items-center justify-center"
                                                                    title="Stop preview"
                                                                    aria-label="Stop preview"
                                                                >
                                                                    <Square size={11} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                                            <Video size={24} />
                                                        </div>
                                                    )
                                                )}
                                                {asset.type === 'audio' && (
                                                    <div className="relative w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                                        <audio
                                                            ref={bindMediaPreviewRef(assetKey)}
                                                            src={imagePreviewUrl}
                                                            preload="metadata"
                                                            onPlay={() => setPlayingMediaKey(assetKey)}
                                                            onPause={() => setPlayingMediaKey((current) => (current === assetKey ? null : current))}
                                                            onEnded={() => setPlayingMediaKey((current) => (current === assetKey ? null : current))}
                                                        />
                                                        <div className="absolute left-1.5 top-1.5 z-30 flex items-center gap-1 rounded-md bg-black/65 p-1">
                                                            <button
                                                                type="button"
                                                                onClick={(event) => handleMediaPreviewAction(assetKey, 'play', event)}
                                                                disabled={!imagePreviewUrl}
                                                                className="h-6 w-6 rounded text-white/90 hover:bg-white/20 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                                                                title="Play preview"
                                                                aria-label="Play preview"
                                                            >
                                                                <Play size={12} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(event) => handleMediaPreviewAction(assetKey, 'pause', event)}
                                                                disabled={!imagePreviewUrl}
                                                                className="h-6 w-6 rounded text-white/90 hover:bg-white/20 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                                                                title="Pause preview"
                                                                aria-label="Pause preview"
                                                            >
                                                                <Pause size={12} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(event) => handleMediaPreviewAction(assetKey, 'stop', event)}
                                                                disabled={!imagePreviewUrl}
                                                                className="h-6 w-6 rounded text-white/90 hover:bg-white/20 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                                                                title="Stop preview"
                                                                aria-label="Stop preview"
                                                            >
                                                                <Square size={11} />
                                                            </button>
                                                        </div>
                                                        <Music size={24} />
                                                        {!imagePreviewUrl && (
                                                            <span className="text-[10px] text-muted-foreground/80">Preview unavailable</span>
                                                        )}
                                                    </div>
                                                )}
                                                {asset.type === 'models' && (
                                                    <div className="relative w-full h-full flex items-center justify-center">
                                                        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground h-full w-full">
                                                            <Box size={22} />
                                                            {loadingModelPreviewKey === assetKey ? (
                                                                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/80">
                                                                    <Loader2 size={10} className="animate-spin" />
                                                                    Loading preview
                                                                </span>
                                                            ) : (
                                                                <span className="text-[10px] text-muted-foreground/80">Hover to preview</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="absolute inset-x-0 bottom-0 z-20 h-2/3 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out">
                                                <div
                                                    className="h-full bg-zinc-900/90 text-white p-2 flex flex-col gap-2"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                    }}
                                                >
                                                    <div className="space-y-1 text-[10px] leading-tight">
                                                        <div className="font-semibold text-[11px] truncate" title={asset.name}>{asset.name}</div>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-white/70">Visibility</span>
                                                            <span className="inline-flex items-center gap-1 font-medium">
                                                                {isUpdatingVisibility ? <Loader2 size={10} className="animate-spin" /> : (asset.isPublic ? <Globe size={10} /> : <Lock size={10} />)}
                                                                {asset.isPublic ? 'Public' : 'Private'}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-start justify-between gap-2">
                                                            <span className="text-white/70">Owner</span>
                                                            <span className="font-medium text-right break-all whitespace-normal max-w-[65%]" title={ownerShort}>{ownerShort}</span>
                                                        </div>
                                                        <div className="flex items-start justify-between gap-2">
                                                            <span className="text-white/70">Sources</span>
                                                            <span className="font-medium text-right break-words whitespace-normal max-w-[65%]" title={sourceLabels.join(', ')}>{sourceLabels.join(', ')}</span>
                                                        </div>
                                                        {sourceCountLabel && (
                                                            <div className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[9px]">
                                                                <Cloud size={9} />
                                                                {sourceCountLabel}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="mt-auto grid grid-cols-2 gap-1">
                                                        <button
                                                            onClick={() => void toggleAssetVisibility(asset)}
                                                            className="h-7 rounded-md bg-white/10 hover:bg-white/20 text-[10px] font-medium inline-flex items-center justify-center gap-1"
                                                        >
                                                            {asset.isPublic ? <Lock size={10} /> : <Globe size={10} />}
                                                            {asset.isPublic ? 'Private' : 'Public'}
                                                        </button>
                                                        <button
                                                            onClick={() => void downloadAsset(asset)}
                                                            className="h-7 rounded-md bg-white/10 hover:bg-white/20 text-[10px] font-medium inline-flex items-center justify-center gap-1"
                                                        >
                                                            <Download size={10} />
                                                            Download
                                                        </button>
                                                        {managedByUser && (
                                                            <>
                                                                <button
                                                                    onClick={() => {
                                                                        setEditingAsset(assetKey);
                                                                        setEditName(asset.name);
                                                                    }}
                                                                    className="h-7 rounded-md bg-white/10 hover:bg-white/20 text-[10px] font-medium inline-flex items-center justify-center gap-1"
                                                                >
                                                                    <Pen size={10} />
                                                                    Rename
                                                                </button>
                                                                <button
                                                                    onClick={() => void deleteAsset(asset)}
                                                                    className="h-7 rounded-md bg-red-500/25 hover:bg-red-500/35 text-[10px] font-medium inline-flex items-center justify-center gap-1"
                                                                >
                                                                    <Trash2 size={10} />
                                                                    Delete
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/65 via-black/25 to-transparent text-white px-2 py-1 pointer-events-none">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] truncate flex-1" title={asset.name}>{asset.name}</span>
                                                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/50" title={sourceCountLabel || sourceLabels.join(', ')}>
                                                        {sourceLabels.length > 1 ? <Cloud size={8} /> : <HardDrive size={8} />}
                                                    </span>
                                                </div>
                                            </div>

                                            {(asset.type === 'videos' || asset.type === 'audio') && playingMediaKey === assetKey && (
                                                <div className="absolute right-1.5 bottom-6 z-20 rounded-full bg-emerald-500/90 text-white text-[9px] font-semibold px-2 py-0.5 pointer-events-none">
                                                    Now Playing
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </DraggableResizablePanel>
        {modelPreviewPopup && (
            <div
                className="fixed z-[120] bg-card border border-border rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                style={{
                    left: modelPreviewPopup.x,
                    top: modelPreviewPopup.y,
                    width: modelPreviewPopup.width,
                    height: modelPreviewPopup.height,
                }}
                onMouseEnter={() => setPreviewHoverKey(modelPreviewPopup.key)}
                onMouseLeave={() => {
                    setPreviewHoverKey(null);
                    setModelPreviewPopup(null);
                }}
            >
                <div className="p-2 border-b border-border flex items-center justify-between bg-secondary/10">
                    <h3 className="font-semibold text-xs flex items-center gap-2 min-w-0">
                        <Box size={14} className="text-primary shrink-0" />
                        <span className="truncate" title={modelPreviewPopup.name}>{modelPreviewPopup.name}</span>
                    </h3>
                    <button
                        onClick={() => setModelPreviewPopup(null)}
                        className="p-1.5 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground"
                        aria-label="Close model preview"
                    >
                        <X size={14} />
                    </button>
                </div>
                <div className="h-[calc(100%-41px)] p-2 bg-secondary/10">
                    <Asset3DPreview url={modelPreviewPopup.url} />
                </div>
            </div>
        )}
        </>
    );
}
