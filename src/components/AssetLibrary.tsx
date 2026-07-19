'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import JSZip from 'jszip';
import { Upload, Image as ImageIcon, Box, Trash2, CheckCircle, Loader2, RotateCw, Pen, X, Video, Music, Search, Users, User, Globe, Lock, Download, HardDrive, Cloud, Play, Pause, Square, SlidersHorizontal, AlertTriangle, CheckSquare, MoreHorizontal, Folder, FolderPlus, FolderMinus, ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import Asset3DPreview from './Asset3DPreview';
import { AssetDescriptor, AssetType, AssetCategory } from '@/types';
import { buildSessionAuthorizationHeader } from '@/lib/authSession';
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
    getAssetCloudProviderLabel,
    isImplementedAssetCloudProvider,
    loadAssetStorageSettings,
    onAssetStorageSettingsChanged,
    type AssetStorageSettings,
} from '@/lib/assetStorageSettings';
import { ASSET_LIBRARY_CHANGED_EVENT, dispatchAssetLibraryChanged } from '@/lib/assetLibraryEvents';
import { ensureDisplayableImage } from '@/lib/imageFormats/universalImageDecoder';
import { ALL_IMAGE_EXTENSIONS, buildImageAcceptAttribute, getExtension } from '@/lib/imageFormats/supportedFormats';
import {
    ASSET_LIBRARY_BUNDLE_KIND,
    ASSET_LIBRARY_BUNDLE_MANIFEST_PATH,
    ASSET_LIBRARY_BUNDLE_VERSION,
    buildAssetLibraryBundleArchivePath,
    buildAssetLibraryBundleCollisionKey,
    isAssetLibraryBundleManifest,
    normalizeAssetBundleOwner,
    type AssetLibraryBundleEntry,
    type AssetLibraryBundleManifest,
} from '@/lib/assetLibraryBundle';
import { useI18n } from '@/providers/I18nProvider';

const ACCEPTED_FILE_TYPES = `${buildImageAcceptAttribute()},video/*,audio/*,.glb,.gltf,.obj,.fbx,.stl,.ply`;

/**
 * Media tab configuration describing available asset categories and upload behavior.
 */
const LIBRARY_TABS = [
    {
        key: 'images',
        labelKey: 'assets.tab.uploads',
        icon: Upload,
        type: 'images' as AssetType,
        category: 'uploads' as AssetCategory,
        accept: 'image/*'
    },
    {
        key: 'videos',
        labelKey: 'assets.tab.videos',
        icon: Video,
        type: 'videos' as AssetType,
        category: 'uploads' as AssetCategory,
        accept: 'video/*'
    },
    {
        key: 'audio',
        labelKey: 'assets.tab.audio',
        icon: Music,
        type: 'audio' as AssetType,
        category: 'uploads' as AssetCategory,
        accept: 'audio/*'
    },
    {
        key: 'models',
        labelKey: 'assets.tab.3d',
        icon: Box,
        type: 'models' as AssetType,
        category: 'uploads' as AssetCategory,
        accept: '.glb,.gltf'
    },
    {
        key: 'generated',
        labelKey: 'assets.tab.generated',
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

const IMAGE_EXTENSIONS = ALL_IMAGE_EXTENSIONS;
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.ogv']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.oga']);
const MODEL_EXTENSIONS = new Set(['.glb', '.gltf', '.obj', '.fbx', '.stl', '.ply']);

const isDrivePassiveAuthError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error ?? '');
    const normalized = message.toLowerCase();
    return normalized.includes('requires user interaction')
        || normalized.includes('failed to open popup window')
        || normalized.includes('popup_failed_to_open')
        || normalized.includes('cross-origin-opener-policy');
};

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
    type: AssetType;
    x: number;
    y: number;
    width: number;
    height: number;
};

type AssetLibraryImportSummary = {
    importedCount: number;
    skippedCount: number;
    failedCount: number;
    totalCount: number;
    importedAsOwner: string;
    skippedNames: string[];
    failureMessages: string[];
    warnings: string[];
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

const GROUPS_STORAGE_PREFIX = 'imageExpressAssetGroups:';

/** Stable identity for group membership that survives re-listing and storage merges. */
const getAssetGroupKey = (asset: LibraryAsset) => [
    asset.type,
    asset.category,
    (asset.owner || '').toLowerCase(),
    asset.name.trim().toLowerCase(),
].join('|');

type AssetGroupMap = Record<string, string[]>;

const loadAssetGroups = (user: string): AssetGroupMap => {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(`${GROUPS_STORAGE_PREFIX}${user.toLowerCase()}`);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const result: AssetGroupMap = {};
        Object.entries(parsed as Record<string, unknown>).forEach(([name, keys]) => {
            if (Array.isArray(keys)) {
                result[name] = keys.filter((key): key is string => typeof key === 'string');
            }
        });
        return result;
    } catch {
        return {};
    }
};

const saveAssetGroups = (user: string, groups: AssetGroupMap) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(`${GROUPS_STORAGE_PREFIX}${user.toLowerCase()}`, JSON.stringify(groups));
    } catch {
        // Best-effort persistence; groups are a convenience layer.
    }
};

