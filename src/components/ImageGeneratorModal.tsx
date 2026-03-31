import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { X, Wand2, Loader2 } from 'lucide-react';
import * as fabric from 'fabric';
import { ExtendedFabricObject } from '@/types';
import StabilityGenerator from './AI/StabilityGenerator';
import useEscapeKey from '@/hooks/useEscapeKey';
import useSingleFlight from '@/hooks/useSingleFlight';
import { APP_THEME } from '@/lib/theme-tokens';
import {
  DEFAULT_COMFY_LOCAL_URL,
  loadComfyCloudApiKey,
  saveComfyCloudApiKey,
    verifyAvailableComfyConnection,
  type ComfyConnectionMode,
} from '@/lib/comfyui/connection';
import { comfyWorkflowRegistry, type ComfyTask } from '@/lib/comfyui/registry';
import { getComfyTaskPreference, saveComfyTaskPreference } from '@/lib/comfyui/preferences';
import { executeComfyTask, recoverComfyTaskByPromptId } from '@/lib/comfyui/runner';
import { ensureComfyWorkflowCatalogRegistered } from '@/lib/comfyui/workflows/catalog';
import {
  GENERATIVE_PROVIDER_OPTIONS,
  getGenerativeProviderOption,
    getSupportedWorkflowsForProvider,
  isGenerativeProviderReady,
  loadGenerativePreferences,
  resolveGenerativeLaunchState,
  saveGenerativePreferences,
  type GenerativeProviderId,
  type GenerativeStabilityTab,
} from '@/lib/generative-preferences';
import { compileAnnotationPrompts } from '@/lib/agentic-edit/promptCompiler';
import type { AnnotationDocument, AnnotationRecord, ReferenceRecord } from '@/lib/agentic-edit/types';

/**
 * ImageGeneratorModal
 * 
 * A floating, draggable modal window for AI Image Generation.
 * Features:
 * - "Magic Zone" creation on canvas (defining area for generation)
 * - Integration with Local ComfyUI and Remote APIs (Stability, OpenAI, etc)
 * - Interface for prompt entry and generation control
 * - Auto-saving of generated results to the "Generated" asset library
 */
interface ImageGeneratorModalProps {
  /** Visibility state */
  isOpen?: boolean;
  /** Reference to the main Fabric.js canvas */
  canvas?: fabric.Canvas | null;
  /** Callback to close the modal */
  onClose: () => void;
  /** Optional callback when image is generated (legacy support) */
  onGenerate?: (imageSrc: string) => void;
  /** Default width for the generation zone */
  initialWidth?: number;
  /** Default height for the generation zone */
  initialHeight?: number;
  /** Optional API Key override */
  apiKey?: string; 
  /** Current user id/email for asset ownership */
  currentUser?: string;
}

type CanvasWithArtboard = fabric.Canvas & {
    artboard?: { width: number; height: number };
};

const COMFY_TASK_STORAGE_KEY = 'image-express-comfy-task';
const COMFY_PENDING_JOB_STORAGE_KEY = 'image-express-comfy-pending-job';

interface PendingComfyJobRecord {
    promptId: string;
    task: ComfyTask;
    workflowId: string;
    modelPresetId: string;
    connection: {
        mode: ComfyConnectionMode;
        localUrl: string;
        cloudUrl: string;
        cloudApiKey: string;
    };
    queuedAt: string;
}

interface CanvasLayerOption {
    id: string;
    label: string;
}

type LayerAnnotationNoteMap = Record<string, AnnotationRecord[]>;

interface AnnotationReferenceItem {
    id: string;
    role: ReferenceRecord['role'];
    file: File | null;
    name: string;
    sourceLayerId?: string;
}

interface RemovedAnnotationSnapshot {
    note: AnnotationRecord;
    index: number;
    layerId: string;
}

const COMFY_TASK_OPTIONS: Array<{ id: ComfyTask; label: string }> = [
    { id: 'generate', label: 'Text to Image' },
    { id: 'img2img', label: 'Image to Image' },
    { id: 'inpaint', label: 'Inpaint' },
    { id: 'outpaint', label: 'Outpaint' },
    { id: 'upscale', label: 'Upscale' },
];

const readImageDimensions = (dataUrl: string): Promise<{ width: number; height: number }> => (
    new Promise((resolve, reject) => {
        const image = new window.Image();
        image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
        image.onerror = () => reject(new Error('Failed to read image dimensions.'));
        image.src = dataUrl;
    })
);

const createSolidMaskDataUrl = (width: number, height: number, fill = '#ffffff'): string => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Failed to create inpaint mask canvas.');
    }

    context.fillStyle = fill;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
};

const buildOutpaintPayload = async (
    sourceImageDataUrl: string,
    padding = 128
): Promise<{ imageDataUrl: string; maskDataUrl: string; width: number; height: number }> => {
    const image = new window.Image();
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Failed to load source image for outpaint.'));
        image.src = sourceImageDataUrl;
    });

    const pad = Math.max(32, Math.round(padding));
    const outputWidth = Math.max(1, image.width + pad * 2);
    const outputHeight = Math.max(1, image.height + pad * 2);

    const imageCanvas = document.createElement('canvas');
    imageCanvas.width = outputWidth;
    imageCanvas.height = outputHeight;
    const imageContext = imageCanvas.getContext('2d');
    if (!imageContext) {
        throw new Error('Failed to create outpaint image canvas.');
    }
    imageContext.fillStyle = '#000000';
    imageContext.fillRect(0, 0, outputWidth, outputHeight);
    imageContext.drawImage(image, pad, pad);

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = outputWidth;
    maskCanvas.height = outputHeight;
    const maskContext = maskCanvas.getContext('2d');
    if (!maskContext) {
        throw new Error('Failed to create outpaint mask canvas.');
    }
    maskContext.fillStyle = '#ffffff';
    maskContext.fillRect(0, 0, outputWidth, outputHeight);
    maskContext.clearRect(pad, pad, image.width, image.height);

    return {
        imageDataUrl: imageCanvas.toDataURL('image/png'),
        maskDataUrl: maskCanvas.toDataURL('image/png'),
        width: outputWidth,
        height: outputHeight,
    };
};

const dataUrlToFile = async (dataUrl: string, filename: string): Promise<File> => {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type || 'image/png' });
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => {
    window.setTimeout(resolve, ms);
});

const mapGenerativeProviderToAgenticProvider = (provider: GenerativeProviderId): 'mock' | 'flux' | 'nanobanana' => {
    if (provider === 'banana') {
        return 'nanobanana';
    }
    if (provider === 'openai' || provider === 'google' || provider === 'stability') {
        return 'flux';
    }
    return 'mock';
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const readBoxGeometry = (geometry: AnnotationRecord['geometry']): { x: number; y: number; w: number; h: number } => {
    if ('w' in geometry && 'h' in geometry) {
        return {
            x: clamp01(typeof geometry.x === 'number' ? geometry.x : 0),
            y: clamp01(typeof geometry.y === 'number' ? geometry.y : 0),
            w: clamp01(typeof geometry.w === 'number' ? geometry.w : 1),
            h: clamp01(typeof geometry.h === 'number' ? geometry.h : 1),
        };
    }

    if ('points' in geometry && Array.isArray(geometry.points) && geometry.points.length > 0) {
        const xs = geometry.points.map((point) => clamp01(point.x));
        const ys = geometry.points.map((point) => clamp01(point.y));
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);
        return {
            x: minX,
            y: minY,
            w: clamp01(maxX - minX),
            h: clamp01(maxY - minY),
        };
    }

    if ('x' in geometry && 'y' in geometry) {
        return {
            x: clamp01(typeof geometry.x === 'number' ? geometry.x : 0.5),
            y: clamp01(typeof geometry.y === 'number' ? geometry.y : 0.5),
            w: 0.12,
            h: 0.12,
        };
    }

    return { x: 0, y: 0, w: 1, h: 1 };
};

const renderAnnotationShape = (
    context: CanvasRenderingContext2D,
    annotation: AnnotationRecord,
    width: number,
    height: number,
    options: { fillStyle: string; strokeStyle: string; lineWidth: number }
) => {
    const lineWidth = Math.max(1, options.lineWidth);
    context.lineWidth = lineWidth;
    context.strokeStyle = options.strokeStyle;
    context.fillStyle = options.fillStyle;

    if (annotation.type === 'point') {
        const point = annotation.geometry as { x: number; y: number };
        const x = clamp01(point.x) * width;
        const y = clamp01(point.y) * height;
        const radius = Math.max(4, Math.round(Math.min(width, height) * 0.01));
        const tail = Math.max(16, Math.round(Math.min(width, height) * 0.04));

        context.beginPath();
        context.moveTo(x - tail, y - tail);
        context.lineTo(x - radius * 0.6, y - radius * 0.6);
        context.stroke();

        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x - radius * 1.7, y - radius * 0.7);
        context.lineTo(x - radius * 0.7, y - radius * 1.7);
        context.closePath();
        context.fill();
        context.stroke();

        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        return;
    }

    if (annotation.type === 'polygon' || annotation.type === 'pose') {
        const points = (annotation.geometry as { points: Array<{ x: number; y: number }> }).points || [];
        if (points.length === 0) {
            return;
        }

        context.beginPath();
        context.moveTo(clamp01(points[0].x) * width, clamp01(points[0].y) * height);
        for (let i = 1; i < points.length; i += 1) {
            context.lineTo(clamp01(points[i].x) * width, clamp01(points[i].y) * height);
        }
        if (annotation.type === 'polygon') {
            context.closePath();
            context.fill();
        }
        context.stroke();
        return;
    }

    if (annotation.type === 'brush') {
        const brush = annotation.geometry as { strokes?: Array<{ points: Array<{ x: number; y: number }>; size: number }> };
        const strokes = brush.strokes || [];
        for (const stroke of strokes) {
            if (!stroke.points || stroke.points.length === 0) continue;
            context.lineWidth = Math.max(2, Math.round(stroke.size * Math.min(width, height)));
            context.beginPath();
            context.moveTo(clamp01(stroke.points[0].x) * width, clamp01(stroke.points[0].y) * height);
            for (let i = 1; i < stroke.points.length; i += 1) {
                context.lineTo(clamp01(stroke.points[i].x) * width, clamp01(stroke.points[i].y) * height);
            }
            context.stroke();
        }
        return;
    }

    const box = readBoxGeometry(annotation.geometry);
    const x = box.x * width;
    const y = box.y * height;
    const w = Math.max(1, box.w * width);
    const h = Math.max(1, box.h * height);
    context.fillRect(x, y, w, h);
    context.strokeRect(x, y, w, h);
};

const buildAnnotationLayerArtifacts = async (
    annotations: AnnotationRecord[],
    width: number,
    height: number
): Promise<{ notesOverlayFile: File; combinedMaskFile: File }> => {
    const safeWidth = Math.max(1, Math.round(width));
    const safeHeight = Math.max(1, Math.round(height));

    const notesCanvas = document.createElement('canvas');
    notesCanvas.width = safeWidth;
    notesCanvas.height = safeHeight;
    const notesContext = notesCanvas.getContext('2d');
    if (!notesContext) {
        throw new Error('Failed to create notes overlay context.');
    }

    notesContext.clearRect(0, 0, safeWidth, safeHeight);

    const enabled = annotations.filter((annotation) => annotation.enabled);
    for (let index = 0; index < enabled.length; index += 1) {
        const annotation = enabled[index];
        renderAnnotationShape(notesContext, annotation, safeWidth, safeHeight, {
            fillStyle: 'rgba(255, 64, 64, 0.20)',
            strokeStyle: 'rgba(255, 64, 64, 0.95)',
            lineWidth: 2,
        });

        const box = readBoxGeometry(annotation.geometry);
        const labelX = Math.max(8, Math.round(box.x * safeWidth) + 4);
        const labelY = Math.max(12, Math.round(box.y * safeHeight) + 12);
        notesContext.fillStyle = 'rgba(255, 255, 255, 0.95)';
        notesContext.font = '12px sans-serif';
        notesContext.fillText(`${index + 1}`, labelX, labelY);
    }

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = safeWidth;
    maskCanvas.height = safeHeight;
    const maskContext = maskCanvas.getContext('2d');
    if (!maskContext) {
        throw new Error('Failed to create combined mask context.');
    }

    maskContext.fillStyle = '#000000';
    maskContext.fillRect(0, 0, safeWidth, safeHeight);

    for (const annotation of enabled) {
        renderAnnotationShape(maskContext, annotation, safeWidth, safeHeight, {
            fillStyle: '#ffffff',
            strokeStyle: '#ffffff',
            lineWidth: 3,
        });
    }

    const notesOverlayDataUrl = notesCanvas.toDataURL('image/png');
    const combinedMaskDataUrl = maskCanvas.toDataURL('image/png');

    return {
        notesOverlayFile: await dataUrlToFile(notesOverlayDataUrl, `notes-overlay-${Date.now()}.png`),
        combinedMaskFile: await dataUrlToFile(combinedMaskDataUrl, `combined-mask-${Date.now()}.png`),
    };
};

