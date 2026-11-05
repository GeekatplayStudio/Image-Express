import { Box, Image as ImageIcon, Music, Upload, Video } from 'lucide-react';
import type { AssetCategory, AssetType } from '@/types';

/**
 * Media tab configuration describing available asset categories and upload behavior.
 */
export const LIBRARY_TABS = [
    { key: 'images', labelKey: 'assets.tab.uploads', icon: Upload, type: 'images' as AssetType, category: 'uploads' as AssetCategory, accept: 'image/*' },
    { key: 'videos', labelKey: 'assets.tab.videos', icon: Video, type: 'videos' as AssetType, category: 'uploads' as AssetCategory, accept: 'video/*' },
    { key: 'audio', labelKey: 'assets.tab.audio', icon: Music, type: 'audio' as AssetType, category: 'uploads' as AssetCategory, accept: 'audio/*' },
    { key: 'models', labelKey: 'assets.tab.3d', icon: Box, type: 'models' as AssetType, category: 'uploads' as AssetCategory, accept: '.glb,.gltf' },
    { key: 'generated', labelKey: 'assets.tab.generated', icon: ImageIcon, type: 'images' as AssetType, category: 'generated' as AssetCategory, accept: 'image/*' },
] as const;

export type LibraryTab = typeof LIBRARY_TABS[number]['key'];
export type LibraryTabConfig = typeof LIBRARY_TABS[number];

export const TAB_CONFIG: Record<LibraryTab, LibraryTabConfig> = LIBRARY_TABS.reduce(
    (acc, tab) => {
        acc[tab.key] = tab;
        return acc;
    },
    {} as Record<LibraryTab, LibraryTabConfig>,
);

export const typeToTabKey: Record<AssetType, LibraryTab> = {
    images: 'images',
    videos: 'videos',
    audio: 'audio',
    models: 'models',
};
