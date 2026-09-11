/**
 * 3D Stamp Tool - Master Studio Modal
 * Full-featured design and fabrication workspace for creating physical 3D stamps and wax seals.
 */

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as fabric from 'fabric';
import {
    Stamp,
    X,
    Eye,
    Play,
    Download,
    Plus,
    Check,
    Box,
    Sparkles,
    Shield,
} from 'lucide-react';
import { useToast } from '@/providers/ToastProvider';
import useEscapeKey from '@/hooks/useEscapeKey';
import {
    DEFAULT_STAMP_CONFIG,
    StampConfig,
    StampExportFormat,
    StampExportTarget,
    StampMaterialTheme,
} from '../domain/stampTypes';
import { AssembledStampResult, buildStampModel } from '../domain/stampModelBuilder';
import { exportStampFile } from '../domain/stampExporters';
import { renderStampArtwork, RenderedArtworkResult } from './StampCanvasRenderer';
import { STAMP_PRESETS } from './StampPresets';
import StampViewport from './StampViewport';
import StampControls from './StampControls';
import StampPressSimulator from './StampPressSimulator';

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
        return DEFAULT_STAMP_CONFIG;
    });

    const [activeStudioView, setActiveStudioView] = useState<'3d' | 'simulator'>('3d');
    const [renderedArtwork, setRenderedArtwork] = useState<RenderedArtworkResult | null>(null);
    const [assembly, setAssembly] = useState<AssembledStampResult | null>(null);
    const [isBuilding, setIsBuilding] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [addedToPage, setAddedToPage] = useState(false);

    // Rebuild 3D model whenever config changes (debounced)
    const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const rebuildModel = useCallback(async (currentConfig: StampConfig) => {
        try {
            setIsBuilding(true);
            const artworkResult = await renderStampArtwork(
                currentConfig.artwork,
                currentConfig.podiumShape,
                currentConfig.dimensions,
                256 // High resolution 256x256 heightmap
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

    const handleApplyPreset = (presetId: string) => {
        const preset = STAMP_PRESETS.find((p) => p.id === presetId);
        if (!preset) return;
        setConfig((prev) => ({
            ...prev,
            ...preset.config,
            dimensions: { ...prev.dimensions, ...(preset.config.dimensions || {}) },
            artwork: { ...prev.artwork, ...(preset.config.artwork || {}) },
        }));
        toast({
            title: 'Preset Applied',
            description: `Loaded ${preset.id} stamp profile.`,
            variant: 'default',
        });
    };

    const handleUseCanvasSelection = () => {
        if (!canvas) {
            toast({ title: 'No Canvas', description: 'Active canvas is not ready.', variant: 'destructive' });
            return;
        }
        const activeObj = canvas.getActiveObject();
        if (!activeObj) {
            toast({
                title: 'No Selection',
                description: 'Select a layer or shape on the canvas first.',
                variant: 'destructive',
            });
            return;
        }

        try {
            const dataUrl = activeObj.toDataURL({ format: 'png', multiplier: 2 });
            setConfig((prev) => ({
                ...prev,
                artwork: {
                    ...prev.artwork,
                    mode: 'image',
                    imageUrl: dataUrl,
                },
            }));
            toast({
                title: 'Graphic Imported',
                description: 'Imported current canvas selection for stamp die.',
                variant: 'default',
            });
        } catch (err) {
            console.error('Error reading canvas selection:', err);
        }
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

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 md:p-6 animate-in fade-in duration-200">
            <div className="w-full max-w-6xl h-[92vh] max-h-[880px] bg-background border border-border/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-foreground">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/60">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
                            <Stamp size={20} />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold flex items-center gap-2">
                                3D Stamp Studio
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                    Fabrication & 3D Print
                                </span>
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
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                                    activeStudioView === '3d'
                                        ? 'bg-background text-foreground shadow-xs'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                <Box size={13} />
                                3D Viewport
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveStudioView('simulator')}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
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
                    {/* Left: 3D Viewport or Simulator */}
                    <div className="flex-1 min-w-0 p-3 flex flex-col bg-secondary/15">
                        {activeStudioView === '3d' ? (
                            <StampViewport
                                assembly={assembly}
                                config={config}
                                onThemeChange={(theme) => setConfig((prev) => ({ ...prev, materialTheme: theme }))}
                            />
                        ) : (
                            <StampPressSimulator
                                imprintDataUrl={renderedArtwork?.imprintDataUrl || ''}
                                dieDataUrl={renderedArtwork?.dieDataUrl || ''}
                                config={config}
                                onAddToCanvas={handleAddToCanvas}
                            />
                        )}
                    </div>

                    {/* Right: Controls Sidebar */}
                    <div className="w-84 md:w-96 flex flex-col min-h-0">
                        <StampControls
                            config={config}
                            onChange={setConfig}
                            onExport={handleExport}
                            onApplyPreset={handleApplyPreset}
                            onUseCanvasSelection={canvas ? handleUseCanvasSelection : undefined}
                            isExporting={isExporting}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