const buildAnnotatedReferenceLayerDataUrl = async (
    baseImageDataUrl: string,
    annotations: AnnotationRecord[],
    width: number,
    height: number
): Promise<string> => {
    const safeWidth = Math.max(1, Math.round(width));
    const safeHeight = Math.max(1, Math.round(height));

    const image = new window.Image();
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Failed to load base image for reference notes layer.'));
        image.src = baseImageDataUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = safeWidth;
    canvas.height = safeHeight;
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Failed to create reference layer canvas context.');
    }

    context.clearRect(0, 0, safeWidth, safeHeight);
    context.drawImage(image, 0, 0, safeWidth, safeHeight);

    const activeAnnotations = annotations.filter((annotation) => annotation.enabled);
    activeAnnotations.forEach((annotation, index) => {
        renderAnnotationShape(context, annotation, safeWidth, safeHeight, {
            fillStyle: 'rgba(47, 126, 255, 0.22)',
            strokeStyle: 'rgba(47, 126, 255, 0.98)',
            lineWidth: 3,
        });

        const box = readBoxGeometry(annotation.geometry);
        const labelX = Math.max(10, Math.round(box.x * safeWidth) + 6);
        const labelY = Math.max(16, Math.round(box.y * safeHeight) + 16);
        const noteTitle = `${index + 1}. ${annotation.instruction.trim() || annotation.type}`;

        context.font = '12px sans-serif';
        context.fillStyle = 'rgba(12, 15, 26, 0.82)';
        const textWidth = Math.min(safeWidth - 20, context.measureText(noteTitle).width + 10);
        const boxWidth = Math.max(28, textWidth);
        context.fillRect(labelX - 4, labelY - 12, boxWidth, 18);

        context.fillStyle = 'rgba(255, 255, 255, 0.98)';
        context.fillText(noteTitle.slice(0, 80), labelX, labelY);
    });

    return canvas.toDataURL('image/png');
};

