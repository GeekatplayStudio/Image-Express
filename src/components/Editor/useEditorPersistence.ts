import { useCallback, useEffect, useState } from 'react';
import * as fabric from 'fabric';

import { loadDriveConfig, uploadBackup } from '@/lib/googleDrive';
import type { ToastOptions } from '@/providers/ToastProvider';
import type { DesignJson, ExportDataUrlOptions, MissingItem, SerializedObject } from '@/components/Editor/editorView.types';
import { serializeCanvas, getArtboardSize, applyArtboardSize } from '@/lib/fabric-utils';
import { saveUiPreferences } from '@/lib/ui-preferences';

type Toast = (options: ToastOptions) => void;

type DialogApi = {
    confirm: (message: string, options?: { title?: string; variant?: 'default' | 'destructive' }) => Promise<boolean>;
    prompt: (
        message: string,
        options?: {
            title?: string;
            defaultValue?: string;
            placeholder?: string;
            variant?: 'default' | 'destructive';
        },
    ) => Promise<string | null>;
};

function shouldLogRecoverableEditorIssue() {
    return !(typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent));
}

type UseEditorPersistenceArgs = {
    canvas: fabric.Canvas | null;
    initialDesign: { data?: unknown } | null;
    initialTemplateJsonUrl: string | null;
    designId: string | null;
    designName: string;
    customHistoryProps: string[];
    driveClientId: string;
    isDirty: boolean;
    dialog: DialogApi;
    toast: Toast;
    onBack: () => void;
    onUpdateDesignInfo: (id: string | null, name: string) => void;
    setIsDirty: (value: boolean) => void;
    setIsExporting: (value: boolean) => void;
    resetHistory: () => void;
    historyReadyRef: React.MutableRefObject<boolean>;
    withViewportReset: <T>(action: () => T | Promise<T>) => Promise<T>;
    safeCanvasToDataURL: (options: ExportDataUrlOptions) => string;
};

