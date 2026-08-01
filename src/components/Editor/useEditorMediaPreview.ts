import { useCallback, useEffect } from 'react';
import * as fabric from 'fabric';

import type { CanvasWithArtboard } from '@/components/Editor/editorView.types';

type MediaPreviewState = { type: 'video' | 'audio'; url: string } | null;

type UseEditorMediaPreviewArgs = {
    canvas: fabric.Canvas | null;
    mediaPreview: MediaPreviewState;
    videoPreviewRef: React.MutableRefObject<HTMLVideoElement | null>;
    setMediaPreview: React.Dispatch<React.SetStateAction<MediaPreviewState>>;
    setActiveTool: (tool: string) => void;
};

const OPEN_MEDIA_PREVIEW_EVENT = 'iex:open-media-preview';

export function useEditorMediaPreview({
    canvas,
    mediaPreview,
    videoPreviewRef,
    setMediaPreview,
    setActiveTool,
}: UseEditorMediaPreviewArgs) {
    useEffect(() => {
        const onOpen = (event: Event) => {
            const detail = (event as CustomEvent<{ type?: string; url?: string }>).detail;
            if (!detail?.url) return;
            if (detail.type !== 'video' && detail.type !== 'audio') return;
            setMediaPreview({ type: detail.type, url: detail.url });
        };
        window.addEventListener(OPEN_MEDIA_PREVIEW_EVENT, onOpen);
        return () => window.removeEventListener(OPEN_MEDIA_PREVIEW_EVENT, onOpen);
    }, [setMediaPreview]);

    const handleCaptureVideoFrame = useCallback(() => {
        if (!canvas || !mediaPreview || mediaPreview.type !== 'video') return;
        const video = videoPreviewRef.current;
        if (!video) return;

        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 720;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, width, height);
        const dataUrl = tempCanvas.toDataURL('image/png');

        fabric.FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' }).then((img) => {
            if (!img || !canvas) return;
            const artboard = (canvas as CanvasWithArtboard).artboard || { width: canvas.width || 800, height: canvas.height || 600 };
            const viewW = artboard.width;
            const viewH = artboard.height;

            if (img.width! > viewW * 0.8 || img.height! > viewH * 0.8) {
                const scale = Math.min((viewW * 0.8) / img.width!, (viewH * 0.8) / img.height!);
                img.scale(scale);
            }

            canvas.centerObject(img);
            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.requestRenderAll();
            setMediaPreview(null);
            setActiveTool('select');
        });
    }, [canvas, mediaPreview, setActiveTool, setMediaPreview, videoPreviewRef]);

    return {
        handleCaptureVideoFrame,
    };
}
