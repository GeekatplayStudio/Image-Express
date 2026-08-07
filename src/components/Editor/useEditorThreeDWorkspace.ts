import { useCallback, useEffect, useMemo, useState } from 'react';
import * as fabric from 'fabric';

import { ExtendedFabricObject, type BackgroundJob, type ThreeDImage } from '@/types';
import type { CanvasWithArtboard } from '@/components/Editor/editorView.types';
import type { ToastOptions } from '@/providers/ToastProvider';

type ThreeDLayerImageOption = {
    id: string;
    label: string;
    imageUrl: string;
};

type ToastHandler = (options: ToastOptions) => void;

interface UseEditorThreeDWorkspaceParams {
    canvas: fabric.Canvas | null;
    activeTool: string;
    setActiveTool: (tool: string) => void;
    user: string;
    backgroundJobs: BackgroundJob[];
    onOpenSettings: () => void;
    toast: ToastHandler;
    upsertBackgroundJob: (jobData: Partial<BackgroundJob>) => void;
    getDisplayName: (url: string) => string;
}

export function useEditorThreeDWorkspace({
    canvas,
    activeTool,
    setActiveTool,
    user,
    backgroundJobs,
    onOpenSettings,
    toast,
    upsertBackgroundJob,
    getDisplayName,
}: UseEditorThreeDWorkspaceParams) {
    const [initialImageFor3D, setInitialImageFor3D] = useState<string | undefined>(undefined);
    const [sourceObjectFor3D, setSourceObjectFor3D] = useState<fabric.Object | null>(null);
    const [editingModelUrl, setEditingModelUrl] = useState<string | null>(null);
    const [editingModelObject, setEditingModelObject] = useState<fabric.Object | null>(null);

    const collectThreeDLayerImageOptions = useCallback((): ThreeDLayerImageOption[] => {
        if (!canvas) {
            return [];
        }

        const objects = canvas.getObjects() as (fabric.Object & ExtendedFabricObject)[];
        const options: ThreeDLayerImageOption[] = [];

        objects.forEach((object, index) => {
            if (object.visible === false) return;
            if (object.mediaType === 'audio') return;
            if (object.isRetouchLayer) return;
            if (object.name === 'Artboard') return;
            if (object.excludeFromExport) return;

            try {
                const imageUrl = object.toDataURL({ format: 'png', multiplier: 1 });
                if (!imageUrl) return;

                const objectId = object.id || `layer-${index}`;
                const label = object.name?.trim() || `Layer ${index + 1}`;
                options.push({ id: objectId, label, imageUrl });
            } catch {
                // Ignore layers that cannot be serialized to image preview.
            }
        });

        return options.reverse();
    }, [canvas]);

    const threeDLayerImageOptions = useMemo(() => {
        if (!canvas || activeTool !== '3d-gen') {
            return [];
        }

        return collectThreeDLayerImageOptions();
    }, [activeTool, canvas, collectThreeDLayerImageOptions]);

    const handleToolbarToolChange = useCallback((tool: string) => {
        if (tool === '3d-gen' && canvas) {
            const activeObject = canvas.getActiveObject();
            if (activeObject) {
                const dataUrl = activeObject.toDataURL({ format: 'png', multiplier: 2 });
                setInitialImageFor3D(dataUrl);
                setSourceObjectFor3D(activeObject);
            } else {
                setInitialImageFor3D(undefined);
                setSourceObjectFor3D(null);
            }
        }

        if (tool !== '3d-gen') {
            setInitialImageFor3D(undefined);
            setSourceObjectFor3D(null);
        }
        setActiveTool(tool);
    }, [canvas, setActiveTool]);

    const handleOpenThreeDFromPanel = useCallback((imageUrl: string) => {
        setInitialImageFor3D(imageUrl);
        if (canvas) {
            setSourceObjectFor3D(canvas.getActiveObject() || null);
        }
        setActiveTool('3d-gen');
    }, [canvas, setActiveTool]);

    const handleOpenThreeDEditor = useCallback((url: string) => {
        setEditingModelUrl(url);
    }, []);

    // The in-panel 3D lighting workspace requests the full editor via a
    // window event (avoids drilling props through four component layers).
    useEffect(() => {
        const onOpen = (e: Event) => {
            const detail = (e as CustomEvent<{ url?: string; objectId?: string }>).detail;
            if (!detail?.url) return;
            if (detail.objectId && canvas) {
                const target = (canvas.getObjects() as ExtendedFabricObject[])
                    .find((o) => o.id === detail.objectId);
                if (target) setEditingModelObject(target);
            }
            setEditingModelUrl(detail.url);
        };
        window.addEventListener('iex:open-3d-editor', onOpen);
        return () => window.removeEventListener('iex:open-3d-editor', onOpen);
    }, [canvas]);

    const handleCloseThreeDLayerEditor = useCallback(() => {
        setEditingModelUrl(null);
        setEditingModelObject(null);
    }, []);

    const handleSaveThreeDLayerEditor = useCallback((
        dataUrl: string,
        currentModelUrl: string,
        settings: ExtendedFabricObject['threeDSettings']
    ) => {
        if (!canvas) {
            return;
        }

        fabric.FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' }).then((img) => {
            if (editingModelObject) {
                img.set({
                    left: editingModelObject.left,
                    top: editingModelObject.top,
                    scaleX: editingModelObject.scaleX,
                    scaleY: editingModelObject.scaleY,
                    angle: editingModelObject.angle,
                    originX: 'center',
                    originY: 'center',
                });
                canvas.remove(editingModelObject);
            } else {
                img.scaleToWidth(300);
                img.set({ left: 300, top: 300, originX: 'center', originY: 'center' });
            }

            const threeDImg = img as ThreeDImage;
            threeDImg.is3DModel = true;
            threeDImg.modelUrl = currentModelUrl;
            (threeDImg as ExtendedFabricObject).threeDSettings = settings;

            const modelName = getDisplayName(currentModelUrl);
            if (modelName) {
                (threeDImg as ExtendedFabricObject).name = modelName;
            }

            canvas.add(threeDImg);
            canvas.setActiveObject(threeDImg);
            canvas.requestRenderAll();
            handleCloseThreeDLayerEditor();
        });
    }, [canvas, editingModelObject, getDisplayName, handleCloseThreeDLayerEditor]);

    const handleCloseThreeDGenerator = useCallback(() => {
        setInitialImageFor3D(undefined);
        setSourceObjectFor3D(null);
        setActiveTool('select');
    }, [setActiveTool]);

    const handleThreeDGeneratorStartBackgroundJob = useCallback((jobData: Partial<BackgroundJob>) => {
        upsertBackgroundJob(jobData);
        if (sourceObjectFor3D && canvas) {
            canvas.requestRenderAll();
        }

        toast({
            title: 'Generation Started',
            description: 'Queued — you can start another while this one runs.',
        });

        // Deliberately keep the panel open: closing it discarded the in-flight
        // guard and made queueing a second generation awkward. Jobs are
        // tracked in the panel's own list and in the status area.
    }, [canvas, sourceObjectFor3D, toast, upsertBackgroundJob]);

    const handleThreeDGeneratorRecoverBackgroundJob = useCallback((jobData: Partial<BackgroundJob>) => {
        upsertBackgroundJob(jobData);
        toast({
            title: 'Job recovery started',
            description: typeof jobData.id === 'string' ? `Now tracking ${jobData.id}.` : 'Recovered job is now tracked.',
            variant: 'success',
        });
    }, [toast, upsertBackgroundJob]);

    const handleThreeDGeneratorAddToCanvas = useCallback((dataUrl: string, modelUrl?: string) => {
        if (!canvas) {
            return;
        }

        fabric.FabricImage.fromURL(dataUrl).then((img) => {
            const artboard = (canvas as CanvasWithArtboard).artboard || {
                width: canvas.width || 800,
                height: canvas.height || 600,
            };
            const viewW = artboard.width;
            const viewH = artboard.height;

            if (img.width! > viewW * 0.8 || img.height! > viewH * 0.8) {
                const scale = Math.min((viewW * 0.8) / img.width!, (viewH * 0.8) / img.height!);
                img.scale(scale);
            }

            canvas.centerObject(img);

            if (modelUrl) {
                const threeDImg = img as ThreeDImage;
                threeDImg.is3DModel = true;
                threeDImg.modelUrl = modelUrl;
                const modelName = getDisplayName(modelUrl);
                if (modelName) {
                    (threeDImg as ExtendedFabricObject).name = modelName;
                }
            }

            canvas.add(img);
            canvas.setActiveObject(img);

            if (sourceObjectFor3D) {
                sourceObjectFor3D.set('visible', false);
                canvas.requestRenderAll();
            }

            handleCloseThreeDGenerator();
        });
    }, [canvas, getDisplayName, handleCloseThreeDGenerator, sourceObjectFor3D]);

    // Every running job, so the panel can show them all rather than silently
    // reporting the first one's progress while others run unseen.
    const activeJobs = useMemo(
        () => backgroundJobs.filter((job) => job.status === 'IN_PROGRESS' || job.status === 'PENDING'),
        [backgroundJobs]
    );

    // The single job the preview pane follows: the most recent finished result
    // if there is one, else the newest still running.
    const activeJob = useMemo(() => {
        const succeeded = backgroundJobs.filter((job) => job.status === 'SUCCEEDED' && job.resultUrl);
        if (succeeded.length > 0) return succeeded[succeeded.length - 1];
        return activeJobs[activeJobs.length - 1];
    }, [activeJobs, backgroundJobs]);

    return {
        setEditingModelUrl,
        setEditingModelObject,
        handleToolbarToolChange,
        handleOpenThreeDFromPanel,
        handleOpenThreeDEditor,
        threeDControls: {
            editingModelUrl,
            editingModelObject,
            onCloseThreeDEditor: handleCloseThreeDLayerEditor,
            onSaveThreeDEditor: handleSaveThreeDLayerEditor,
            showThreeDGenerator: activeTool === '3d-gen',
            initialImage: initialImageFor3D,
            layerImageOptions: threeDLayerImageOptions,
            currentUser: user,
            onOpenSettings,
            activeJob,
            activeJobs,
            onStartBackgroundJob: handleThreeDGeneratorStartBackgroundJob,
            onRecoverBackgroundJob: handleThreeDGeneratorRecoverBackgroundJob,
            onAddToCanvas: handleThreeDGeneratorAddToCanvas,
            onCloseThreeDGenerator: handleCloseThreeDGenerator,
        },
    };
}
