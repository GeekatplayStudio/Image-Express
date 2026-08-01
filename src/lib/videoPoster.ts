'use client';

/**
 * Capture a still frame from a video URL for grid/room thumbnails.
 * Cached in-memory so reopening the vault does not re-decode every clip.
 */

const posterCache = new Map<string, string>();
let captureQueue: Promise<unknown> = Promise.resolve();

export function getCachedVideoPoster(cacheKey: string): string | null {
    return posterCache.get(cacheKey) ?? null;
}

export function captureVideoPoster(cacheKey: string, url: string, size = 256): Promise<string> {
    const cached = posterCache.get(cacheKey);
    if (cached) return Promise.resolve(cached);

    const run = captureQueue.then(async () => {
        const again = posterCache.get(cacheKey);
        if (again) return again;
        const dataUrl = await captureFrameToDataUrl(url, size);
        posterCache.set(cacheKey, dataUrl);
        return dataUrl;
    });
    captureQueue = run.catch(() => undefined);
    return run;
}

function captureFrameToDataUrl(url: string, size: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        // Same-origin / blob URLs work; cross-origin may taint the canvas.
        if (!url.startsWith('blob:')) {
            video.crossOrigin = 'anonymous';
        }

        let settled = false;
        const fail = (error: Error) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error);
        };
        const succeed = (dataUrl: string) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(dataUrl);
        };
        const cleanup = () => {
            video.removeAttribute('src');
            video.load();
        };

        const timer = window.setTimeout(() => fail(new Error('Video poster timed out')), 12_000);

        video.onloadeddata = () => {
            try {
                const duration = Number.isFinite(video.duration) ? video.duration : 1;
                video.currentTime = Math.min(0.25, Math.max(0.05, duration * 0.05));
            } catch {
                fail(new Error('Could not seek video'));
            }
        };
        video.onseeked = () => {
            window.clearTimeout(timer);
            try {
                const width = video.videoWidth || size;
                const height = video.videoHeight || size;
                if (width < 2 || height < 2) {
                    fail(new Error('Video has no dimensions'));
                    return;
                }
                const scale = size / Math.max(width, height);
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(width * scale));
                canvas.height = Math.max(1, Math.round(height * scale));
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    fail(new Error('Canvas unavailable'));
                    return;
                }
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                succeed(canvas.toDataURL('image/jpeg', 0.82));
            } catch (error) {
                fail(error instanceof Error ? error : new Error('Poster capture failed'));
            }
        };
        video.onerror = () => {
            window.clearTimeout(timer);
            fail(new Error('Video failed to load'));
        };
        video.src = url;
    });
}
