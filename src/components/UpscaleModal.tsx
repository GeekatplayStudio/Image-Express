'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as fabric from 'fabric';
import { ArrowUpWideNarrow, CheckCircle2, Loader2, X } from 'lucide-react';
import useEscapeKey from '@/hooks/useEscapeKey';
import { useI18n } from '@/providers/I18nProvider';
import { captureSelectionImage, captureSourceImage } from '@/components/AI/stability-generator/stabilityGeneratorCanvas';
import {
    UPSCALE_PROVIDERS,
    getUpscaleProvider,
    loadUpscalePreferences,
    saveUpscalePreferences,
    type UpscaleProviderId,
} from '@/lib/upscale/upscaleProviders';
import {
    getUpscaleApiKey,
    insertUpscaledLayer,
    runUpscale,
    type UpscaleSourcePlacement,
} from '@/lib/upscale/upscaleClient';

interface UpscaleModalProps {
    canvas?: fabric.Canvas | null;
    onClose: () => void;
}

const measureImage = (dataUrl: string): Promise<{ width: number; height: number }> => (
    new Promise((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
        img.onerror = () => reject(new Error('Could not read the source image.'));
        img.src = dataUrl;
    })
);

/**
 * The Upscale tool: pick a source (selected layer or the whole canvas), pick
 * a service, run — the result lands as a new layer over the source so the
 * original stays untouched underneath.
 */
