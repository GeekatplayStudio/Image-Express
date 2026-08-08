'use client';

import * as fabric from 'fabric';

import { placeAtViewportCenter } from '@/lib/canvas-placement';
import { persistAssetToLibrary } from '@/lib/assetPersistence';
import { renderModelThumbnail } from '@/lib/modelThumbnail';
import type { BackgroundJob, ExtendedFabricObject, ThreeDGroup, ThreeDImage } from '@/types';

/**
 * What happens when a background job finishes: save the asset, get something
 * onto the canvas, and settle the job record.
 *
 * Extracted from `useBackgroundJobPolling` because it now has two callers. The
 * browser poller still drives jobs it owns (guests, and any job whose server
 * handoff failed), while jobs the server polls arrive over SSE — and both must
 * finish a job identically. Leaving this inline would have meant the SSE path
 * silently never placing a model on the canvas.
 *
 * It stays client-side on purpose: every step here needs a Fabric canvas.
 */

export type CompletionOutcome = {
    status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
    progress: number;
    resultUrl?: string;
    thumbnailUrl?: string;
    error?: string;
};

export type MaterializeArgs = {
    job: BackgroundJob;
    outcome: CompletionOutcome;
    canvas: fabric.Canvas | null;
    user: string;
    setBackgroundJobs: React.Dispatch<React.SetStateAction<BackgroundJob[]>>;
};

/** Derive a sensible filename, ensuring the extension matches the payload. */
export function completionFilename(job: BackgroundJob, resultUrl: string): string {
    let filename = (job.prompt || 'generated').slice(0, 15).replace(/[^a-z0-9]/gi, '_');
    const urlMatch = resultUrl.match(/\.([a-z0-9]+)(?:$|[?#])/i);
    const extension = (urlMatch?.[1] || 'glb').toLowerCase();
    if (!filename.toLowerCase().endsWith(`.${extension}`)) filename += `.${extension}`;
    return filename;
}

export async function materializeCompletedJob({
    job,
    outcome,
    canvas,
    user,
    setBackgroundJobs,
}: MaterializeArgs): Promise<void> {
    const { status, progress, resultUrl, thumbnailUrl, error } = outcome;

    const updatedJob: BackgroundJob = {
        ...job,
        status,
        resultUrl,
        thumbnailUrl,
        progress: status === 'SUCCEEDED' ? 100 : progress,
        error: status === 'FAILED'
            ? (error || 'Failed to process.')
            : status === 'CANCELLED'
                ? (error || 'Tracking stopped by user.')
                : undefined,
    };
    setBackgroundJobs((prev) => prev.map((p) => (p.id === job.id ? updatedJob : p)));

    if (status !== 'SUCCEEDED' || !resultUrl) return;

    try {
        await persistAssetToLibrary({
            source: resultUrl,
            filename: completionFilename(job, resultUrl),
            type: 'models',
            category: 'uploads',
            owner: user,
        });
    } catch (persistError) {
        // A library save failure must not stop the model reaching the canvas —
        // the user still gets their generation.
        console.error('Failed to auto-save asset', persistError);
    }

    if (!canvas) return;

    const addFallbackPlaceholder = () => {
        const group = new fabric.Group([], { left: 150, top: 150, subTargetCheck: true, interactive: true });
        const box = new fabric.Rect({ width: 100, height: 100, fill: '#3b82f6', rx: 10, ry: 10 });
        const text = new fabric.IText('3D', {
            fontSize: 30, fill: 'white', left: 30, top: 35, fontFamily: 'sans-serif', fontWeight: 'bold',
        });
        group.add(box);
        group.add(text);
        const threeDGroup = group as ThreeDGroup;
        threeDGroup.is3DModel = true;
        threeDGroup.modelUrl = resultUrl;
        if (job.prompt) (threeDGroup as ExtendedFabricObject).name = job.prompt.slice(0, 40);
        canvas.add(threeDGroup);
        canvas.setActiveObject(threeDGroup);
        canvas.requestRenderAll();
    };

    const placeImage = (dataUrl: string, crossOrigin?: 'anonymous') => (
        fabric.FabricImage.fromURL(dataUrl, crossOrigin ? { crossOrigin } : undefined)
            .then((img) => {
                if (!img) throw new Error('Image loaded but null');
                if (!canvas) return;
                img.scaleToWidth(280);
                placeAtViewportCenter(canvas, img);
                const threeDImg = img as ThreeDImage;
                threeDImg.is3DModel = true;
                threeDImg.modelUrl = resultUrl;
                if (job.prompt) (threeDImg as ExtendedFabricObject).name = job.prompt.slice(0, 40);
                canvas.add(threeDImg);
                canvas.setActiveObject(threeDImg);
                canvas.requestRenderAll();
            })
    );

    // Show the model that actually came back. Render the returned GLB offscreen
    // so the canvas gets a real still of the generated geometry; the provider
    // thumbnail and the "3D" box are only fallbacks for when the model cannot
    // be rendered here.
    const canRenderModel = /\.(glb|gltf)(?:$|[?#])/i.test(resultUrl);
    const renderPromise = canRenderModel
        ? renderModelThumbnail(resultUrl, resultUrl, 512).then((dataUrl) => placeImage(dataUrl))
        : Promise.reject(new Error('Not a renderable model URL'));

    await renderPromise.catch(() => {
        if (!thumbnailUrl) {
            addFallbackPlaceholder();
            return;
        }
        return placeImage(thumbnailUrl, 'anonymous').catch(() => {
            addFallbackPlaceholder();
        });
    });
}
