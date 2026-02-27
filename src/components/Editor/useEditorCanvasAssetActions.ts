import { useCallback } from 'react';
import * as fabric from 'fabric';

import type { ThreeDGroup, ThreeDImage, ExtendedFabricObject } from '@/types';
import type { CanvasWithArtboard } from '@/components/Editor/editorView.types';
import type { ToastOptions } from '@/providers/ToastProvider';

type Toast = (options: ToastOptions) => void;

type UseEditorCanvasAssetActionsArgs = {
    canvas: fabric.Canvas | null;
    user: string;
    pushHistory: () => void;
    setIsDirty: (value: boolean) => void;
    setContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; isOpen: boolean }>>;
    toast: Toast;
};

export function useEditorCanvasAssetActions({
    canvas,
    user,
    pushHistory,
    setIsDirty,
    setContextMenu,
    toast,
}: UseEditorCanvasAssetActionsArgs) {
    const handleAssetSelect = useCallback((url: string, type: string, name?: string) => {
        if (!canvas) return;

        if (type === 'models' || type === 'model' || url.endsWith('.glb') || url.endsWith('.gltf')) {
            fabric.FabricImage.fromURL(url).then((img) => {
                img.scaleToWidth(300);
                canvas.centerObject(img);
                const threeDImg = img as ThreeDImage;
                threeDImg.is3DModel = true;
                threeDImg.modelUrl = url;
                if (name) (threeDImg as ExtendedFabricObject).name = name;
                canvas.add(img);
                canvas.setActiveObject(img);
                canvas.requestRenderAll();
                pushHistory();
            });
        } else if (type === 'videos' || type === 'video') {
            toast({ title: 'Video support', description: 'Video placement is experimental.' });
        } else {
            fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' }).then((img) => {
                const artboard = (canvas as CanvasWithArtboard).artboard || { width: canvas.width || 800, height: canvas.height || 600 };
                const viewW = artboard.width;
                if (img.width! > viewW * 0.5) {
                    img.scaleToWidth(viewW * 0.5);
                }
                canvas.centerObject(img);
                if (name) (img as ExtendedFabricObject).name = name;
                canvas.add(img);
                canvas.setActiveObject(img);
                canvas.requestRenderAll();
                pushHistory();
            }).catch(() => {
                toast({ title: 'Error', description: 'Failed to load image', variant: 'destructive' });
            });
        }
    }, [canvas, pushHistory, toast]);

    const handleCanvasModified = useCallback(() => {
        setIsDirty(true);
        pushHistory();
    }, [pushHistory, setIsDirty]);

    const handleRightClick = useCallback((e: MouseEvent) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            isOpen: true,
        });
    }, [setContextMenu]);

    const handleFileDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;

        toast({ title: 'Uploading assets...' });

        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('category', 'uploads');
            formData.append('owner', user);

            try {
                const res = await fetch('/api/assets/upload', { method: 'POST', body: formData });
                const json = await res.json();
                const assetUrl = json.path || json.url;

                if (json.success && assetUrl) {
                    const type = json.type || 'images';
                    if (!canvas) continue;

                    if (type === 'images' || type === 'image') {
                        fabric.FabricImage.fromURL(assetUrl, { crossOrigin: 'anonymous' }).then((img) => {
                            if (!img) return;
                            img.scaleToWidth(Math.min(300, (canvas.width || 800) / 3));
                            canvas.centerObject(img);
                            const ext = img as ExtendedFabricObject;
                            ext.id = crypto.randomUUID();
                            ext.name = file.name;
                            canvas.add(img);
                            canvas.setActiveObject(img);
                            canvas.requestRenderAll();
                            pushHistory();
                        });
                    } else if (type === 'models' || type === 'model') {
                        const group = new fabric.Group([], { left: 100, top: 100, subTargetCheck: true, interactive: true });
                        const box = new fabric.Rect({ width: 100, height: 100, fill: '#3b82f6', rx: 10, ry: 10 });
                        const text = new fabric.IText('3D', { fontSize: 30, fill: 'white', left: 30, top: 35, fontFamily: 'sans-serif', fontWeight: 'bold' });
                        group.add(box);
                        group.add(text);
                        const threeDGroup = group as ThreeDGroup;
                        threeDGroup.is3DModel = true;
                        threeDGroup.modelUrl = assetUrl;
                        threeDGroup.id = crypto.randomUUID();
                        threeDGroup.name = file.name;

                        canvas.centerObject(threeDGroup);
                        canvas.add(threeDGroup);
                        canvas.setActiveObject(threeDGroup);
                        canvas.requestRenderAll();
                        pushHistory();
                    } else if (type === 'videos' || type === 'video') {
                        toast({ title: 'Video uploaded to library. Please add from library.', variant: 'success' });
                    }
                }
            } catch (err) {
                console.error('Upload failed', err);
                toast({ title: `Upload failed for ${file.name}`, variant: 'destructive' });
            }
        }
    }, [canvas, pushHistory, toast, user]);

    return {
        handleAssetSelect,
        handleCanvasModified,
        handleRightClick,
        handleFileDrop,
    };
}