export default function UpscaleModal({ canvas, onClose }: UpscaleModalProps) {
    const { t } = useI18n();
    const initialPreferences = useMemo(() => loadUpscalePreferences(), []);

    const hasSelection = Boolean(canvas?.getActiveObject());
    const [source, setSource] = useState<'selection' | 'canvas'>(hasSelection ? 'selection' : 'canvas');
    const [providerId, setProviderId] = useState<UpscaleProviderId>(initialPreferences.defaultProvider);
    const [scale, setScale] = useState(initialPreferences.defaultScale);
    const [creativity, setCreativity] = useState(initialPreferences.creativity);
    const [prompt, setPrompt] = useState('');

    const [isProcessing, setIsProcessing] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [placement, setPlacement] = useState<UpscaleSourcePlacement>(null);
    const [added, setAdded] = useState(false);

    useEscapeKey(onClose);

    const provider = getUpscaleProvider(providerId) || UPSCALE_PROVIDERS[0];
    const keyMissing = !provider.isLocal && !getUpscaleApiKey(provider.id);

    useEffect(() => {
        if (!provider.scales.includes(scale)) {
            setScale(provider.scales[0]);
        }
    }, [provider, scale]);

    const handleRun = useCallback(async () => {
        if (!canvas || isProcessing) return;
        setErrorMessage('');
        setResultImage(null);
        setAdded(false);
        setIsProcessing(true);
        setStatusMessage(t('upscale.status.capturing'));

        try {
            const active = canvas.getActiveObject();
            const sourceDataUrl = captureSourceImage(
                canvas,
                source,
                () => captureSelectionImage(canvas, false),
            );
            if (!sourceDataUrl) {
                throw new Error(t('upscale.error.noSource'));
            }
            const { width, height } = await measureImage(sourceDataUrl);

            if (source === 'selection' && active) {
                const rect = active.getBoundingRect();
                setPlacement({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
            } else {
                setPlacement(null);
            }

            setStatusMessage(t('upscale.status.sending', { provider: provider.name }));
            const result = await runUpscale({
                provider: provider.id,
                image: sourceDataUrl,
                scale,
                creativity,
                prompt: prompt.trim() || undefined,
                sourceWidth: width,
                sourceHeight: height,
                onStatus: setStatusMessage,
            });

            setResultImage(result);
            setStatusMessage('');
            saveUpscalePreferences({ defaultProvider: provider.id, defaultScale: scale, creativity });
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
            setStatusMessage('');
        } finally {
            setIsProcessing(false);
        }
    }, [canvas, creativity, isProcessing, prompt, provider, scale, source, t]);

    const handleAddLayer = useCallback(async () => {
        if (!canvas || !resultImage) return;
        try {
            await insertUpscaledLayer(canvas, resultImage, { provider: provider.id, scale, placement });
            setAdded(true);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
        }
    }, [canvas, placement, provider.id, resultImage, scale]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <h2 className="font-semibold text-sm flex items-center gap-2">
                        <ArrowUpWideNarrow size={16} className="text-primary" />
                        {t('upscale.title')}
                    </h2>
                    <button type="button" onClick={onClose} aria-label={t('common.close')} className="p-1 rounded hover:bg-secondary transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label className="text-xs font-semibold mb-1.5 block">{t('upscale.source')}</label>
                        <div className="flex gap-2 text-xs">
                            <button
                                type="button"
                                onClick={() => setSource('selection')}
                                disabled={!hasSelection}
                                className={`px-3 h-8 rounded border transition-colors disabled:opacity-40 ${source === 'selection' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-secondary'}`}
                            >
                                {t('upscale.source.selection')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setSource('canvas')}
                                className={`px-3 h-8 rounded border transition-colors ${source === 'canvas' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-secondary'}`}
                            >
                                {t('upscale.source.canvas')}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold mb-1.5 block">{t('upscale.service')}</label>
                            <select
                                value={providerId}
                                onChange={(event) => setProviderId(event.target.value as UpscaleProviderId)}
                                className="w-full h-9 px-2 rounded-md bg-background border border-border text-xs outline-none focus:border-primary"
                            >
                                {UPSCALE_PROVIDERS.map((entry) => (
                                    <option key={entry.id} value={entry.id}>{entry.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold mb-1.5 block">{t('upscale.scale')}</label>
                            <select
                                value={scale}
                                onChange={(event) => setScale(Number(event.target.value))}
                                className="w-full h-9 px-2 rounded-md bg-background border border-border text-xs outline-none focus:border-primary"
                            >
                                {provider.scales.map((option) => (
                                    <option key={option} value={option}>{option}x</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground">{t(provider.guidanceKey)}</p>
                    {keyMissing ? (
                        <p className="text-[11px] text-amber-500">{t('upscale.keyMissing')}</p>
                    ) : null}

                    {provider.supportsCreativity ? (
                        <div>
                            <label className="text-xs font-semibold mb-1.5 flex items-center justify-between">
                                {t('settings.upscale.creativity')}
                                <span className="font-mono text-[11px] text-muted-foreground">{creativity.toFixed(2)}</span>
                            </label>
                            <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.05}
                                value={creativity}
                                onChange={(event) => setCreativity(Number(event.target.value))}
                                className="w-full accent-primary"
                            />
                            <input
                                type="text"
                                value={prompt}
                                onChange={(event) => setPrompt(event.target.value)}
                                placeholder={t('upscale.promptPlaceholder')}
                                className="mt-2 w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary outline-none text-xs"
                            />
                        </div>
                    ) : null}

                    {resultImage ? (
                        <div className="border border-border rounded-lg p-2 bg-background">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={resultImage} alt={t('upscale.resultAlt')} className="max-h-64 w-full object-contain rounded" />
                        </div>
                    ) : null}

                    {statusMessage ? (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-2">
                            <Loader2 size={12} className="animate-spin" /> {statusMessage}
                        </p>
                    ) : null}
                    {errorMessage ? <p className="text-[11px] text-red-500">{errorMessage}</p> : null}
                    {added ? (
                        <p className="text-[11px] text-green-500 flex items-center gap-1">
                            <CheckCircle2 size={12} /> {t('upscale.addedAsLayer')}
                        </p>
                    ) : null}
                </div>

                <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-9 px-4 rounded-md border border-border text-xs font-semibold hover:bg-secondary transition-colors"
                    >
                        {t('common.close')}
                    </button>
                    {resultImage ? (
                        <button
                            type="button"
                            onClick={() => void handleAddLayer()}
                            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                        >
                            {t('upscale.addAsLayer')}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => void handleRun()}
                        disabled={isProcessing || !canvas || keyMissing}
                        className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {isProcessing ? t('upscale.running') : t('upscale.run')}
                    </button>
                </div>
            </div>
        </div>
    );
}