export default function ImageGeneratorModal({
  isOpen = true,
  canvas,
  onClose,
  onGenerate,
  initialWidth = 512,
  initialHeight = 512,
  apiKey,
  currentUser,
}: ImageGeneratorModalProps) {
    const formatElapsedSeconds = (elapsedMs?: number): string => {
            if (!elapsedMs || elapsedMs <= 0) {
                    return '0s';
            }
            return `${Math.max(1, Math.round(elapsedMs / 1000))}s`;
    };
    const runSingleFlight = useSingleFlight();

  const owner = currentUser?.trim() || 'Guest';
  // --- Generation State ---
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [useAgenticEditNotes, setUseAgenticEditNotes] = useState(false);
    const [globalNegativePrompt, setGlobalNegativePrompt] = useState('');
    const [annotationNotes, setAnnotationNotes] = useState<AnnotationRecord[]>([]);
    const [layerAnnotationNotesMap, setLayerAnnotationNotesMap] = useState<LayerAnnotationNoteMap>({});
        const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
        const [annotationBaseImage, setAnnotationBaseImage] = useState<string | null>(null);
        const [annotationBaseDimensions, setAnnotationBaseDimensions] = useState<{ width: number; height: number } | null>(null);
    const [referenceItems, setReferenceItems] = useState<AnnotationReferenceItem[]>([]);
        const [canvasLayerOptions, setCanvasLayerOptions] = useState<CanvasLayerOption[]>([]);
        const [selectedCanvasLayerId, setSelectedCanvasLayerId] = useState<string>('');
    const [isPointNoteMode, setIsPointNoteMode] = useState(false);
    const [lastRemovedAnnotation, setLastRemovedAnnotation] = useState<RemovedAnnotationSnapshot | null>(null);
    const lastRemovedAnnotationTimeoutRef = useRef<number | null>(null);
  
  // --- UI State (Draggable Window) ---
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  
  // --- Canvas Zone Management ---
  const [zoneWidth, setZoneWidth] = useState(initialWidth);
  const [zoneHeight, setZoneHeight] = useState(initialHeight);
  const zoneObjectRef = useRef<fabric.Rect | null>(null);

  // --- Provider Selection ---
  const [availableProviders, setAvailableProviders] = useState<GenerativeProviderId[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<GenerativeProviderId>('comfy');
  const [comfyServerUrl, setComfyServerUrl] = useState(DEFAULT_COMFY_LOCAL_URL);
  const [comfyConnectionMode, setComfyConnectionMode] = useState<ComfyConnectionMode>('auto');
  const [comfyCloudUrl, setComfyCloudUrl] = useState('https://cloud.comfy.org');
  const [comfyCloudApiKey, setComfyCloudApiKey] = useState('');
  const [availableComfyWorkflowIds, setAvailableComfyWorkflowIds] = useState<string[]>([]);
    const [selectedComfyTask, setSelectedComfyTask] = useState<ComfyTask>('generate');
  const [selectedComfyWorkflowId, setSelectedComfyWorkflowId] = useState('');
  const [selectedComfyModelPresetId, setSelectedComfyModelPresetId] = useState('');
    const [initialStabilityTab, setInitialStabilityTab] = useState<GenerativeStabilityTab>('generate');
  const [autoStartInpaintMasking, setAutoStartInpaintMasking] = useState(true);
  const [showInpaintPromptDock, setShowInpaintPromptDock] = useState(true);
  const [isCheckingComfyConnection, setIsCheckingComfyConnection] = useState(false);
  const [comfyConnectionStatusMessage, setComfyConnectionStatusMessage] = useState('');
  const hasAttemptedComfyRecoveryRef = useRef(false);
    const annotationCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const activeAnnotationLayerIdRef = useRef<string>('');
    const canvasLayerIdMapRef = useRef<WeakMap<fabric.Object, string>>(new WeakMap());
    const nextCanvasLayerIdRef = useRef(1);
    const annotationPointerStateRef = useRef<{
            noteId: string;
            type: AnnotationRecord['type'];
            start: { x: number; y: number };
            points: Array<{ x: number; y: number }>;
            drawing: boolean;
    } | null>(null);

  const readPendingComfyJob = useCallback((): PendingComfyJobRecord | null => {
      if (typeof window === 'undefined') {
          return null;
      }

      const raw = window.localStorage.getItem(COMFY_PENDING_JOB_STORAGE_KEY);
      if (!raw) {
          return null;
      }

      try {
          const parsed = JSON.parse(raw) as PendingComfyJobRecord;
          if (!parsed.promptId || !parsed.workflowId || !parsed.modelPresetId) {
              return null;
          }

          return parsed;
      } catch {
          return null;
      }
  }, []);

  const writePendingComfyJob = useCallback((job: PendingComfyJobRecord) => {
      if (typeof window === 'undefined') {
          return;
      }

      window.localStorage.setItem(COMFY_PENDING_JOB_STORAGE_KEY, JSON.stringify(job));
  }, []);

  const clearPendingComfyJob = useCallback(() => {
      if (typeof window === 'undefined') {
          return;
      }

      window.localStorage.removeItem(COMFY_PENDING_JOB_STORAGE_KEY);
  }, []);

  const syncComfyTaskSelections = useCallback((task: ComfyTask) => {
      const taskPreference = getComfyTaskPreference(task);
      const workflows = comfyWorkflowRegistry.getWorkflowsForTask(task);
      const workflowIds = workflows.map((workflow) => workflow.id);
      const preferredWorkflow = workflows.find((workflow) => workflow.id === taskPreference.workflowId);
      const preferredModelPresetId = taskPreference.modelPresetId || '';
      const preferredWorkflowSupportsModel = Boolean(
          preferredWorkflow && (!preferredModelPresetId || preferredWorkflow.modelPresetIds.includes(preferredModelPresetId))
      );
      const initialWorkflowId = preferredWorkflowSupportsModel
          ? preferredWorkflow!.id
          : (
              (preferredModelPresetId
                  ? workflows.find((workflow) => workflow.modelPresetIds.includes(preferredModelPresetId))?.id
                  : undefined)
              || preferredWorkflow?.id
              || workflowIds[0]
              || ''
          );

      setAvailableComfyWorkflowIds(workflowIds);
      setSelectedComfyWorkflowId(initialWorkflowId);

      if (initialWorkflowId) {
          const modelPresets = comfyWorkflowRegistry.getModelPresetsForWorkflow(initialWorkflowId);
          const initialModelPresetId = modelPresets.some((preset) => preset.id === taskPreference.modelPresetId)
              ? (taskPreference.modelPresetId as string)
              : (modelPresets[0]?.id || '');

          setSelectedComfyModelPresetId(initialModelPresetId);
      } else {
          setSelectedComfyModelPresetId('');
      }
  }, []);

  // --- Modal View Mode (Zone vs Generative Fill/Studio) ---
  const [mode, setMode] = useState<'zone' | 'stability'>('zone');

  // Init: Synch with LocalStorage settings
  useEffect(() => {
    if (typeof window !== 'undefined') {
        ensureComfyWorkflowCatalogRegistered();

        // Check for Available API Keys in storage
        const stability = localStorage.getItem('stability_api_key');
        const openai = localStorage.getItem('openai_api_key');
        const google = localStorage.getItem('google_api_key');
        const banana = localStorage.getItem('banana_api_key');
        
        const providers: GenerativeProviderId[] = ['comfy']; // Local ComfyUI is always an option
        if (stability) providers.push('stability');
        if (openai) providers.push('openai');
        if (google) providers.push('google');
        if (banana) providers.push('banana');
        
        const preferences = loadGenerativePreferences();
        const launch = resolveGenerativeLaunchState(preferences, providers);

        setAvailableProviders(providers);
        setSelectedProvider(launch.provider);
        setMode(launch.provider === 'stability' ? 'stability' : 'zone');
        setInitialStabilityTab(launch.stabilityTab);
        setComfyServerUrl(preferences.comfyServerUrl);
        setComfyConnectionMode(preferences.comfyConnectionMode);
        setComfyCloudUrl(preferences.comfyCloudUrl);
        setComfyCloudApiKey(loadComfyCloudApiKey());
        setAutoStartInpaintMasking(preferences.autoStartInpaintMasking);
        setShowInpaintPromptDock(preferences.showInpaintPromptDock);

        const savedTask = window.localStorage.getItem(COMFY_TASK_STORAGE_KEY);
        const initialTask = COMFY_TASK_OPTIONS.some((task) => task.id === savedTask)
            ? (savedTask as ComfyTask)
            : 'generate';
        setSelectedComfyTask(initialTask);
        syncComfyTaskSelections(initialTask);
    }
  }, [syncComfyTaskSelections]);

  useEffect(() => {
      syncComfyTaskSelections(selectedComfyTask);
  }, [selectedComfyTask, syncComfyTaskSelections]);

  /**
   * Updates selected provider and persists choice.
   */
  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newVal = e.target.value as GenerativeProviderId;
      setSelectedProvider(newVal);
      setMode(newVal === 'stability' ? 'stability' : 'zone');
      saveGenerativePreferences({ defaultProvider: newVal });

      // Keep compatibility with older keys used in previous releases.
      localStorage.setItem('image-express-gen-provider', newVal);
      localStorage.setItem('image-express-provider', newVal);
  };

  const handleComfyTaskChange = (task: ComfyTask) => {
      setSelectedComfyTask(task);
      if (typeof window !== 'undefined') {
          window.localStorage.setItem(COMFY_TASK_STORAGE_KEY, task);
      }
  };

  const handleComfyWorkflowChange = (workflowId: string) => {
      setSelectedComfyWorkflowId(workflowId);
      saveComfyTaskPreference(selectedComfyTask, { workflowId });

      const workflow = comfyWorkflowRegistry.getWorkflow(workflowId);
      const modelPresets = comfyWorkflowRegistry.getModelPresetsForWorkflow(workflowId);
      const nextModelPresetId = (
          modelPresets.find((preset) => preset.id === workflow?.defaultModelPresetId)?.id
          || modelPresets[0]?.id
          || ''
      );
      setSelectedComfyModelPresetId(nextModelPresetId);
      saveComfyTaskPreference(selectedComfyTask, {
          workflowId,
          modelPresetId: nextModelPresetId || undefined,
      });
  };

  const handleComfyModelPresetChange = (modelPresetId: string) => {
      setSelectedComfyModelPresetId(modelPresetId);
      saveComfyTaskPreference(selectedComfyTask, {
          workflowId: selectedComfyWorkflowId || undefined,
          modelPresetId,
      });
  };

  const captureComfySourceImage = useCallback((): string | null => {
      if (!canvas) {
          return null;
      }

      const originalVpt = canvas.viewportTransform;
      canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
      canvas.requestRenderAll();

      try {
          const activeObject = canvas.getActiveObject();
          if (activeObject) {
              const bounds = activeObject.getBoundingRect();
              return canvas.toDataURL({
                  format: 'png',
                  multiplier: 1,
                  left: Math.max(0, bounds.left),
                  top: Math.max(0, bounds.top),
                  width: Math.max(1, bounds.width),
                  height: Math.max(1, bounds.height),
              });
          }

          if (zoneObjectRef.current) {
              const zone = zoneObjectRef.current;
              return canvas.toDataURL({
                  format: 'png',
                  multiplier: 1,
                  left: Math.max(0, zone.left || 0),
                  top: Math.max(0, zone.top || 0),
                  width: Math.max(1, (zone.width || zoneWidth) * (zone.scaleX || 1)),
                  height: Math.max(1, (zone.height || zoneHeight) * (zone.scaleY || 1)),
              });
          }

          const extCanvas = canvas as CanvasWithArtboard;
          if (extCanvas.artboard) {
              return canvas.toDataURL({
                  format: 'png',
                  multiplier: 1,
                  left: 0,
                  top: 0,
                  width: Math.max(1, extCanvas.artboard.width),
                  height: Math.max(1, extCanvas.artboard.height),
              });
          }

          return canvas.toDataURL({ format: 'png', multiplier: 1 });
      } finally {
          if (originalVpt) {
              canvas.setViewportTransform(originalVpt);
              canvas.requestRenderAll();
          }
      }
  }, [canvas, zoneHeight, zoneWidth]);

  const handleVerifyComfyConnection = async () => {
      if (isCheckingComfyConnection) {
          return;
      }

      setIsCheckingComfyConnection(true);
      setComfyConnectionStatusMessage('Checking ComfyUI connection...');

      try {
          const verification = await verifyAvailableComfyConnection({
              mode: comfyConnectionMode,
              localUrl: comfyServerUrl,
              cloudUrl: comfyCloudUrl,
              cloudApiKey: comfyCloudApiKey,
          });

          setComfyConnectionStatusMessage(verification.message);
      } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to verify ComfyUI connection.';
          setComfyConnectionStatusMessage(message);
      } finally {
          setIsCheckingComfyConnection(false);
      }
  };
    
  /**
   * Retreives the API key for a specific provider from storage.
   */
  const getProviderKey = (provider: GenerativeProviderId) => {
      if (provider === 'comfy') return '';
      return localStorage.getItem(`${provider}_api_key`) || '';
  };

  const addAnnotationNote = () => {
      const noteId = `note_${Date.now()}`;
      applyAnnotationNotesUpdate((previous) => ([
        ...previous,
        {
            id: noteId,
            type: 'box',
            enabled: true,
            priority: previous.length + 1,
            geometry: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
            instruction: '',
            mode: 'auto',
            strength: 0.8,
        },
      ]));
      setSelectedAnnotationId(noteId);
  };

  const updateAnnotationBoxGeometry = (
      id: string,
      patch: Partial<{ x: number; y: number; w: number; h: number }>
  ) => {
      applyAnnotationNotesUpdate((previous) => previous.map((note) => {
          if (note.id !== id) {
              return note;
          }

          const current = readBoxGeometry(note.geometry);
          return {
              ...note,
              geometry: {
                  x: clamp01(typeof patch.x === 'number' ? patch.x : current.x),
                  y: clamp01(typeof patch.y === 'number' ? patch.y : current.y),
                  w: clamp01(typeof patch.w === 'number' ? patch.w : current.w),
                  h: clamp01(typeof patch.h === 'number' ? patch.h : current.h),
              },
          };
      }));
  };

  const updateAnnotationNote = (id: string, patch: Partial<AnnotationRecord>) => {
      applyAnnotationNotesUpdate((previous) => previous.map((note) => (
          note.id === id ? { ...note, ...patch } : note
      )));
  };

  const clearLastRemovedAnnotationTimeout = useCallback(() => {
      if (lastRemovedAnnotationTimeoutRef.current) {
          window.clearTimeout(lastRemovedAnnotationTimeoutRef.current);
          lastRemovedAnnotationTimeoutRef.current = null;
      }
  }, []);

  const openUndoWindow = useCallback((snapshot: RemovedAnnotationSnapshot) => {
      setLastRemovedAnnotation(snapshot);
      clearLastRemovedAnnotationTimeout();
      lastRemovedAnnotationTimeoutRef.current = window.setTimeout(() => {
          setLastRemovedAnnotation(null);
          lastRemovedAnnotationTimeoutRef.current = null;
      }, 10000);
  }, [clearLastRemovedAnnotationTimeout]);

  const removeAnnotationNote = (id: string) => {
      const targetLayerId = activeAnnotationLayerIdRef.current || selectedCanvasLayerId;
      const removeIndex = annotationNotes.findIndex((note) => note.id === id);
      const removedNote = removeIndex >= 0 ? annotationNotes[removeIndex] : null;

      applyAnnotationNotesUpdate((previous) => previous
          .filter((note) => note.id !== id)
          .map((note, index) => ({ ...note, priority: index + 1 })));
      setSelectedAnnotationId((previous) => (previous === id ? null : previous));

      if (removedNote && targetLayerId) {
          openUndoWindow({
              note: removedNote,
              index: removeIndex,
              layerId: targetLayerId,
          });
      }
  };

  const undoLastRemovedAnnotation = useCallback(() => {
      if (!lastRemovedAnnotation) {
          return;
      }

      const snapshot = lastRemovedAnnotation;
      clearLastRemovedAnnotationTimeout();

      setLayerAnnotationNotesMap((current) => {
          const currentLayerNotes = [...(current[snapshot.layerId] || [])];
          const safeInsertIndex = Math.max(0, Math.min(snapshot.index, currentLayerNotes.length));
          currentLayerNotes.splice(safeInsertIndex, 0, snapshot.note);
          const normalized = currentLayerNotes.map((note, index) => ({ ...note, priority: index + 1 }));
          return {
              ...current,
              [snapshot.layerId]: normalized,
          };
      });

      if ((activeAnnotationLayerIdRef.current || selectedCanvasLayerId) === snapshot.layerId) {
          setAnnotationNotes((previous) => {
              const next = [...previous];
              const safeInsertIndex = Math.max(0, Math.min(snapshot.index, next.length));
              next.splice(safeInsertIndex, 0, snapshot.note);
              return next.map((note, index) => ({ ...note, priority: index + 1 }));
          });
          setSelectedAnnotationId(snapshot.note.id);
      }

      setLastRemovedAnnotation(null);
      setStatusMessage('Note restored.');
  }, [clearLastRemovedAnnotationTimeout, lastRemovedAnnotation, selectedCanvasLayerId]);

  const moveAnnotationNote = (id: string, direction: 'up' | 'down') => {
      applyAnnotationNotesUpdate((previous) => {
          const currentIndex = previous.findIndex((note) => note.id === id);
          if (currentIndex < 0) return previous;
          const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
          if (targetIndex < 0 || targetIndex >= previous.length) return previous;
          const next = [...previous];
          const [current] = next.splice(currentIndex, 1);
          next.splice(targetIndex, 0, current);
          return next.map((note, index) => ({ ...note, priority: index + 1 }));
      });
  };

  const addReferenceSlot = () => {
      const referenceId = `ref_${Date.now()}`;
      setReferenceItems((previous) => ([
          ...previous,
          {
              id: referenceId,
              role: 'style',
              file: null,
              name: '',
          },
      ]));
  };

  const updateReferenceSlot = (id: string, patch: Partial<{ role: ReferenceRecord['role']; file: File | null; name: string }>) => {
      setReferenceItems((previous) => previous.map((reference) => (
          reference.id === id ? { ...reference, ...patch } : reference
      )));
  };

  const removeReferenceSlot = (id: string) => {
      setReferenceItems((previous) => previous.filter((reference) => reference.id !== id));
  };

  const ensureCanvasLayerId = useCallback((object: fabric.Object): string => {
      const existing = canvasLayerIdMapRef.current.get(object);
      if (existing) {
          return existing;
      }

      const created = `layer_${nextCanvasLayerIdRef.current++}`;
      canvasLayerIdMapRef.current.set(object, created);
      return created;
  }, []);

  const getCanvasLayerLabel = useCallback((object: fabric.Object, index: number): string => {
      const ext = object as fabric.Object & { name?: string; text?: string; aiReferenceLayer?: boolean };
      const typeLabel = object.type || 'object';
      const refSuffix = ext.aiReferenceLayer ? ' [REF]' : '';
      if (typeof ext.name === 'string' && ext.name.trim().length > 0) {
          return `${index + 1}. ${ext.name.trim()} (${typeLabel})${refSuffix}`;
      }
      if (typeof ext.text === 'string' && ext.text.trim().length > 0) {
          const summary = ext.text.trim().slice(0, 24);
          return `${index + 1}. "${summary}${ext.text.trim().length > 24 ? '…' : ''}" (${typeLabel})${refSuffix}`;
      }
      return `${index + 1}. ${typeLabel}${refSuffix}`;
  }, []);

  const getCanvasLayerObjectById = useCallback((layerId: string): fabric.Object | null => {
      if (!canvas || !layerId) {
          return null;
      }

      const objects = canvas.getObjects();
      return objects.find((object) => ensureCanvasLayerId(object) === layerId) || null;
  }, [canvas, ensureCanvasLayerId]);

  const refreshCanvasLayerOptions = useCallback(() => {
      if (!canvas) {
          setCanvasLayerOptions([]);
          setSelectedCanvasLayerId('');
          return;
      }

      const objects = canvas.getObjects();
      const options = [...objects]
          .reverse()
          .map((object, index) => ({
              id: ensureCanvasLayerId(object),
              label: getCanvasLayerLabel(object, index),
          }));

      setCanvasLayerOptions(options);
      setSelectedCanvasLayerId((previous) => {
          if (previous && options.some((option) => option.id === previous)) {
              return previous;
          }
          return options[0]?.id || '';
      });
  }, [canvas, ensureCanvasLayerId, getCanvasLayerLabel]);

  const captureCanvasLayerDataUrl = useCallback((targetLayerId: string): string | null => {
      if (!canvas || !targetLayerId) {
          return null;
      }

      const objects = canvas.getObjects();
      const targetObject = getCanvasLayerObjectById(targetLayerId);
      if (!targetObject) {
          return null;
      }

      const originalVpt = canvas.viewportTransform;
      const originalVisibility = objects.map((object) => object.visible);
      canvas.viewportTransform = [1, 0, 0, 1, 0, 0];

      try {
          objects.forEach((object) => {
              object.visible = object === targetObject;
          });
          canvas.renderAll();

          const bounds = targetObject.getBoundingRect();
          return canvas.toDataURL({
              format: 'png',
              multiplier: 1,
              left: Math.max(0, bounds.left),
              top: Math.max(0, bounds.top),
              width: Math.max(1, bounds.width),
              height: Math.max(1, bounds.height),
          });
      } finally {
          objects.forEach((object, index) => {
              object.visible = originalVisibility[index];
          });
          if (originalVpt) {
              canvas.setViewportTransform(originalVpt);
          }
          canvas.renderAll();
      }
  }, [canvas, getCanvasLayerObjectById]);

  const markLayerAsReference = useCallback((layerId: string, isReference = true) => {
      const targetObject = getCanvasLayerObjectById(layerId) as ExtendedFabricObject | null;
      if (!targetObject) {
          return;
      }

      targetObject.aiReferenceLayer = isReference;
      canvas?.requestRenderAll();
      refreshCanvasLayerOptions();
  }, [canvas, getCanvasLayerObjectById, refreshCanvasLayerOptions]);

  const addSelectedCanvasLayerAsReference = useCallback(async () => {
      const dataUrl = captureCanvasLayerDataUrl(selectedCanvasLayerId);
      if (!dataUrl) {
          setStatusMessage('Unable to capture selected layer as reference.');
          return;
      }

      const selectedOption = canvasLayerOptions.find((option) => option.id === selectedCanvasLayerId);
      const label = selectedOption?.label || 'Canvas layer';
      const file = await dataUrlToFile(dataUrl, `${selectedCanvasLayerId}.png`);
      setReferenceItems((previous) => {
          const existingIndex = previous.findIndex((reference) => reference.sourceLayerId === selectedCanvasLayerId);
          if (existingIndex >= 0) {
              const next = [...previous];
              const existing = next[existingIndex];
              next[existingIndex] = {
                  ...existing,
                  file,
                  name: `${label}.png`,
              };
              return next;
          }

          return [
              ...previous,
              {
                  id: `ref_${Date.now()}`,
                  role: 'style',
                  file,
                  name: `${label}.png`,
                  sourceLayerId: selectedCanvasLayerId,
              },
          ];
      });
      markLayerAsReference(selectedCanvasLayerId, true);
      setStatusMessage(`Added layer reference: ${label}`);
  }, [captureCanvasLayerDataUrl, canvasLayerOptions, selectedCanvasLayerId, markLayerAsReference]);

  const useSelectedLayerForNotes = useCallback(async () => {
      const dataUrl = captureCanvasLayerDataUrl(selectedCanvasLayerId);
      if (!dataUrl) {
          setStatusMessage('Unable to load selected layer for notes.');
          return;
      }

      const dimensions = await readImageDimensions(dataUrl);
      setAnnotationBaseImage(dataUrl);
      setAnnotationBaseDimensions(dimensions);
      activeAnnotationLayerIdRef.current = selectedCanvasLayerId;
      setAnnotationNotes(layerAnnotationNotesMap[selectedCanvasLayerId] || []);
      setSelectedAnnotationId(null);
      setStatusMessage('Notes are now scoped to the selected layer.');
  }, [captureCanvasLayerDataUrl, selectedCanvasLayerId, layerAnnotationNotesMap]);

  const createReferenceLayerForNotes = useCallback(async () => {
      if (!selectedCanvasLayerId) {
          setStatusMessage('Select a layer first.');
          return;
      }

      await addSelectedCanvasLayerAsReference();
      await useSelectedLayerForNotes();
      setIsPointNoteMode(true);
      setSelectedAnnotationId(null);
      setStatusMessage('Reference layer ready. Click on the image to place point notes with text.');
  }, [addSelectedCanvasLayerAsReference, selectedCanvasLayerId, useSelectedLayerForNotes]);

  const saveReferenceNotesLayerToCanvas = useCallback(async () => {
      if (!canvas) {
          setStatusMessage('Canvas is not available.');
          return;
      }

      if (!annotationBaseImage || !annotationBaseDimensions) {
          setStatusMessage('Load or create a reference layer first.');
          return;
      }

      const activeLayerId = activeAnnotationLayerIdRef.current || selectedCanvasLayerId;
      if (!activeLayerId) {
          setStatusMessage('Select a source layer before saving reference notes.');
          return;
      }

      const effectiveNotes = (layerAnnotationNotesMap[activeLayerId] || annotationNotes)
          .filter((note) => note.enabled)
          .map((note, index) => ({ ...note, priority: index + 1 }));

      if (effectiveNotes.length === 0) {
          setStatusMessage('Add at least one note before saving the reference notes layer.');
          return;
      }

      const flattenedDataUrl = await buildAnnotatedReferenceLayerDataUrl(
          annotationBaseImage,
          effectiveNotes,
          annotationBaseDimensions.width,
          annotationBaseDimensions.height
      );

      const planDocument: AnnotationDocument = {
          image: {
              id: `img_ref_${Date.now()}`,
              width: annotationBaseDimensions.width,
              height: annotationBaseDimensions.height,
          },
          annotations: effectiveNotes,
          globalPrompt: {
              positive: prompt,
              negative: globalNegativePrompt,
          },
          references: [],
          provider: {
              name: mapGenerativeProviderToAgenticProvider(selectedProvider),
              model: 'embedded-ref-layer',
              params: {},
          },
      };

      const compiledPrompts = compileAnnotationPrompts(planDocument);
    const sourceLayer = getCanvasLayerObjectById(activeLayerId) as ExtendedFabricObject | null;
    const selectedLayerOption = canvasLayerOptions.find((layer) => layer.id === activeLayerId);
    const sourceLabel = selectedLayerOption?.label || sourceLayer?.name || activeLayerId;

      const imageObject = await fabric.Image.fromURL(flattenedDataUrl, { crossOrigin: 'anonymous' });
      const ext = imageObject as ExtendedFabricObject;
      ext.name = `Ref Notes • ${sourceLabel}`;
      ext.aiReferenceLayer = true;
      ext.aiGenerated = true;
      ext.aiProvider = 'agentic-edit';
      ext.aiEditPlanData = {
          createdAt: new Date().toISOString(),
          sourceLayerId: activeLayerId,
          sourceLayerLabel: sourceLabel,
          globalPrompt: {
              positive: prompt,
              negative: globalNegativePrompt,
          },
          compiledPrompts,
          annotations: effectiveNotes.map((note) => ({
              id: note.id,
              type: note.type,
              instruction: note.instruction,
              mode: note.mode,
              strength: note.strength,
              geometry: note.geometry,
          })),
      };

      if (sourceLayer) {
          const bounds = sourceLayer.getBoundingRect();
          imageObject.set({
              left: bounds.left,
              top: bounds.top,
              scaleX: Math.max(0.001, bounds.width / Math.max(1, imageObject.width || 1)),
              scaleY: Math.max(0.001, bounds.height / Math.max(1, imageObject.height || 1)),
          });
      } else {
          canvas.centerObject(imageObject);
      }

      canvas.add(imageObject);
      canvas.setActiveObject(imageObject);

      const savedLayerId = ensureCanvasLayerId(imageObject);
      setSelectedCanvasLayerId(savedLayerId);
      setLayerAnnotationNotesMap((current) => ({
          ...current,
          [savedLayerId]: effectiveNotes,
      }));

      canvas.requestRenderAll();
      refreshCanvasLayerOptions();
      setStatusMessage('Saved notes as embedded reference layer on canvas. You can now send this layer through ComfyUI.');
  }, [
      annotationBaseDimensions,
      annotationBaseImage,
      annotationNotes,
      canvas,
      ensureCanvasLayerId,
      getCanvasLayerObjectById,
      globalNegativePrompt,
      layerAnnotationNotesMap,
      prompt,
      refreshCanvasLayerOptions,
      selectedCanvasLayerId,
      canvasLayerOptions,
      selectedProvider,
  ]);

  const applyAnnotationNotesUpdate = useCallback((updater: (previous: AnnotationRecord[]) => AnnotationRecord[]) => {
      setAnnotationNotes((previous) => {
          const next = updater(previous);
          const targetLayerId = activeAnnotationLayerIdRef.current || selectedCanvasLayerId;
          if (targetLayerId) {
              setLayerAnnotationNotesMap((current) => ({
                  ...current,
                  [targetLayerId]: next,
              }));
          }
          return next;
      });
  }, [selectedCanvasLayerId]);

  const addPointNoteAt = useCallback((x: number, y: number) => {
      const noteId = `note_${Date.now()}`;
      const safeX = clamp01(x);
      const safeY = clamp01(y);

      applyAnnotationNotesUpdate((previous) => ([
          ...previous,
          {
              id: noteId,
              type: 'point',
              enabled: true,
              priority: previous.length + 1,
              geometry: { x: safeX, y: safeY },
              instruction: '',
              mode: 'auto',
              strength: 0.8,
          },
      ]));

      setSelectedAnnotationId(noteId);
  }, [applyAnnotationNotesUpdate]);

  const loadAnnotationBaseFromCanvas = useCallback(async () => {
      const sourceImage = captureComfySourceImage();
      if (!sourceImage) {
          setStatusMessage('Select an image or zone on the canvas to start AI Edit annotation.');
          return;
      }

      const dimensions = await readImageDimensions(sourceImage);
      setAnnotationBaseImage(sourceImage);
      setAnnotationBaseDimensions(dimensions);
      setStatusMessage('Annotation layer loaded. Draw directly on the image with your selected note.');
  }, [captureComfySourceImage]);

  const getPointerNormalized = (event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
      const canvasElement = annotationCanvasRef.current;
      if (!canvasElement) {
          return null;
      }

      const bounds = canvasElement.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
          return null;
      }

      return {
          x: clamp01((event.clientX - bounds.left) / bounds.width),
          y: clamp01((event.clientY - bounds.top) / bounds.height),
      };
  };

  const handleAnnotationPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.button === 2) {
          return;
      }

      const point = getPointerNormalized(event);
      if (!point) {
          return;
      }

      if (isPointNoteMode) {
          addPointNoteAt(point.x, point.y);
          return;
      }

      if (!selectedAnnotationId) {
          return;
      }

      const note = annotationNotes.find((item) => item.id === selectedAnnotationId);
      if (!note) {
          return;
      }

      if (note.type === 'point') {
          updateAnnotationNote(note.id, { geometry: { x: point.x, y: point.y } });
          return;
      }

      if (note.type === 'brush') {
          annotationPointerStateRef.current = {
              noteId: note.id,
              type: note.type,
              start: point,
              points: [point],
              drawing: true,
          };
          updateAnnotationNote(note.id, {
              geometry: {
                  boundingBox: { x: point.x, y: point.y, w: 0.001, h: 0.001 },
                  strokes: [{ points: [point], size: 0.015 }],
              },
          });
          return;
      }

      annotationPointerStateRef.current = {
          noteId: note.id,
          type: note.type,
          start: point,
          points: [point],
          drawing: true,
      };

      updateAnnotationNote(note.id, {
          geometry: {
              x: point.x,
              y: point.y,
              w: 0.001,
              h: 0.001,
          },
      });
  };

  const handleAnnotationPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
      const pointerState = annotationPointerStateRef.current;
      if (!pointerState || !pointerState.drawing) {
          return;
      }

      const point = getPointerNormalized(event);
      if (!point) {
          return;
      }

      if (pointerState.type === 'brush') {
          const allPoints = [...pointerState.points, point];
          pointerState.points = allPoints;

          const xs = allPoints.map((item) => item.x);
          const ys = allPoints.map((item) => item.y);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const maxX = Math.max(...xs);
          const maxY = Math.max(...ys);

          updateAnnotationNote(pointerState.noteId, {
              geometry: {
                  boundingBox: {
                      x: clamp01(minX),
                      y: clamp01(minY),
                      w: clamp01(maxX - minX),
                      h: clamp01(maxY - minY),
                  },
                  strokes: [{ points: allPoints, size: 0.015 }],
              },
          });
          return;
      }

      const start = pointerState.start;
      const x = Math.min(start.x, point.x);
      const y = Math.min(start.y, point.y);
      const w = Math.max(0.001, Math.abs(point.x - start.x));
      const h = Math.max(0.001, Math.abs(point.y - start.y));

      updateAnnotationNote(pointerState.noteId, {
          geometry: { x, y, w, h },
      });
  };

  const handleAnnotationPointerUp = () => {
      annotationPointerStateRef.current = null;
  };

  const findNearestPointNote = useCallback((x: number, y: number): AnnotationRecord | null => {
      let nearest: AnnotationRecord | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (const note of annotationNotes) {
          if (!note.enabled || note.type !== 'point') {
              continue;
          }

          const point = note.geometry as { x: number; y: number };
          const dx = clamp01(point.x) - clamp01(x);
          const dy = clamp01(point.y) - clamp01(y);
          const distance = Math.sqrt((dx * dx) + (dy * dy));
          if (distance < nearestDistance) {
              nearestDistance = distance;
              nearest = note;
          }
      }

      if (!nearest || nearestDistance > 0.04) {
          return null;
      }

      return nearest;
  }, [annotationNotes]);

  const handleAnnotationContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const point = getPointerNormalized(event as unknown as React.PointerEvent<HTMLCanvasElement>);
      if (!point) {
          return;
      }

      const nearest = findNearestPointNote(point.x, point.y);
      if (!nearest) {
          setStatusMessage('No nearby point note to remove. Right-click directly on a point marker.');
          return;
      }

      removeAnnotationNote(nearest.id);
      setStatusMessage('Point note removed.');
  };

  const handleInlinePointNoteContextMenu = (event: React.MouseEvent, noteId: string) => {
      event.preventDefault();
      event.stopPropagation();
      removeAnnotationNote(noteId);
      setStatusMessage('Point note removed.');
  };

  useEffect(() => {
      if (!useAgenticEditNotes || !annotationBaseImage || !annotationBaseDimensions) {
          return;
      }

      const canvasElement = annotationCanvasRef.current;
      if (!canvasElement) {
          return;
      }

      const context = canvasElement.getContext('2d');
      if (!context) {
          return;
      }

      const image = new window.Image();
      image.onload = () => {
          const width = Math.max(1, Math.round(annotationBaseDimensions.width));
          const height = Math.max(1, Math.round(annotationBaseDimensions.height));

          canvasElement.width = width;
          canvasElement.height = height;
          context.clearRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);

          const orderedNotes = [...annotationNotes].sort((a, b) => a.priority - b.priority);
          orderedNotes.forEach((note, index) => {
              if (!note.enabled) {
                  return;
              }

              const isSelected = note.id === selectedAnnotationId;
              renderAnnotationShape(context, note, width, height, {
                  fillStyle: isSelected ? 'rgba(73, 134, 255, 0.28)' : 'rgba(255, 64, 64, 0.18)',
                  strokeStyle: isSelected ? 'rgba(73, 134, 255, 0.95)' : 'rgba(255, 64, 64, 0.95)',
                  lineWidth: isSelected ? 3 : 2,
              });

              const box = readBoxGeometry(note.geometry);
              context.fillStyle = 'rgba(255,255,255,0.95)';
              context.font = '12px sans-serif';
              context.fillText(`${index + 1}`, Math.max(8, Math.round(box.x * width) + 4), Math.max(14, Math.round(box.y * height) + 14));
          });
      };

      image.src = annotationBaseImage;
  }, [useAgenticEditNotes, annotationBaseImage, annotationBaseDimensions, annotationNotes, selectedAnnotationId]);

  useEffect(() => {
      if (!isOpen || !useAgenticEditNotes) {
          return;
      }

      refreshCanvasLayerOptions();
  }, [isOpen, useAgenticEditNotes, refreshCanvasLayerOptions]);

  useEffect(() => {
      if (!canvas) {
          return;
      }

      const referencedLayerIds = new Set(
          referenceItems
              .map((reference) => reference.sourceLayerId)
              .filter((layerId): layerId is string => typeof layerId === 'string' && layerId.length > 0)
      );

      let hasChanges = false;
      canvas.getObjects().forEach((object) => {
          const layerId = ensureCanvasLayerId(object);
          const ext = object as ExtendedFabricObject;
          const shouldBeReference = referencedLayerIds.has(layerId);
          if (Boolean(ext.aiReferenceLayer) !== shouldBeReference) {
              ext.aiReferenceLayer = shouldBeReference;
              hasChanges = true;
          }
      });

      if (hasChanges) {
          canvas.requestRenderAll();
          refreshCanvasLayerOptions();
      }
  }, [canvas, ensureCanvasLayerId, referenceItems, refreshCanvasLayerOptions]);

  useEffect(() => {
      if (!selectedCanvasLayerId) {
          return;
      }

      if (activeAnnotationLayerIdRef.current === selectedCanvasLayerId) {
          return;
      }

      activeAnnotationLayerIdRef.current = selectedCanvasLayerId;
      setAnnotationNotes(layerAnnotationNotesMap[selectedCanvasLayerId] || []);
      setSelectedAnnotationId(null);
  }, [selectedCanvasLayerId, layerAnnotationNotesMap]);

  useEffect(() => () => {
      if (lastRemovedAnnotationTimeoutRef.current) {
          window.clearTimeout(lastRemovedAnnotationTimeoutRef.current);
          lastRemovedAnnotationTimeoutRef.current = null;
      }
  }, []);

  useEscapeKey(onClose, { enabled: isOpen });

  useEffect(() => {
      if (!isOpen || isGenerating || hasAttemptedComfyRecoveryRef.current) {
          return;
      }

      const pending = readPendingComfyJob();
      if (!pending) {
          return;
      }

      hasAttemptedComfyRecoveryRef.current = true;
      setIsGenerating(true);
      setStatusMessage(`Resuming pending ComfyUI run (${pending.promptId.slice(0, 8)}...)`);

      void recoverComfyTaskByPromptId({
          promptId: pending.promptId,
          workflowId: pending.workflowId,
          connection: {
              mode: pending.connection.mode,
              localUrl: pending.connection.localUrl,
              cloudUrl: pending.connection.cloudUrl,
              cloudApiKey: pending.connection.cloudApiKey,
          },
          onProgress: (progress) => {
              if (progress.message && progress.message.trim().length > 0) {
                  setStatusMessage(`ComfyUI recovery: ${progress.message} • ${formatElapsedSeconds(progress.elapsedMs)}`);
                  return;
              }

              const percent = Math.max(0, Math.min(100, Math.round(progress.progress * 100)));
              setStatusMessage(`ComfyUI recovery running (${percent}%) • ${formatElapsedSeconds(progress.elapsedMs)}`);
          },
      }).then((result) => {
          if (result.dataUrl) {
              setGeneratedImage(result.dataUrl);
              setStatusMessage('Recovered pending ComfyUI result.');
              clearPendingComfyJob();
          } else {
              setStatusMessage('ComfyUI recovery finished, but no image output was found yet.');
          }
      }).catch((error) => {
          const message = error instanceof Error ? error.message : 'Failed to recover pending ComfyUI result.';
          setStatusMessage(`ComfyUI recovery pending: ${message}`);
      }).finally(() => {
          setIsGenerating(false);
      });
  }, [
      isOpen,
      isGenerating,
      readPendingComfyJob,
      clearPendingComfyJob,
  ]);

  // Initial Window Position
  useEffect(() => {
    if (typeof window !== 'undefined' && !hasMoved) {
       // Position next to the AI Zone icon (approx 5th item in toolbar)
       setPosition({ 
           x: 90, 
           y: 220 
       });
    }
  }, [hasMoved]); 

  // --- Zone Logic: Create/Destroy on Canvas ---
  useEffect(() => {
    if (!canvas) return;
    if (mode !== 'zone') {
        if (zoneObjectRef.current && canvas.contains(zoneObjectRef.current)) {
            canvas.remove(zoneObjectRef.current);
            canvas.requestRenderAll();
        }
        zoneObjectRef.current = null;
        return;
    }

    // Check if user already selected a rect to transform into a zone
    const activeObj = canvas.getActiveObject();
    
    if (activeObj && activeObj.type === 'rect') {
        // Use existing selection as zone
        setZoneWidth(activeObj.width! * activeObj.scaleX!);
        setZoneHeight(activeObj.height! * activeObj.scaleY!);
        zoneObjectRef.current = activeObj as fabric.Rect;
    } else {
        // Create new UI Zone indicator
        const zone = new fabric.Rect({
            left: 100,
            top: 100,
            width: 512,
            height: 512,
            fill: APP_THEME.zoneOverlayFill,
            stroke: APP_THEME.zoneStroke,
            strokeWidth: 2,
            strokeDashArray: [5, 5], // Dashed line
            transparentCorners: false,
            cornerColor: APP_THEME.zoneStroke,
            cornerStrokeColor: '#fff',
        });
        
        canvas.add(zone);
        canvas.setActiveObject(zone);
        zoneObjectRef.current = zone;
        
        // Listen for scaling to update dimensions state
        zone.on('scaling', () => {
             setZoneWidth(Math.round(zone.width! * zone.scaleX!));
             setZoneHeight(Math.round(zone.height! * zone.scaleY!));
        });
        
        canvas.requestRenderAll();
    }

    // Cleanup: Remove zone when modal closes
    return () => {
        if (zoneObjectRef.current && canvas.contains(zoneObjectRef.current)) {
            canvas.remove(zoneObjectRef.current);
            canvas.requestRenderAll();
        }
    };
  }, [canvas, mode]);

  // --- Draggable Window Handlers ---
  const handleMouseDown = (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('.no-drag')) return; // Prevent drag interaction on inputs
      setIsDragging(true);
      setHasMoved(true);
      dragStartPos.current = {
          x: e.clientX - position.x,
          y: e.clientY - position.y
      };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        
        // Compute new position based on delta
        const newX = e.clientX - dragStartPos.current.x;
        const newY = e.clientY - dragStartPos.current.y;
        
        setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    // Attach global listeners while dragging to catch mouse leaving the window
    if (isDragging) {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);


  // --- Helper Functions ---

  /**
   * Saves a generated image (URL or Data URI) to the persistent workspace assets.
   * Target folder: public/assets/generated/images
   */
  const saveToAssets = async (url: string) => {
    try {
        if (url.startsWith('data:')) {
            // Case: Base64 Data URI (e.g. from Stability API)
            const blob = await (await fetch(url)).blob();
            const file = new File([blob], `generated-${Date.now()}.png`, { type: 'image/png' });
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', 'images');
            formData.append('category', 'generated');
            formData.append('owner', owner);
            
            await fetch('/api/assets/upload', {
                method: 'POST',
                body: formData
            });
        } else {
            // Case: External URL (e.g. from ComfyUI or other Remote URL)
             await fetch('/api/assets/save-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: url,
                    filename: `generated-${Date.now()}.png`,
                    type: 'images',
                    category: 'generated',
                    owner
                })
            });
        }
    } catch (e) {
        console.error("Failed to auto-save asset", e);
    }
  };

  /**
   * Finalizes the generation process:
   * 1. Auto-saves the image
   * 2. Adds the image to the Fabric.js canvas
   * 3. Fits image to the "Magic Zone" if it exists, or centers it
   */
  const handleAddToCanvas = () => {
    if (!generatedImage || !canvas) {
        if (onGenerate && generatedImage) onGenerate(generatedImage);
        onClose();
        return;
    }

    // Auto-save generated image to assets history
    saveToAssets(generatedImage);

    fabric.Image.fromURL(generatedImage, { crossOrigin: 'anonymous' }).then((img) => {
        const ext = img as ExtendedFabricObject;
        ext.aiGenerated = true;
        ext.aiProvider = selectedProvider;
        if (!zoneObjectRef.current) {
             // Use Artboard dimensions if available
             const artboard = (canvas as CanvasWithArtboard).artboard || { width: canvas.width || 800, height: canvas.height || 600 };
             const targetWidth = artboard.width;
             const targetHeight = artboard.height;
             
             // Scale down if larger than 80% of canvas to ensure visibility
             if (img.width! > targetWidth * 0.8 || img.height! > targetHeight * 0.8) {
                 const scale = Math.min(
                     (targetWidth * 0.8) / img.width!,
                     (targetHeight * 0.8) / img.height!
                 );
                 img.scale(scale);
             }
             canvas.centerObject(img);
             canvas.add(img);
             canvas.setActiveObject(img);
        } else {
            // Fit to Zone
            const z = zoneObjectRef.current;
            img.set({
                left: z.left,
                top: z.top,
                scaleX: (z.width! * z.scaleX!) / img.width!,
                scaleY: (z.height! * z.scaleY!) / img.height!,
            });
            // Remove the zone indicator guide
            canvas.remove(z);
            // Replace with actual image
            canvas.add(img);
            canvas.setActiveObject(img);
        }
        canvas.requestRenderAll();
        onClose(); 
    }).catch(err => {
        console.error("Failed to load image to canvas", err);
        setStatusMessage("Failed to place image on canvas");
    });
  };

  const placeImageOnCanvas = () => {
    handleAddToCanvas();
  };

  /**
   * Main Generation Handler.
   * Routes request to appropriate provider (Comfy, Stability, etc).
   */
  const handleGenerate = async () => {
        await runSingleFlight(async () => {
            if (!prompt && !(selectedProvider === 'comfy' && selectedComfyTask === 'upscale')) return;

            setIsGenerating(true);
            setStatusMessage('Queueing generation...');
            setGeneratedImage(null);

            if (zoneObjectRef.current) {
                const z = zoneObjectRef.current;
                const w = Math.round(z.width! * z.scaleX!);
                const h = Math.round(z.height! * z.scaleY!);
                setZoneWidth(w);
                setZoneHeight(h);
            }

            const currentW = zoneObjectRef.current ? Math.round(zoneObjectRef.current.width! * zoneObjectRef.current.scaleX!) : zoneWidth;
            const currentH = zoneObjectRef.current ? Math.round(zoneObjectRef.current.height! * zoneObjectRef.current.scaleY!) : zoneHeight;

            try {
                if (selectedProvider === 'comfy') {
                    if (!selectedComfyWorkflowId) {
                        throw new Error('No ComfyUI workflow is selected.');
                    }

                    if (!selectedComfyModelPresetId) {
                        throw new Error('No ComfyUI model preset is selected.');
                    }

                    const params: Record<string, unknown> = {
                        prompt,
                        width: currentW,
                        height: currentH,
                    };

                    if (selectedComfyTask !== 'generate') {
                        const sourceImage = captureComfySourceImage();
                        if (!sourceImage) {
                            throw new Error('Select an image or zone on the canvas before running this ComfyUI task.');
                        }

                        const sourceDimensions = await readImageDimensions(sourceImage);
                        params.image = sourceImage;

                        if (selectedComfyTask === 'img2img') {
                            params.strength = 0.65;
                            params.width = sourceDimensions.width;
                            params.height = sourceDimensions.height;
                        }

                        if (selectedComfyTask === 'inpaint') {
                            params.mask = createSolidMaskDataUrl(sourceDimensions.width, sourceDimensions.height);
                            params.width = sourceDimensions.width;
                            params.height = sourceDimensions.height;
                        }

                        if (selectedComfyTask === 'outpaint') {
                            const outpaintPayload = await buildOutpaintPayload(sourceImage, 128);
                            params.image = outpaintPayload.imageDataUrl;
                            params.mask = outpaintPayload.maskDataUrl;
                            params.width = outpaintPayload.width;
                            params.height = outpaintPayload.height;
                        }

                        if (selectedComfyTask === 'upscale') {
                            params.width = Math.max(64, Math.round(sourceDimensions.width * 2));
                            params.height = Math.max(64, Math.round(sourceDimensions.height * 2));
                        }
                    }

                    setStatusMessage('Sending workflow to ComfyUI...');

                    let queuedPromptId: string | null = null;

                    const execution = await executeComfyTask({
                        connection: {
                            mode: comfyConnectionMode,
                            localUrl: comfyServerUrl,
                            cloudUrl: comfyCloudUrl,
                            cloudApiKey: comfyCloudApiKey,
                        },
                        task: selectedComfyTask,
                        workflowId: selectedComfyWorkflowId,
                        modelPresetId: selectedComfyModelPresetId,
                        params,
                        onQueued: (promptId) => {
                            queuedPromptId = promptId;
                            writePendingComfyJob({
                                promptId,
                                task: selectedComfyTask,
                                workflowId: selectedComfyWorkflowId,
                                modelPresetId: selectedComfyModelPresetId,
                                connection: {
                                    mode: comfyConnectionMode,
                                    localUrl: comfyServerUrl,
                                    cloudUrl: comfyCloudUrl,
                                    cloudApiKey: comfyCloudApiKey,
                                },
                                queuedAt: new Date().toISOString(),
                            });
                        },
                        onProgress: (progress) => {
                            if (progress.message && progress.message.trim().length > 0) {
                                setStatusMessage(`ComfyUI: ${progress.message} • ${formatElapsedSeconds(progress.elapsedMs)}`);
                                return;
                            }

                            if (progress.stage === 'waiting-history') {
                                setStatusMessage(`ComfyUI is still processing (loading models or running queue) • ${formatElapsedSeconds(progress.elapsedMs)}`);
                                return;
                            }

                            const percent = Math.max(0, Math.min(100, Math.round(progress.progress * 100)));
                            const nodeLabel = progress.nodeId ? `node ${progress.nodeId}` : 'current node';
                            setStatusMessage(`ComfyUI running: ${nodeLabel} (${percent}%) • ${formatElapsedSeconds(progress.elapsedMs)}`);
                        },
                    });

                    if (execution.result.dataUrl) {
                        setGeneratedImage(execution.result.dataUrl);
                        setStatusMessage(`Generation complete via ${execution.workflow.name}.`);
                        clearPendingComfyJob();
                    } else {
                        setStatusMessage('ComfyUI finished, but no image output was returned.');
                        if (queuedPromptId) {
                            setStatusMessage('ComfyUI finished without direct image response. You can reload; recovery will continue from history.');
                        }
                    }

                    setIsGenerating(false);
                    return;
                }

                const currentKey = getProviderKey(selectedProvider);

                if (useAgenticEditNotes) {
                    const resolvedAgenticProvider = mapGenerativeProviderToAgenticProvider(selectedProvider);
                    const sourceImage = captureComfySourceImage();
                    if (!sourceImage) {
                        throw new Error('Select an image or zone on the canvas before using AI Edit Notes.');
                    }

                    setStatusMessage('Preparing AI Edit Notes payload...');
                    const imageDimensions = await readImageDimensions(sourceImage);
                    const originalFile = await dataUrlToFile(sourceImage, `agentic-original-${Date.now()}.png`);

                    const activeLayerId = activeAnnotationLayerIdRef.current;
                    const scopedNotes = activeLayerId
                        ? (layerAnnotationNotesMap[activeLayerId] || annotationNotes)
                        : annotationNotes;

                    const nonEmptyNotes = scopedNotes
                        .filter((note) => note.enabled && note.instruction.trim().length > 0)
                        .map((note, index) => ({ ...note, priority: index + 1 }));

                    const fallbackNotes: AnnotationRecord[] = nonEmptyNotes.length > 0
                        ? nonEmptyNotes
                        : [{
                            id: `note_prompt_${Date.now()}`,
                            type: 'text',
                            enabled: true,
                            priority: 1,
                            geometry: { x: 0, y: 0, w: 1, h: 1 },
                            instruction: prompt,
                            mode: 'auto',
                            strength: 0.8,
                        }];

                    const referenceDocument = referenceItems
                        .filter((reference) => reference.file)
                        .map((reference) => ({ id: reference.id, role: reference.role }));

                    const annotationDocument: AnnotationDocument = {
                        image: {
                            id: `img_${Date.now()}`,
                            width: imageDimensions.width,
                            height: imageDimensions.height,
                        },
                        annotations: fallbackNotes,
                        globalPrompt: {
                            positive: prompt,
                            negative: globalNegativePrompt,
                        },
                        references: referenceDocument,
                        provider: {
                            name: resolvedAgenticProvider,
                            model: resolvedAgenticProvider === 'flux' ? 'flux-kontext' : resolvedAgenticProvider === 'nanobanana' ? 'nanobanana-v1' : 'mock-v1',
                            params: {},
                        },
                    };

                    const layerArtifacts = await buildAnnotationLayerArtifacts(
                        annotationDocument.annotations,
                        imageDimensions.width,
                        imageDimensions.height
                    );

                    const compiledPrompts = compileAnnotationPrompts(annotationDocument);
                    const formData = new FormData();
                    formData.append('original', originalFile);
                    formData.append('notes_overlay', layerArtifacts.notesOverlayFile);
                    formData.append('combined_mask', layerArtifacts.combinedMaskFile);
                    formData.append('annotations_json', JSON.stringify(annotationDocument));
                    formData.append('prompt_positive', compiledPrompts.positive);
                    formData.append('prompt_negative', compiledPrompts.negative);
                    formData.append('provider_name', annotationDocument.provider.name);
                    formData.append('provider_model', annotationDocument.provider.model);
                    formData.append('provider_params', JSON.stringify(annotationDocument.provider.params));

                    const referenceMeta: Array<{ id: string; role: string }> = [];
                    for (const reference of referenceItems) {
                        if (!reference.file) continue;
                        referenceMeta.push({ id: reference.id, role: reference.role });
                        formData.append('references[]', reference.file);
                    }
                    formData.append('references_meta', JSON.stringify(referenceMeta));

                    const queueResponse = await fetch('/api/generate', {
                        method: 'POST',
                        body: formData,
                    });

                    const queueData = await queueResponse.json();
                    if (!queueResponse.ok || !queueData.job_id) {
                        throw new Error(queueData.message || 'Failed to queue AI Edit Notes job.');
                    }

                    const jobId = queueData.job_id as string;
                    setStatusMessage(`Job queued (${jobId.slice(-8)}). Waiting for worker...`);

                    let completedResultUrl = '';
                    for (let attempt = 0; attempt < 120; attempt += 1) {
                        await wait(1500);

                        const statusResponse = await fetch(`/api/jobs/${jobId}`);
                        const statusData = await statusResponse.json();
                        if (!statusResponse.ok) {
                            throw new Error(statusData.message || 'Failed to poll job status.');
                        }

                        const percent = Math.max(0, Math.min(100, Math.round((statusData.progress || 0) * 100)));
                        setStatusMessage(`AI Edit Notes: ${statusData.message || statusData.status} (${percent}%)`);

                        if (statusData.status === 'failed') {
                            throw new Error(statusData.error || 'AI Edit Notes generation failed.');
                        }

                        if (statusData.status === 'succeeded') {
                            const resultResponse = await fetch(`/api/jobs/${jobId}/result`);
                            const resultData = await resultResponse.json();
                            if (!resultResponse.ok || !resultData.imageUrl) {
                                throw new Error(resultData.message || 'Job completed but result image is unavailable.');
                            }
                            completedResultUrl = resultData.imageUrl as string;
                            break;
                        }
                    }

                    if (!completedResultUrl) {
                        throw new Error('Timed out waiting for AI Edit Notes result.');
                    }

                    setGeneratedImage(completedResultUrl);
                    setStatusMessage('AI Edit Notes generation complete!');
                    setIsGenerating(false);
                    return;
                }

                const response = await fetch('/api/ai/generate-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt,
                        width: currentW,
                        height: currentH,
                        serverUrl: comfyServerUrl,
                        provider: 'remote',
                        specificProvider: selectedProvider,
                        apiKey: currentKey
                    }),
                });

                const data = await response.json();

                if (!data.success) {
                    throw new Error(data.message || 'Generation failed');
                }

                if (data.imageUrl) {
                    setGeneratedImage(data.imageUrl);
                    setStatusMessage('Generation complete!');
                } else {
                    setStatusMessage('Finished, but no image returned.');
                }

                setIsGenerating(false);
            } catch (error) {
                console.error(error);
                const message = error instanceof Error ? error.message : 'Unknown error';
                setStatusMessage(`Error: ${message}`);
                setIsGenerating(false);
            }
        });
  };

  const hasStabilityAccess = availableProviders.includes('stability');
  const selectedComfyWorkflow = selectedComfyWorkflowId
      ? comfyWorkflowRegistry.getWorkflow(selectedComfyWorkflowId)
      : null;
  const availableComfyModelPresets = selectedComfyWorkflow
      ? comfyWorkflowRegistry.getModelPresetsForWorkflow(selectedComfyWorkflow.id)
      : [];
  const selectedProviderOption = getGenerativeProviderOption(selectedProvider);
    const selectedProviderSupportedWorkflows = getSupportedWorkflowsForProvider(selectedProvider);
  const isSelectedProviderReady = isGenerativeProviderReady(selectedProvider);
  const isComfyConnectionConfigured = comfyConnectionMode === 'local'
      ? comfyServerUrl.trim().length > 0
      : comfyConnectionMode === 'cloud'
          ? comfyCloudUrl.trim().length > 0 && comfyCloudApiKey.trim().length > 0
          : comfyServerUrl.trim().length > 0 || (comfyCloudUrl.trim().length > 0 && comfyCloudApiKey.trim().length > 0);
  const canRunComfyGeneration = Boolean(selectedComfyWorkflow && selectedComfyModelPresetId && isComfyConnectionConfigured);
  const selectedProviderLabel = selectedProviderOption?.label || selectedProvider;
  const stabilityBadge = getGenerativeProviderOption('stability')?.label || 'Stability AI';
    const isStabilityProviderSelected = selectedProvider === 'stability';
    const hasAnnotationWorkspaceLoaded = Boolean(annotationBaseImage && annotationBaseDimensions);
    const hasCanvasLayerSelection = Boolean(selectedCanvasLayerId);
    const selectedCanvasLayerLabel = canvasLayerOptions.find((layer) => layer.id === selectedCanvasLayerId)?.label || '';
    const isAiNotesExpandedLayout = useAgenticEditNotes && !isStabilityProviderSelected;
    const annotationAspectRatio = annotationBaseDimensions
            ? `${Math.max(1, Math.round(annotationBaseDimensions.width))} / ${Math.max(1, Math.round(annotationBaseDimensions.height))}`
            : '1 / 1';

  if (!isOpen) return null;

  return (
        <div 
            className={`fixed z-[100] bg-card border border-border shadow-2xl rounded-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 ${isAiNotesExpandedLayout ? 'w-[980px] max-w-[95vw]' : 'w-[350px]'}`}
      style={{
          left: position.x,
          top: position.y
      }}
    >
      {/* 
        Modal Header - Draggable Handle 
      */}
        <div 
        className="h-10 bg-secondary/50 border-b flex items-center justify-between px-3 cursor-move select-none"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
           <Wand2 size={16} className="text-primary"/>
           Generative
        </div>
        <button onClick={onClose} className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors no-drag">
           <X size={16} />
        </button>
      </div>
      
    <div className={`p-4 bg-background overflow-y-auto no-drag ${isAiNotesExpandedLayout ? 'max-h-[85vh]' : 'max-h-[70vh]'}`}>
        <div className="space-y-3">
            <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">AI Provider</label>
                <select
                    className="w-full text-xs p-2 rounded-md border bg-background"
                    value={selectedProvider}
                    onChange={handleProviderChange}
                >
                    {availableProviders.map((provider) => (
                        <option className="bg-zinc-950 text-white" key={provider} value={provider}>
                            {`${GENERATIVE_PROVIDER_OPTIONS.find((item) => item.id === provider)?.label || provider}${isGenerativeProviderReady(provider) ? '' : ' (Coming soon)'}`}
                        </option>
                    ))}
                </select>
            </div>

            <div className="text-[10px] text-muted-foreground border border-border/60 rounded-md px-2 py-1 bg-background/60">
                Requests route to <span className="font-semibold text-foreground">{selectedProviderLabel}</span>. Supported workflows: {selectedProviderSupportedWorkflows.join(', ')}.
            </div>
        </div>

        {isStabilityProviderSelected ? (
             /* Stability AI Specific UI */
             hasStabilityAccess ? (
                 <StabilityGenerator 
                     isOpen={true}
                     onClose={onClose}
                     canvas={canvas || null}
                     apiKey={apiKey || getProviderKey('stability')}
                     embedded={true} 
                     onAssetSave={saveToAssets}
                     initialTab={initialStabilityTab}
                     autoStartInpaintMasking={autoStartInpaintMasking}
                     showInpaintQuickDock={showInpaintPromptDock}
                     providerLabel={stabilityBadge}
                 />
             ) : (
                 <div className="text-xs border border-amber-500/30 bg-amber-500/10 rounded-lg p-3 text-amber-700 dark:text-amber-300">
                     Add a Stability API key in Settings to use Generative Fill and inpaint workflows.
                 </div>
             )
        ) : (
        <>
            {/* 
              Generic / ComfyUI Zone Content 
              Renders controls for dimensions based on canvas selection
            */}
            <div className="space-y-4">
               {/* Controls */}
               <div className="space-y-2">
                 <label className="text-xs font-medium text-muted-foreground flex justify-between">
                    Prompt
                    <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-foreground">{zoneWidth}x{zoneHeight}</span>
                 </label>
                 <textarea 
                    className="w-full text-sm p-3 rounded-lg border bg-background focus:ring-2 focus:ring-primary/20 min-h-[80px] resize-none transition-all placeholder:text-muted-foreground/50"
                    placeholder="Describe what you want to appear in the zone..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                 />
               </div>

               <div className="space-y-2 rounded-md border border-border/70 bg-secondary/20 p-2">
                   <label className="flex items-center justify-between text-[11px] font-medium text-foreground/80">
                       <span>AI Edit Notes (beta)</span>
                       <input
                           type="checkbox"
                           checked={useAgenticEditNotes}
                           onChange={(event) => setUseAgenticEditNotes(event.target.checked)}
                       />
                   </label>

                   {!useAgenticEditNotes && (
                       <div className="rounded border border-border/60 bg-background/50 px-2 py-1 text-[10px] text-muted-foreground">
                           Turn on <span className="font-medium text-foreground">AI Edit Notes</span> to access the <span className="font-medium text-foreground">Create Reference Layer</span> action from selected canvas layer.
                       </div>
                   )}

                   {useAgenticEditNotes && (
                       <div className="space-y-2">
                           <div className="space-y-1">
                               <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Routed Agentic Provider</label>
                               <div className="w-full text-xs p-2 rounded-md border bg-background text-muted-foreground">
                                   {mapGenerativeProviderToAgenticProvider(selectedProvider)} (derived from AI Provider)
                               </div>
                           </div>

                           <div className="space-y-1">
                               <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Global Negative Prompt</label>
                               <input
                                   className="w-full text-xs p-2 rounded-md border bg-background"
                                   value={globalNegativePrompt}
                                   onChange={(event) => setGlobalNegativePrompt(event.target.value)}
                                   placeholder="Optional negatives"
                               />
                           </div>

                           <div className="space-y-1 rounded border border-border/60 bg-background/50 p-2">
                               <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Step 1 · Create Reference Layer</label>
                               <div className="text-[10px] text-muted-foreground">Selected layer: {selectedCanvasLayerLabel || 'None selected'}</div>
                               <div className="grid grid-cols-[1fr,auto] gap-1">
                                   <select
                                       className="w-full rounded border bg-background p-1 text-[10px]"
                                       value={selectedCanvasLayerId}
                                       onChange={(event) => setSelectedCanvasLayerId(event.target.value)}
                                   >
                                       {canvasLayerOptions.length === 0 ? (
                                           <option value="">No canvas layers detected</option>
                                       ) : (
                                           canvasLayerOptions.map((layer) => (
                                               <option key={layer.id} value={layer.id}>{layer.label}</option>
                                           ))
                                       )}
                                   </select>
                                   <button
                                       type="button"
                                       disabled={canvasLayerOptions.length === 0 || !hasCanvasLayerSelection}
                                       onClick={() => {
                                           void createReferenceLayerForNotes();
                                       }}
                                       className="rounded border border-border px-2 py-1 text-[10px] disabled:cursor-not-allowed disabled:opacity-60"
                                   >
                                       Make Reference Layer
                                   </button>
                               </div>
                               {!hasCanvasLayerSelection && (
                                   <div className="text-[10px] text-muted-foreground">Pick a layer first, then click <span className="font-medium text-foreground">Make Reference Layer</span>.</div>
                               )}
                           </div>

                           <div className="space-y-1">
                               <div className="flex items-center justify-between">
                                   <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Step 2 · Notes Workspace</label>
                                   <button
                                       type="button"
                                       onClick={() => {
                                           void loadAnnotationBaseFromCanvas();
                                       }}
                                       className="rounded border border-border px-2 py-1 text-[10px] hover:bg-background"
                                   >
                                       Load From Canvas
                                   </button>
                               </div>
                               <div className="rounded border border-border/60 bg-background/50 px-2 py-1 text-[10px] text-muted-foreground">
                                   Large workspace for notes: left click to add/move notes, right click on a point note to remove it.
                               </div>
                               <div className="rounded border border-border/60 bg-background/40 p-2 min-h-[460px]">
                                   {annotationBaseImage ? (
                                       <div className="relative w-full min-h-[440px]">
                                           <canvas
                                               ref={annotationCanvasRef}
                                               className="w-full max-h-[72vh] rounded border border-border/40 bg-black/10 touch-none"
                                               style={{ aspectRatio: annotationAspectRatio }}
                                               onPointerDown={handleAnnotationPointerDown}
                                               onPointerMove={handleAnnotationPointerMove}
                                               onPointerUp={handleAnnotationPointerUp}
                                               onPointerLeave={handleAnnotationPointerUp}
                                               onContextMenu={handleAnnotationContextMenu}
                                           />
                                           {annotationNotes
                                               .filter((note) => note.enabled && note.type === 'point')
                                               .map((note) => {
                                                   const point = note.geometry as { x: number; y: number };
                                                   const left = `${clamp01(point.x) * 100}%`;
                                                   const top = `${clamp01(point.y) * 100}%`;
                                                   return (
                                                       <div
                                                           key={`inline_${note.id}`}
                                                           className="absolute z-10"
                                                           style={{
                                                               left,
                                                               top,
                                                               transform: 'translate(10px, -12px)',
                                                           }}
                                                           onContextMenu={(event) => handleInlinePointNoteContextMenu(event, note.id)}
                                                       >
                                                           <input
                                                               className="w-40 rounded border border-border/80 bg-background/95 px-1.5 py-1 text-[10px]"
                                                               value={note.instruction}
                                                               onChange={(event) => updateAnnotationNote(note.id, { instruction: event.target.value })}
                                                               onPointerDown={(event) => event.stopPropagation()}
                                                               onContextMenu={(event) => handleInlinePointNoteContextMenu(event, note.id)}
                                                               placeholder="Point note text"
                                                           />
                                                       </div>
                                                   );
                                               })}
                                       </div>
                                   ) : (
                                       <div className="text-[10px] text-muted-foreground">
                                           Load image from current canvas selection/zone, then draw notes directly here.
                                       </div>
                                   )}
                               </div>
                           </div>

                           <div className="space-y-1">
                               <div className="flex items-center justify-between">
                                   <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Step 3 · Note Tools</label>
                                   <div className="flex items-center gap-1">
                                       <button
                                           type="button"
                                           disabled={!hasAnnotationWorkspaceLoaded}
                                           onClick={() => setIsPointNoteMode((previous) => !previous)}
                                           className={`rounded border border-border px-2 py-1 text-[10px] disabled:cursor-not-allowed disabled:opacity-60 ${isPointNoteMode ? 'bg-primary/20 text-primary' : 'hover:bg-background'}`}
                                       >
                                           Pointer Notes: {isPointNoteMode ? 'On' : 'Off'}
                                       </button>
                                       <button
                                           type="button"
                                           onClick={addAnnotationNote}
                                           className="rounded border border-border px-2 py-1 text-[10px] hover:bg-background"
                                       >
                                           Add Manual Note
                                       </button>
                                   </div>
                               </div>

                               <button
                                   type="button"
                                   disabled={!hasAnnotationWorkspaceLoaded || annotationNotes.filter((note) => note.enabled).length === 0}
                                   onClick={() => {
                                       void saveReferenceNotesLayerToCanvas();
                                   }}
                                   className="w-full rounded border border-border px-2 py-1.5 text-[10px] font-medium hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                               >
                                   Step 4 · Save Ref Notes Layer to Canvas (embedded notes + metadata)
                               </button>
                               <div className="rounded border border-border/60 bg-background/50 px-2 py-1 text-[10px] text-muted-foreground">
                                   Saves a flattened reference-note layer directly on canvas and stores instruction data for forwarding into ComfyUI workflows.
                               </div>

                               {annotationNotes.length === 0 && (
                                   <div className="text-[10px] text-muted-foreground">No notes added. Prompt text will be used as fallback.</div>
                               )}

                               {annotationNotes.map((note, index) => (
                                   <div
                                       key={note.id}
                                       className={`space-y-1 rounded border bg-background/50 p-2 ${selectedAnnotationId === note.id ? 'border-primary/70 ring-1 ring-primary/40' : 'border-border/60'}`}
                                       onClick={() => setSelectedAnnotationId(note.id)}
                                   >
                                       <div className="grid grid-cols-3 gap-1">
                                           <select
                                               className="rounded border bg-background p-1 text-[10px]"
                                               value={note.type}
                                               onChange={(event) => {
                                                   const nextType = event.target.value as AnnotationRecord['type'];
                                                   const nextGeometry = nextType === 'point'
                                                       ? { x: 0.5, y: 0.5 }
                                                       : { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
                                                   if (nextType !== 'point' && isPointNoteMode) {
                                                       setIsPointNoteMode(false);
                                                   }
                                                   updateAnnotationNote(note.id, {
                                                       type: nextType,
                                                       geometry: nextGeometry,
                                                   });
                                               }}
                                           >
                                               <option value="box">Box</option>
                                               <option value="point">Point</option>
                                               <option value="polygon">Polygon</option>
                                               <option value="brush">Brush</option>
                                               <option value="pose">Pose</option>
                                               <option value="text">Text</option>
                                           </select>

                                           <select
                                               className="rounded border bg-background p-1 text-[10px]"
                                               value={note.mode || 'auto'}
                                               onChange={(event) => updateAnnotationNote(note.id, { mode: event.target.value as AnnotationRecord['mode'] })}
                                           >
                                               <option value="auto">Auto</option>
                                               <option value="inpaint">Inpaint</option>
                                               <option value="replace">Replace</option>
                                               <option value="style">Style</option>
                                               <option value="pose">Pose</option>
                                               <option value="text">Text</option>
                                           </select>

                                           <input
                                               type="number"
                                               min={0}
                                               max={1}
                                               step={0.05}
                                               className="rounded border bg-background p-1 text-[10px]"
                                               value={typeof note.strength === 'number' ? note.strength : 0.8}
                                               onChange={(event) => {
                                                   const nextStrength = Number(event.target.value);
                                                   updateAnnotationNote(note.id, { strength: Number.isFinite(nextStrength) ? clamp01(nextStrength) : 0.8 });
                                               }}
                                               title="Strength"
                                           />
                                       </div>

                                       {(note.type === 'point' || note.type === 'box' || note.type === 'text') && (
                                           <div className="grid grid-cols-4 gap-1">
                                               <input
                                                   type="number"
                                                   min={0}
                                                   max={1}
                                                   step={0.01}
                                                   className="rounded border bg-background p-1 text-[10px]"
                                                   value={readBoxGeometry(note.geometry).x}
                                                   onChange={(event) => updateAnnotationBoxGeometry(note.id, { x: Number(event.target.value) })}
                                                   title="x"
                                               />
                                               <input
                                                   type="number"
                                                   min={0}
                                                   max={1}
                                                   step={0.01}
                                                   className="rounded border bg-background p-1 text-[10px]"
                                                   value={readBoxGeometry(note.geometry).y}
                                                   onChange={(event) => updateAnnotationBoxGeometry(note.id, { y: Number(event.target.value) })}
                                                   title="y"
                                               />
                                               <input
                                                   type="number"
                                                   min={0}
                                                   max={1}
                                                   step={0.01}
                                                   className="rounded border bg-background p-1 text-[10px]"
                                                   value={readBoxGeometry(note.geometry).w}
                                                   onChange={(event) => updateAnnotationBoxGeometry(note.id, { w: Number(event.target.value) })}
                                                   title="w"
                                               />
                                               <input
                                                   type="number"
                                                   min={0}
                                                   max={1}
                                                   step={0.01}
                                                   className="rounded border bg-background p-1 text-[10px]"
                                                   value={readBoxGeometry(note.geometry).h}
                                                   onChange={(event) => updateAnnotationBoxGeometry(note.id, { h: Number(event.target.value) })}
                                                   title="h"
                                               />
                                           </div>
                                       )}

                                       <textarea
                                           className="w-full min-h-[56px] resize-none rounded border bg-background p-2 text-xs"
                                           value={note.instruction}
                                           onChange={(event) => updateAnnotationNote(note.id, { instruction: event.target.value })}
                                           placeholder={`Edit note ${index + 1}`}
                                       />
                                       <div className="flex items-center justify-between gap-1">
                                           <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                               <input
                                                   type="checkbox"
                                                   checked={note.enabled}
                                                   onChange={(event) => updateAnnotationNote(note.id, { enabled: event.target.checked })}
                                               />
                                               Enabled
                                           </label>
                                           <div className="flex items-center gap-1">
                                               <button type="button" onClick={() => moveAnnotationNote(note.id, 'up')} className="rounded border border-border px-2 py-0.5 text-[10px]">↑</button>
                                               <button type="button" onClick={() => moveAnnotationNote(note.id, 'down')} className="rounded border border-border px-2 py-0.5 text-[10px]">↓</button>
                                               <button type="button" onClick={() => removeAnnotationNote(note.id)} className="rounded border border-border px-2 py-0.5 text-[10px]">Remove</button>
                                           </div>
                                       </div>
                                   </div>
                               ))}
                           </div>

                           <div className="space-y-1">
                               <div className="flex items-center justify-between">
                                   <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Reference Files (Optional)</label>
                                   <div className="flex items-center gap-1">
                                       <button
                                           type="button"
                                           onClick={refreshCanvasLayerOptions}
                                           className="rounded border border-border px-2 py-1 text-[10px] hover:bg-background"
                                       >
                                           Refresh Layers
                                       </button>
                                       <button
                                           type="button"
                                           onClick={addReferenceSlot}
                                           className="rounded border border-border px-2 py-1 text-[10px] hover:bg-background"
                                       >
                                           Add Upload Ref
                                       </button>
                                   </div>
                               </div>

                               {referenceItems.map((reference) => (
                                   <div key={reference.id} className="grid grid-cols-[1fr,auto] gap-1 rounded border border-border/60 bg-background/50 p-2">
                                       <div className="space-y-1">
                                           <select
                                               className="w-full rounded border bg-background p-1 text-[10px]"
                                               value={reference.role}
                                               onChange={(event) => updateReferenceSlot(reference.id, { role: event.target.value as ReferenceRecord['role'] })}
                                           >
                                               <option value="style">Style</option>
                                               <option value="character">Character</option>
                                               <option value="pose">Pose</option>
                                               <option value="background">Background</option>
                                               <option value="other">Other</option>
                                           </select>
                                           <input
                                               type="file"
                                               accept="image/*"
                                               className="w-full text-[10px]"
                                               onChange={(event) => {
                                                   const nextFile = event.target.files?.[0] || null;
                                                   updateReferenceSlot(reference.id, { file: nextFile, name: nextFile?.name || '' });
                                               }}
                                           />
                                           {reference.name && (
                                               <div className="text-[10px] text-muted-foreground truncate" title={reference.name}>{reference.name}</div>
                                           )}
                                           {reference.sourceLayerId && (
                                               <div className="text-[10px] text-muted-foreground">Layer source: {reference.sourceLayerId}</div>
                                           )}
                                       </div>
                                       <button
                                           type="button"
                                           onClick={() => removeReferenceSlot(reference.id)}
                                           className="rounded border border-border px-2 py-1 text-[10px]"
                                       >
                                           Remove
                                       </button>
                                   </div>
                               ))}
                           </div>
                       </div>
                   )}
               </div>

               <div className="grid grid-cols-2 gap-2">
                   <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Aspect</label>
                      <div className="w-full text-xs p-2 rounded-md border bg-secondary/20 text-muted-foreground truncate" title="Resize zone on canvas to change">
                          Custom ({zoneWidth}x{zoneHeight})
                      </div>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Provider Status</label>
                      <div className="w-full text-xs p-2 rounded-md border bg-secondary/20 text-muted-foreground truncate">
                          {isSelectedProviderReady ? 'Ready for generation' : 'Coming soon'}
                      </div>
                   </div>
               </div>

              {selectedProvider === 'comfy' && (
                   <div className="space-y-2">
                       <div className="space-y-1">
                           <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Connection</label>
                           <select
                               className="w-full text-xs p-2 rounded-md border bg-background"
                               value={comfyConnectionMode}
                               onChange={(event) => {
                                   const nextMode = event.target.value as ComfyConnectionMode;
                                   setComfyConnectionMode(nextMode);
                                   saveGenerativePreferences({ comfyConnectionMode: nextMode });
                               }}
                           >
                               <option value="auto">Auto (Local, then Cloud)</option>
                               <option value="local">Local only</option>
                               <option value="cloud">Cloud only</option>
                           </select>
                       </div>

                       <div className="space-y-1">
                           <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">ComfyUI URL</label>
                           <input
                               className="w-full text-xs p-2 rounded-md border bg-background font-mono"
                               value={comfyServerUrl}
                               onChange={(event) => {
                                   const nextUrl = event.target.value;
                                   setComfyServerUrl(nextUrl);
                                   saveGenerativePreferences({ comfyServerUrl: nextUrl });
                               }}
                               placeholder={DEFAULT_COMFY_LOCAL_URL}
                           />
                       </div>

                       {comfyConnectionMode !== 'local' && (
                           <>
                               <div className="space-y-1">
                                   <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Comfy Cloud URL</label>
                                   <input
                                       className="w-full text-xs p-2 rounded-md border bg-background font-mono"
                                       value={comfyCloudUrl}
                                       onChange={(event) => {
                                           const nextUrl = event.target.value;
                                           setComfyCloudUrl(nextUrl);
                                           saveGenerativePreferences({ comfyCloudUrl: nextUrl });
                                       }}
                                       placeholder="https://cloud.comfy.org"
                                   />
                               </div>

                               <div className="space-y-1">
                                   <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Comfy Cloud API Key</label>
                                   <input
                                       type="password"
                                       className="w-full text-xs p-2 rounded-md border bg-background font-mono"
                                       value={comfyCloudApiKey}
                                       onChange={(event) => {
                                           const nextKey = event.target.value;
                                           setComfyCloudApiKey(nextKey);
                                           saveComfyCloudApiKey(nextKey);
                                       }}
                                       placeholder="ck-..."
                                   />
                               </div>
                           </>
                       )}

                       <div className="grid grid-cols-3 gap-2">
                                   <div className="space-y-1">
                                       <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Task</label>
                                       <select
                                           className="w-full text-xs p-2 rounded-md border bg-background"
                                           value={selectedComfyTask}
                                           onChange={(event) => handleComfyTaskChange(event.target.value as ComfyTask)}
                                       >
                                           {COMFY_TASK_OPTIONS.map((taskOption) => (
                                               <option key={taskOption.id} value={taskOption.id}>
                                                   {taskOption.label}
                                               </option>
                                           ))}
                                       </select>
                                   </div>

                           <div className="space-y-1">
                               <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Workflow</label>
                               <select
                                   className="w-full text-xs p-2 rounded-md border bg-background"
                                   value={selectedComfyWorkflowId}
                                   onChange={(event) => handleComfyWorkflowChange(event.target.value)}
                               >
                                   {availableComfyWorkflowIds.map((workflowId) => {
                                       const workflow = comfyWorkflowRegistry.getWorkflow(workflowId);
                                       return (
                                           <option key={workflowId} value={workflowId}>
                                               {workflow?.name || workflowId}
                                           </option>
                                       );
                                   })}
                               </select>
                           </div>

                           <div className="space-y-1">
                               <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Model</label>
                               <select
                                   className="w-full text-xs p-2 rounded-md border bg-background"
                                   value={selectedComfyModelPresetId}
                                   onChange={(event) => handleComfyModelPresetChange(event.target.value)}
                               >
                                   {availableComfyModelPresets.map((modelPreset) => (
                                       <option key={modelPreset.id} value={modelPreset.id}>
                                           {modelPreset.name}
                                       </option>
                                   ))}
                               </select>
                           </div>
                       </div>

                       <button
                           type="button"
                           onClick={handleVerifyComfyConnection}
                           disabled={isCheckingComfyConnection || isGenerating}
                           className="w-full rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                       >
                           {isCheckingComfyConnection ? 'Checking connection...' : 'Verify ComfyUI Connection'}
                       </button>

                       {comfyConnectionStatusMessage && (
                           <div className="text-[10px] text-muted-foreground border border-border/60 rounded-md px-2 py-1 bg-background/60">
                               {comfyConnectionStatusMessage}
                           </div>
                       )}

                       {selectedComfyWorkflow && (
                           <div className="text-[10px] text-muted-foreground border border-border/60 rounded-md px-2 py-1 bg-background/60">
                               {selectedComfyWorkflow.description}
                           </div>
                       )}

                       <div className="text-[10px] text-muted-foreground border border-border/60 rounded-md px-2 py-1 bg-background/60">
                           Task chooses operation type; workflow is the pipeline graph; model selects checkpoint preset.
                       </div>
                   </div>
               )}

               {/* Generate Button */}
               <button 
                  onClick={handleGenerate}
                        disabled={isGenerating || (!prompt && !(selectedProvider === 'comfy' && selectedComfyTask === 'upscale')) || !isSelectedProviderReady || (selectedProvider === 'comfy' && !canRunComfyGeneration)}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-sm"
               >
                  {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                  {isGenerating ? 'Dreaming...' : 'Generate Image'}
               </button>

               {statusMessage && (
                  <div className={`text-xs py-2 px-3 rounded-md ${statusMessage.includes('Error') ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-secondary-foreground'}`}>
                      <div className="flex items-center justify-between gap-2">
                          <span className="text-left">{statusMessage}</span>
                          {lastRemovedAnnotation && (
                              <button
                                  type="button"
                                  onClick={undoLastRemovedAnnotation}
                                  className="rounded border border-border/70 bg-background/70 px-2 py-0.5 text-[10px] font-medium hover:bg-background"
                              >
                                  Undo
                              </button>
                          )}
                      </div>
                  </div>
               )}

               <div className="text-[10px] text-muted-foreground border border-border/60 rounded-md px-2 py-1 bg-background/60">
                   Active default provider: {selectedProviderLabel}
               </div>

               {!isSelectedProviderReady && (
                  <div className="text-[10px] text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-md px-2 py-1 bg-amber-500/10">
                      {selectedProviderLabel} integration is configured for future support and is not active yet.
                  </div>
               )}
               
               {/* Result Preview Area */}
               {generatedImage && (
                   <div className="relative group rounded-lg overflow-hidden border bg-checkerboard aspect-square animate-in zoom-in-95">
                       <Image
                           src={generatedImage}
                           alt="Generated"
                           fill
                           sizes="256px"
                           className="object-contain"
                           unoptimized
                       />
                       
                       <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                           <button 
                              onClick={placeImageOnCanvas}
                              className="bg-white text-black px-4 py-1.5 rounded-full text-xs font-bold hover:bg-white/90 transform hover:scale-105 transition-all"
                           >
                              Place on Canvas
                           </button>
                           <button 
                              onClick={() => setGeneratedImage(null)}
                              className="text-white/70 hover:text-white text-xs underline"
                           >
                              Discard
                           </button>
                       </div>
                   </div>
               )}
            </div>
        </>
        )}
      </div>
    </div>
  );
}