export function useEditorPersistence({
    canvas,
    initialDesign,
    initialTemplateJsonUrl,
    designId,
    designName,
    customHistoryProps,
    driveClientId,
    isDirty,
    dialog,
    toast,
    onBack,
    onUpdateDesignInfo,
    setIsDirty,
    setIsExporting,
    resetHistory,
    historyReadyRef,
    withViewportReset,
    safeCanvasToDataURL,
}: UseEditorPersistenceArgs) {
    const [showMissingAssetsModal, setShowMissingAssetsModal] = useState(false);
    const [missingItems, setMissingItems] = useState<MissingItem[]>([]);
    const [pendingTemplateJson, setPendingTemplateJson] = useState<DesignJson | null>(null);

    const closeMissingAssetsModal = useCallback(() => {
        setShowMissingAssetsModal(false);
        setPendingTemplateJson(null);
    }, []);

    const handleOpenDesign = useCallback(async (design: { data?: unknown }) => {
        if (!canvas) return;

        let designData: unknown = design.data;
        if (!designData) return;

        if (typeof designData === 'string') {
            try {
                const res = await fetch(designData);
                if (!res.ok) throw new Error('Failed to fetch design data');
                designData = await res.json();
            } catch (error) {
                if (shouldLogRecoverableEditorIssue()) {
                    console.warn('Error loading design data', error);
                }
                toast({ title: 'Load failed', description: 'Could not load design data.', variant: 'destructive' });
                return;
            }
        }

        const artboardSize = (designData as { artboard?: { width?: number; height?: number } }).artboard;

        historyReadyRef.current = false;
        canvas.loadFromJSON(designData as Record<string, unknown>, () => {
            if (artboardSize?.width && artboardSize?.height) {
                applyArtboardSize(canvas, artboardSize.width, artboardSize.height);
            }
            canvas.requestRenderAll();
            setIsDirty(false);
            resetHistory();
        });
    }, [canvas, historyReadyRef, resetHistory, setIsDirty, toast]);

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!isDirty) return;
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    const handleBack = useCallback(async () => {
        if (!isDirty) {
            onBack();
            return;
        }

        const confirmed = await dialog.confirm('Discard unsaved changes and leave?', {
            title: 'Unsaved changes',
            variant: 'destructive',
        });
        if (confirmed) {
            setIsDirty(false);
            onBack();
        }
    }, [dialog, isDirty, onBack, setIsDirty]);

    const handleSave = useCallback(async () => {
        if (!canvas) return;

        let nextName = designName;
        if (!designId && nextName === 'Untitled Page') {
            const inputName = await dialog.prompt('Enter design name:', {
                title: 'Design name',
                defaultValue: designName,
                placeholder: 'My Design',
            });
            if (!inputName) return;
            nextName = inputName;
        } else if (nextName === 'Untitled Page') {
            const inputName = await dialog.prompt('Enter design name:', {
                title: 'Design name',
                defaultValue: designName,
                placeholder: 'My Design',
            });
            if (inputName) nextName = inputName;
        }

        const json = serializeCanvas<DesignJson>(canvas, customHistoryProps);
        const artboardSize = getArtboardSize(canvas);
        if (artboardSize) {
            json.artboard = artboardSize;
            saveUiPreferences({ lastCanvasWidth: artboardSize.width, lastCanvasHeight: artboardSize.height });
        }
        const jsonString = JSON.stringify(json);

        let thumbnailDataUrl = '';

        if (canvas.width && canvas.height && canvas.width > 0 && canvas.height > 0) {
            setIsExporting(true);
            try {
                thumbnailDataUrl = await withViewportReset(() => safeCanvasToDataURL({
                    format: 'png',
                    multiplier: 0.5,
                    enableRetinaScaling: true,
                    quality: 1,
                }));
            } catch (error) {
                console.warn('Thumbnail generation with multiplier failed, retrying without:', error);
                try {
                    thumbnailDataUrl = await withViewportReset(() => safeCanvasToDataURL({
                        format: 'png',
                        multiplier: 1,
                        enableRetinaScaling: true,
                        quality: 1,
                    }));
                } catch (retryError) {
                    console.error('Thumbnail generation failed completely:', retryError);
                }
            } finally {
                setIsExporting(false);
            }
        } else {
            console.warn('Canvas has invalid dimensions, skipping thumbnail generation.');
        }

        try {
            const response = await fetch('/api/designs/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: designId,
                    name: nextName,
                    canvasData: json,
                    thumbnailDataUrl,
                }),
            });

            const result = await response.json();
            if (!result.success) {
                toast({
                    title: 'Save failed',
                    description: result.message || 'Failed to save design.',
                    variant: 'destructive',
                });
                return;
            }

            onUpdateDesignInfo(result.design.id, result.design.name);
            setIsDirty(false);
            toast({ title: 'Design saved', description: 'Your changes are saved.', variant: 'success' });

            if (typeof window !== 'undefined') {
                const driveConfig = loadDriveConfig();
                if (!driveConfig.enabled) return;

                const clientId = (driveConfig.clientId || driveClientId || '').trim();
                if (!clientId) {
                    console.warn('Google Drive backup skipped: missing client ID');
                    return;
                }

                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupName = `${nextName || 'design'}-${timestamp}.json`;
                uploadBackup(
                    clientId,
                    backupName,
                    jsonString,
                    'application/json',
                    thumbnailDataUrl,
                ).catch((error) => {
                    console.error('Google Drive backup failed', error);
                });
            }
        } catch (error) {
            console.error('Save error:', error);
            toast({ title: 'Save failed', description: 'Error saving design to server.', variant: 'destructive' });
        }
    }, [
        canvas,
        customHistoryProps,
        designId,
        designName,
        dialog,
        driveClientId,
        onUpdateDesignInfo,
        safeCanvasToDataURL,
        setIsDirty,
        setIsExporting,
        toast,
        withViewportReset,
    ]);

    const handleLoadTemplate = useCallback(async (templateJsonUrl: string) => {
        if (!canvas) return;

        setMissingItems([]);
        setPendingTemplateJson(null);

        try {
            const res = await fetch(templateJsonUrl);
            if (!res.ok) throw new Error('Failed to fetch template JSON');

            const json = await res.json();
            const objects = Array.isArray(json.objects) ? (json.objects as SerializedObject[]) : [];
            const missing: MissingItem[] = [];

            const checkUrl = (url: string): Promise<boolean> => (
                new Promise((resolve) => {
                    const img = new window.Image();
                    img.onload = () => resolve(true);
                    img.onerror = () => resolve(false);
                    img.src = url;
                })
            );

            const candidates: Array<{ index: number; src: string; type: 'image' | 'model' }> = [];
            objects.forEach((obj, index) => {
                if (obj.type === 'image' && obj.src) candidates.push({ index, src: obj.src, type: 'image' });
                if (obj.is3DModel && obj.modelUrl) candidates.push({ index, src: obj.modelUrl, type: 'model' });
            });

            for (const candidate of candidates) {
                let exists = false;
                if (candidate.type === 'model') {
                    try {
                        const head = await fetch(candidate.src, { method: 'HEAD' });
                        exists = head.ok;
                    } catch {
                        exists = false;
                    }
                } else {
                    exists = await checkUrl(candidate.src);
                }

                if (!exists) {
                    missing.push({
                        id: candidate.index.toString(),
                        type: candidate.type,
                        originalSrc: candidate.src,
                    });
                }
            }

            if (missing.length > 0) {
                setMissingItems(missing);
                setPendingTemplateJson(json);
                setShowMissingAssetsModal(true);
                return;
            }

            const artboardSize = (json as { artboard?: { width?: number; height?: number } }).artboard;

            historyReadyRef.current = false;
            canvas.loadFromJSON(json, () => {
                if (artboardSize?.width && artboardSize?.height) {
                    applyArtboardSize(canvas, artboardSize.width, artboardSize.height);
                }
                canvas.requestRenderAll();
                setIsDirty(false);
                resetHistory();
            });
        } catch (error) {
            console.error('Failed to load template', error);
            toast({ title: 'Load failed', description: 'Error loading template file.', variant: 'destructive' });
        }
    }, [canvas, historyReadyRef, resetHistory, setIsDirty, toast]);

    useEffect(() => {
        if (!canvas) return;

        if (initialTemplateJsonUrl) {
            void handleLoadTemplate(initialTemplateJsonUrl);
            return;
        }

        if (initialDesign) {
            void handleOpenDesign(initialDesign);
        }
    }, [canvas, handleLoadTemplate, handleOpenDesign, initialDesign, initialTemplateJsonUrl]);

    useEffect(() => {
        if (!canvas) return;
        if (initialTemplateJsonUrl || initialDesign) return;
        resetHistory();
    }, [canvas, initialDesign, initialTemplateJsonUrl, resetHistory]);

    const handleResolveMissing = useCallback((replaceMap: Record<string, string> | null) => {
        if (!canvas || !pendingTemplateJson) return;

        const json = JSON.parse(JSON.stringify(pendingTemplateJson)) as DesignJson;
        if (replaceMap) {
            Object.entries(replaceMap).forEach(([indexStr, newUrl]) => {
                const idx = Number.parseInt(indexStr, 10);
                if (!json.objects || !json.objects[idx]) return;
                const obj = json.objects[idx];
                if (obj.type === 'image') obj.src = newUrl;
                if (obj.is3DModel) obj.modelUrl = newUrl;
            });
        } else {
            const indicesToRemove = missingItems
                .map((item) => Number.parseInt(item.id, 10))
                .sort((a, b) => b - a);
            indicesToRemove.forEach((idx) => {
                json.objects?.splice(idx, 1);
            });
        }

        const artboardSize = (json as { artboard?: { width?: number; height?: number } }).artboard;

        historyReadyRef.current = false;
        canvas.loadFromJSON(json, () => {
            if (artboardSize?.width && artboardSize?.height) {
                applyArtboardSize(canvas, artboardSize.width, artboardSize.height);
            }
            canvas.requestRenderAll();
            setIsDirty(false);
            setPendingTemplateJson(null);
            setMissingItems([]);
            setShowMissingAssetsModal(false);
            resetHistory();
        });
    }, [canvas, historyReadyRef, missingItems, pendingTemplateJson, resetHistory, setIsDirty]);

    return {
        handleBack,
        handleSave,
        handleOpenDesign,
        showMissingAssetsModal,
        missingItems,
        closeMissingAssetsModal,
        handleResolveMissing,
    };
}
