import type * as fabric from 'fabric';
import type { BackgroundJob, ExtendedFabricObject } from '@/types';

export type StabilityGeneratorTab = 'generate' | 'inpaint' | 'img2img' | 'outpaint' | 'upscale' | 'removebox';

export interface StabilityGeneratorProps {
    isOpen: boolean;
    onClose: () => void;
    canvas: fabric.Canvas | null;
    apiKey: string | undefined;
    onJobCreated?: (job: BackgroundJob) => void;
    embedded?: boolean;
    onAssetSave?: (url: string) => void;
    initialTab?: StabilityGeneratorTab;
    autoStartInpaintMasking?: boolean;
    showInpaintQuickDock?: boolean;
    providerLabel?: string;
}

export type CanvasWithArtboard = fabric.Canvas & {
    artboard?: { width: number; height: number; left?: number; top?: number };
    artboardRect?: fabric.Rect;
};

export type StabilityToast = {
    title: string;
    description: string;
    variant: 'warning' | 'success' | 'destructive';
};

export interface StabilityRequestDependencies {
    apiKey?: string;
    prompt: string;
    aspectRatio: string;
    strength: number[];
    selectedCanvasImage: string | null;
    sourceType: 'selection' | 'canvas';
    flattenSelection: boolean;
    maskDataUrl: string | null;
    outpaintDirs: { left: boolean; right: boolean; up: boolean; down: boolean };
    isCanvasMasking: boolean;
    canvas: fabric.Canvas | null;
    runSingleFlight: <T>(action: () => Promise<T>) => Promise<T | undefined>;
    toast: (payload: StabilityToast) => void;
    onJobCreated?: (job: BackgroundJob) => void;
    onClose: () => void;
    setIsProcessing: (value: boolean) => void;
    setResultImage: (value: string | null) => void;
    handleSuccess: (base64Raw: string) => void;
    captureSourceImage: () => string | null;
    captureCanvasAndMask: () => Promise<{ imageBlob: Blob; maskBlob: Blob } | null>;
    toggleCanvasMasking: () => void;
}

export interface StabilityGeneratorContentProps {
    activeTab: StabilityGeneratorTab;
    isProcessing: boolean;
    prompt: string;
    aspectRatio: string;
    strength: number[];
    resultImage: string | null;
    selectedCanvasImage: string | null;
    sourceType: 'selection' | 'canvas';
    flattenSelection: boolean;
    isDrawingMask: boolean;
    maskCanvasRef: React.RefObject<HTMLCanvasElement | null>;
    brushSize: number[];
    isCanvasMasking: boolean;
    outpaintDirs: { left: boolean; right: boolean; up: boolean; down: boolean };
    showInpaintQuickDock: boolean;
    providerLabel: string;
    onTabChange: (nextTab: string) => void;
    onPromptChange: (value: string) => void;
    onAspectRatioChange: (value: string) => void;
    onStrengthChange: (value: number[]) => void;
    onSourceTypeChange: (value: 'selection' | 'canvas') => void;
    onFlattenSelectionChange: (value: boolean) => void;
    onSetIsDrawingMask: (value: boolean) => void;
    onPersistMaskDataUrl: () => void;
    onDrawMask: (event: React.MouseEvent) => void;
    onBrushSizeChange: (value: number[]) => void;
    onToggleCanvasMasking: () => void;
    onClearCanvasMask: () => void;
    onOutpaintDirectionToggle: (direction: 'left' | 'right' | 'up' | 'down') => void;
    onGenerate: () => void;
    onImg2Img: () => void;
    onOutpaint: () => void;
    onInpaint: () => void;
    onUpscale: (type: 'conservative' | 'creative') => void;
    onRemoveBg: () => void;
    onAddToCanvas: () => void;
}

export type StabilityExtendedFabricObject = ExtendedFabricObject;
