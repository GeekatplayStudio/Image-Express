import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { X, Wand2, Loader2 } from 'lucide-react';
import * as fabric from 'fabric';
import { ExtendedFabricObject } from '@/types';
import StabilityGenerator from './AI/StabilityGenerator';
import ComfyWorkflowLibraryPanel from './ComfyWorkflowLibraryPanel';
import { captureComfySourceImageFromCanvas, inspectCapturedSourceDataUrl } from './imageGeneratorModalUtils';
import useAppTheme from '@/hooks/useAppTheme';
import useEscapeKey from '@/hooks/useEscapeKey';
import {
  DEFAULT_COMFY_LOCAL_URL,
    hydrateComfyCloudSettingsFromRuntime,
  loadComfyCloudApiKey,
  saveComfyCloudApiKey,
  verifyAvailableComfyConnection,
  type ComfyConnectionMode,
} from '@/lib/comfyui/connection';
import { comfyWorkflowRegistry, type ComfyTask, type ComfyWorkflowInstallableModel } from '@/lib/comfyui/registry';
import {
    registerSerializedComfyWorkflow,
    type ComfyDiagnosticsSnapshot,
    type SerializedComfyWorkflowRegistration,
} from '@/lib/comfyui/libraryTypes';
import { getComfyTaskPreference, saveComfyTaskPreference } from '@/lib/comfyui/preferences';
import { workflowRequiresPositivePrompt } from '@/lib/comfyui/promptRequirements';
import { executeComfyTask, inspectComfyServerCatalog, recoverComfyTaskByPromptId } from '@/lib/comfyui/runner';
import { ensureComfyWorkflowCatalogRegistered } from '@/lib/comfyui/workflows/catalog';
import { useDialog } from '@/providers/DialogProvider';
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
import { loadLocalAiPreferences } from '@/lib/localAiPreferences';
import { parseMissingOllamaModelMessage, requestOllamaModelInstall } from '@/lib/ollamaModelInstall';
import { persistAssetToLibrary } from '@/lib/assetPersistence';
import { compileAnnotationPrompts } from '@/lib/agentic-edit/promptCompiler';
import type { AnnotationDocument, AnnotationRecord, ReferenceRecord } from '@/lib/agentic-edit/types';
import { buildAnnotatedReferenceLayerDataUrl, buildAnnotationLayerArtifacts, clamp01, readBoxGeometry, renderAnnotationShape } from '@/components/image-generator/annotationCanvasUtils';
import { buildComfyTaskModelOptions, findComfyTaskModelOption } from '@/lib/comfyui/localModelOptions';

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
const COMFY_CANCELLED_PROMPTS_STORAGE_KEY = 'image-express-comfy-cancelled-prompts';
const COMFY_DEBUG_REQUEST_STORAGE_KEY = 'image-express-comfy-last-request';

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

