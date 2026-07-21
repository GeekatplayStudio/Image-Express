'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import * as fabric from 'fabric';

import { buildFrameZipEntryName, dataUrlToBlob } from '@/components/Editor/editorExportUtils';
import { runWithExportOverlays } from '@/components/Editor/editorExportOverlays';
import {
    MEDIA_OVERLAY_PRESETS,
    type MediaOverlayNamingTemplate,
} from '@/components/Editor/editorViewConfig';
import { resolveEditorExportCropBounds } from '@/components/Editor/editorExportCrop';
import type { MediaOverlayFrameConfig } from '@/components/Editor/mediaOverlayTypes';
import type {
    ArtboardRectWithBackground,
    CanvasWithArtboard,
    ExportDataUrlOptions,
} from '@/components/Editor/editorView.types';
import { useEditorCanvasExportSupport } from '@/components/Editor/useEditorCanvasExportSupport';
import { useMediaOverlay } from '@/components/Editor/useMediaOverlay';
import { serializeCanvas } from '@/lib/fabric-utils';

const CANVAS_WIDTH = 2200;
const CANVAS_HEIGHT = 1600;
const ARTBOARD = {
    left: 160,
    top: 120,
    width: 1200,
    height: 800,
};
const HARNESS_DESIGN_NAME = 'Harness Design';
const CUSTOM_HISTORY_PROPS: string[] = [];

type SaveResult = {
    id: string;
    name: string;
};

