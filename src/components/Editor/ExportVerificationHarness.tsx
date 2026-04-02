'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { jsPDF } from 'jspdf';

import { resolveEditorExportCropBounds } from '@/components/Editor/editorExportCrop';
import { runWithExportOverlays } from '@/components/Editor/editorExportOverlays';
import { useEditorCanvasExportSupport } from '@/components/Editor/useEditorCanvasExportSupport';
import type {
    ArtboardRectWithBackground,
    CanvasWithArtboard,
    ExportDataUrlOptions,
} from '@/components/Editor/editorView.types';

const ARTBOARD = {
    left: 120,
    top: 90,
    width: 300,
    height: 200,
};

function triggerDownload(url: string, filename: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export default function ExportVerificationHarness() {
    const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
    const overlayFrameRef = useRef<fabric.Object | null>(null);
    const overlayLabelRef = useRef<fabric.Object | null>(null);

    const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const { safeCanvasToDataURL, withViewportReset } = useEditorCanvasExportSupport({ canvas });

    useEffect(() => {
        if (!canvasElementRef.current) return undefined;

        const nextCanvas = new fabric.Canvas(canvasElementRef.current, {
            width: 900,
            height: 700,
            backgroundColor: '#101827',
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

        const redBlock = new fabric.Rect({
            left: 150,
            top: 120,
            width: 100,
            height: 80,
            fill: '#ef4444',
            rx: 14,
            ry: 14,
        });

        const blueCircle = new fabric.Circle({
            left: 290,
            top: 150,
            radius: 36,
            fill: '#2563eb',
        });

        const greenLabel = new fabric.Textbox('Export coverage', {
            left: 150,
            top: 215,
            width: 180,
            fontSize: 20,
            fill: '#0f172a',
            selectable: false,
        });

        const overlayFrame = new fabric.Rect({
            left: 175,
            top: 105,
            width: 170,
            height: 120,
            fill: 'rgba(255,255,255,0)',
            stroke: '#f97316',
            strokeWidth: 3,
            strokeDashArray: [8, 6],
            selectable: false,
            evented: false,
        });

        const overlayLabel = new fabric.Textbox('Media overlay frame', {
            left: 180,
            top: 230,
            width: 190,
            fontSize: 14,
            fill: '#f97316',
            backgroundColor: 'rgba(255,255,255,0.92)',
            selectable: false,
            evented: false,
        });

        runtimeCanvas.artboard = { ...ARTBOARD };
        runtimeCanvas.artboardRect = artboardRect;
        overlayFrameRef.current = overlayFrame;
        overlayLabelRef.current = overlayLabel;

        nextCanvas.add(artboardRect, redBlock, blueCircle, greenLabel, overlayFrame, overlayLabel);
        nextCanvas.setViewportTransform([1.6, 0, 0, 1.6, -115, -80]);
        nextCanvas.requestRenderAll();

        setCanvas(nextCanvas);
        setIsReady(true);

        return () => {
            overlayFrameRef.current = null;
            overlayLabelRef.current = null;
            setIsReady(false);
            setCanvas(null);
            nextCanvas.dispose();
        };
    }, []);

    const exportRaster = useCallback(async (format: 'png' | 'jpg') => {
        if (!canvas) return;

        const crop = resolveEditorExportCropBounds(canvas as CanvasWithArtboard);
        const options: ExportDataUrlOptions = {
            format: format === 'jpg' ? 'jpeg' : 'png',
            quality: 1,
            multiplier: 1,
            enableRetinaScaling: true,
            left: crop.left,
            top: crop.top,
            width: crop.width,
            height: crop.height,
            backgroundColor: format === 'jpg' ? '#ffffff' : undefined,
        };

        await runWithExportOverlays({
            canvas,
            profileSettings: null,
            fallbackUser: 'e2e',
            overlayFrame: overlayFrameRef.current,
            overlayLabel: overlayLabelRef.current,
            setIsExporting,
        }, async () => {
            const dataUrl = await withViewportReset(() => safeCanvasToDataURL(options));
            triggerDownload(dataUrl, `export-verification.${format}`);
        });
    }, [canvas, safeCanvasToDataURL, withViewportReset]);

    const exportPdf = useCallback(async () => {
        if (!canvas) return;

        const crop = resolveEditorExportCropBounds(canvas as CanvasWithArtboard);

        await runWithExportOverlays({
            canvas,
            profileSettings: null,
            fallbackUser: 'e2e',
            overlayFrame: overlayFrameRef.current,
            overlayLabel: overlayLabelRef.current,
            setIsExporting,
        }, async () => {
            const imgData = await withViewportReset(() => safeCanvasToDataURL({
                format: 'png',
                quality: 1,
                multiplier: 1,
                enableRetinaScaling: true,
                left: crop.left,
                top: crop.top,
                width: crop.width,
                height: crop.height,
                backgroundColor: '#ffffff',
            }));

            const pdf = new jsPDF({
                orientation: crop.width > crop.height ? 'landscape' : 'portrait',
                unit: 'px',
                format: [crop.width, crop.height],
                hotfixes: ['px_scaling'],
            });

            pdf.addImage(imgData, 'PNG', 0, 0, crop.width, crop.height);
            pdf.save('export-verification.pdf');
        });
    }, [canvas, safeCanvasToDataURL, withViewportReset]);

    return (
        <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
            <div className="mx-auto flex max-w-5xl flex-col gap-6">
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold">Export Verification Harness</h1>
                    <p className="text-sm text-slate-300">
                        Browser-level export checks for full-artboard downloads while a media overlay frame is present.
                    </p>
                    <p data-testid="export-harness-status" className="text-sm font-medium text-emerald-300">
                        {isReady ? 'Harness ready' : 'Preparing canvas'}
                    </p>
                    <p data-testid="export-harness-expected-size" className="text-sm text-slate-400">
                        Expected export size: {ARTBOARD.width}x{ARTBOARD.height}
                    </p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={() => { void exportRaster('png'); }}
                        disabled={!isReady || isExporting}
                        className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Export PNG
                    </button>
                    <button
                        type="button"
                        onClick={() => { void exportRaster('jpg'); }}
                        disabled={!isReady || isExporting}
                        className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Export JPG
                    </button>
                    <button
                        type="button"
                        onClick={() => { void exportPdf(); }}
                        disabled={!isReady || isExporting}
                        className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Export PDF
                    </button>
                </div>

                <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-2xl">
                    <canvas ref={canvasElementRef} className="max-w-full rounded-lg bg-slate-800" />
                </div>
            </div>
        </div>
    );
}