interface ComfyPreparedRequestSnapshot {
    createdAt: string;
    task: ComfyTask;
    workflowId: string;
    workflowName: string;
    modelPresetId: string;
    modelPresetName: string;
    uiPrompt: string;
    preparedPositivePrompt: string;
    preparedNegativePrompt: string;
    width: number;
    height: number;
    hasImage: boolean;
    hasMask: boolean;
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

const COMFY_AGENTIC_EDIT_WORKFLOW_9B = 'image_flux2_klein_image_edit_9b_base';
const COMFY_AGENTIC_EDIT_WORKFLOW_4B = 'image_flux2_klein_image_edit_4b_base';

interface ComfyMissingRequirementSummary {
    updateInstall: boolean;
    models: ComfyWorkflowInstallableModel[];
    workflows: string[];
}

const formatComfyDiagnosticsText = (diagnostics: ComfyDiagnosticsSnapshot): string => {
    const lines: string[] = [];
    const pushSection = (title: string, sectionLines: string[]) => {
        lines.push(title);
        lines.push(...sectionLines);
        lines.push('');
    };

    pushSection('ComfyUI Diagnostics', [
        `Generated: ${diagnostics.generatedAt}`,
        `Server URL: ${diagnostics.connection.serverUrl}`,
        `Transport: ${diagnostics.connection.transportKind}`,
        `API Base Path: ${diagnostics.connection.apiBasePath || '/'}`,
        `History Path: ${diagnostics.connection.historyPathBase}`,
    ]);

    pushSection('Resolved Paths', diagnostics.paths.statuses.map((status) => (
        `${status.label}: ${status.path || '(not configured)'} | exists=${status.exists ? 'yes' : 'no'} | readable=${status.readable ? 'yes' : 'no'}${status.note ? ` | ${status.note}` : ''}`
    )));

    pushSection('Asset Inventory', diagnostics.assets.length > 0
        ? diagnostics.assets.flatMap((group) => [
            `${group.label} (${group.values.length})${group.expectedSubdirectory ? ` | expected folder: ${group.expectedSubdirectory}` : ''}`,
            `  Sources: ${group.sourceInputs.join(', ') || '(none)'}`,
            ...group.values.map((value) => `  - ${value}`),
        ])
        : ['No model-style asset lists were returned by ComfyUI object_info.']);

    pushSection('Custom Node Repositories', diagnostics.library.nodeRepos.length > 0
        ? diagnostics.library.nodeRepos.flatMap((repo) => [
            `${repo.name} | ${repo.repoKind} | ${repo.gitManaged ? 'git repo' : 'plain folder'} | workflow hints=${repo.workflowHintCount}`,
            `  Path: ${repo.path}`,
        ])
        : ['No custom node/workflow repositories were discovered in configured folders.']);

    pushSection('Workflow Library Files', diagnostics.library.customFolderWorkflows.length > 0
        ? diagnostics.library.customFolderWorkflows.flatMap((workflow) => [
            `${workflow.name} | runnable=${workflow.runnable ? 'yes' : 'no'} | task=${workflow.task || 'unknown'}`,
            `  Location: ${workflow.location || '(unknown)'}`,
            workflow.warning ? `  Warning: ${workflow.warning}` : '',
        ].filter(Boolean))
        : ['No workflow JSON files were discovered in the configured workflow folders.']);

    pushSection('Server Workflow Templates', diagnostics.library.serverTemplates.length > 0
        ? diagnostics.library.serverTemplates.flatMap((workflow) => [
            `${workflow.name} | runnable=${workflow.runnable ? 'yes' : 'no'} | task=${workflow.task || 'unknown'}`,
            `  Location: ${workflow.location || '(unknown)'}`,
            workflow.warning ? `  Warning: ${workflow.warning}` : '',
        ].filter(Boolean))
        : ['No importable server templates were discovered.']);

    pushSection('Available Node Types', diagnostics.runtime.nodeTypes.length > 0
        ? [
            `Count: ${diagnostics.runtime.nodeTypes.length}`,
            ...diagnostics.runtime.nodeTypes.map((nodeType) => `- ${nodeType}`),
        ]
        : ['No node types were returned by ComfyUI object_info.']);

    pushSection('Features JSON', [JSON.stringify(diagnostics.runtime.features, null, 2) || 'null']);
    pushSection('System Stats JSON', [JSON.stringify(diagnostics.runtime.systemStats, null, 2) || 'null']);

    if (diagnostics.library.warnings.length > 0) {
        pushSection('Warnings', diagnostics.library.warnings.map((warning) => `- ${warning}`));
    }

    return lines.join('\n').trim();
};

const buildComfyMissingRequirementSummary = (
    records: Array<{
        workflowId: string;
        missingNodeTypes: string[];
        missingModels: ComfyWorkflowInstallableModel[];
        canAutoUpdateInstall: boolean;
    }>
): ComfyMissingRequirementSummary | null => {
    const workflows = new Set<string>();
    const modelMap = new Map<string, ComfyWorkflowInstallableModel>();
    let updateInstall = false;

    for (const record of records) {
        if (record.missingNodeTypes.length === 0 && record.missingModels.length === 0) {
            continue;
        }

        workflows.add(record.workflowId);
        if (record.canAutoUpdateInstall && record.missingNodeTypes.length > 0) {
            updateInstall = true;
        }

        for (const model of record.missingModels) {
            modelMap.set(`${model.directory}/${model.name}`.toLowerCase(), model);
        }
    }

    if (!updateInstall && modelMap.size === 0) {
        return null;
    }

    return {
        updateInstall,
        models: Array.from(modelMap.values()),
        workflows: Array.from(workflows),
    };
};

const formatComfyRequirementDetails = (
    records: Array<{
        workflowId: string;
        compatible: boolean;
        missingNodeTypes: string[];
        missingModels: ComfyWorkflowInstallableModel[];
    }>
): string => records
    .map((record) => {
        if (record.compatible) {
            return `${record.workflowId}:ok`;
        }

        const detailParts: string[] = [];
        if (record.missingNodeTypes.length > 0) {
            detailParts.push(`nodes ${record.missingNodeTypes.slice(0, 3).join(', ')}`);
        }
        if (record.missingModels.length > 0) {
            detailParts.push(`models ${record.missingModels.slice(0, 3).map((model) => model.name).join(', ')}`);
        }

        return `${record.workflowId}:missing ${detailParts.join('; ') || 'requirements'}`;
    })
    .join(' | ');

const readPreparedComfyText = (values: unknown[] | undefined): string => {
    const textValue = values?.find((value): value is string => (
        typeof value === 'string' && value.trim().length > 0
    ));

    return textValue ? textValue.trim() : '';
};

const truncateComfyPromptForStatus = (value: string, maxLength = 120): string => {
    const trimmed = value.trim();
    if (trimmed.length <= maxLength) {
        return trimmed;
    }

    return `${trimmed.slice(0, maxLength - 3).trimEnd()}...`;
};

interface ComfyQualityProfile {
    width: number;
    height: number;
    steps: number;
    cfg: number;
    strength: number;
    seed: number;
}

const snapToComfyGrid = (value: number): number => Math.max(64, Math.round(value / 64) * 64);

const resolveAdaptiveComfyDimensions = (
    baseWidth: number,
    baseHeight: number,
    maxSide: number,
    minSide = 512
): { width: number; height: number } => {
    const safeBaseWidth = Math.max(64, Math.round(baseWidth || 1024));
    const safeBaseHeight = Math.max(64, Math.round(baseHeight || 1024));
    const safeMaxSide = Math.max(minSide, Math.round(maxSide));

    const longest = Math.max(safeBaseWidth, safeBaseHeight);
    const scaleFromLongest = Math.max(minSide, Math.min(safeMaxSide, longest)) / longest;

    let width = safeBaseWidth * scaleFromLongest;
    let height = safeBaseHeight * scaleFromLongest;

    const shortest = Math.min(width, height);
    if (shortest < minSide) {
        const scaleFromShortest = minSide / shortest;
        width *= scaleFromShortest;
        height *= scaleFromShortest;
    }

    width = snapToComfyGrid(width);
    height = snapToComfyGrid(height);

    const normalizedLongest = Math.max(width, height);
    if (normalizedLongest > safeMaxSide) {
        const downScale = safeMaxSide / normalizedLongest;
        width = snapToComfyGrid(width * downScale);
        height = snapToComfyGrid(height * downScale);
    }

    return {
        width: Math.max(64, width),
        height: Math.max(64, height),
    };
};

const resolveComfyQualityProfile = (
    workflowId: string,
    modelPresetId: string,
    baseWidth: number,
    baseHeight: number,
    task: ComfyTask
): ComfyQualityProfile => {
    const lowerWorkflowId = workflowId.toLowerCase();
    const lowerModelPreset = modelPresetId.toLowerCase();

    let maxSide = 1344;
    let steps = task === 'generate' ? 36 : 30;
    let cfg = 6.5;
    let strength = task === 'img2img' ? 0.68 : 0.75;

    if (lowerWorkflowId.includes('flux2_klein') || lowerWorkflowId.includes('flux2') || lowerModelPreset.includes('flux')) {
        maxSide = 1024;
        steps = lowerWorkflowId.includes('9b') ? 42 : 34;
        cfg = 3.5;
        strength = task === 'img2img' ? 0.72 : 0.8;
    }

    if (task === 'upscale') {
        maxSide = 2048;
        steps = 16;
        cfg = 4.5;
        strength = 0.5;
    }

    const adaptiveDimensions = resolveAdaptiveComfyDimensions(baseWidth, baseHeight, maxSide, 512);

    return {
        width: adaptiveDimensions.width,
        height: adaptiveDimensions.height,
        steps,
        cfg,
        strength,
        seed: Math.floor(Math.random() * 2147483647),
    };
};

const getPreferredComfyAgenticWorkflow = (workflowIds: string[]): string => (
    workflowIds.find((workflowId) => workflowId === COMFY_AGENTIC_EDIT_WORKFLOW_9B)
    || workflowIds.find((workflowId) => workflowId === COMFY_AGENTIC_EDIT_WORKFLOW_4B)
    || workflowIds[0]
    || ''
);

const resolveFluxModelFromWorkflowId = (workflowId: string): string => {
    if (workflowId === COMFY_AGENTIC_EDIT_WORKFLOW_4B) {
        return 'flux.2-klein-4b';
    }
    if (workflowId === COMFY_AGENTIC_EDIT_WORKFLOW_9B) {
        return 'flux.2-klein-9b';
    }
    return 'flux-kontext';
};

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

const AI_EDIT_NOTES_MAX_WAIT_MS = 30 * 60 * 1000;
const AI_EDIT_NOTES_POLL_INTERVAL_MS = 1500;

const waitWithAbort = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
    if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
    }

    const timeoutId = window.setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
    }, ms);

    const onAbort = () => {
        window.clearTimeout(timeoutId);
        signal?.removeEventListener('abort', onAbort);
        reject(new DOMException('Aborted', 'AbortError'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
});

const mapGenerativeProviderToAgenticProvider = (provider: GenerativeProviderId): 'mock' | 'flux' | 'nanobanana' => {
    if (provider === 'banana') {
        return 'nanobanana';
    }
    if (provider === 'comfy' || provider === 'ollama' || provider === 'openai' || provider === 'google' || provider === 'stability') {
        return 'flux';
    }
    return 'mock';
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
    const appTheme = useAppTheme();
    const dialog = useDialog();
    const formatElapsedSeconds = (elapsedMs?: number): string => {
            if (!elapsedMs || elapsedMs <= 0) {
                    return '0s';
            }
            return `${Math.max(1, Math.round(elapsedMs / 1000))}s`;
    };

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
    const aiEditNotesAbortControllerRef = useRef<AbortController | null>(null);
    const aiEditNotesAbortRequestedRef = useRef(false);
  
  // --- UI State (Draggable Window) ---
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  
  // --- Canvas Zone Management ---
  const [zoneWidth, setZoneWidth] = useState(initialWidth);
  const [zoneHeight, setZoneHeight] = useState(initialHeight);
  const zoneObjectRef = useRef<fabric.Rect | null>(null);

  const currentAspectRatio = zoneHeight > 0 ? zoneWidth / zoneHeight : (16 / 9);

  const applyManualZoneDimensions = useCallback((nextWidth: number, nextHeight: number) => {
      const safeWidth = Math.max(1, Math.round(nextWidth));
      const safeHeight = Math.max(1, Math.round(nextHeight));

      setZoneWidth(safeWidth);
      setZoneHeight(safeHeight);

      const zone = zoneObjectRef.current;
      if (zone) {
          zone.set({
              width: safeWidth,
              height: safeHeight,
              scaleX: 1,
              scaleY: 1,
          });
          zone.setCoords();
          canvas?.requestRenderAll();
      }
  }, [canvas]);

  // --- Provider Selection ---
  const [availableProviders, setAvailableProviders] = useState<GenerativeProviderId[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<GenerativeProviderId>('comfy');
  const [comfyServerUrl, setComfyServerUrl] = useState(DEFAULT_COMFY_LOCAL_URL);
  const [comfyConnectionMode, setComfyConnectionMode] = useState<ComfyConnectionMode>('auto');
  const [comfyCloudUrl, setComfyCloudUrl] = useState('https://cloud.comfy.org');
  const [comfyCloudApiKey, setComfyCloudApiKey] = useState('');
  const [comfyInstallPath, setComfyInstallPath] = useState('');
  const [comfyCustomNodesPath, setComfyCustomNodesPath] = useState('');
  const [comfyWorkflowLibraryPath, setComfyWorkflowLibraryPath] = useState('');
  const [availableComfyWorkflowIds, setAvailableComfyWorkflowIds] = useState<string[]>([]);
    const [selectedComfyTask, setSelectedComfyTask] = useState<ComfyTask>('generate');
    const selectedComfyTaskRef = useRef<ComfyTask>('generate');
  const [selectedComfyWorkflowId, setSelectedComfyWorkflowId] = useState('');
  const [selectedComfyModelPresetId, setSelectedComfyModelPresetId] = useState('');
  const adaptManualSizeToSelectedModel = useCallback((rawWidth: number, rawHeight: number) => {
      const normalizedWidth = Math.max(1, Math.round(rawWidth));
      const normalizedHeight = Math.max(1, Math.round(rawHeight));

      if (selectedProvider !== 'comfy') {
          return {
              width: normalizedWidth,
              height: normalizedHeight,
          };
      }

      const workflowId = selectedComfyWorkflowId || getPreferredComfyAgenticWorkflow(availableComfyWorkflowIds);
      const quality = resolveComfyQualityProfile(
          workflowId,
          selectedComfyModelPresetId || 'default',
          normalizedWidth,
          normalizedHeight,
          selectedComfyTask
      );

      return {
          width: quality.width,
          height: quality.height,
      };
  }, [
      selectedProvider,
      selectedComfyWorkflowId,
      selectedComfyModelPresetId,
      selectedComfyTask,
      availableComfyWorkflowIds,
  ]);

  const applyManualZoneWidthLocked = useCallback((nextWidth: number) => {
      const safeWidth = Math.max(1, Math.round(nextWidth));
      const safeHeight = Math.max(1, Math.round(safeWidth / currentAspectRatio));
      applyManualZoneDimensions(safeWidth, safeHeight);
  }, [applyManualZoneDimensions, currentAspectRatio]);

    const [initialStabilityTab, setInitialStabilityTab] = useState<GenerativeStabilityTab>('generate');
  const [autoStartInpaintMasking, setAutoStartInpaintMasking] = useState(true);
  const [showInpaintPromptDock, setShowInpaintPromptDock] = useState(true);
  const [isCheckingComfyConnection, setIsCheckingComfyConnection] = useState(false);
        const [isInspectingComfyDiagnostics, setIsInspectingComfyDiagnostics] = useState(false);
    const [isInstallingComfyRequirements, setIsInstallingComfyRequirements] = useState(false);
  const [comfyConnectionStatusMessage, setComfyConnectionStatusMessage] = useState('');
    const [comfyCatalogStatusMessage, setComfyCatalogStatusMessage] = useState('');
    const [showComfyDiagnosticsPopup, setShowComfyDiagnosticsPopup] = useState(false);
    const [comfyDiagnosticsText, setComfyDiagnosticsText] = useState('');
    const [comfyMissingRequirements, setComfyMissingRequirements] = useState<ComfyMissingRequirementSummary | null>(null);
  const hasAttemptedComfyRecoveryRef = useRef(false);
    const warmedComfyProfilesRef = useRef<Set<string>>(new Set());
    const comfyCancelRequestedRef = useRef(false);
    const comfyRunTokenRef = useRef(0);
    const currentComfyPromptIdRef = useRef<string>('');
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

  const writePreparedComfyRequestSnapshot = useCallback((snapshot: ComfyPreparedRequestSnapshot) => {
      if (typeof window === 'undefined') {
          return;
      }

      window.localStorage.setItem(COMFY_DEBUG_REQUEST_STORAGE_KEY, JSON.stringify(snapshot));
  }, []);

  const readCancelledComfyPrompts = useCallback((): string[] => {
      if (typeof window === 'undefined') {
          return [];
      }

      try {
          const raw = window.localStorage.getItem(COMFY_CANCELLED_PROMPTS_STORAGE_KEY);
          if (!raw) {
              return [];
          }

          const parsed = JSON.parse(raw) as string[];
          return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
      } catch {
          return [];
      }
  }, []);

  const writeCancelledComfyPrompts = useCallback((promptIds: string[]) => {
      if (typeof window === 'undefined') {
          return;
      }

      window.localStorage.setItem(COMFY_CANCELLED_PROMPTS_STORAGE_KEY, JSON.stringify(promptIds.slice(-40)));
  }, []);

  const rememberCancelledComfyPrompt = useCallback((promptId: string) => {
      if (!promptId) {
          return;
      }

      const current = readCancelledComfyPrompts();
      if (current.includes(promptId)) {
          return;
      }

      writeCancelledComfyPrompts([...current, promptId]);
  }, [readCancelledComfyPrompts, writeCancelledComfyPrompts]);

  const isComfyPromptCancelled = useCallback((promptId: string): boolean => {
      if (!promptId) {
          return false;
      }

      return readCancelledComfyPrompts().includes(promptId);
  }, [readCancelledComfyPrompts]);

  const handleCancelComfyRun = useCallback(() => {
      comfyCancelRequestedRef.current = true;
      comfyRunTokenRef.current += 1;
      rememberCancelledComfyPrompt(currentComfyPromptIdRef.current);
      clearPendingComfyJob();
      currentComfyPromptIdRef.current = '';
      setStatusMessage('ComfyUI job cancelled by user.');
      setIsGenerating(false);
  }, [clearPendingComfyJob, rememberCancelledComfyPrompt]);

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
        
        const providers: GenerativeProviderId[] = ['comfy', 'ollama']; // Local runtimes are always available as options
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
        void hydrateComfyCloudSettingsFromRuntime().then((runtimeConfig) => {
            if (runtimeConfig.cloudApiKey) {
                setComfyCloudApiKey((current) => current || runtimeConfig.cloudApiKey);
            }

            if (
                runtimeConfig.cloudUrl
                && (
                    !preferences.comfyCloudUrl.trim()
                    || preferences.comfyCloudUrl.trim() === 'https://cloud.comfy.org'
                )
            ) {
                setComfyCloudUrl(runtimeConfig.cloudUrl);
            }
        });
        setComfyInstallPath(preferences.comfyInstallPath);
        setComfyCustomNodesPath(preferences.comfyCustomNodesPath);
        setComfyWorkflowLibraryPath(preferences.comfyWorkflowLibraryPath);
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
      selectedComfyTaskRef.current = selectedComfyTask;
  }, [selectedComfyTask]);

  useEffect(() => {
      syncComfyTaskSelections(selectedComfyTask);
  }, [selectedComfyTask, syncComfyTaskSelections]);

  useEffect(() => {
      if (!useAgenticEditNotes || selectedProvider !== 'comfy') {
          return;
      }

      if (selectedComfyTask !== 'img2img') {
          setSelectedComfyTask('img2img');
          if (typeof window !== 'undefined') {
              window.localStorage.setItem(COMFY_TASK_STORAGE_KEY, 'img2img');
          }
      }
  }, [useAgenticEditNotes, selectedProvider, selectedComfyTask]);

  useEffect(() => {
      if (!useAgenticEditNotes || selectedProvider !== 'comfy' || selectedComfyTask !== 'img2img') {
          return;
      }

      const preferredWorkflowId = getPreferredComfyAgenticWorkflow(availableComfyWorkflowIds);
      if (!preferredWorkflowId) {
          return;
      }

      const modelPresets = comfyWorkflowRegistry.getModelPresetsForWorkflow(preferredWorkflowId);
      const nextModelPresetId = (
          modelPresets.find((preset) => preset.id === 'default')?.id
          || modelPresets[0]?.id
          || ''
      );

      if (selectedComfyWorkflowId !== preferredWorkflowId) {
          setSelectedComfyWorkflowId(preferredWorkflowId);
          setSelectedComfyModelPresetId(nextModelPresetId);
          saveComfyTaskPreference('img2img', {
              workflowId: preferredWorkflowId,
              modelPresetId: nextModelPresetId || undefined,
          });
          return;
      }

      if (!selectedComfyModelPresetId && nextModelPresetId) {
          setSelectedComfyModelPresetId(nextModelPresetId);
          saveComfyTaskPreference('img2img', {
              workflowId: preferredWorkflowId,
              modelPresetId: nextModelPresetId,
          });
      }
  }, [
      useAgenticEditNotes,
      selectedProvider,
      selectedComfyTask,
      availableComfyWorkflowIds,
      selectedComfyWorkflowId,
      selectedComfyModelPresetId,
  ]);

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

  const handleComfyModelChoiceChange = (modelChoiceId: string) => {
      const [workflowId, modelPresetId] = modelChoiceId.split('::');
      if (!workflowId || !modelPresetId) {
          return;
      }

      setSelectedComfyWorkflowId(workflowId);
      setSelectedComfyModelPresetId(modelPresetId);
      saveComfyTaskPreference(selectedComfyTask, {
          workflowId,
          modelPresetId,
      });
  };

  const handleUseComfyLibraryWorkflow = useCallback((registration: SerializedComfyWorkflowRegistration) => {
      registerSerializedComfyWorkflow(registration);

      const workflowIds = comfyWorkflowRegistry.getWorkflowsForTask(registration.task).map((workflow) => workflow.id);
      const workflow = comfyWorkflowRegistry.getWorkflow(registration.id);
      const modelPresets = comfyWorkflowRegistry.getModelPresetsForWorkflow(registration.id);
      const nextModelPresetId = (
          modelPresets.find((preset) => preset.id === workflow?.defaultModelPresetId)?.id
          || modelPresets[0]?.id
          || ''
      );

      setSelectedComfyTask(registration.task);
      if (typeof window !== 'undefined') {
          window.localStorage.setItem(COMFY_TASK_STORAGE_KEY, registration.task);
      }
      setAvailableComfyWorkflowIds(workflowIds);
      setSelectedComfyWorkflowId(registration.id);
      setSelectedComfyModelPresetId(nextModelPresetId);
      saveComfyTaskPreference(registration.task, {
          workflowId: registration.id,
          modelPresetId: nextModelPresetId || undefined,
      });
      setStatusMessage(`Comfy workflow "${registration.name}" is ready.`);
  }, []);

  const handleDiscoveredComfyWorkflows = useCallback((registrations: SerializedComfyWorkflowRegistration[]) => {
      if (registrations.length === 0) {
          return;
      }

      for (const registration of registrations) {
          registerSerializedComfyWorkflow(registration);
      }

      syncComfyTaskSelections(selectedComfyTaskRef.current);
  }, [syncComfyTaskSelections]);

  const captureComfySourceImage = useCallback((): string | null => {
      return captureComfySourceImageFromCanvas(canvas, zoneObjectRef.current, zoneWidth, zoneHeight);
  }, [canvas, zoneHeight, zoneWidth]);

  const inspectComfyCatalog = useCallback(async () => {
      const catalogSnapshot = await inspectComfyServerCatalog({
          connection: {
              mode: comfyConnectionMode,
              localUrl: comfyServerUrl,
              cloudUrl: comfyCloudUrl,
              cloudApiKey: comfyCloudApiKey,
          },
      });

      const fluxKleinRecords = catalogSnapshot.records.filter((record) => (
          record.workflowId === COMFY_AGENTIC_EDIT_WORKFLOW_9B || record.workflowId === COMFY_AGENTIC_EDIT_WORKFLOW_4B
      ));
      const fluxReady = fluxKleinRecords.some((record) => record.compatible);
      const details = formatComfyRequirementDetails(fluxKleinRecords);
      const missingRequirements = buildComfyMissingRequirementSummary(fluxKleinRecords);

      setComfyMissingRequirements(missingRequirements);
      setComfyCatalogStatusMessage(
          `ComfyUI ${catalogSnapshot.detectedVersion} @ ${catalogSnapshot.serverUrl} — workflows ${catalogSnapshot.compatibleWorkflowCount}/${catalogSnapshot.workflowCount} compatible. Flux Klein edit: ${fluxReady ? 'ready' : 'not ready (missing custom nodes/models)'}${details ? ` (${details})` : ''}.`
      );

      return { catalogSnapshot, missingRequirements };
  }, [comfyCloudApiKey, comfyCloudUrl, comfyConnectionMode, comfyServerUrl]);

  const handleInspectComfyDiagnostics = useCallback(async () => {
      if (isInspectingComfyDiagnostics) {
          return;
      }

      setIsInspectingComfyDiagnostics(true);
      setComfyConnectionStatusMessage('Loading ComfyUI diagnostics...');

      try {
          const response = await fetch('/api/ai/comfy/library', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                  action: 'inspect-config',
                  connectionMode: comfyConnectionMode,
                  comfyServerUrl,
                  comfyCloudUrl,
                  comfyCloudApiKey,
                  installPath: comfyInstallPath,
                  customNodesPath: comfyCustomNodesPath,
                  workflowLibraryPath: comfyWorkflowLibraryPath,
              }),
          });

          const data = await response.json() as {
              success?: boolean;
              message?: string;
              diagnostics?: ComfyDiagnosticsSnapshot;
          };

          if (!response.ok || !data.success || !data.diagnostics) {
              throw new Error(data.message || 'Failed to load ComfyUI diagnostics.');
          }

          setComfyDiagnosticsText(formatComfyDiagnosticsText(data.diagnostics));
          setShowComfyDiagnosticsPopup(true);
          setComfyConnectionStatusMessage(`Loaded ComfyUI diagnostics from ${data.diagnostics.connection.serverUrl}.`);
      } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to load ComfyUI diagnostics.';
          setComfyConnectionStatusMessage(message);
      } finally {
          setIsInspectingComfyDiagnostics(false);
      }
  }, [
      comfyCloudApiKey,
      comfyCloudUrl,
      comfyConnectionMode,
      comfyCustomNodesPath,
      comfyInstallPath,
      comfyServerUrl,
      comfyWorkflowLibraryPath,
      isInspectingComfyDiagnostics,
  ]);

  const installMissingComfyRequirements = useCallback(async (requirements: ComfyMissingRequirementSummary) => {
      const summaryParts: string[] = [];
      if (requirements.updateInstall) {
          summaryParts.push('update the ComfyUI install to restore missing nodes');
      }
      if (requirements.models.length > 0) {
          summaryParts.push(`download ${requirements.models.length} missing model${requirements.models.length === 1 ? '' : 's'} into the default models folders`);
      }

      const confirmed = await dialog.confirm(
          `Install the detected ComfyUI requirements for Flux Klein? This will ${summaryParts.join(' and ')}.`,
          { title: 'Install Missing Comfy Requirements' }
      );
      if (!confirmed) {
          return false;
      }

      setIsInstallingComfyRequirements(true);
      try {
          const response = await fetch('/api/ai/comfy/library', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                  action: 'install-requirements',
                  connectionMode: comfyConnectionMode,
                  comfyServerUrl,
                  comfyCloudUrl,
                  comfyCloudApiKey,
                  installPath: comfyInstallPath,
                  customNodesPath: comfyCustomNodesPath,
                  workflowLibraryPath: comfyWorkflowLibraryPath,
                  updateInstall: requirements.updateInstall,
                  models: requirements.models,
              }),
          });

          const data = await response.json() as { success?: boolean; message?: string };
          if (!response.ok || !data.success) {
              throw new Error(data.message || 'Failed to install missing Comfy requirements.');
          }

          setComfyConnectionStatusMessage(data.message || 'Installed missing Comfy requirements.');
          setComfyMissingRequirements(null);
          await inspectComfyCatalog();
          return true;
      } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to install missing Comfy requirements.';
          setComfyConnectionStatusMessage(message);
          return false;
      } finally {
          setIsInstallingComfyRequirements(false);
      }
  }, [comfyCloudApiKey, comfyCloudUrl, comfyConnectionMode, comfyCustomNodesPath, comfyInstallPath, comfyServerUrl, comfyWorkflowLibraryPath, dialog, inspectComfyCatalog]);

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

          if (verification.ok) {
              try {
                  const { missingRequirements } = await inspectComfyCatalog();
                  if (missingRequirements) {
                      await installMissingComfyRequirements(missingRequirements);
                  }
              } catch (catalogError) {
                  const catalogMessage = catalogError instanceof Error ? catalogError.message : 'Failed to inspect Comfy workflow catalog.';
                  setComfyCatalogStatusMessage(`Catalog sync warning: ${catalogMessage}`);
                  setComfyMissingRequirements(null);
              }
          }
      } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to verify ComfyUI connection.';
          setComfyConnectionStatusMessage(message);
          setComfyCatalogStatusMessage('');
          setComfyMissingRequirements(null);
      } finally {
          setIsCheckingComfyConnection(false);
      }
  };

  const hasComfyConfigForCatalogSync = comfyConnectionMode === 'local'
      ? comfyServerUrl.trim().length > 0
      : comfyConnectionMode === 'cloud'
          ? comfyCloudUrl.trim().length > 0 && comfyCloudApiKey.trim().length > 0
          : comfyServerUrl.trim().length > 0 || (comfyCloudUrl.trim().length > 0 && comfyCloudApiKey.trim().length > 0);

  useEffect(() => {
      if (!isOpen || selectedProvider !== 'comfy' || !hasComfyConfigForCatalogSync) {
          return;
      }

      void (async () => {
          try {
              await inspectComfyCatalog();
          } catch {
              setComfyCatalogStatusMessage('');
              setComfyMissingRequirements(null);
          }
      })();
  }, [
      isOpen,
      selectedProvider,
      hasComfyConfigForCatalogSync,
      comfyConnectionMode,
      comfyServerUrl,
      comfyCloudUrl,
      comfyCloudApiKey,
      inspectComfyCatalog,
  ]);
    
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

    const applySelectedLayerForNotes = useCallback(async () => {
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
      await applySelectedLayerForNotes();
      setIsPointNoteMode(true);
      setSelectedAnnotationId(null);
      setStatusMessage('Reference layer ready. Click on the image to place point notes with text.');
  }, [addSelectedCanvasLayerAsReference, applySelectedLayerForNotes, selectedCanvasLayerId]);

  const saveReferenceNotesLayerToCanvas = useCallback(async (
      notesOverride?: AnnotationRecord[],
      silent = false
  ) => {
      if (!canvas) {
          if (!silent) {
              setStatusMessage('Canvas is not available.');
          }
          return;
      }

      if (!annotationBaseImage || !annotationBaseDimensions) {
          if (!silent) {
              setStatusMessage('Load or create a reference layer first.');
          }
          return;
      }

      const activeLayerId = activeAnnotationLayerIdRef.current || selectedCanvasLayerId;
      if (!activeLayerId) {
          if (!silent) {
              setStatusMessage('Select a source layer before saving reference notes.');
          }
          return;
      }

      const effectiveNotes = (notesOverride || layerAnnotationNotesMap[activeLayerId] || annotationNotes)
          .filter((note) => note.enabled)
          .map((note, index) => ({ ...note, priority: index + 1 }));

      if (effectiveNotes.length === 0) {
          if (!silent) {
              setStatusMessage('Add at least one note before saving the reference notes layer.');
          }
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
      if (!silent) {
          setStatusMessage('Saved notes as embedded reference layer on canvas. You can now send this layer through ComfyUI.');
      }
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

      if (isComfyPromptCancelled(pending.promptId)) {
          clearPendingComfyJob();
          setStatusMessage('Skipped a previously cancelled ComfyUI recovery job.');
          return;
      }

      hasAttemptedComfyRecoveryRef.current = true;
    comfyCancelRequestedRef.current = false;
    const recoveryToken = ++comfyRunTokenRef.current;
      currentComfyPromptIdRef.current = pending.promptId;
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
              if (comfyCancelRequestedRef.current || recoveryToken !== comfyRunTokenRef.current) {
                  return;
              }

              if (progress.message && progress.message.trim().length > 0) {
                  setStatusMessage(`ComfyUI recovery: ${progress.message} • ${formatElapsedSeconds(progress.elapsedMs)}`);
                  return;
              }

              const percent = Math.max(0, Math.min(100, Math.round(progress.progress * 100)));
              setStatusMessage(`ComfyUI recovery running (${percent}%) • ${formatElapsedSeconds(progress.elapsedMs)}`);
          },
      }).then((result) => {
          if (comfyCancelRequestedRef.current || recoveryToken !== comfyRunTokenRef.current) {
              return;
          }

          if (result.dataUrl) {
              setGeneratedImage(result.dataUrl);
              setStatusMessage('Recovered pending ComfyUI result.');
              clearPendingComfyJob();
              currentComfyPromptIdRef.current = '';
          } else {
              setStatusMessage('ComfyUI recovery finished, but no image output was found yet.');
          }
      }).catch((error) => {
          if (comfyCancelRequestedRef.current || recoveryToken !== comfyRunTokenRef.current) {
              return;
          }

          const message = error instanceof Error ? error.message : 'Failed to recover pending ComfyUI result.';
          setStatusMessage(`ComfyUI recovery pending: ${message}`);
      }).finally(() => {
          if (recoveryToken === comfyRunTokenRef.current) {
              currentComfyPromptIdRef.current = '';
              setIsGenerating(false);
          }
      });
  }, [
      isOpen,
      isGenerating,
      readPendingComfyJob,
      clearPendingComfyJob,
      isComfyPromptCancelled,
  ]);

  // Initial Window Position
  useEffect(() => {
    if (!isOpen || !canvas) {
        return;
    }

    canvas.isDrawingMode = false;
    canvas.selection = true;
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
    canvas.requestRenderAll();
  }, [canvas, isOpen]);

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
            fill: appTheme.zoneOverlayFill,
            stroke: appTheme.zoneStroke,
            strokeWidth: 2,
            strokeDashArray: [5, 5], // Dashed line
            transparentCorners: false,
            cornerColor: appTheme.zoneStroke,
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
   * Respects the current asset storage mode (local, hybrid, cloud).
   */
  const saveToAssets = async (url: string) => {
    try {
        const extensionMatch = url.match(/^data:image\/([a-z0-9.+-]+);/i)
            || url.match(/\.([a-z0-9]+)(?:$|[?#])/i);
        const extension = (extensionMatch?.[1] || 'png').replace('svg+xml', 'svg').toLowerCase();

        await persistAssetToLibrary({
            source: url,
            filename: `generated-${Date.now()}.${extension}`,
            type: 'images',
            category: 'generated',
            owner,
        });
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
        if (!prompt && !(selectedProvider === 'comfy' && selectedComfyTask === 'upscale')) return;

    setIsGenerating(true);
    setStatusMessage('Queueing generation...');
    setGeneratedImage(null);

    // Update zone dims from current object state just in case
    if (zoneObjectRef.current) {
        const z = zoneObjectRef.current;
        const w = Math.round(z.width! * z.scaleX!);
        const h = Math.round(z.height! * z.scaleY!);
        setZoneWidth(w);
        setZoneHeight(h);
    }
    
    // Use current state for API call
    const currentW = zoneObjectRef.current ? Math.round(zoneObjectRef.current.width! * zoneObjectRef.current.scaleX!) : zoneWidth;
    const currentH = zoneObjectRef.current ? Math.round(zoneObjectRef.current.height! * zoneObjectRef.current.scaleY!) : zoneHeight;

    try {
      if (useAgenticEditNotes) {
          aiEditNotesAbortRequestedRef.current = false;
          const aiAbortController = new AbortController();
          aiEditNotesAbortControllerRef.current = aiAbortController;

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

          await saveReferenceNotesLayerToCanvas(fallbackNotes, true);

          const extractedNotes = fallbackNotes.map((note) => ({
              id: note.id,
              instruction: note.instruction,
              type: note.type,
              mode: note.mode || 'auto',
              strength: typeof note.strength === 'number' ? note.strength : 0.8,
          }));
          const extractedNotesText = extractedNotes
              .map((note, index) => `${index + 1}. ${note.instruction}`)
              .join('\n');

          const referenceDocument = referenceItems
              .filter((reference) => reference.file)
              .map((reference) => ({ id: reference.id, role: reference.role }));

          const comfyAgenticWorkflowId = selectedProvider === 'comfy'
              ? (selectedComfyWorkflowId || getPreferredComfyAgenticWorkflow(availableComfyWorkflowIds))
              : '';
          const providerModel = resolvedAgenticProvider === 'nanobanana'
              ? 'nanobanana-2'
              : selectedProvider === 'comfy'
                  ? resolveFluxModelFromWorkflowId(comfyAgenticWorkflowId)
                  : 'flux-kontext';

          const providerParams: Record<string, unknown> = {
              extractedNotes,
              extractedNotesText,
          };

          if (selectedProvider === 'comfy') {
              const qualityProfile = resolveComfyQualityProfile(
                  comfyAgenticWorkflowId || COMFY_AGENTIC_EDIT_WORKFLOW_9B,
                  selectedComfyModelPresetId || 'default',
                  imageDimensions.width,
                  imageDimensions.height,
                  'img2img'
              );

              providerParams.connection = {
                  mode: comfyConnectionMode,
                  localUrl: comfyServerUrl,
                  cloudUrl: comfyCloudUrl,
                  cloudApiKey: comfyCloudApiKey,
              };
              providerParams.comfyTask = 'img2img';
              providerParams.workflowId = comfyAgenticWorkflowId || COMFY_AGENTIC_EDIT_WORKFLOW_9B;
              providerParams.modelPresetId = selectedComfyModelPresetId || 'default';
              providerParams.width = qualityProfile.width;
              providerParams.height = qualityProfile.height;
              providerParams.steps = qualityProfile.steps;
              providerParams.cfg = qualityProfile.cfg;
              providerParams.strength = qualityProfile.strength;
              providerParams.seed = qualityProfile.seed;
              providerParams.referenceRoles = referenceDocument.map((reference) => reference.role);
              providerParams.referenceCount = referenceDocument.length;
          }

          if (selectedProvider === 'banana') {
              providerParams.apiKey = getProviderKey('banana');
          }

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
                  model: providerModel,
                  params: providerParams,
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
          formData.append('embedded_notes_image', layerArtifacts.notesOverlayFile);
          formData.append('combined_mask', layerArtifacts.combinedMaskFile);
          formData.append('annotations_json', JSON.stringify(annotationDocument));
          formData.append('prompt_positive', compiledPrompts.positive);
          formData.append('prompt_negative', compiledPrompts.negative);
          formData.append('provider_name', annotationDocument.provider.name);
          formData.append('provider_model', annotationDocument.provider.model);
          formData.append('provider_params', JSON.stringify(annotationDocument.provider.params));
          formData.append('additional_notes_text', extractedNotesText);
          formData.append('additional_notes_json', JSON.stringify(extractedNotes));

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
              signal: aiAbortController.signal,
          });

          const queueData = await queueResponse.json();
          if (!queueResponse.ok || !queueData.job_id) {
              throw new Error(queueData.message || 'Failed to queue AI Edit Notes job.');
          }

          const jobId = queueData.job_id as string;
          setStatusMessage(`Job queued (${jobId.slice(-8)}). Waiting for worker...`);

          let completedResultUrl = '';
          const startedAt = Date.now();
          while (Date.now() - startedAt < AI_EDIT_NOTES_MAX_WAIT_MS) {
              if (aiEditNotesAbortRequestedRef.current) {
                  throw new DOMException('Aborted', 'AbortError');
              }

              await waitWithAbort(AI_EDIT_NOTES_POLL_INTERVAL_MS, aiAbortController.signal);

              const statusResponse = await fetch(`/api/jobs/${jobId}`, {
                  signal: aiAbortController.signal,
              });
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
                  const resultResponse = await fetch(`/api/jobs/${jobId}/result`, {
                      signal: aiAbortController.signal,
                  });
                  const resultData = await resultResponse.json();
                  if (!resultResponse.ok || !resultData.imageUrl) {
                      throw new Error(resultData.message || 'Job completed but result image is unavailable.');
                  }
                  completedResultUrl = resultData.imageUrl as string;
                  break;
              }
          }

          if (!completedResultUrl) {
              throw new Error('Timed out waiting for AI Edit Notes result after 30 minutes.');
          }

          setGeneratedImage(completedResultUrl);
          setStatusMessage('AI Edit Notes generation complete!');
          aiEditNotesAbortControllerRef.current = null;
          setIsGenerating(false);
          return;
      }

      if (selectedProvider === 'comfy') {
          comfyCancelRequestedRef.current = false;
          const comfyRunToken = ++comfyRunTokenRef.current;

          if (!selectedComfyWorkflowId) {
              throw new Error('No ComfyUI workflow is selected.');
          }

          if (!selectedComfyModelPresetId) {
              throw new Error('No ComfyUI model preset is selected.');
          }

          const referenceBlendHint = referenceItems
              .filter((reference) => reference.file)
              .map((reference, index) => `Ref ${index + 1} (${reference.role})`)
              .slice(0, 12)
              .join(', ');

          const comfyPrompt = referenceBlendHint
              ? `${prompt}\n\nReference blending guidance: combine or replace target objects using ${referenceBlendHint}. Preserve composition and lighting consistency.`
              : prompt;

          const params: Record<string, unknown> = {
              prompt: comfyPrompt,
              negativePrompt: globalNegativePrompt,
              width: currentW,
              height: currentH,
          };

          if (selectedComfyTask !== 'generate') {
              const sourceImage = captureComfySourceImage();
              if (!sourceImage) {
                  throw new Error('Select an image or zone on the canvas before running this ComfyUI task.');
              }

              const sourceInspection = await inspectCapturedSourceDataUrl(sourceImage);
              if (sourceInspection.looksBlank) {
                  throw new Error(
                      `The captured source for ${COMFY_TASK_OPTIONS.find((task) => task.id === selectedComfyTask)?.label || selectedComfyTask} is almost entirely blank. `
                      + 'Move the zone over real image content, or switch the task to Text to Image for prompt-only generation.'
                  );
              }

              const sourceDimensions = await readImageDimensions(sourceImage);
              params.image = sourceImage;

              if (selectedComfyTask === 'img2img') {
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

          const qualityProfile = resolveComfyQualityProfile(
              selectedComfyWorkflowId,
              selectedComfyModelPresetId,
              Number(params.width) || currentW,
              Number(params.height) || currentH,
              selectedComfyTask
          );

          params.width = qualityProfile.width;
          params.height = qualityProfile.height;
          params.steps = qualityProfile.steps;
          params.cfg = qualityProfile.cfg;
          params.seed = qualityProfile.seed;

          if (selectedComfyTask === 'img2img' || selectedComfyTask === 'inpaint' || selectedComfyTask === 'outpaint') {
              params.strength = qualityProfile.strength;
          }

          const comfyProfileKey = `${selectedComfyTask}::${selectedComfyWorkflowId}::${selectedComfyModelPresetId}`;
          if (!warmedComfyProfilesRef.current.has(comfyProfileKey)) {
              setStatusMessage('Preloading ComfyUI model/workflow (one-time for this selection)...');

              const warmupParams: Record<string, unknown> = {
                  ...params,
                  prompt: 'warmup pass',
                  negativePrompt: '',
                  width: Math.max(512, Math.min(768, Number(params.width) || 512)),
                  height: Math.max(512, Math.min(768, Number(params.height) || 512)),
                  steps: 1,
                  cfg: 1,
                  strength: selectedComfyTask === 'img2img' || selectedComfyTask === 'inpaint' || selectedComfyTask === 'outpaint'
                      ? Math.min(0.4, Number(params.strength) || 0.35)
                      : params.strength,
              };

              await executeComfyTask({
                  connection: {
                      mode: comfyConnectionMode,
                      localUrl: comfyServerUrl,
                      cloudUrl: comfyCloudUrl,
                      cloudApiKey: comfyCloudApiKey,
                  },
                  task: selectedComfyTask,
                  workflowId: selectedComfyWorkflowId,
                  modelPresetId: selectedComfyModelPresetId,
                  params: warmupParams,
                  onProgress: (progress) => {
                      if (comfyCancelRequestedRef.current || comfyRunToken !== comfyRunTokenRef.current) {
                          return;
                      }

                      const elapsedMs = progress.elapsedMs || 0;
                      const seconds = Math.max(1, Math.round(elapsedMs / 1000));
                      if (progress.stage === 'waiting-history' && elapsedMs >= 30000) {
                          setStatusMessage(`ComfyUI warmup: loading model weights into VRAM (${seconds}s)...`);
                          return;
                      }
                      if (progress.message && progress.message.trim().length > 0) {
                          setStatusMessage(`ComfyUI warmup: ${progress.message} • ${seconds}s`);
                      }
                  },
              });

              if (comfyCancelRequestedRef.current || comfyRunToken !== comfyRunTokenRef.current) {
                  setIsGenerating(false);
                  return;
              }

              warmedComfyProfilesRef.current.add(comfyProfileKey);
              setStatusMessage('ComfyUI warmup complete. Starting full-quality render...');
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
              onPrepared: (prepared) => {
                  const preparedPositivePrompt = readPreparedComfyText(prepared.boundInputValues.prompt);
                  const preparedNegativePrompt = readPreparedComfyText(prepared.boundInputValues.negativePrompt);

                  if (workflowRequiresPositivePrompt(prepared.workflow.inputBindings) && !preparedPositivePrompt) {
                      throw new Error(
                          `Prepared ComfyUI workflow "${prepared.workflow.id}" has an empty positive prompt. `
                          + 'This workflow is not binding the text prompt correctly.'
                      );
                  }

                  const snapshot: ComfyPreparedRequestSnapshot = {
                      createdAt: new Date().toISOString(),
                      task: selectedComfyTask,
                      workflowId: prepared.workflow.id,
                      workflowName: prepared.workflow.name,
                      modelPresetId: prepared.modelPreset.id,
                      modelPresetName: prepared.modelPreset.name,
                      uiPrompt: comfyPrompt,
                      preparedPositivePrompt,
                      preparedNegativePrompt,
                      width: Number(params.width) || currentW,
                      height: Number(params.height) || currentH,
                      hasImage: typeof params.image === 'string' && params.image.length > 0,
                      hasMask: typeof params.mask === 'string' && params.mask.length > 0,
                  };

                  writePreparedComfyRequestSnapshot(snapshot);
                  console.info('Prepared ComfyUI workflow request', snapshot);
                  setStatusMessage(
                      preparedPositivePrompt
                          ? `Sending workflow to ComfyUI... prompt: ${truncateComfyPromptForStatus(preparedPositivePrompt)}`
                          : 'Sending workflow to ComfyUI...'
                  );
              },
              onQueued: (promptId) => {
                  queuedPromptId = promptId;
                  currentComfyPromptIdRef.current = promptId;
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
                  if (comfyCancelRequestedRef.current || comfyRunToken !== comfyRunTokenRef.current) {
                      return;
                  }

                  if (progress.message && progress.message.trim().length > 0) {
                      setStatusMessage(`ComfyUI: ${progress.message} • ${formatElapsedSeconds(progress.elapsedMs)}`);
                      return;
                  }

                  if (progress.stage === 'waiting-history') {
                      const elapsedMs = progress.elapsedMs || 0;
                      if (elapsedMs >= 45000) {
                          setStatusMessage(`ComfyUI is loading models or waiting on queue (first runs can take longer) • ${formatElapsedSeconds(elapsedMs)}`);
                          return;
                      }
                      setStatusMessage(`ComfyUI is still processing (loading models or running queue) • ${formatElapsedSeconds(elapsedMs)}`);
                      return;
                  }

                  const percent = Math.max(0, Math.min(100, Math.round(progress.progress * 100)));
                  const nodeLabel = progress.nodeId ? `node ${progress.nodeId}` : 'current node';
                  setStatusMessage(`ComfyUI running: ${nodeLabel} (${percent}%) • ${formatElapsedSeconds(progress.elapsedMs)}`);
              },
          });

          if (comfyCancelRequestedRef.current || comfyRunToken !== comfyRunTokenRef.current) {
              setIsGenerating(false);
              return;
          }

          if (execution.result.dataUrl) {
              setGeneratedImage(execution.result.dataUrl);
              setStatusMessage(`Generation complete via ${execution.workflow.name}.`);
              clearPendingComfyJob();
              currentComfyPromptIdRef.current = '';
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
            const localAiPreferences = selectedProvider === 'ollama'
                    ? loadLocalAiPreferences()
                    : null;

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
                    apiKey: currentKey,
                    localAiBaseUrl: localAiPreferences?.ollamaBaseUrl,
                    localAiModel: localAiPreferences?.ollamaModel,
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
                        const isAbortError = error instanceof DOMException && error.name === 'AbortError';
                        if (isAbortError) {
                                setStatusMessage('AI Edit Notes request was aborted by user.');
                        } else {
                                const message = error instanceof Error ? error.message : 'Unknown error';
                                const missingModel = selectedProvider === 'ollama'
                                    ? parseMissingOllamaModelMessage(message)
                                    : null;

                                if (missingModel) {
                                    const confirmed = await dialog.confirm(
                                        `Model "${missingModel.model}" is not installed in Ollama yet. Download and install it now?`,
                                        {
                                            title: 'Install missing Ollama model',
                                            confirmText: 'Install model',
                                            cancelText: 'Not now',
                                        }
                                    );

                                    if (confirmed) {
                                        setStatusMessage(`Installing ${missingModel.model} from Ollama...`);
                                        try {
                                            const preferences = loadLocalAiPreferences();
                                            const result = await requestOllamaModelInstall({
                                                baseUrl: missingModel.baseUrl || preferences.ollamaBaseUrl,
                                                model: missingModel.model,
                                            });
                                            setStatusMessage(`${result.message} Click Generate again to continue.`);
                                        } catch (installError) {
                                            setStatusMessage(`Error: ${installError instanceof Error ? installError.message : 'Failed to install the Ollama model.'}`);
                                        }
                                    } else {
                                        setStatusMessage(`Error: ${message}`);
                                    }
                                } else {
                                    setStatusMessage(`Error: ${message}`);
                                }
                        }
            aiEditNotesAbortControllerRef.current = null;
            aiEditNotesAbortRequestedRef.current = false;
      setIsGenerating(false);
    }
  };

    const handleAbortAiEditNotes = useCallback(() => {
            aiEditNotesAbortRequestedRef.current = true;
            aiEditNotesAbortControllerRef.current?.abort();
            setStatusMessage('Aborting AI Edit Notes request...');
    }, []);

  const hasStabilityAccess = availableProviders.includes('stability');
  const selectedComfyWorkflow = selectedComfyWorkflowId
      ? comfyWorkflowRegistry.getWorkflow(selectedComfyWorkflowId)
      : null;
  const availableComfyModelOptions = buildComfyTaskModelOptions(selectedComfyTask, availableComfyWorkflowIds);
  const selectedComfyModelChoiceId = selectedComfyWorkflowId && selectedComfyModelPresetId
      ? `${selectedComfyWorkflowId}::${selectedComfyModelPresetId}`
      : (availableComfyModelOptions[0]?.id || '');
  const selectedComfyModelOption = findComfyTaskModelOption(
      selectedComfyTask,
      availableComfyWorkflowIds,
      selectedComfyWorkflowId,
      selectedComfyModelPresetId,
  );
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
    const selectedComfyWorkflowForPreview = selectedComfyWorkflowId || getPreferredComfyAgenticWorkflow(availableComfyWorkflowIds);
    const adaptiveQualityPreview = resolveComfyQualityProfile(
        selectedComfyWorkflowForPreview,
        selectedComfyModelPresetId || 'default',
        zoneWidth,
        zoneHeight,
        selectedProvider === 'comfy' ? selectedComfyTask : 'generate'
    );
    const autoAdjustedZoneHeight = selectedProvider === 'comfy'
        ? adaptManualSizeToSelectedModel(zoneWidth, zoneHeight).height
        : zoneHeight;
    const isCurrentSizeModelPerfect = zoneWidth === adaptiveQualityPreview.width
        && zoneHeight === adaptiveQualityPreview.height;
    const modalWidth = isAiNotesExpandedLayout ? 'min(96vw, 1180px)' : 'min(94vw, 760px)';
    const modalHeight = isAiNotesExpandedLayout ? 'min(88vh, 900px)' : 'min(84vh, 760px)';
    const modalMinWidth = isAiNotesExpandedLayout ? 'min(760px, 96vw)' : 'min(520px, 94vw)';
    const modalMinHeight = isAiNotesExpandedLayout ? 'min(560px, 88vh)' : 'min(520px, 84vh)';

  useEffect(() => {
      if (availableComfyModelOptions.length === 0) {
          return;
      }

      const currentSelection = availableComfyModelOptions.find((option) => option.id === `${selectedComfyWorkflowId}::${selectedComfyModelPresetId}`);
      if (currentSelection) {
          return;
      }

      const fallbackSelection = availableComfyModelOptions[0];
      setSelectedComfyWorkflowId(fallbackSelection.workflowId);
      setSelectedComfyModelPresetId(fallbackSelection.modelPresetId);
      saveComfyTaskPreference(selectedComfyTask, {
          workflowId: fallbackSelection.workflowId,
          modelPresetId: fallbackSelection.modelPresetId,
      });
  }, [availableComfyModelOptions, selectedComfyModelPresetId, selectedComfyTask, selectedComfyWorkflowId]);

  if (!isOpen) return null;

  return (
        <div 
                        className="fixed z-[100] flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                        data-testid="generative-modal"
      style={{
          left: position.x,
                    top: position.y,
                    width: modalWidth,
                    height: modalHeight,
                    minWidth: modalMinWidth,
                    minHeight: modalMinHeight,
                    maxWidth: '96vw',
                    maxHeight: '88vh',
                    resize: 'both',
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
      
    <div className="flex-1 min-h-0 overflow-y-auto bg-background p-4 no-drag">
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
                      <div className="space-y-1 rounded-md border bg-secondary/20 p-2">
                          <div className="grid grid-cols-2 gap-1">
                              <input
                                  type="number"
                                  min={1}
                                  className="w-full rounded border bg-background p-1 text-xs"
                                  value={zoneWidth}
                                  onChange={(event) => {
                                      const parsed = Number(event.target.value);
                                      if (Number.isFinite(parsed)) {
                                          applyManualZoneWidthLocked(parsed);
                                      }
                                  }}
                                  title="Custom width (free input)"
                              />
                              <input
                                  type="number"
                                  min={1}
                                  className="w-full rounded border bg-secondary/40 p-1 text-xs text-muted-foreground"
                                  value={autoAdjustedZoneHeight}
                                  readOnly
                                  title="Auto-adjusted model-optimized height"
                              />
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                              Custom aspect: {zoneWidth}×{zoneHeight}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                              Model-adapted: {adaptiveQualityPreview.width}×{adaptiveQualityPreview.height}
                          </div>
                          {selectedProvider === 'comfy' && !isCurrentSizeModelPerfect && (
                              <div className="text-[10px] text-amber-400">
                                  Size is not perfect for selected model; render will snap to {adaptiveQualityPreview.width}×{adaptiveQualityPreview.height}.
                              </div>
                          )}
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
                               <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Model</label>
                               <select
                                   className="w-full text-xs p-2 rounded-md border bg-background"
                                   value={selectedComfyModelChoiceId}
                                   onChange={(event) => handleComfyModelChoiceChange(event.target.value)}
                               >
                                   {availableComfyModelOptions.map((option) => (
                                       <option key={option.id} value={option.id}>
                                           {option.label}{option.memoryLabel ? ` - ${option.memoryLabel}` : ''}
                                       </option>
                                   ))}
                               </select>
                           </div>

                           <div className="space-y-1">
                               <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Workflow Variant</label>
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
                       </div>

                       {selectedComfyModelOption && (
                           <div className="text-[10px] text-muted-foreground rounded border border-border/60 bg-background/40 px-2 py-1.5 space-y-1">
                               <div>
                                   <span className="font-medium text-foreground">{selectedComfyModelOption.label}</span>
                                   {selectedComfyModelOption.memoryLabel ? ` · Expected memory: ${selectedComfyModelOption.memoryLabel}` : ''}
                               </div>
                               <div>{selectedComfyModelOption.description}</div>
                               <div>Workflow variant: <span className="font-medium text-foreground">{selectedComfyModelOption.workflowName}</span></div>
                           </div>
                       )}

                       {selectedComfyTask !== 'generate' && (
                           <div className="text-[10px] text-muted-foreground rounded border border-border/60 bg-background/40 px-2 py-1.5">
                               {COMFY_TASK_OPTIONS.find((task) => task.id === selectedComfyTask)?.label || 'This task'} uses the current zone as a source image. If the zone is over empty canvas, switch the task to <span className="font-medium text-foreground">Text to Image</span>.
                           </div>
                       )}

                       <button
                           type="button"
                           onClick={handleVerifyComfyConnection}
                           disabled={isCheckingComfyConnection || isGenerating}
                           className="w-full rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                       >
                           {isCheckingComfyConnection ? 'Checking connection...' : 'Verify ComfyUI Connection'}
                       </button>

                       <button
                           type="button"
                           onClick={() => {
                               void handleInspectComfyDiagnostics();
                           }}
                           disabled={isInspectingComfyDiagnostics || isGenerating}
                           className="w-full rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                       >
                           {isInspectingComfyDiagnostics ? 'Loading ComfyUI diagnostics...' : 'Show ComfyUI Diagnostics'}
                       </button>

                       {isGenerating && selectedProvider === 'comfy' && !useAgenticEditNotes && (
                           <button
                               type="button"
                               onClick={handleCancelComfyRun}
                               className="w-full rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary"
                           >
                               Cancel Active Comfy Job
                           </button>
                       )}

                       {comfyConnectionStatusMessage && (
                           <div className="text-[10px] text-muted-foreground border border-border/60 rounded-md px-2 py-1 bg-background/60">
                               {comfyConnectionStatusMessage}
                           </div>
                       )}

                       {comfyCatalogStatusMessage && (
                           <div className="text-[10px] text-muted-foreground border border-border/60 rounded-md px-2 py-1 bg-background/60">
                               {comfyCatalogStatusMessage}
                           </div>
                       )}

                       {comfyMissingRequirements && (
                           <div className="text-[10px] text-muted-foreground border border-amber-500/30 rounded-md px-2 py-2 bg-amber-500/10 space-y-2">
                               <div>
                                   Missing Comfy requirements detected for {comfyMissingRequirements.workflows.join(', ')}.
                               </div>
                               <div>
                                   {comfyMissingRequirements.updateInstall ? 'ComfyUI install update required. ' : ''}
                                   {comfyMissingRequirements.models.length > 0
                                       ? `Missing models: ${comfyMissingRequirements.models.map((model) => model.name).join(', ')}.`
                                       : 'No model downloads required.'}
                               </div>
                               <button
                                   type="button"
                                   onClick={() => {
                                       void installMissingComfyRequirements(comfyMissingRequirements);
                                   }}
                                   disabled={isCheckingComfyConnection || isInstallingComfyRequirements || isGenerating}
                                   className="w-full rounded-md border border-amber-500/40 px-3 py-2 text-xs font-medium text-foreground hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                               >
                                   {isInstallingComfyRequirements ? 'Installing missing requirements...' : 'Install Missing Requirements'}
                               </button>
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

                       <ComfyWorkflowLibraryPanel
                           connectionMode={comfyConnectionMode}
                           comfyServerUrl={comfyServerUrl}
                           comfyCloudUrl={comfyCloudUrl}
                           comfyCloudApiKey={comfyCloudApiKey}
                           installPath={comfyInstallPath}
                           customNodesPath={comfyCustomNodesPath}
                           workflowLibraryPath={comfyWorkflowLibraryPath}
                           selectedTask={selectedComfyTask}
                           onUseWorkflow={handleUseComfyLibraryWorkflow}
                           onWorkflowsDiscovered={handleDiscoveredComfyWorkflows}
                       />
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

                    {useAgenticEditNotes && (
                         <div className="text-[10px] text-muted-foreground border border-border/60 rounded-md px-2 py-1 bg-background/60">
                              AI Edit Notes jobs may take up to 30+ minutes. Use <span className="font-medium text-foreground">Abort</span> in status to stop a running request.
                         </div>
                    )}


                    {showComfyDiagnosticsPopup && (
                        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
                            <div className="flex h-full max-h-[80vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-card shadow-2xl">
                                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                                    <div>
                                        <h3 className="text-sm font-semibold text-foreground">ComfyUI Diagnostics</h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            Runtime config, resolved paths, assets, workflows, and node inventory from the connected ComfyUI server.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowComfyDiagnosticsPopup(false)}
                                        className="rounded-md border border-border p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                                        aria-label="Close ComfyUI diagnostics"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>

                                <div className="flex-1 p-4 min-h-0">
                                    <textarea
                                        aria-label="ComfyUI diagnostics output"
                                        value={comfyDiagnosticsText}
                                        readOnly
                                        className="h-full min-h-[420px] w-full resize-none rounded-lg border border-border bg-background px-3 py-3 font-mono text-[11px] leading-5 text-foreground outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
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
                          {isGenerating && useAgenticEditNotes && (
                              <button
                                  type="button"
                                  onClick={handleAbortAiEditNotes}
                                  className="rounded border border-border/70 bg-background/70 px-2 py-0.5 text-[10px] font-medium hover:bg-background"
                              >
                                  Abort
                              </button>
                          )}
                          {isGenerating && !useAgenticEditNotes && selectedProvider === 'comfy' && (
                              <button
                                  type="button"
                                  onClick={handleCancelComfyRun}
                                  className="rounded border border-border/70 bg-background/70 px-2 py-0.5 text-[10px] font-medium hover:bg-background"
                              >
                                  Cancel Job
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
