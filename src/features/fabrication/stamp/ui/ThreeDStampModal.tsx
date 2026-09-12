/**
 * 3D Stamp Tool - Master Studio Modal
 * Full-featured design and fabrication workspace for creating physical 3D stamps and wax seals.
 */

'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as fabric from 'fabric';
import {
    Stamp,
    X,
    Play,
    Plus,
    Check,
    Box,
    Eye,
} from 'lucide-react';
import { useToast } from '@/providers/ToastProvider';
import useEscapeKey from '@/hooks/useEscapeKey';
import BodyPortal from '@/components/ui/BodyPortal';
import DraggableResizablePanel from '@/components/ui/DraggableResizablePanel';
import {
    DEFAULT_STAMP_CONFIG,
    StampConfig,
    StampExportFormat,
    StampExportTarget,
} from '../domain/stampTypes';
import { AssembledStampResult, buildStampModel } from '../domain/stampModelBuilder';
import { exportStampFile } from '../domain/stampExporters';
import { renderStampArtwork, RenderedArtworkResult } from './StampCanvasRenderer';
import { captureVisibleCanvasLayers } from './stampCanvasCapture';
import { STAMP_PRESETS } from './StampPresets';
import StampViewport, { StampViewportHandle } from './StampViewport';
import StampControls from './StampControls';
import StampPressSimulator from './StampPressSimulator';
import StampMaterialImpression from './StampMaterialImpression';

interface ThreeDStampModalProps {
    canvas?: fabric.Canvas | null;
    onClose: () => void;
    onAddToCanvas?: (dataUrl: string) => void;
    initialImage?: string;
}

