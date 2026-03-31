'use client';

import type { BackgroundJob } from '@/types';

export type HitemsImageViewMode = 'single' | 'multi';

export interface LayerImageOption {
    id: string;
    label: string;
    imageUrl: string;
}

export interface ThreeDGeneratorProps {
    onAddToCanvas: (dataUrl: string, modelUrl?: string) => void;
    onClose: () => void;
    onOpenSettings?: () => void;
    initialImage?: string;
    layerImageOptions?: LayerImageOption[];
    onStartBackgroundJob?: (job: Partial<BackgroundJob>) => void;
    onRecoverBackgroundJob?: (job: Partial<BackgroundJob>) => void;
    activeJob?: BackgroundJob | null;
    currentUser?: string;
}

export interface HitemsSetupStatus {
    label: string;
    isReady: boolean;
}