type AssetContextMenuState = {
    asset: LibraryAsset;
    clickX: number;
    clickY: number;
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
    const [selectedAssetKeys, setSelectedAssetKeys] = useState<string[]>([]);
    const [isExportingLibrary, setIsExportingLibrary] = useState(false);
    const [isImportingLibrary, setIsImportingLibrary] = useState(false);
    const [lastImportSummary, setLastImportSummary] = useState<AssetLibraryImportSummary | null>(null);
    const [showFilters, setShowFilters] = useState(false);
    const [isCleaningUp, setIsCleaningUp] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [contextMenu, setContextMenu] = useState<AssetContextMenuState | null>(null);
    // Set only after the menu has mounted and its real size is measured, so it never
    // renders clipped off the bottom/right edge regardless of content length or trigger position.
    const [contextMenuPosition, setContextMenuPosition] = useState<{ left: number; top: number } | null>(null);
    const [assetGroups, setAssetGroups] = useState<AssetGroupMap>(() => loadAssetGroups(currentUser?.trim() || 'Guest'));
    const [activeGroup, setActiveGroup] = useState<string | null>(null);

    const contextMenuRef = useRef<HTMLDivElement | null>(null);
    const moreMenuRef = useRef<HTMLDivElement | null>(null);

    const dialog = useDialog();
    const { toast } = useToast();
    const { t } = useI18n();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const importInputRef = useRef<HTMLInputElement>(null);
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
        const mediaPreviewMap = mediaPreviewRefs.current;
        return () => {
            mediaPreviewMap.forEach((media) => {
                media.pause();
            });
            mediaPreviewMap.clear();
        };
    }, []);

    const getAssetKey = useCallback((asset: LibraryAsset) => {
        if (asset.storageProvider === 'merged') {
            return `merged:${getAssetMergeKey(asset)}`;
        }
        return `${asset.storageProvider}:${asset.storageId || asset.path}`;
    }, []);

    const queryAssetsForTab = useCallback(async (
        targetTab: LibraryTab,
        options?: {
            includePreviewPaths?: boolean;
            search?: string;
            scope?: AssetScopeTab;
            visibility?: VisibilityFilter;
            includePublic?: boolean;
        },
    ) => {
        const config = TAB_CONFIG[targetTab];
        const settings = loadAssetStorageSettings();
        const resolvedScope = options?.scope || scopeTab;
        const resolvedVisibility = options?.visibility || visibilityFilter;
        const includePreviewPaths = Boolean(options?.includePreviewPaths);
        const includePublic = typeof options?.includePublic === 'boolean'
            ? options.includePublic
            : (resolvedScope === 'shared' ? true : showPublicAssets);
        const search = (options?.search ?? searchQuery).trim();
        const cloudProviderImplemented = isImplementedAssetCloudProvider(settings.cloudProvider);

        const shouldLoadLocal = settings.mode === 'local' || settings.mode === 'hybrid';
        const shouldLoadCloud = cloudProviderImplemented && (settings.mode === 'cloud' || settings.mode === 'hybrid');
        const shouldLoadServer = settings.mode === 'hybrid' && settings.includeLegacyServerAssetsInHybrid;

        const loadLocalPromise = shouldLoadLocal
            ? listLocalAssets({
                type: config.type,
                category: config.category,
                owner: normalizedUser,
                scope: resolvedScope,
                includePublic,
                visibility: resolvedVisibility,
                search,
            })
            : Promise.resolve([]);

        const driveConfig = loadDriveConfig();
        const resolvedDriveClientId = (driveConfig.clientId || driveClientId || '').trim();
        const loadCloudPromise = shouldLoadCloud && driveConfig.enabled && resolvedDriveClientId
            ? listDriveAssets(resolvedDriveClientId, {
                owner: normalizedUser,
                scope: resolvedScope,
                includePublic,
                visibility: resolvedVisibility,
                search,
                type: config.type,
                category: config.category,
            }, {
                allowInteractiveAuth: false,
            }).catch((error) => {
                if (!isDrivePassiveAuthError(error)) {
                    console.error('Failed loading Google Drive assets', error);
                }
                return [];
            })
            : Promise.resolve([]);

        const loadServerPromise = shouldLoadServer
            ? fetch(`/api/assets/list?${new URLSearchParams({
                type: config.type,
                category: config.category,
                owner: normalizedUser,
                scope: resolvedScope,
                includePublic: String(includePublic),
                visibility: resolvedVisibility,
                search,
            }).toString()}`, {
                headers: (() => {
                    const authorization = buildSessionAuthorizationHeader();
                    return authorization ? { Authorization: authorization } : undefined;
                })(),
            })
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

        const localNormalized: LibraryAsset[] = localAssets.map((item) => {
            const previewPath = includePreviewPaths ? registerObjectUrl(URL.createObjectURL(item.data)) : undefined;
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

        return mergeDuplicateAssets([...localNormalized, ...cloudNormalized, ...serverNormalized]);
    }, [driveClientId, normalizedUser, registerObjectUrl, scopeTab, searchQuery, showPublicAssets, visibilityFilter]);

    /**
     * Fetches assets from enabled storage providers based on storage mode.
     */
    const fetchAssets = useCallback(async (forcedTab?: LibraryTab) => {
        setIsLoading(true);
        const resolvedTab = forcedTab || activeTab;

        try {
            const settings = loadAssetStorageSettings();
            setStorageSettings(settings);
            clearObjectUrls();
            setAssets(await queryAssetsForTab(resolvedTab, { includePreviewPaths: true }));
        } catch (error) {
            console.error('Failed to load assets', error);
        } finally {
            setIsLoading(false);
        }
    }, [activeTab, clearObjectUrls, queryAssetsForTab]);

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
        const handleAssetLibraryChanged = () => {
            void fetchAssets();
        };

        window.addEventListener(ASSET_LIBRARY_CHANGED_EVENT, handleAssetLibraryChanged);
        return () => {
            window.removeEventListener(ASSET_LIBRARY_CHANGED_EVENT, handleAssetLibraryChanged);
        };
    }, [fetchAssets]);

    useEffect(() => {
        return () => {
            clearObjectUrls();
        };
    }, [clearObjectUrls]);

    useEffect(() => {
        const visibleKeys = new Set(assets.map((asset) => getAssetKey(asset)));
        setSelectedAssetKeys((current) => current.filter((assetKey) => visibleKeys.has(assetKey)));
    }, [assets, getAssetKey]);

    useEscapeKey(onClose);

    // Close the asset context menu / header overflow menu on outside clicks, based on
    // whether the click actually landed inside each menu's DOM — not on every opener
    // remembering to stopPropagation, which is what made this flaky before (any one
    // interactive element inside a tile that forgot it would blow the menu away).
    useEffect(() => {
        if (!contextMenu && !showMoreMenu) return;
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (contextMenu && !(contextMenuRef.current && target && contextMenuRef.current.contains(target))) {
                setContextMenu(null);
            }
            if (showMoreMenu && !(moreMenuRef.current && target && moreMenuRef.current.contains(target))) {
                setShowMoreMenu(false);
            }
        };
        // Capture phase: runs before any element's own stopPropagation, so this can't
        // be silently defeated by a descendant that doesn't call it.
        window.addEventListener('pointerdown', handlePointerDown, true);
        return () => window.removeEventListener('pointerdown', handlePointerDown, true);
    }, [contextMenu, showMoreMenu]);

    const openAssetContextMenu = useCallback((asset: LibraryAsset, event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenuPosition(null);
        setContextMenu({ asset, clickX: event.clientX, clickY: event.clientY });
    }, []);

    // After the menu mounts (invisible), measure its real size and clamp it fully
    // inside the viewport. Guessing a height in advance is what caused it to render
    // cropped on small thumbnails and other edge positions.
    useLayoutEffect(() => {
        if (!contextMenu) {
            setContextMenuPosition(null);
            return;
        }
        const el = contextMenuRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const viewportPadding = 8;
        const left = Math.min(
            Math.max(viewportPadding, contextMenu.clickX),
            Math.max(viewportPadding, window.innerWidth - rect.width - viewportPadding)
        );
        const top = Math.min(
            Math.max(viewportPadding, contextMenu.clickY),
            Math.max(viewportPadding, window.innerHeight - rect.height - viewportPadding)
        );
        setContextMenuPosition({ left, top });
    }, [contextMenu]);

    const toggleAssetSelection = useCallback((assetKey: string, checked: boolean) => {
        setSelectedAssetKeys((current) => {
            if (checked) {
                return current.includes(assetKey) ? current : [...current, assetKey];
            }
            return current.filter((entry) => entry !== assetKey);
        });
    }, []);

    const clearAssetSelection = useCallback(() => {
        setSelectedAssetKeys([]);
    }, []);

    const downloadBlob = useCallback((blob: Blob, filename: string) => {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
    }, []);

    const resolveAssetBlob = useCallback(async (asset: LibraryAsset) => {
        if (asset.storageProvider === 'local') {
            if (!asset.storageId) {
                throw new Error('Missing local asset id.');
            }
            return getLocalAssetBlob(asset.storageId);
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
            return downloadDriveAssetBlob(resolvedDriveClientId, asset.storageId);
        }

        const response = await fetch(asset.path);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.blob();
    }, [driveClientId]);

    /**
     * Handles file selection from system dialog.
     * Uploads to local, cloud, or both depending on storage settings.
     */
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const originalFile = e.target.files?.[0];
        if (!originalFile) return;

        const config = TAB_CONFIG[activeTab];
        const detectedType = inferAssetType(originalFile.name, originalFile.type);
        setIsUploading(true);

        let file: File = originalFile;
        if (detectedType === 'images') {
            try {
                const decoded = await ensureDisplayableImage(originalFile);
                if (decoded.convertedFromLabel) {
                    const baseName = originalFile.name.slice(0, originalFile.name.length - getExtension(originalFile.name).length);
                    file = new File([decoded.blob], `${baseName}.png`, { type: 'image/png' });
                    toast({
                        title: `Converted from ${decoded.convertedFromLabel}`,
                        description: decoded.isPreviewOnly
                            ? 'Imported the embedded preview image; the original file was not modified.'
                            : 'Converted to PNG so it can be edited and previewed.',
                        variant: 'default'
                    });
                }
            } catch (error) {
                toast({
                    title: t('assets.unsupportedFile'),
                    description: error instanceof Error ? error.message : 'Could not open this file.',
                    variant: 'warning'
                });
                setIsUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }
        }

        try {
            const settings = loadAssetStorageSettings();
            const uploadLocal = settings.mode === 'local' || settings.mode === 'hybrid';
            const cloudProviderLabel = getAssetCloudProviderLabel(settings.cloudProvider);
            const cloudProviderImplemented = isImplementedAssetCloudProvider(settings.cloudProvider);
            const uploadCloud = cloudProviderImplemented && (settings.mode === 'cloud' || (settings.mode === 'hybrid' && uploadToCloud));

            if (!cloudProviderImplemented && settings.mode !== 'local') {
                toast({
                    title: `${cloudProviderLabel} not available yet`,
                    description: uploadLocal
                        ? `This build will keep the upload local until ${cloudProviderLabel} support lands.`
                        : `${cloudProviderLabel} cloud uploads are not implemented yet.`,
                    variant: 'warning'
                });
                if (!uploadLocal) {
                    return;
                }
            }

            const driveConfig = loadDriveConfig();
            const resolvedDriveClientId = (driveConfig.clientId || driveClientId || '').trim();
            if (uploadCloud && (!driveConfig.enabled || !resolvedDriveClientId)) {
                toast({
                    title: `${cloudProviderLabel} required`,
                    description: `Connect ${cloudProviderLabel} in Settings before cloud upload.`,
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
                await fetchAssets(targetTab);
            } else {
                await fetchAssets();
            }
        } catch (error) {
            console.error(error);
            toast({ title: t('assets.uploadError'), description: t('assets.uploadErrorBody'), variant: 'destructive' });
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
                const authorization = buildSessionAuthorizationHeader();
                const res = await fetch('/api/assets/rename', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(authorization ? { Authorization: authorization } : {}),
                    },
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
                    title: t('assets.renamePartial'),
                    description: t('assets.renamePartialBody'),
                    variant: 'warning'
                });
            }
        } catch (error) {
            console.error('Rename error:', error);
            toast({ title: t('assets.renameFailed'), description: t('assets.renameFailedBody'), variant: 'destructive' });
        } finally {
            setEditingAsset(null);
        }
    };

    /**
     * Handles deletion of an asset.
     * Works for local, cloud, and legacy server providers.
     * @param e Event to stop propagation
     */
    const deleteAssetSources = async (asset: LibraryAsset) => {
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
                const authorization = buildSessionAuthorizationHeader();
                const res = await fetch('/api/assets/delete', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(authorization ? { Authorization: authorization } : {}),
                    },
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

            if (successCount !== targetSources.length) {
                toast({
                    title: t('assets.deletePartial'),
                    description: t('assets.deletePartialBody'),
                    variant: 'warning'
                });
            }
    };

    /**
     * Confirms and deletes a single asset across its storage providers.
     */
    const deleteAsset = async (asset: LibraryAsset, e?: React.MouseEvent) => {
        e?.stopPropagation(); // Prevent selection when clicking delete
        const confirmed = await dialog.confirm('Are you sure you want to delete this asset?', { title: t('assets.deleteAsset'), variant: 'destructive' });
        if (!confirmed) return;

        try {
            await deleteAssetSources(asset);
            await fetchAssets();
        } catch (error) {
            console.error('Error deleting asset:', error);
            toast({ title: t('assets.deleteFailed'), description: t('assets.deleteFailedBody'), variant: 'destructive' });
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
                title: t('assets.readOnly'),
                description: t('assets.readOnlyBody'),
                variant: 'warning'
            });
            return;
        }

        const nextPublicState = !Boolean(asset.isPublic);
        const targetSources = getSourceAssets(asset).filter(canManageSingleAsset);
        if (targetSources.length === 0) {
            toast({
                title: t('assets.readOnly'),
                description: t('assets.readOnlyBody'),
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
                const authorization = buildSessionAuthorizationHeader();
                const res = await fetch('/api/assets/visibility', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(authorization ? { Authorization: authorization } : {}),
                    },
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
                title: t('assets.visibilityFailed'),
                description: t('assets.visibilityFailedBody'),
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
                type: asset.type,
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
                title: t('assets.openFailed'),
                description: t('assets.openFailedBody'),
                variant: 'destructive'
            });
        }
    }, [onClose, onSelect, resolveAssetSelectionPath, toast]);

    const downloadAsset = async (asset: LibraryAsset, e?: React.MouseEvent) => {
        e?.stopPropagation();
        e?.preventDefault();

        try {
            const selectedAsset = pickRepresentativeAsset(asset);
            const blob = await resolveAssetBlob(selectedAsset);
            downloadBlob(blob, selectedAsset.name || 'asset');
        } catch (error) {
            console.error('Download failed', error);
            toast({
                title: t('assets.downloadFailed'),
                description: t('assets.downloadFailedBody'),
                variant: 'destructive'
            });
        }
    };

    const selectedAssetsInView = assets.filter((asset) => selectedAssetKeys.includes(getAssetKey(asset)));
    const manageableSelectedAssets = selectedAssetsInView.filter(canManageAsset);

    const toggleSelectAllInView = useCallback(() => {
        setSelectedAssetKeys((current) => {
            const allKeys = assets.map((asset) => getAssetKey(asset));
            const allSelected = allKeys.length > 0 && allKeys.every((key) => current.includes(key));
            return allSelected ? [] : allKeys;
        });
    }, [assets, getAssetKey]);

    const handleBulkDelete = useCallback(async () => {
        if (manageableSelectedAssets.length === 0) return;
        const confirmed = await dialog.confirm(
            `Delete ${manageableSelectedAssets.length} selected asset(s)? This cannot be undone.`,
            { title: t('assets.deleteAssets'), variant: 'destructive' }
        );
        if (!confirmed) return;

        let failures = 0;
        for (const asset of manageableSelectedAssets) {
            try {
                await deleteAssetSources(asset);
            } catch {
                failures += 1;
            }
        }
        await fetchAssets();
        clearAssetSelection();
        toast({
            title: failures === 0 ? 'Assets deleted' : 'Some deletions failed',
            description: `Deleted ${manageableSelectedAssets.length - failures} of ${manageableSelectedAssets.length} selected asset(s).`,
            variant: failures === 0 ? 'success' : 'warning',
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [manageableSelectedAssets, dialog, clearAssetSelection, toast]);

    const handleBulkVisibility = useCallback(async (makePublic: boolean) => {
        const targets = manageableSelectedAssets.filter((asset) => Boolean(asset.isPublic) !== makePublic);
        for (const asset of targets) {
            await toggleAssetVisibility(asset);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [manageableSelectedAssets]);

    const handleBulkDownload = useCallback(async () => {
        for (const asset of selectedAssetsInView) {
            await downloadAsset(asset);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAssetsInView]);

    const persistGroups = useCallback((next: AssetGroupMap) => {
        // Drop groups that ended up empty so stale names don't linger in the chip row.
        const cleaned: AssetGroupMap = {};
        Object.entries(next).forEach(([name, keys]) => {
            if (keys.length > 0) cleaned[name] = keys;
        });
        setAssetGroups(cleaned);
        saveAssetGroups(normalizedUser, cleaned);
        setActiveGroup((current) => (current && !cleaned[current] ? null : current));
    }, [normalizedUser]);

    const addAssetsToGroup = useCallback((groupName: string, targets: LibraryAsset[]) => {
        if (targets.length === 0) return;
        const nextKeys = new Set(assetGroups[groupName] || []);
        // An asset lives in at most one group; joining a group leaves the previous one.
        const targetKeys = new Set(targets.map(getAssetGroupKey));
        const next: AssetGroupMap = {};
        Object.entries(assetGroups).forEach(([name, keys]) => {
            next[name] = name === groupName ? keys : keys.filter((key) => !targetKeys.has(key));
        });
        targetKeys.forEach((key) => nextKeys.add(key));
        next[groupName] = Array.from(nextKeys);
        persistGroups(next);
        toast({ title: t('assets.grouped'), description: `Added ${targets.length} asset(s) to "${groupName}".`, variant: 'success' });
    }, [assetGroups, persistGroups, toast]);

    const createGroupForAssets = useCallback(async (targets: LibraryAsset[]) => {
        const name = (await dialog.prompt('Name the new group:', { title: t('assets.newAssetGroup'), confirmText: 'Create' }))?.trim();
        if (!name) return;
        addAssetsToGroup(name, targets);
    }, [addAssetsToGroup, dialog]);

    const removeAssetsFromGroups = useCallback((targets: LibraryAsset[]) => {
        if (targets.length === 0) return;
        const targetKeys = new Set(targets.map(getAssetGroupKey));
        const next: AssetGroupMap = {};
        Object.entries(assetGroups).forEach(([name, keys]) => {
            next[name] = keys.filter((key) => !targetKeys.has(key));
        });
        persistGroups(next);
    }, [assetGroups, persistGroups]);

    const groupNameForAsset = useCallback((asset: LibraryAsset) => {
        const key = getAssetGroupKey(asset);
        const entry = Object.entries(assetGroups).find(([, keys]) => keys.includes(key));
        return entry ? entry[0] : null;
    }, [assetGroups]);

    const groupNames = useMemo(() => Object.keys(assetGroups).sort((a, b) => a.localeCompare(b)), [assetGroups]);

    const displayedAssets = useMemo(() => {
        if (!activeGroup) return assets;
        const keys = new Set(assetGroups[activeGroup] || []);
        return assets.filter((asset) => keys.has(getAssetGroupKey(asset)));
    }, [activeGroup, assetGroups, assets]);

    const loadAllTabAssetsForBundle = useCallback(async (searchOverride?: string) => {
        const assetGroupsByTab = await Promise.all(
            LIBRARY_TABS.map((tab) => queryAssetsForTab(tab.key, {
                includePreviewPaths: false,
                search: searchOverride,
            }))
        );
        return assetGroupsByTab.flat();
    }, [queryAssetsForTab]);

    const buildExistingImportCollisionSet = useCallback(async () => {
        const assetGroups = await Promise.all(
            LIBRARY_TABS.map((tab) => queryAssetsForTab(tab.key, {
                includePreviewPaths: false,
                search: '',
                scope: 'personal',
                visibility: 'all',
                includePublic: true,
            }))
        );

        const keys = new Set<string>();
        assetGroups.flat().forEach((asset) => {
            getSourceAssets(asset).forEach((sourceAsset) => {
                keys.add(buildAssetLibraryBundleCollisionKey({
                    name: sourceAsset.name,
                    type: sourceAsset.type,
                    category: sourceAsset.category,
                    owner: sourceAsset.owner,
                    isPublic: sourceAsset.isPublic,
                }));
            });
        });
        return keys;
    }, [queryAssetsForTab]);

    const handleExportLibrary = useCallback(async () => {
        setIsExportingLibrary(true);
        try {
            const exportTargets = selectedAssetsInView.length > 0
                ? selectedAssetsInView
                : await loadAllTabAssetsForBundle(searchQuery);

            if (exportTargets.length === 0) {
                toast({
                    title: t('assets.nothingToExport'),
                    description: t('assets.nothingToExportBody'),
                    variant: 'warning',
                });
                return;
            }

            const manifestEntries: AssetLibraryBundleEntry[] = [];
            const exportFailures: string[] = [];
            const zip = new JSZip();

            for (const asset of exportTargets) {
                const representative = pickRepresentativeAsset(asset);
                try {
                    const blob = await resolveAssetBlob(representative);
                    const archivePath = buildAssetLibraryBundleArchivePath({
                        index: manifestEntries.length,
                        name: asset.name,
                        type: asset.type,
                        category: asset.category,
                    });
                    zip.file(archivePath, blob);
                    manifestEntries.push({
                        archivePath,
                        name: asset.name,
                        type: asset.type,
                        category: asset.category,
                        owner: normalizeAssetBundleOwner(asset.owner),
                        isPublic: Boolean(asset.isPublic),
                        mimeType: blob.type || undefined,
                        createdAt: asset.createdAt,
                        updatedAt: asset.updatedAt,
                        sourceProviders: Array.from(new Set(getSourceAssets(asset).map((entry) => entry.storageProvider))),
                    });
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown export error';
                    exportFailures.push(`${asset.name}: ${message}`);
                }
            }

            if (manifestEntries.length === 0) {
                throw new Error('None of the current assets could be packaged.');
            }

            const manifest: AssetLibraryBundleManifest = {
                kind: ASSET_LIBRARY_BUNDLE_KIND,
                version: ASSET_LIBRARY_BUNDLE_VERSION,
                exportedAt: new Date().toISOString(),
                exportedBy: normalizedUser,
                assetCount: manifestEntries.length,
                assets: manifestEntries,
            };
            zip.file(ASSET_LIBRARY_BUNDLE_MANIFEST_PATH, JSON.stringify(manifest, null, 2));

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const bundleBlob = await zip.generateAsync({ type: 'blob' });
            downloadBlob(bundleBlob, `asset-library-${timestamp}.zip`);

            toast({
                title: exportFailures.length > 0 ? 'Library export completed with warnings' : 'Library export complete',
                description: exportFailures.length > 0
                    ? `Packaged ${manifestEntries.length} asset(s); ${exportFailures.length} failed to export.`
                    : `Packaged ${manifestEntries.length} asset(s) into a transferable ZIP.`,
                variant: exportFailures.length > 0 ? 'warning' : 'success',
            });
        } catch (error) {
            console.error('Asset library export failed', error);
            toast({
                title: t('assets.exportFailed'),
                description: error instanceof Error ? error.message : 'Could not export the asset library bundle.',
                variant: 'destructive',
            });
        } finally {
            setIsExportingLibrary(false);
        }
    }, [downloadBlob, loadAllTabAssetsForBundle, normalizedUser, resolveAssetBlob, searchQuery, selectedAssetsInView, toast]);

    const handleImportLibrary = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const bundleFile = event.target.files?.[0];
        if (!bundleFile) {
            return;
        }

        setIsImportingLibrary(true);
        setLastImportSummary(null);

        try {
            const zip = await JSZip.loadAsync(bundleFile);
            const manifestFile = zip.file(ASSET_LIBRARY_BUNDLE_MANIFEST_PATH);
            if (!manifestFile) {
                throw new Error('This ZIP does not contain an Image Express asset-library manifest.');
            }

            const manifestJson = await manifestFile.async('string');
            const manifestValue = JSON.parse(manifestJson) as unknown;
            if (!isAssetLibraryBundleManifest(manifestValue)) {
                throw new Error('Asset-library manifest is invalid or unsupported.');
            }

            const settings = loadAssetStorageSettings();
            const uploadLocal = settings.mode === 'local' || settings.mode === 'hybrid';
            const cloudProviderLabel = getAssetCloudProviderLabel(settings.cloudProvider);
            const cloudProviderImplemented = isImplementedAssetCloudProvider(settings.cloudProvider);
            const uploadCloud = cloudProviderImplemented && (settings.mode === 'cloud' || (settings.mode === 'hybrid' && uploadToCloud));
            if (!uploadLocal && !uploadCloud) {
                throw new Error('Current storage settings do not allow imported assets to be stored.');
            }

            if (!cloudProviderImplemented && settings.mode !== 'local' && !uploadLocal) {
                throw new Error(`${cloudProviderLabel} cloud imports are not implemented yet.`);
            }

            const driveConfig = loadDriveConfig();
            const resolvedDriveClientId = (driveConfig.clientId || driveClientId || '').trim();
            const canUploadToDrive = uploadCloud && driveConfig.enabled && resolvedDriveClientId;
            if (uploadCloud && !canUploadToDrive && !uploadLocal) {
                throw new Error(`${cloudProviderLabel} must be connected before importing a cloud-only asset bundle.`);
            }

            const existingKeys = await buildExistingImportCollisionSet();
            const skippedNames: string[] = [];
            const failureMessages: string[] = [];
            const warnings: string[] = [];
            let importedCount = 0;

            if (uploadCloud && !canUploadToDrive) {
                warnings.push(`${cloudProviderLabel} was unavailable, so imported assets were saved only to local storage.`);
            }

            for (const entry of manifestValue.assets) {
                const collisionKey = buildAssetLibraryBundleCollisionKey({
                    name: entry.name,
                    type: entry.type,
                    category: entry.category,
                    owner: normalizedUser,
                    isPublic: entry.isPublic,
                });

                if (existingKeys.has(collisionKey)) {
                    skippedNames.push(entry.name);
                    continue;
                }

                const archiveFile = zip.file(entry.archivePath);
                if (!archiveFile) {
                    failureMessages.push(`${entry.name}: missing archived file in bundle.`);
                    continue;
                }

                try {
                    const blob = await archiveFile.async('blob');

                    if (uploadLocal) {
                        await saveLocalAsset({
                            file: blob,
                            filename: entry.name,
                            type: entry.type,
                            category: entry.category,
                            owner: normalizedUser,
                            isPublic: entry.isPublic,
                            mimeType: entry.mimeType || blob.type || undefined,
                        });
                    }

                    if (canUploadToDrive) {
                        await uploadDriveAsset(resolvedDriveClientId, {
                            file: blob,
                            filename: entry.name,
                            type: entry.type,
                            category: entry.category,
                            owner: normalizedUser,
                            isPublic: entry.isPublic,
                        });
                    }

                    existingKeys.add(collisionKey);
                    importedCount += 1;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown import error';
                    failureMessages.push(`${entry.name}: ${message}`);
                }
            }

            const summary: AssetLibraryImportSummary = {
                importedCount,
                skippedCount: skippedNames.length,
                failedCount: failureMessages.length,
                totalCount: manifestValue.assets.length,
                importedAsOwner: normalizedUser,
                skippedNames,
                failureMessages,
                warnings,
            };
            setLastImportSummary(summary);

            if (importedCount > 0) {
                dispatchAssetLibraryChanged({
                    action: 'bundle-import',
                    assetCount: importedCount,
                    owner: normalizedUser,
                });
                await fetchAssets();
            }

            toast({
                title: failureMessages.length > 0 ? 'Library import completed with warnings' : 'Library import complete',
                description: `Imported ${importedCount} of ${manifestValue.assets.length} asset(s). Skipped ${skippedNames.length}, failed ${failureMessages.length}.`,
                variant: failureMessages.length > 0 || skippedNames.length > 0 ? 'warning' : 'success',
            });
        } catch (error) {
            console.error('Asset library import failed', error);
            toast({
                title: t('assets.importFailed'),
                description: error instanceof Error ? error.message : 'Could not import the asset library bundle.',
                variant: 'destructive',
            });
        } finally {
            setIsImportingLibrary(false);
            if (importInputRef.current) {
                importInputRef.current.value = '';
            }
        }
    }, [buildExistingImportCollisionSet, driveClientId, fetchAssets, normalizedUser, toast, uploadToCloud]);

    /**
     * Scans every tab for assets whose underlying file can no longer be
     * resolved (deleted on disk/Drive but still listed) and deletes those
     * broken library entries after confirmation.
     */
    const handleCleanupMissingAssets = useCallback(async () => {
        setIsCleaningUp(true);
        try {
            const allAssets = await loadAllTabAssetsForBundle('');
            const ownedAssets = allAssets.filter(canManageAsset);

            const brokenAssets: LibraryAsset[] = [];
            await Promise.all(ownedAssets.map(async (asset) => {
                try {
                    await resolveAssetBlob(pickRepresentativeAsset(asset));
                } catch {
                    brokenAssets.push(asset);
                }
            }));

            if (brokenAssets.length === 0) {
                toast({ title: t('assets.nothingToClean'), description: t('assets.nothingToCleanBody') });
                return;
            }

            const confirmed = await dialog.confirm(
                `Found ${brokenAssets.length} asset(s) that can no longer be loaded (missing files). Remove them from the library?`,
                { title: t('assets.removeMissing'), variant: 'destructive' }
            );
            if (!confirmed) return;

            const driveConfig = loadDriveConfig();
            const resolvedDriveClientId = (driveConfig.clientId || driveClientId || '').trim();
            let removedCount = 0;

            for (const asset of brokenAssets) {
                const targetSources = getSourceAssets(asset).filter(canManageSingleAsset);
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
                    const authorization = buildSessionAuthorizationHeader();
                    const res = await fetch('/api/assets/delete', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(authorization ? { Authorization: authorization } : {}),
                        },
                        body: JSON.stringify({ filePath: entry.path, owner: normalizedUser }),
                    });
                    const data = await res.json();
                    if (!(data.success || res.ok)) {
                        throw new Error(data.message || 'Unknown error');
                    }
                }));
                if (results.some((result) => result.status === 'fulfilled')) {
                    removedCount += 1;
                }
            }

            await fetchAssets();
            toast({
                title: t('assets.cleanupComplete'),
                description: `Removed ${removedCount} of ${brokenAssets.length} missing asset(s) from the library.`,
                variant: removedCount === brokenAssets.length ? 'success' : 'warning',
            });
        } catch (error) {
            console.error('Asset cleanup failed', error);
            toast({
                title: t('assets.cleanupFailed'),
                description: t('assets.cleanupFailedBody'),
                variant: 'destructive',
            });
        } finally {
            setIsCleaningUp(false);
        }
    }, [canManageAsset, canManageSingleAsset, dialog, driveClientId, fetchAssets, loadAllTabAssetsForBundle, normalizedUser, resolveAssetBlob, toast]);

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
                <div className="flex items-center gap-0.5">
                    <button
                        onClick={() => setShowFilters((prev) => !prev)}
                        className={cn(
                            "h-7 w-7 rounded-md inline-flex items-center justify-center transition-colors",
                            showFilters
                                ? "bg-primary/15 text-primary"
                                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                        )}
                        aria-label={t('assets.toggleFilters')}
                        aria-expanded={showFilters}
                        title={t('assets.filtersTitle')}
                    >
                        <SlidersHorizontal size={14} />
                    </button>
                    <button
                        onClick={() => fetchAssets()}
                        className="h-7 w-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        title={t('assets.refresh')}
                        aria-label={t('assets.refresh')}
                    >
                        <RotateCw size={14} className={isLoading ? "animate-spin" : ""} />
                    </button>
                    <div className="relative" ref={moreMenuRef}>
                        <button
                            onClick={(event) => {
                                event.stopPropagation();
                                setShowMoreMenu((prev) => !prev);
                            }}
                            className={cn(
                                "h-7 w-7 rounded-md inline-flex items-center justify-center transition-colors",
                                showMoreMenu
                                    ? "bg-primary/15 text-primary"
                                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                            )}
                            aria-label={t('assets.moreActions')}
                            aria-expanded={showMoreMenu}
                            title={t('assets.moreActionsTitle')}
                        >
                            {(isImportingLibrary || isExportingLibrary || isCleaningUp)
                                ? <Loader2 size={14} className="animate-spin" />
                                : <MoreHorizontal size={14} />}
                        </button>
                        {showMoreMenu && (
                            <div
                                className="absolute right-0 top-8 z-40 w-52 rounded-lg border border-border bg-popover shadow-xl p-1 animate-in fade-in zoom-in-95 duration-100"
                                onPointerDown={(event) => event.stopPropagation()}
                            >
                                <button
                                    onClick={() => {
                                        setShowMoreMenu(false);
                                        importInputRef.current?.click();
                                    }}
                                    disabled={isImportingLibrary}
                                    className="w-full h-8 px-2 rounded-md text-xs text-left inline-flex items-center gap-2 hover:bg-secondary disabled:opacity-50"
                                    aria-label={t('assets.importLibrary')}
                                >
                                    <Upload size={13} className="text-muted-foreground" />
                                    Import Library…
                                </button>
                                <button
                                    onClick={() => {
                                        setShowMoreMenu(false);
                                        void handleExportLibrary();
                                    }}
                                    disabled={isExportingLibrary}
                                    className="w-full h-8 px-2 rounded-md text-xs text-left inline-flex items-center gap-2 hover:bg-secondary disabled:opacity-50"
                                    aria-label={t('assets.exportLibrary')}
                                >
                                    <Download size={13} className="text-muted-foreground" />
                                    Export Library
                                </button>
                                <div className="my-1 h-px bg-border/60" />
                                <button
                                    onClick={() => {
                                        setShowMoreMenu(false);
                                        void handleCleanupMissingAssets();
                                    }}
                                    disabled={isCleaningUp}
                                    className="w-full h-8 px-2 rounded-md text-xs text-left inline-flex items-center gap-2 hover:bg-secondary disabled:opacity-50"
                                    aria-label={t('assets.removeMissing')}
                                    title={t('assets.removeMissingTitle')}
                                >
                                    <AlertTriangle size={13} className="text-amber-500" />
                                    Clean Up Missing Assets
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="mx-0.5 h-4 w-px bg-border/70" />
                    <button
                        onClick={onClose}
                        className="h-7 w-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label={t('assets.closeLibrary')}
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Collapsible Filters (personal/shared, search, visibility) — hidden by default since rarely changed */}
            {showFilters && (
                <div className="p-2 border-b border-border/50 space-y-1.5 bg-secondary/5 animate-in fade-in slide-in-from-top-2 duration-150">
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
                                placeholder={t('assets.searchPlaceholder')}
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
                            <option value="all">{t('assets.allVisibility')}</option>
                            <option value="public">{t('assets.publicOnly')}</option>
                            <option value="private">{t('assets.privateOnly')}</option>
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
            )}

            {/* Bulk selection action bar — appears only when assets are selected, replacing hover-only controls */}
            {selectedAssetKeys.length > 0 && (
                <div className="px-2 py-1.5 border-b border-border/50 bg-primary/5 flex items-center gap-1.5 overflow-x-auto animate-in fade-in slide-in-from-top-2 duration-150">
                    <span
                        className="h-7 px-2 inline-flex items-center rounded-md border border-primary/30 bg-primary/10 text-[11px] font-semibold text-primary shrink-0"
                        data-testid="asset-library-selection-count"
                    >
                        {selectedAssetKeys.length} selected
                    </span>
                    <button
                        onClick={() => void handleBulkDownload()}
                        className="h-7 px-2 rounded-md text-[11px] font-medium text-foreground inline-flex items-center gap-1.5 hover:bg-secondary shrink-0"
                        title={t('assets.downloadSelected')}
                    >
                        <Download size={12} />
                        Download
                    </button>
                    {manageableSelectedAssets.length === 1 && (
                        <button
                            onClick={() => {
                                const target = manageableSelectedAssets[0];
                                setEditingAsset(getAssetKey(target));
                                setEditName(target.name);
                            }}
                            className="h-7 px-2 rounded-md text-[11px] font-medium text-foreground inline-flex items-center gap-1.5 hover:bg-secondary shrink-0"
                            title={t('assets.renameSelected')}
                        >
                            <Pen size={12} />
                            Rename
                        </button>
                    )}
                    {manageableSelectedAssets.length > 0 && (
                        <>
                            <button
                                onClick={() => void createGroupForAssets(selectedAssetsInView)}
                                className="h-7 px-2 rounded-md text-[11px] font-medium text-foreground inline-flex items-center gap-1.5 hover:bg-secondary shrink-0"
                                title={t('assets.groupSelected')}
                            >
                                <FolderPlus size={12} />
                                Group
                            </button>
                            {selectedAssetsInView.some((asset) => groupNameForAsset(asset)) && (
                                <button
                                    onClick={() => removeAssetsFromGroups(selectedAssetsInView)}
                                    className="h-7 px-2 rounded-md text-[11px] font-medium text-foreground inline-flex items-center gap-1.5 hover:bg-secondary shrink-0"
                                    title={t('assets.ungroupSelected')}
                                >
                                    <FolderMinus size={12} />
                                    Ungroup
                                </button>
                            )}
                            <button
                                onClick={() => void handleBulkVisibility(true)}
                                className="h-7 px-2 rounded-md text-[11px] font-medium text-foreground inline-flex items-center gap-1.5 hover:bg-secondary shrink-0"
                                title={t('assets.makeSelectedPublic')}
                            >
                                <Globe size={12} />
                                Public
                            </button>
                            <button
                                onClick={() => void handleBulkVisibility(false)}
                                className="h-7 px-2 rounded-md text-[11px] font-medium text-foreground inline-flex items-center gap-1.5 hover:bg-secondary shrink-0"
                                title={t('assets.makeSelectedPrivate')}
                            >
                                <Lock size={12} />
                                Private
                            </button>
                            <button
                                onClick={() => void handleBulkDelete()}
                                className="h-7 px-2 rounded-md text-[11px] font-medium text-red-500 inline-flex items-center gap-1.5 hover:bg-red-500/15 shrink-0"
                                title={t('assets.deleteSelected')}
                            >
                                <Trash2 size={12} />
                                Delete
                            </button>
                        </>
                    )}
                    <button
                        onClick={toggleSelectAllInView}
                        className="h-7 px-2 rounded-md text-[11px] font-medium text-muted-foreground inline-flex items-center gap-1.5 hover:bg-secondary shrink-0 ml-auto"
                        title={t('assets.toggleSelectAll')}
                    >
                        <CheckSquare size={12} />
                        All
                    </button>
                    <button
                        onClick={clearAssetSelection}
                        className="h-7 w-7 rounded-md text-muted-foreground inline-flex items-center justify-center hover:bg-secondary shrink-0"
                        title={t('assets.clearSelection')}
                        aria-label={t('assets.clearSelection')}
                    >
                        <X size={13} />
                    </button>
                </div>
            )}

            {/* Body: vertical media-type icon rail on the left, content on the right */}
            <div className="flex flex-1 min-h-0">
                <div className="flex flex-col items-center gap-1 p-1.5 border-r border-border/50 bg-card/50 shrink-0">
                    {LIBRARY_TABS.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    "w-10 h-10 flex flex-col items-center justify-center gap-0.5 rounded-md transition-colors",
                                    activeTab === tab.key ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground"
                                )}
                                title={t(tab.labelKey)}
                                aria-label={t(tab.labelKey)}
                                aria-pressed={activeTab === tab.key}
                            >
                                <Icon size={16} />
                                <span className="text-[8px] font-medium leading-none">{t(tab.labelKey)}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

            {/* Upload Row */}
            <div className="p-2 border-b border-border/50 bg-secondary/5">
                {lastImportSummary && (
                    <div
                        className="mb-2 rounded-md border border-border/60 bg-background/80 px-3 py-2 text-[11px] text-muted-foreground"
                        data-testid="asset-library-import-summary"
                    >
                        <div className="font-semibold text-foreground">
                            Imported {lastImportSummary.importedCount} of {lastImportSummary.totalCount} asset(s) as {lastImportSummary.importedAsOwner}.
                        </div>
                        <div>
                            Skipped duplicates: {lastImportSummary.skippedCount}. Failed: {lastImportSummary.failedCount}.
                        </div>
                        {lastImportSummary.warnings.length > 0 && (
                            <div className="mt-1 text-amber-700">
                                {lastImportSummary.warnings.join(' ')}
                            </div>
                        )}
                        {lastImportSummary.skippedNames.length > 0 && (
                            <div className="mt-1 truncate" title={lastImportSummary.skippedNames.join(', ')}>
                                Duplicates: {lastImportSummary.skippedNames.join(', ')}
                            </div>
                        )}
                        {lastImportSummary.failureMessages.length > 0 && (
                            <div className="mt-1 truncate text-destructive" title={lastImportSummary.failureMessages.join(' | ')}>
                                Failures: {lastImportSummary.failureMessages.join(' | ')}
                            </div>
                        )}
                    </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                {storageSettings.mode === 'hybrid' && (
                    <label className="h-7 px-2 rounded-md border border-border/50 bg-background/70 flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none shrink-0">
                        <input
                            type="checkbox"
                            checked={uploadToCloud}
                            onChange={(event) => setUploadToCloud(event.target.checked)}
                            className="rounded border-border text-primary focus:ring-primary/20"
                        />
                        Also upload this file to {getAssetCloudProviderLabel(storageSettings.cloudProvider)}
                    </label>
                )}
                {storageSettings.mode === 'cloud' && (
                    <div className="h-7 px-2 text-[11px] text-muted-foreground bg-secondary/20 border border-border/40 rounded-md inline-flex items-center gap-1.5 shrink-0">
                        <Cloud size={12} className="text-primary" />
                        Uploads go to {getAssetCloudProviderLabel(storageSettings.cloudProvider)} only.
                    </div>
                )}
                {storageSettings.mode !== 'local' && isImplementedAssetCloudProvider(storageSettings.cloudProvider) && !loadDriveConfig().enabled && (
                    <div className="h-7 px-2 text-[11px] text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-md inline-flex items-center shrink-0">
                        {getAssetCloudProviderLabel(storageSettings.cloudProvider)} not connected.
                    </div>
                )}
                {storageSettings.mode !== 'local' && !isImplementedAssetCloudProvider(storageSettings.cloudProvider) && (
                    <div className="h-7 px-2 text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-md inline-flex items-center shrink-0">
                        {getAssetCloudProviderLabel(storageSettings.cloudProvider)} planned. Uploads stay local in this build.
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
                <input
                    ref={importInputRef}
                    type="file"
                    accept=".zip,application/zip"
                    className="hidden"
                    onChange={handleImportLibrary}
                    data-testid="asset-library-import-input"
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

            {/* Group filter chips — shown only once the user has created groups */}
            {groupNames.length > 0 && (
                <div className="px-3 pt-2 flex items-center gap-1.5 flex-wrap">
                    <button
                        onClick={() => setActiveGroup(null)}
                        className={cn(
                            "h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors",
                            activeGroup === null
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        )}
                    >
                        All
                    </button>
                    {groupNames.map((name) => (
                        <button
                            key={name}
                            onClick={() => setActiveGroup((current) => (current === name ? null : name))}
                            className={cn(
                                "h-6 px-2.5 rounded-full text-[11px] font-medium inline-flex items-center gap-1 transition-colors",
                                activeGroup === name
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
                            )}
                            title={`Show only assets in "${name}"`}
                        >
                            <Folder size={11} />
                            {name}
                            <span className={cn("text-[10px]", activeGroup === name ? "text-primary-foreground/80" : "text-muted-foreground/70")}>
                                {(assetGroups[name] || []).length}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* Asset Grid Display */}
            <div className="flex-1 overflow-y-auto p-3">
                {isLoading ? (
                    <div className="flex justify-center py-8 text-muted-foreground">
                        <Loader2 className="animate-spin" size={20} />
                    </div>
                ) : displayedAssets.length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted-foreground">
                        {activeGroup
                            ? `No assets from "${activeGroup}" in this tab.`
                            : 'No assets found. Upload one to get started.'}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {displayedAssets.map((asset, index) => {
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
                            const isSelected = selectedAssetKeys.includes(assetKey);
                            const memberGroup = groupNameForAsset(asset);

                            return (
                                <div
                                    key={assetKey || `${asset.path}-${index}`}
                                    className={cn(
                                        "group relative aspect-square bg-secondary/25 rounded-lg overflow-hidden border transition-all cursor-pointer",
                                        isSelected
                                            ? "border-primary ring-2 ring-primary/40 shadow-md"
                                            : "border-border/60 hover:border-primary/50 hover:shadow-md"
                                    )}
                                    title={asset.name}
                                    onContextMenu={(event) => openAssetContextMenu(asset, event)}
                                    onMouseEnter={(event) => {
                                        if (asset.type === 'models' || asset.type === 'videos' || asset.type === 'audio') {
                                            void openModelPreviewPopup(asset, assetKey, event.currentTarget.getBoundingClientRect());
                                        }
                                    }}
                                    onMouseLeave={() => {
                                        if (asset.type !== 'models' && asset.type !== 'videos' && asset.type !== 'audio') return;
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
                                    <label
                                        className={cn(
                                            "absolute left-1.5 top-1.5 z-30 flex h-6 w-6 items-center justify-center rounded-md bg-black/55 backdrop-blur-[2px] transition-opacity",
                                            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                                        )}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={(event) => toggleAssetSelection(assetKey, event.target.checked)}
                                            aria-label={`Select asset ${asset.name}`}
                                            className="h-3.5 w-3.5 rounded border-white/50 text-primary focus:ring-primary/30"
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={(event) => openAssetContextMenu(asset, event)}
                                        className="absolute right-1.5 top-1.5 z-30 flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-white/90 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-black/75 transition-opacity"
                                        aria-label={`Asset actions for ${asset.name}`}
                                        title={t('assets.assetActions')}
                                    >
                                        <MoreHorizontal size={13} />
                                    </button>
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
                                                    title={t('common.save')}
                                                >
                                                    <CheckCircle size={12} />
                                                </button>
                                                <button
                                                    onClick={() => setEditingAsset(null)}
                                                    className="p-1 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded"
                                                    title={t('common.cancel')}
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
                                                                className="w-full h-full object-contain"
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
                                                                className="w-full h-full object-contain"
                                                                onPlay={() => setPlayingMediaKey(assetKey)}
                                                                onPause={() => setPlayingMediaKey((current) => (current === assetKey ? null : current))}
                                                                onEnded={() => setPlayingMediaKey((current) => (current === assetKey ? null : current))}
                                                                playsInline
                                                                preload="metadata"
                                                            />
                                                            <div className="absolute left-1.5 top-9 z-20 flex items-center gap-1 rounded-md bg-black/65 p-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={(event) => handleMediaPreviewAction(assetKey, 'play', event)}
                                                                    className="h-6 w-6 rounded text-white/90 hover:bg-white/20 inline-flex items-center justify-center"
                                                                    title={t('assets.playPreview')}
                                                                    aria-label={t('assets.playPreview')}
                                                                >
                                                                    <Play size={12} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(event) => handleMediaPreviewAction(assetKey, 'pause', event)}
                                                                    className="h-6 w-6 rounded text-white/90 hover:bg-white/20 inline-flex items-center justify-center"
                                                                    title={t('assets.pausePreview')}
                                                                    aria-label={t('assets.pausePreview')}
                                                                >
                                                                    <Pause size={12} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(event) => handleMediaPreviewAction(assetKey, 'stop', event)}
                                                                    className="h-6 w-6 rounded text-white/90 hover:bg-white/20 inline-flex items-center justify-center"
                                                                    title={t('assets.stopPreview')}
                                                                    aria-label={t('assets.stopPreview')}
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
                                                        <div className="absolute left-1.5 top-9 z-20 flex items-center gap-1 rounded-md bg-black/65 p-1">
                                                            <button
                                                                type="button"
                                                                onClick={(event) => handleMediaPreviewAction(assetKey, 'play', event)}
                                                                disabled={!imagePreviewUrl}
                                                                className="h-6 w-6 rounded text-white/90 hover:bg-white/20 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                                                                title={t('assets.playPreview')}
                                                                aria-label={t('assets.playPreview')}
                                                            >
                                                                <Play size={12} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(event) => handleMediaPreviewAction(assetKey, 'pause', event)}
                                                                disabled={!imagePreviewUrl}
                                                                className="h-6 w-6 rounded text-white/90 hover:bg-white/20 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                                                                title={t('assets.pausePreview')}
                                                                aria-label={t('assets.pausePreview')}
                                                            >
                                                                <Pause size={12} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(event) => handleMediaPreviewAction(assetKey, 'stop', event)}
                                                                disabled={!imagePreviewUrl}
                                                                className="h-6 w-6 rounded text-white/90 hover:bg-white/20 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                                                                title={t('assets.stopPreview')}
                                                                aria-label={t('assets.stopPreview')}
                                                            >
                                                                <Square size={11} />
                                                            </button>
                                                        </div>
                                                        <Music size={24} />
                                                        {!imagePreviewUrl && (
                                                            <span className="text-[10px] text-muted-foreground/80">{t('assets.previewUnavailable')}</span>
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
                                                                <span className="text-[10px] text-muted-foreground/80">{t('assets.hoverToPreview')}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/75 via-black/35 to-transparent text-white px-2 pb-1.5 pt-4 pointer-events-none">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] font-medium truncate flex-1">{asset.name}</span>
                                                    {memberGroup && (
                                                        <span className="inline-flex items-center gap-0.5 rounded-full bg-white/15 px-1.5 py-px text-[9px]" title={`In group "${memberGroup}"`}>
                                                            <Folder size={8} />
                                                            <span className="max-w-[64px] truncate">{memberGroup}</span>
                                                        </span>
                                                    )}
                                                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/50" title={asset.isPublic ? `Public · ${ownerShort}` : `Private · ${ownerShort}`}>
                                                        {isUpdatingVisibility ? <Loader2 size={8} className="animate-spin" /> : (asset.isPublic ? <Globe size={8} /> : <Lock size={8} />)}
                                                    </span>
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
                </div>
            </div>
        </DraggableResizablePanel>
        {contextMenu && (() => {
            const menuAsset = contextMenu.asset;
            const menuAssetKey = getAssetKey(menuAsset);
            const menuManaged = canManageAsset(menuAsset);
            const menuGroup = groupNameForAsset(menuAsset);
            const menuIsMulti = selectedAssetKeys.length > 1 && selectedAssetKeys.includes(menuAssetKey);
            const menuTargets = menuIsMulti ? selectedAssetsInView : [menuAsset];
            const closeMenu = () => setContextMenu(null);

            return (
                <div
                    ref={contextMenuRef}
                    className="fixed z-[130] w-52 rounded-lg border border-border bg-popover shadow-xl p-1 overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
                    style={
                        contextMenuPosition
                            ? {
                                left: contextMenuPosition.left,
                                top: contextMenuPosition.top,
                                maxHeight: 'calc(100vh - 16px)',
                                // The "duration-100" class below is meant only for the
                                // fade/zoom entrance *animation*; without this, it also makes
                                // this position jump an animated *transition*, which can visibly
                                // stall at the off-screen starting point instead of snapping.
                                transition: 'none',
                            }
                            : {
                                // Off-screen but still laid out and measurable for the initial
                                // pass, until the useLayoutEffect above knows its real size and
                                // clamps it fully on-screen.
                                left: -9999,
                                top: -9999,
                                maxHeight: 'calc(100vh - 16px)',
                                transition: 'none',
                            }
                    }
                    onContextMenu={(event) => event.preventDefault()}
                    role="menu"
                    aria-label={`Actions for ${menuAsset.name}`}
                >
                    {menuIsMulti && (
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {selectedAssetKeys.length} assets selected
                        </div>
                    )}
                    {!menuIsMulti && (
                        <button
                            onClick={() => {
                                closeMenu();
                                void handleAssetSelect(menuAsset);
                            }}
                            className="w-full h-8 px-2 rounded-md text-xs text-left inline-flex items-center gap-2 hover:bg-secondary"
                            role="menuitem"
                            title={t('assets.addToCanvas')}
                        >
                            <ImagePlus size={13} className="text-muted-foreground" />
                            Add to Canvas
                        </button>
                    )}
                    <button
                        onClick={() => {
                            closeMenu();
                            if (menuIsMulti) {
                                void handleBulkDownload();
                            } else {
                                void downloadAsset(menuAsset);
                            }
                        }}
                        className="w-full h-8 px-2 rounded-md text-xs text-left inline-flex items-center gap-2 hover:bg-secondary"
                        role="menuitem"
                        title={t('assets.downloadAsset')}
                    >
                        <Download size={13} className="text-muted-foreground" />
                        Download
                    </button>
                    {!menuIsMulti && menuManaged && (
                        <button
                            onClick={() => {
                                closeMenu();
                                setEditingAsset(menuAssetKey);
                                setEditName(menuAsset.name);
                            }}
                            className="w-full h-8 px-2 rounded-md text-xs text-left inline-flex items-center gap-2 hover:bg-secondary"
                            role="menuitem"
                            title={t('assets.renameAsset')}
                        >
                            <Pen size={13} className="text-muted-foreground" />
                            Rename
                        </button>
                    )}
                    <button
                        onClick={() => {
                            closeMenu();
                            if (menuIsMulti) {
                                void handleBulkVisibility(!menuAsset.isPublic);
                            } else {
                                void toggleAssetVisibility(menuAsset);
                            }
                        }}
                        className="w-full h-8 px-2 rounded-md text-xs text-left inline-flex items-center gap-2 hover:bg-secondary"
                        role="menuitem"
                        title={menuAsset.isPublic ? 'Set private' : 'Set public'}
                    >
                        {menuAsset.isPublic ? <Lock size={13} className="text-muted-foreground" /> : <Globe size={13} className="text-muted-foreground" />}
                        {menuAsset.isPublic ? 'Make Private' : 'Make Public'}
                    </button>
                    <div className="my-1 h-px bg-border/60" />
                    {groupNames.filter((name) => name !== menuGroup).map((name) => (
                        <button
                            key={name}
                            onClick={() => {
                                closeMenu();
                                addAssetsToGroup(name, menuTargets);
                            }}
                            className="w-full h-8 px-2 rounded-md text-xs text-left inline-flex items-center gap-2 hover:bg-secondary"
                            role="menuitem"
                            title={`Add to group "${name}"`}
                        >
                            <Folder size={13} className="text-muted-foreground" />
                            <span className="truncate">Add to &quot;{name}&quot;</span>
                        </button>
                    ))}
                    <button
                        onClick={() => {
                            closeMenu();
                            void createGroupForAssets(menuTargets);
                        }}
                        className="w-full h-8 px-2 rounded-md text-xs text-left inline-flex items-center gap-2 hover:bg-secondary"
                        role="menuitem"
                        title={t('assets.addToNewGroup')}
                    >
                        <FolderPlus size={13} className="text-muted-foreground" />
                        New Group…
                    </button>
                    {(menuGroup || (menuIsMulti && menuTargets.some((target) => groupNameForAsset(target)))) && (
                        <button
                            onClick={() => {
                                closeMenu();
                                removeAssetsFromGroups(menuTargets);
                            }}
                            className="w-full h-8 px-2 rounded-md text-xs text-left inline-flex items-center gap-2 hover:bg-secondary"
                            role="menuitem"
                            title={t('assets.removeFromGroup')}
                        >
                            <FolderMinus size={13} className="text-muted-foreground" />
                            Remove from Group
                        </button>
                    )}
                    {menuManaged && (
                        <>
                            <div className="my-1 h-px bg-border/60" />
                            <button
                                onClick={() => {
                                    closeMenu();
                                    if (menuIsMulti) {
                                        void handleBulkDelete();
                                    } else {
                                        void deleteAsset(menuAsset);
                                    }
                                }}
                                className="w-full h-8 px-2 rounded-md text-xs text-left inline-flex items-center gap-2 text-red-500 hover:bg-red-500/10"
                                role="menuitem"
                                title={t('assets.deleteAsset')}
                            >
                                <Trash2 size={13} />
                                Delete
                            </button>
                        </>
                    )}
                </div>
            );
        })()}
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
                        {modelPreviewPopup.type === 'videos' ? <Video size={14} className="text-primary shrink-0" />
                            : modelPreviewPopup.type === 'audio' ? <Music size={14} className="text-primary shrink-0" />
                            : <Box size={14} className="text-primary shrink-0" />}
                        <span className="truncate" title={modelPreviewPopup.name}>{modelPreviewPopup.name}</span>
                    </h3>
                    <button
                        onClick={() => setModelPreviewPopup(null)}
                        className="p-1.5 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground"
                        aria-label={t('assets.closePreview')}
                    >
                        <X size={14} />
                    </button>
                </div>
                <div className="h-[calc(100%-41px)] p-2 bg-secondary/10 flex items-center justify-center">
                    {modelPreviewPopup.type === 'videos' ? (
                        <video src={modelPreviewPopup.url} className="max-w-full max-h-full" controls autoPlay muted playsInline />
                    ) : modelPreviewPopup.type === 'audio' ? (
                        <div className="w-full flex flex-col items-center gap-3 text-muted-foreground">
                            <Music size={32} />
                            <audio src={modelPreviewPopup.url} className="w-full" controls autoPlay />
                        </div>
                    ) : (
                        <Asset3DPreview url={modelPreviewPopup.url} />
                    )}
                </div>
            </div>
        )}
        </>
    );
}