export default function ThreeDStampModal({
    canvas,
    onClose,
    onAddToCanvas,
    initialImage,
}: ThreeDStampModalProps) {
    const { toast } = useToast();
    useEscapeKey(onClose);

    const [config, setConfig] = useState<StampConfig>(() => {
        if (initialImage) {
            return {
                ...DEFAULT_STAMP_CONFIG,
                artwork: {
                    ...DEFAULT_STAMP_CONFIG.artwork,
                    mode: 'image',
                    imageUrl: initialImage,
                },
            };
        }
        if (canvas) {
            const captured = captureVisibleCanvasLayers(canvas);
            if (captured && captured.dataUrl) {
                return {
                    ...DEFAULT_STAMP_CONFIG,
                    artwork: {
                        ...DEFAULT_STAMP_CONFIG.artwork,
                        mode: 'image',
                        imageUrl: captured.dataUrl,
                    },
                };
            }
        }
        return DEFAULT_STAMP_CONFIG;
    });

    const [activeStudioView, setActiveStudioView] = useState<'3d' | 'impression' | 'simulator'>('3d');
    const [renderedArtwork, setRenderedArtwork] = useState<RenderedArtworkResult | null>(null);
    const [assembly, setAssembly] = useState<AssembledStampResult | null>(null);
    const [isBuilding, setIsBuilding] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [addedToPage, setAddedToPage] = useState(false);
    const [showPlatform, setShowPlatform] = useState<boolean>(true);
    const [showStampPodium, setShowStampPodium] = useState<boolean>(true);
    const viewportRef = useRef<StampViewportHandle | null>(null);

    // Rebuild 3D model whenever config changes (debounced)
    const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const rebuildModel = useCallback(async (currentConfig: StampConfig) => {
        try {
            setIsBuilding(true);
            const artworkResult = await renderStampArtwork(
                currentConfig.artwork,
                currentConfig.podiumShape,
                currentConfig.dimensions,
                512 // Ultra-sharp 512x512 subpixel heightmap (eliminates jagged edges)
            );
            setRenderedArtwork(artworkResult);

            const newAssembly = buildStampModel(
                currentConfig,
                artworkResult.heightmapData,
                artworkResult.gridWidth,
                artworkResult.gridHeight
            );
            setAssembly(newAssembly);
        } catch (err) {
            console.error('Failed to build 3D stamp model:', err);
            toast({
                title: 'Build Error',
                description: 'Could not construct 3D stamp geometry.',
                variant: 'destructive',
            });
        } finally {
            setIsBuilding(false);
        }
    }, [toast]);

    useEffect(() => {
        if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
        }
        updateTimeoutRef.current = setTimeout(() => {
            void rebuildModel(config);
        }, 80);

        return () => {
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
            }
        };
    }, [config, rebuildModel]);

    // Store active selection on canvas so user can still import it even while interactions are disabled
    const savedSelectedObjectRef = useRef<fabric.Object | null>(null);

    // Completely disarm canvas pointer events and active transformations while 3D Stamp Studio is open
    useEffect(() => {
        if (!canvas) return;

        const currentActive = canvas.getActiveObject();
        if (currentActive) {
            savedSelectedObjectRef.current = currentActive;
        }

        const upperCanvas = canvas.upperCanvasEl;
        const prevPointerEvents = upperCanvas ? upperCanvas.style.pointerEvents : '';
        const prevSelection = canvas.selection;
        const typedCanvas = canvas as fabric.Canvas & { skipTargetFind?: boolean };
        const prevSkipTargetFind = typedCanvas.skipTargetFind;

        // Block all pointer/mouse interactions on the Fabric canvas behind the modal
        if (upperCanvas) {
            upperCanvas.style.pointerEvents = 'none';
        }
        canvas.selection = false;
        typedCanvas.skipTargetFind = true;
        canvas.discardActiveObject();
        canvas.defaultCursor = 'default';
        canvas.requestRenderAll();

        return () => {
            if (upperCanvas) {
                upperCanvas.style.pointerEvents = prevPointerEvents;
            }
            canvas.selection = prevSelection;
            typedCanvas.skipTargetFind = prevSkipTargetFind;
            // Restore active object selection if one was active
            if (savedSelectedObjectRef.current && canvas.getObjects().includes(savedSelectedObjectRef.current)) {
                canvas.setActiveObject(savedSelectedObjectRef.current);
            }
            canvas.requestRenderAll();
        };
    }, [canvas]);

    // Automatically populate with visible canvas layers on mount if user hasn't specified initial image
    const autoImportedRef = useRef(false);
    useEffect(() => {
        if (autoImportedRef.current) return;
        if (initialImage) {
            autoImportedRef.current = true;
            return;
        }
        if (canvas) {
            const captured = captureVisibleCanvasLayers(canvas);
            if (captured && captured.dataUrl) {
                autoImportedRef.current = true;
                setConfig((prev) => {
                    // Only auto-import if still in default text mode
                    if (
                        prev.artwork.mode === 'text' &&
                        prev.artwork.text.primaryText === DEFAULT_STAMP_CONFIG.artwork.text.primaryText
                    ) {
                        return {
                            ...prev,
                            artwork: {
                                ...prev.artwork,
                                mode: 'image',
                                imageUrl: captured.dataUrl,
                            },
                        };
                    }
                    return prev;
                });
                toast({
                    title: 'Active Canvas Artwork Loaded',
                    description: `Loaded ${captured.layerCount} visible layer${captured.layerCount === 1 ? '' : 's'} from canvas into 3D stamp.`,
                    variant: 'default',
                });
            }
        }
    }, [canvas, initialImage, toast]);

    const handleApplyPreset = (presetId: string) => {
        const preset = STAMP_PRESETS.find((p) => p.id === presetId);
        if (!preset) return;
        setConfig((prev) => ({
            ...prev,
            // Strictly preserve the user's chosen podiumShape and stampType - never switch shape without request!
            podiumShape: prev.podiumShape,
            stampType: prev.stampType,
            handleStyle: prev.handleStyle,
            materialTheme: preset.config.materialTheme ?? prev.materialTheme,
            dimensions: {
                ...prev.dimensions,
                // Keep the user's width, depth, and thicknesses intact
                widthMm: prev.dimensions.widthMm,
                depthMm: prev.dimensions.depthMm,
                podiumThicknessMm: prev.dimensions.podiumThicknessMm,
                handleHeightMm: prev.dimensions.handleHeightMm,
                reliefDepthMm: preset.config.dimensions?.reliefDepthMm ?? prev.dimensions.reliefDepthMm,
                basePlateThicknessMm: preset.config.dimensions?.basePlateThicknessMm ?? prev.dimensions.basePlateThicknessMm,
                draftAngleDeg: preset.config.dimensions?.draftAngleDeg ?? prev.dimensions.draftAngleDeg,
            },
            artwork: { ...prev.artwork, ...(preset.config.artwork || {}) },
        }));
        toast({
            title: 'Preset Applied',
            description: `Loaded ${preset.id} artwork styling.`,
            variant: 'default',
        });
    };

    const handleUseCanvasSelection = () => {
        if (!canvas) {
            toast({
                title: 'No Canvas',
                description: 'Active canvas is not ready or available.',
                variant: 'destructive',
            });
            return;
        }

        const captured = captureVisibleCanvasLayers(canvas);
        if (!captured || !captured.dataUrl) {
            toast({
                title: 'Canvas is Empty',
                description: 'No visible layers found on the canvas. Add text, shapes, or drawings first.',
                variant: 'destructive',
            });
            return;
        }

        setConfig((prev) => ({
            ...prev,
            artwork: {
                ...prev.artwork,
                mode: 'image',
                imageUrl: captured.dataUrl,
            },
        }));

        toast({
            title: 'Canvas Artwork Imported',
            description: `Imported ${captured.layerCount} visible layer${captured.layerCount === 1 ? '' : 's'} with anti-aliased vector smoothing.`,
            variant: 'default',
        });
    };

    const handleExport = async (format: StampExportFormat, target: StampExportTarget) => {
        if (!assembly) return;
        try {
            setIsExporting(true);
            const baseName =
                config.artwork.mode === 'text' && config.artwork.text.primaryText
                    ? `stamp-${config.artwork.text.primaryText}`
                    : 'stamp-model';

            await exportStampFile(assembly, format, target, baseName);
            toast({
                title: 'Export Successful',
                description: `Saved ${format.toUpperCase()} model for 3D printing.`,
                variant: 'default',
            });
        } catch (err) {
            console.error('Export failed:', err);
            toast({
                title: 'Export Failed',
                description: 'Failed to generate 3D export file.',
                variant: 'destructive',
            });
        } finally {
            setIsExporting(false);
        }
    };

    const handleAddToCanvas = (dataUrl?: string) => {
        const urlToUse = dataUrl || renderedArtwork?.imprintDataUrl;
        if (!urlToUse) return;

        if (onAddToCanvas) {
            onAddToCanvas(urlToUse);
        } else if (canvas) {
            // Directly insert onto canvas if handler not passed
            fabric.Image.fromURL(urlToUse).then((img) => {
                img.scaleToWidth(Math.min(canvas.getWidth() * 0.4, 300));
                canvas.centerObject(img);
                canvas.add(img);
                canvas.setActiveObject(img);
                canvas.renderAll();
            });
        }

        setAddedToPage(true);
        setTimeout(() => setAddedToPage(false), 2000);
        toast({
            title: 'Added to Page',
            description: 'Stamped impression inserted into active page.',
            variant: 'default',
        });
    };

    const initialFrame = useMemo(() => {
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
        const width = Math.min(1140, Math.max(760, vw - 32));
        const height = Math.min(780, Math.max(520, vh - 32));
        return {
            size: { width, height },
            position: {
                x: Math.max(16, Math.round((vw - width) / 2)),
                y: Math.max(16, Math.round((vh - height) / 2)),
            },
        };
    }, []);

    return (
        <BodyPortal>
            <div
                className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 md:p-6 animate-in fade-in duration-200 pointer-events-auto"
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
            >
                <DraggableResizablePanel
                    className="bg-card rounded-xl shadow-2xl overflow-hidden border border-border flex flex-col pointer-events-auto z-[1001]"
                    initialPosition={initialFrame.position}
                    initialSize={initialFrame.size}
                    minWidth={760}
                    minHeight={520}
                >
                    {/* Header with draggable-handle cursor-move */}
                    <div className="h-12 px-4 border-b border-border flex items-center justify-between bg-secondary/15 draggable-handle cursor-move shrink-0 select-none">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                                <Stamp size={18} />
                            </div>
                            <div>
                                <h2 className="text-sm font-semibold flex items-center gap-2">
                                    3D Stamp Studio
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                        Fabrication & 3D Print
                                    </span>
                                    {isBuilding && (
                                        <span className="text-[10px] text-muted-foreground animate-pulse">
                                            Rendering...
                                        </span>
                                    )}
                                </h2>
                                <p className="text-[11px] text-muted-foreground">
                                    Create press stamps and wax seals with authentic handles, backing podiums, and extruded dies.
                                </p>
                            </div>
                        </div>

                        {/* View Switcher & Action Buttons */}
                        <div className="flex items-center gap-2">
                            <div className="flex p-0.5 rounded-lg bg-secondary border border-border">
                                <button
                                    type="button"
                                    onClick={() => setActiveStudioView('3d')}
                                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                                        activeStudioView === '3d'
                                            ? 'bg-background text-foreground shadow-xs'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    <Box size={13} />
                                    3D Model
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveStudioView('impression')}
                                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                                        activeStudioView === 'impression'
                                            ? 'bg-background text-foreground shadow-xs'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    <Eye size={13} />
                                    Material Impression
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveStudioView('simulator')}
                                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                                        activeStudioView === 'simulator'
                                            ? 'bg-background text-foreground shadow-xs'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    <Play size={13} />
                                    Press Simulator
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => handleAddToCanvas()}
                                disabled={!renderedArtwork?.imprintDataUrl}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-secondary/50 hover:bg-secondary text-xs font-medium transition-colors disabled:opacity-50"
                                title="Insert 2D stamped impression directly onto active Page artboard"
                            >
                                {addedToPage ? <Check size={14} className="text-emerald-500" /> : <Plus size={14} />}
                                {addedToPage ? 'Added!' : 'Add to Page'}
                            </button>

                            <button
                                type="button"
                                onClick={onClose}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                title="Close 3D Stamp Tool"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Main Content Split Pane */}
                    <div className="flex-1 flex min-h-0 overflow-hidden">
                        {/* Left: 3D Viewport, Material Impression, or Simulator */}
                        <div className="flex-1 min-w-0 p-3 flex flex-col bg-secondary/15">
                            {activeStudioView === '3d' && (
                                <StampViewport
                                    ref={viewportRef}
                                    assembly={assembly}
                                    config={config}
                                    onThemeChange={(theme) => setConfig((prev) => ({ ...prev, materialTheme: theme }))}
                                    imprintDataUrl={renderedArtwork?.imprintDataUrl}
                                    showPlatform={showPlatform}
                                    onTogglePlatform={() => setShowPlatform((prev) => !prev)}
                                    showStampPodium={showStampPodium}
                                    onToggleStampPodium={() => setShowStampPodium((prev) => !prev)}
                                />
                            )}
                            {activeStudioView === 'impression' && (
                                <StampMaterialImpression
                                    imprintDataUrl={renderedArtwork?.imprintDataUrl || ''}
                                    heightmapData={renderedArtwork?.heightmapData}
                                    gridWidth={renderedArtwork?.gridWidth}
                                    gridHeight={renderedArtwork?.gridHeight}
                                    config={config}
                                    onAddToCanvas={handleAddToCanvas}
                                />
                            )}
                            {activeStudioView === 'simulator' && (
                                <StampPressSimulator
                                    imprintDataUrl={renderedArtwork?.imprintDataUrl || ''}
                                    heightmapData={renderedArtwork?.heightmapData}
                                    gridWidth={renderedArtwork?.gridWidth}
                                    gridHeight={renderedArtwork?.gridHeight}
                                    config={config}
                                    onAddToCanvas={handleAddToCanvas}
                                />
                            )}
                        </div>

                        {/* Right: Controls Sidebar */}
                        <div className="w-84 md:w-96 flex flex-col min-h-0 border-l border-border">
                            <StampControls
                                config={config}
                                onChange={setConfig}
                                onExport={handleExport}
                                onApplyPreset={handleApplyPreset}
                                onUseCanvasSelection={canvas ? handleUseCanvasSelection : undefined}
                                isExporting={isExporting}
                                imprintDataUrl={renderedArtwork?.imprintDataUrl}
                            />
                        </div>
                    </div>
                </DraggableResizablePanel>
            </div>
        </BodyPortal>
    );
}