function triggerDownload(url: string, filename: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function triggerBlobDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    triggerDownload(url, filename);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildHarnessCanvas(canvasElement: HTMLCanvasElement) {
    const nextCanvas = new fabric.Canvas(canvasElement, {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: '#0f172a',
        preserveObjectStacking: true,
    });
    const runtimeCanvas = nextCanvas as CanvasWithArtboard;

    const artboardRect = new fabric.Rect({
        left: ARTBOARD.left,
        top: ARTBOARD.top,
        width: ARTBOARD.width,
        height: ARTBOARD.height,
        fill: '#ffffff',
        stroke: '#94a3b8',
        strokeWidth: 2,
        selectable: false,
        evented: false,
    }) as ArtboardRectWithBackground;
    artboardRect.canvasBackgroundColor = '#ffffff';
    artboardRect.canvasBackgroundEnabled = true;

    runtimeCanvas.artboard = { ...ARTBOARD };
    runtimeCanvas.artboardRect = artboardRect;

    const headline = new fabric.Textbox('Campaign Variant Harness', {
        left: 260,
        top: 180,
        width: 500,
        fontSize: 48,
        fontWeight: '700',
        fill: '#0f172a',
    });
    const accent = new fabric.Rect({
        left: 260,
        top: 320,
        width: 360,
        height: 220,
        fill: '#2563eb',
        rx: 24,
        ry: 24,
    });
    const badge = new fabric.Circle({
        left: 760,
        top: 260,
        radius: 96,
        fill: '#f97316',
    });
    const body = new fabric.Textbox('Batch ZIP and variant export verification', {
        left: 260,
        top: 580,
        width: 620,
        fontSize: 32,
        fill: '#334155',
    });

    nextCanvas.add(artboardRect, headline, accent, badge, body);
    nextCanvas.setViewportTransform([0.62, 0, 0, 0.62, 20, 18]);
    nextCanvas.requestRenderAll();

    return nextCanvas;
}

export default function MediaOverlayVerificationHarness() {
    const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
    const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
    const [designId, setDesignId] = useState<string | null>(null);
    const [designName, setDesignName] = useState(HARNESS_DESIGN_NAME);
    const [statusMessage, setStatusMessage] = useState('Preparing harness...');
    const [seedStep, setSeedStep] = useState<'preset-square' | 'add-square' | 'preset-facebook' | 'add-facebook' | 'select-first' | 'ready'>('preset-square');
    const [isBusy, setIsBusy] = useState(false);
    const [lastSaveResult, setLastSaveResult] = useState<SaveResult | null>(null);

    useEffect(() => {
        if (!canvasElementRef.current) return undefined;

        const nextCanvas = buildHarnessCanvas(canvasElementRef.current);
        setCanvas(nextCanvas);

        return () => {
            setCanvas(null);
            nextCanvas.dispose();
        };
    }, []);

    const {
        getCanvasBackgroundSettings,
        withViewportReset,
        safeCanvasToDataURL,
    } = useEditorCanvasExportSupport({ canvas });

    const toast = useCallback((options: { title: string; description: string; variant: 'success' | 'warning' | 'destructive' }) => {
        setStatusMessage(`${options.title}: ${options.description}`);
    }, []);

    const {
        mediaOverlayEnabled,
        mediaOverlayFrames,
        activeMediaOverlayFrameId,
        mediaOverlayFrameRef,
        mediaOverlayLabelRef,
        mediaOverlayNamingTemplate,
        setMediaOverlayNamingTemplate,
        getMediaOverlayBatchTargets,
        handleMediaOverlayPresetChange,
        handleAddMediaOverlayFrame,
        handleSelectMediaOverlayFrame,
        handleConvertActiveMediaOverlayFrameToVariant,
    } = useMediaOverlay({
        canvas,
        designId,
        designName,
        onDirty: () => undefined,
        pushHistory: () => undefined,
        toast,
        confirm: async () => true,
        onVariantDraftCreated: (nextName) => {
            setDesignId(null);
            setDesignName(nextName);
        },
    });

    useEffect(() => {
        if (mediaOverlayNamingTemplate !== 'design-preset-date-frame') {
            setMediaOverlayNamingTemplate('design-preset-date-frame');
        }
    }, [mediaOverlayNamingTemplate, setMediaOverlayNamingTemplate]);

    useEffect(() => {
        if (!canvas || !mediaOverlayEnabled) return;

        if (seedStep === 'preset-square') {
            handleMediaOverlayPresetChange('instagram-square');
            setSeedStep('add-square');
            return;
        }

        if (seedStep === 'add-square') {
            if (mediaOverlayFrames.length === 0) {
                handleAddMediaOverlayFrame();
                return;
            }
            setSeedStep('preset-facebook');
            return;
        }

        if (seedStep === 'preset-facebook') {
            handleMediaOverlayPresetChange('facebook-post');
            setSeedStep('add-facebook');
            return;
        }

        if (seedStep === 'add-facebook') {
            if (mediaOverlayFrames.length === 1) {
                handleAddMediaOverlayFrame();
                return;
            }
            setSeedStep('select-first');
            return;
        }

        if (seedStep === 'select-first') {
            const firstFrame = mediaOverlayFrames[0];
            if (!firstFrame) return;
            if (activeMediaOverlayFrameId !== firstFrame.id) {
                handleSelectMediaOverlayFrame(firstFrame.id);
                return;
            }
            setSeedStep('ready');
            setStatusMessage('Harness ready');
        }
    }, [
        activeMediaOverlayFrameId,
        canvas,
        handleAddMediaOverlayFrame,
        handleMediaOverlayPresetChange,
        handleSelectMediaOverlayFrame,
        mediaOverlayEnabled,
        mediaOverlayFrames,
        seedStep,
    ]);

    const activeFrame = useMemo<MediaOverlayFrameConfig | null>(() => {
        if (mediaOverlayFrames.length === 0) return null;
        if (!activeMediaOverlayFrameId) return mediaOverlayFrames[0] ?? null;
        return mediaOverlayFrames.find((frame) => frame.id === activeMediaOverlayFrameId) ?? mediaOverlayFrames[0] ?? null;
    }, [activeMediaOverlayFrameId, mediaOverlayFrames]);

    const withOverlayExport = useCallback(async (action: () => Promise<void>) => {
        if (!canvas) return;
        await runWithExportOverlays({
            canvas,
            profileSettings: null,
            fallbackUser: 'e2e',
            overlayFrame: mediaOverlayFrameRef.current,
            overlayLabel: mediaOverlayLabelRef.current,
            setIsExporting: setIsBusy,
        }, action);
    }, [canvas, mediaOverlayFrameRef, mediaOverlayLabelRef]);

    const exportBatchZip = useCallback(async () => {
        if (!canvas) return;
        const targets = getMediaOverlayBatchTargets('all');
        if (targets.length === 0) {
            setStatusMessage('No media overlay frames available for batch export.');
            return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const background = getCanvasBackgroundSettings();

        await withOverlayExport(async () => {
            const zip = new JSZip();

            targets.forEach((frame, index) => {
                const options: ExportDataUrlOptions = {
                    format: 'png',
                    quality: 1,
                    multiplier: 1,
                    enableRetinaScaling: true,
                    left: frame.bounds.left,
                    top: frame.bounds.top,
                    width: frame.bounds.width,
                    height: frame.bounds.height,
                    backgroundColor: background.enabled ? background.color : undefined,
                };
                const dataUrl = safeCanvasToDataURL(options);
                zip.file(buildFrameZipEntryName(frame, index, timestamp, {
                    designName,
                    namingTemplate: mediaOverlayNamingTemplate as MediaOverlayNamingTemplate,
                }), dataUrlToBlob(dataUrl));
            });

            const blob = await zip.generateAsync({ type: 'blob' });
            triggerBlobDownload(blob, `media-overlay-${timestamp}-all-frames.zip`);
        });

        setStatusMessage(`Batch ZIP exported with ${targets.length} frames.`);
    }, [
        canvas,
        designName,
        getCanvasBackgroundSettings,
        getMediaOverlayBatchTargets,
        mediaOverlayNamingTemplate,
        safeCanvasToDataURL,
        withOverlayExport,
    ]);

    const convertActiveFrame = useCallback(async () => {
        await handleConvertActiveMediaOverlayFrameToVariant();
    }, [handleConvertActiveMediaOverlayFrameToVariant]);

    const saveVariantDraft = useCallback(async () => {
        if (!canvas) return;

        setIsBusy(true);
        setStatusMessage('Saving variant draft...');

        try {
            const thumbnailDataUrl = await withViewportReset(() => safeCanvasToDataURL({
                format: 'png',
                multiplier: 0.5,
                enableRetinaScaling: true,
                quality: 1,
            }));

            const response = await fetch('/api/designs/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: designId,
                    name: designName,
                    canvasData: serializeCanvas(canvas, CUSTOM_HISTORY_PROPS),
                    thumbnailDataUrl,
                }),
            });
            const result = await response.json() as {
                success?: boolean;
                message?: string;
                design?: { id: string; name: string };
            };

            if (!response.ok || !result.success || !result.design) {
                throw new Error(result.message || 'Failed to save variant draft.');
            }

            const nextSaveResult = {
                id: result.design.id,
                name: result.design.name,
            };
            setDesignId(nextSaveResult.id);
            setDesignName(nextSaveResult.name);
            setLastSaveResult(nextSaveResult);
            setStatusMessage(`Saved variant draft as ${nextSaveResult.id}.`);
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : 'Failed to save variant draft.');
        } finally {
            setIsBusy(false);
        }
    }, [canvas, designId, designName, safeCanvasToDataURL, withViewportReset]);

    const exportVariantPng = useCallback(async () => {
        if (!canvas) return;
        const crop = resolveEditorExportCropBounds(canvas as CanvasWithArtboard);
        const background = getCanvasBackgroundSettings();

        await withOverlayExport(async () => {
            const dataUrl = await withViewportReset(() => safeCanvasToDataURL({
                format: 'png',
                quality: 1,
                multiplier: 1,
                enableRetinaScaling: true,
                left: crop.left,
                top: crop.top,
                width: crop.width,
                height: crop.height,
                backgroundColor: background.enabled ? background.color : undefined,
            }));
            triggerDownload(dataUrl, 'variant-draft.png');
        });

        setStatusMessage(`Variant PNG exported at ${Math.round(crop.width)}x${Math.round(crop.height)}.`);
    }, [canvas, getCanvasBackgroundSettings, safeCanvasToDataURL, withOverlayExport, withViewportReset]);

    const activePresetLabel = useMemo(() => {
        if (!activeFrame) return 'none';
        return MEDIA_OVERLAY_PRESETS.find((preset) => preset.id === activeFrame.preset)?.exportToken || activeFrame.preset;
    }, [activeFrame]);

    const variantReady = mediaOverlayFrames.length === 0 && designName.includes('Instagram 1:1');

    return (
        <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
            <div className="mx-auto flex max-w-6xl flex-col gap-6">
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold">Media Overlay Verification Harness</h1>
                    <p className="text-sm text-slate-300">
                        Browser-level verification for media-overlay batch ZIP export plus variant-draft conversion, save, and export flows.
                    </p>
                    <p data-testid="media-overlay-harness-status" className="text-sm font-medium text-emerald-300">
                        {statusMessage}
                    </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-2xl">
                        <canvas ref={canvasElementRef} className="max-w-full rounded-lg bg-slate-800" />
                    </div>

                    <div className="relative z-10 space-y-4 rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-2xl">
                        <div className="space-y-1 text-sm">
                            <div data-testid="media-overlay-frame-count">Frames: {mediaOverlayFrames.length}</div>
                            <div data-testid="media-overlay-active-preset">Active preset: {activePresetLabel}</div>
                            <div data-testid="media-overlay-design-id">Design ID: {designId || 'unsaved'}</div>
                            <div data-testid="media-overlay-design-name">Design Name: {designName}</div>
                            <div data-testid="media-overlay-last-save">Last Save: {lastSaveResult?.id || 'none'}</div>
                            <div data-testid="media-overlay-variant-ready">Variant Ready: {variantReady ? 'yes' : 'no'}</div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <button
                                type="button"
                                onClick={() => { void exportBatchZip(); }}
                                disabled={seedStep !== 'ready' || isBusy}
                                className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Export Batch ZIP
                            </button>
                            <button
                                type="button"
                                onClick={() => { void convertActiveFrame(); }}
                                disabled={seedStep !== 'ready' || !activeFrame || isBusy}
                                className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Convert Active Frame
                            </button>
                            <button
                                type="button"
                                onClick={() => { void saveVariantDraft(); }}
                                disabled={!variantReady || isBusy}
                                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Save Variant Draft
                            </button>
                            <button
                                type="button"
                                onClick={() => { void exportVariantPng(); }}
                                disabled={!variantReady || isBusy}
                                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Export Variant PNG
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}