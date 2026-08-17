import { useCallback, useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';

import { runWithExportOverlays } from '@/components/Editor/editorExportOverlays';
import { resolveEditorExportCropBounds } from '@/components/Editor/editorExportCrop';
import { exportHtmlBundle as exportHtmlBundleHelper } from '@/components/Editor/editorHtmlExport';
import { type MediaOverlayNamingTemplate } from '@/components/Editor/editorViewConfig';
import type { FabricationExportState } from '@/components/Editor/EditorFabricationExportModals';
import type { MediaOverlayBatchTarget } from '@/components/Editor/useMediaOverlay';
import {
    buildFrameZipEntryName,
    dataUrlToBlob,
    formatBytes,
} from '@/components/Editor/editorExportUtils';
import type { UserProfileSettings } from '@/lib/profile-utils';
import type { ToastOptions } from '@/providers/ToastProvider';
import { serializeCanvas } from '@/lib/fabric-utils';
import type {
    CanvasWithArtboard,
    ExportDataUrlOptions,
    RectBounds,
    DesignJson,
} from '@/components/Editor/editorView.types';

type ExportFormat = 'png' | 'jpg' | 'svg' | 'pdf' | 'json' | 'html' | 'embroidery' | 'cricut';
type SharePlatform = 'facebook' | 'instagram';

type Toast = (options: ToastOptions) => void;

type CanvasBackgroundSettings = {
    color: string;
    enabled: boolean;
};

type OverlayObjectRef = {
    current: fabric.Object | null;
};

type UseEditorExportArgs = {
    canvas: fabric.Canvas | null;
    customHistoryProps: string[];
    user: string;
    profileSettings: UserProfileSettings | null;
    mediaOverlayFrameRef: OverlayObjectRef;
    mediaOverlayLabelRef: OverlayObjectRef;
    getCanvasBackgroundSettings: () => CanvasBackgroundSettings;
    withViewportReset: <T>(action: () => T | Promise<T>) => Promise<T>;
    safeCanvasToDataURL: (options: ExportDataUrlOptions) => string;
    getMediaOverlayBatchTargets: (scope: 'selected' | 'all') => MediaOverlayBatchTarget[];
    mediaOverlayNamingTemplate: MediaOverlayNamingTemplate;
    designName: string;
    getDisplayName: (url: string) => string;
    toast: Toast;
    closeExportMenu: () => void;
    closeShareMenu: () => void;
};

export function useEditorExport({
    canvas,
    customHistoryProps,
    user,
    profileSettings,
    mediaOverlayFrameRef,
    mediaOverlayLabelRef,
    getCanvasBackgroundSettings,
    withViewportReset,
    safeCanvasToDataURL,
    getMediaOverlayBatchTargets,
    mediaOverlayNamingTemplate,
    designName,
    getDisplayName,
    toast,
    closeExportMenu,
    closeShareMenu,
}: UseEditorExportArgs) {
    const [isExporting, setIsExporting] = useState(false);
    const [showExportQualityModal, setShowExportQualityModal] = useState(false);
    const [exportQualityValue, setExportQualityValue] = useState(100);
    const [exportQualitySize, setExportQualitySize] = useState<string>('');
    const [pendingExportFormat, setPendingExportFormat] = useState<'png' | 'jpg' | null>(null);
    const [includeCanvasBackground, setIncludeCanvasBackground] = useState(true);
    const [fabricationExport, setFabricationExport] = useState<FabricationExportState>(null);

    const pendingExportFilenameRef = useRef('');
    const pendingExportCropRef = useRef<RectBounds | undefined>(undefined);
    const exportSizeTimerRef = useRef<number | null>(null);

    const clearExportSizeTimer = useCallback(() => {
        if (!exportSizeTimerRef.current) return;
        window.clearTimeout(exportSizeTimerRef.current);
        exportSizeTimerRef.current = null;
    }, []);

    useEffect(() => () => {
        clearExportSizeTimer();
    }, [clearExportSizeTimer]);

    const downloadFile = useCallback((url: string, filename: string) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, []);

    const downloadBlob = useCallback((blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        downloadFile(url, filename);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, [downloadFile]);

    const withExportOverlays = useCallback(async (action: () => void | Promise<void>) => {
        if (!canvas) return;
        await runWithExportOverlays({
            canvas,
            profileSettings,
            fallbackUser: user,
            overlayFrame: mediaOverlayFrameRef.current,
            overlayLabel: mediaOverlayLabelRef.current,
            setIsExporting,
        }, action);
    }, [canvas, mediaOverlayFrameRef, mediaOverlayLabelRef, profileSettings, user]);

    const estimateExportSize = useCallback(async (format: 'png' | 'jpg', quality: number, includeBackground: boolean) => {
        if (!canvas) return;

        const cropOptions = pendingExportCropRef.current;
        const options: ExportDataUrlOptions = {
            format: format === 'jpg' ? 'jpeg' : 'png',
            quality: Math.max(0.1, Math.min(1, quality / 100)),
            multiplier: 1,
            enableRetinaScaling: true,
        };

        const shouldIncludeBackground = format === 'jpg' ? true : includeBackground;
        if (shouldIncludeBackground) {
            options.backgroundColor = getCanvasBackgroundSettings().color;
        }

        if (cropOptions) {
            options.left = cropOptions.left;
            options.top = cropOptions.top;
            options.width = cropOptions.width;
            options.height = cropOptions.height;
        }

        try {
            const dataUrl = await withViewportReset(() => safeCanvasToDataURL(options));
            const base64Index = dataUrl.indexOf(',');
            const base64Length = base64Index >= 0 ? dataUrl.length - base64Index - 1 : dataUrl.length;
            const bytes = Math.floor((base64Length * 3) / 4);
            setExportQualitySize(formatBytes(bytes));
        } catch {
            setExportQualitySize('Unavailable');
        }
    }, [canvas, getCanvasBackgroundSettings, safeCanvasToDataURL, withViewportReset]);

    useEffect(() => {
        if (!showExportQualityModal || !pendingExportFormat) return;
        clearExportSizeTimer();
        exportSizeTimerRef.current = window.setTimeout(() => {
            void estimateExportSize(pendingExportFormat, exportQualityValue, includeCanvasBackground);
        }, 150);
    }, [
        clearExportSizeTimer,
        estimateExportSize,
        exportQualityValue,
        includeCanvasBackground,
        pendingExportFormat,
        showExportQualityModal,
    ]);

    const closeExportQualityModal = useCallback(() => {
        clearExportSizeTimer();
        setShowExportQualityModal(false);
    }, [clearExportSizeTimer]);

    const openExportQualityModal = useCallback((
        format: 'png' | 'jpg',
        filename: string,
        cropOptions?: RectBounds,
    ) => {
        setPendingExportFormat(format);
        pendingExportFilenameRef.current = filename;
        pendingExportCropRef.current = cropOptions;

        const defaultQuality = format === 'jpg' ? 90 : 100;
        const backgroundSettings = getCanvasBackgroundSettings();
        const defaultIncludeBackground = format === 'jpg' ? true : backgroundSettings.enabled;

        setIncludeCanvasBackground(defaultIncludeBackground);
        setExportQualityValue(defaultQuality);
        setExportQualitySize('Calculating...');
        setShowExportQualityModal(true);

        clearExportSizeTimer();
        exportSizeTimerRef.current = window.setTimeout(() => {
            void estimateExportSize(format, defaultQuality, defaultIncludeBackground);
        }, 100);
    }, [clearExportSizeTimer, estimateExportSize, getCanvasBackgroundSettings]);

    const confirmPendingQualityExport = useCallback(async () => {
        if (!canvas || !pendingExportFormat) return;

        const cropOptions = pendingExportCropRef.current;
        const options: ExportDataUrlOptions = {
            format: pendingExportFormat === 'jpg' ? 'jpeg' : 'png',
            quality: Math.max(0.1, Math.min(1, exportQualityValue / 100)),
            multiplier: 1,
            enableRetinaScaling: true,
        };

        const shouldIncludeBackground = pendingExportFormat === 'jpg' ? true : includeCanvasBackground;
        if (shouldIncludeBackground) {
            options.backgroundColor = getCanvasBackgroundSettings().color;
        }

        if (cropOptions) {
            options.left = cropOptions.left;
            options.top = cropOptions.top;
            options.width = cropOptions.width;
            options.height = cropOptions.height;
        }

        await withExportOverlays(async () => {
            const dataUrl = await withViewportReset(() => safeCanvasToDataURL(options));
            downloadFile(dataUrl, pendingExportFilenameRef.current);
        });

        closeExportQualityModal();
    }, [
        canvas,
        closeExportQualityModal,
        downloadFile,
        exportQualityValue,
        getCanvasBackgroundSettings,
        includeCanvasBackground,
        pendingExportFormat,
        safeCanvasToDataURL,
        withExportOverlays,
        withViewportReset,
    ]);

    const resolveCropOptions = useCallback((): RectBounds => {
        return resolveEditorExportCropBounds(canvas as CanvasWithArtboard | null);
    }, [canvas]);

    const exportHtmlBundle = useCallback(async (baseName: string, timestamp: string) => {
        if (!canvas) return;

        await exportHtmlBundleHelper({
            canvas,
            baseName,
            timestamp,
            customHistoryProps,
            toast,
            downloadBlob,
            getDisplayName,
        });
    }, [canvas, customHistoryProps, downloadBlob, getDisplayName, toast]);

    const openFabricationExport = useCallback(async (kind: 'embroidery' | 'cricut') => {
        if (!canvas) return;
        const cropOptions = resolveCropOptions();
        await withViewportReset(() => {
            const sourceDataUrl = safeCanvasToDataURL({
                format: 'png',
                quality: 1,
                multiplier: 1,
                enableRetinaScaling: true,
                ...cropOptions,
            });
            setFabricationExport({ kind, sourceDataUrl });
        });
    }, [canvas, resolveCropOptions, safeCanvasToDataURL, withViewportReset]);

    const handleExport = useCallback(async (format: ExportFormat) => {
        if (!canvas) return;

        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `design-${timestamp}.${format}`;
            const cropOptions = resolveCropOptions();

            switch (format) {
                case 'png':
                    openExportQualityModal('png', filename, cropOptions);
                    break;
                case 'jpg':
                    openExportQualityModal('jpg', filename, cropOptions);
                    break;
                case 'svg': {
                    const svgContent = canvas.toSVG({
                        width: `${cropOptions.width}px`,
                        height: `${cropOptions.height}px`,
                        viewBox: {
                            x: cropOptions.left,
                            y: cropOptions.top,
                            width: cropOptions.width,
                            height: cropOptions.height,
                        },
                    });
                    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    downloadFile(url, filename);
                    break;
                }
                case 'pdf': {
                    await withExportOverlays(async () => {
                        const pdfWidth = cropOptions.width;
                        const pdfHeight = cropOptions.height;
                        const pdf = new jsPDF({
                            orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
                            unit: 'px',
                            format: [pdfWidth, pdfHeight],
                            hotfixes: ['px_scaling'],
                        });
                        const imgData = safeCanvasToDataURL({
                            format: 'png',
                            quality: 1,
                            multiplier: 1,
                            enableRetinaScaling: true,
                            ...cropOptions,
                        });
                        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                        pdf.save(filename);
                    });
                    break;
                }
                case 'json': {
                    const json = JSON.stringify(serializeCanvas<DesignJson>(canvas, customHistoryProps));
                    const jsonBlob = new Blob([json], { type: 'application/json' });
                    const jsonUrl = URL.createObjectURL(jsonBlob);
                    downloadFile(jsonUrl, `design-${timestamp}.json`);
                    break;
                }
                case 'html':
                    await exportHtmlBundle(filename.replace(/\.html$/, ''), timestamp);
                    break;
                case 'embroidery': {
                    // Plain capture (no export overlays/watermarks) — the modal
                    // handles color reduction and background removal from here.
                    await openFabricationExport('embroidery');
                    break;
                }
                case 'cricut': {
                    await openFabricationExport('cricut');
                    break;
                }
                default:
                    break;
            }
        } catch (error) {
            console.error('Export failed:', error);
        }

        closeExportMenu();
    }, [
        canvas,
        closeExportMenu,
        customHistoryProps,
        downloadFile,
        exportHtmlBundle,
        openFabricationExport,
        openExportQualityModal,
        resolveCropOptions,
        safeCanvasToDataURL,
        withExportOverlays,
    ]);

    const closeFabricationExport = useCallback(() => {
        setFabricationExport(null);
    }, []);

    const handleShare = useCallback(async (platform: SharePlatform) => {
        await handleExport('png');

        const url = platform === 'facebook' ? 'https://www.facebook.com' : 'https://www.instagram.com';
        window.open(url, '_blank');

        toast({
            title: 'Ready to Share',
            description: `Design exported. Please upload the file to ${platform === 'facebook' ? 'Facebook' : 'Instagram'}.`,
            duration: 5000,
        });

        closeShareMenu();
    }, [closeShareMenu, handleExport, toast]);

    const exportMediaOverlayFramesZip = useCallback(async (scope: 'selected' | 'all') => {
        if (!canvas) return;

        const targets = getMediaOverlayBatchTargets(scope);
        if (targets.length === 0) {
            toast({
                title: 'No frames to export',
                description: scope === 'selected'
                    ? 'Enable at least one frame for batch export.'
                    : 'Add a frame or enable media overlay first.',
                variant: 'destructive',
            });
            return;
        }

        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const shouldIncludeBackground = getCanvasBackgroundSettings().enabled;

            await withExportOverlays(async () => {
                const zip = new JSZip();

                targets.forEach((frame: MediaOverlayBatchTarget, index: number) => {
                    const dataUrl = safeCanvasToDataURL({
                        format: 'png',
                        quality: 1,
                        multiplier: 1,
                        enableRetinaScaling: true,
                        left: frame.bounds.left,
                        top: frame.bounds.top,
                        width: frame.bounds.width,
                        height: frame.bounds.height,
                        backgroundColor: shouldIncludeBackground ? getCanvasBackgroundSettings().color : undefined,
                    });
                    zip.file(buildFrameZipEntryName(frame, index, timestamp, {
                        designName,
                        namingTemplate: mediaOverlayNamingTemplate,
                    }), dataUrlToBlob(dataUrl));
                });

                const blob = await zip.generateAsync({ type: 'blob' });
                downloadBlob(blob, `design-${timestamp}-${scope}-frames.zip`);
            });

            toast({
                title: 'Batch export complete',
                description: `Created ZIP with ${targets.length} frame${targets.length === 1 ? '' : 's'}.`,
                variant: 'success',
            });
        } catch (error) {
            console.error('Batch frame export failed:', error);
            toast({
                title: 'Batch export failed',
                description: 'Unable to generate frame ZIP.',
                variant: 'destructive',
            });
        }

        closeExportMenu();
    }, [
        canvas,
        closeExportMenu,
        designName,
        downloadBlob,
        getCanvasBackgroundSettings,
        getMediaOverlayBatchTargets,
        mediaOverlayNamingTemplate,
        safeCanvasToDataURL,
        toast,
        withExportOverlays,
    ]);

    return {
        isExporting,
        setIsExporting,
        showExportQualityModal,
        pendingExportFormat,
        exportQualityValue,
        exportQualitySize,
        includeCanvasBackground,
        setExportQualityValue,
        setIncludeCanvasBackground,
        closeExportQualityModal,
        confirmPendingQualityExport,
        handleExport,
        handleShare,
        exportMediaOverlayFramesZip,
        fabricationExport,
        closeFabricationExport,
        openFabricationExport,
    };
}
