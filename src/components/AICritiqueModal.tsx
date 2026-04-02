import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as fabric from 'fabric';
import { Loader2, MessageSquare, X } from 'lucide-react';
import useEscapeKey from '@/hooks/useEscapeKey';
import { loadLocalAiPreferences } from '@/lib/localAiPreferences';

interface AICritiqueModalProps {
    isOpen?: boolean;
    canvas?: fabric.Canvas | null;
    onClose: () => void;
}

type CritiqueTarget = 'selection' | 'canvas';

type CanvasWithSelectionControls = fabric.Canvas & {
    artboard?: { width: number; height: number };
    defaultCursor: string;
    hoverCursor: string;
    isDrawingMode?: boolean;
    selection: boolean;
    viewportTransform?: fabric.TMat2D;
};

type FabricObjectLike = fabric.Object & {
    name?: string;
};

const resolveSelectionLabel = (target: fabric.Object | null | undefined): string | null => {
    if (!target) return null;
    const namedTarget = target as FabricObjectLike;
    if (typeof namedTarget.name === 'string' && namedTarget.name.trim().length > 0) {
        return namedTarget.name.trim();
    }
    if (typeof target.type === 'string' && target.type.trim().length > 0) {
        return target.type.replace(/-/g, ' ');
    }
    return 'Selected layer';
};

const captureCritiqueImage = (canvas: CanvasWithSelectionControls, target: CritiqueTarget): string => {
    const originalViewportTransform = Array.isArray(canvas.viewportTransform) && canvas.viewportTransform.length === 6
        ? [...canvas.viewportTransform] as fabric.TMat2D
        : undefined;
    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    canvas.requestRenderAll();

    try {
        if (target === 'selection') {
            const activeObject = canvas.getActiveObject();
            if (!activeObject) {
                throw new Error('Select a layer on the canvas before running critique.');
            }

            const bounds = activeObject.getBoundingRect();
            return canvas.toDataURL({
                format: 'png',
                multiplier: 1,
                left: Math.max(0, bounds.left),
                top: Math.max(0, bounds.top),
                width: Math.max(1, bounds.width),
                height: Math.max(1, bounds.height),
            });
        }

        if (canvas.artboard) {
            return canvas.toDataURL({
                format: 'png',
                multiplier: 1,
                left: 0,
                top: 0,
                width: Math.max(1, canvas.artboard.width),
                height: Math.max(1, canvas.artboard.height),
            });
        }

        return canvas.toDataURL({ format: 'png', multiplier: 1 });
    } finally {
        if (originalViewportTransform) {
            if (typeof canvas.setViewportTransform === 'function') {
                canvas.setViewportTransform(originalViewportTransform);
            } else {
                canvas.viewportTransform = originalViewportTransform;
            }
            canvas.requestRenderAll();
        }
    }
};

export default function AICritiqueModal({
    isOpen = true,
    canvas,
    onClose,
}: AICritiqueModalProps) {
    const [target, setTarget] = useState<CritiqueTarget>('canvas');
    const [selectionLabel, setSelectionLabel] = useState<string | null>(null);
    const [focus, setFocus] = useState('');
    const [ollamaBaseUrl, setOllamaBaseUrl] = useState('');
    const [ollamaModel, setOllamaModel] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [critique, setCritique] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    useEscapeKey(onClose, { enabled: isOpen });

    const syncSelectionState = useCallback(() => {
        if (!canvas) {
            setSelectionLabel(null);
            return;
        }

        setSelectionLabel(resolveSelectionLabel(canvas.getActiveObject()));
    }, [canvas]);

    useEffect(() => {
        if (!isOpen) return;

        const preferences = loadLocalAiPreferences();
        setOllamaBaseUrl(preferences.ollamaBaseUrl);
        setOllamaModel(preferences.ollamaModel);
        setFocus('');
        setCritique('');
        setErrorMessage('');

        if (!canvas) {
            setTarget('canvas');
            setSelectionLabel(null);
            return;
        }

        canvas.isDrawingMode = false;
        canvas.selection = true;
        canvas.defaultCursor = 'default';
        canvas.hoverCursor = 'move';
        canvas.requestRenderAll();

        const nextSelectionLabel = resolveSelectionLabel(canvas.getActiveObject());
        setSelectionLabel(nextSelectionLabel);
        setTarget(nextSelectionLabel ? 'selection' : 'canvas');
    }, [canvas, isOpen]);

    useEffect(() => {
        if (!isOpen || !canvas) return;

        const handleSelectionChange = () => {
            syncSelectionState();
        };

        canvas.on('selection:created', handleSelectionChange);
        canvas.on('selection:updated', handleSelectionChange);
        canvas.on('selection:cleared', handleSelectionChange);
        syncSelectionState();

        return () => {
            canvas.off('selection:created', handleSelectionChange);
            canvas.off('selection:updated', handleSelectionChange);
            canvas.off('selection:cleared', handleSelectionChange);
        };
    }, [canvas, isOpen, syncSelectionState]);

    const targetLabel = useMemo(() => (
        target === 'selection'
            ? (selectionLabel || 'Selected layer')
            : 'Full canvas'
    ), [selectionLabel, target]);

    const canAnalyze = Boolean(canvas) && (target === 'canvas' || Boolean(selectionLabel)) && !isAnalyzing;

    const handleAnalyze = async () => {
        if (!canvas) {
            setErrorMessage('Canvas is not ready yet.');
            return;
        }

        if (target === 'selection' && !selectionLabel) {
            setErrorMessage('Select a layer on the canvas, or switch the critique target to Full Canvas.');
            return;
        }

        setIsAnalyzing(true);
        setErrorMessage('');
        setCritique('');

        try {
            const imageDataUrl = captureCritiqueImage(canvas as CanvasWithSelectionControls, target);
            const response = await fetch('/api/ai/ollama/critique', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    baseUrl: ollamaBaseUrl,
                    model: ollamaModel,
                    target,
                    targetLabel,
                    focus,
                    imageDataUrl,
                }),
            });

            const payload = await response.json() as {
                success?: boolean;
                critique?: string;
                message?: string;
            };

            if (!response.ok || !payload.success || !payload.critique) {
                throw new Error(payload.message || 'Failed to generate local AI critique.');
            }

            setCritique(payload.critique);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to generate local AI critique.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed left-24 top-20 z-[1700] w-[24rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card/95 text-foreground shadow-2xl backdrop-blur-xl"
        >
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        <MessageSquare size={16} />
                        <span>AI Critique</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Leave this panel open and click a layer on the canvas to critique the current selection.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md p-1 transition-colors hover:bg-white/10"
                    aria-label="Close AI Critique"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="space-y-4 px-4 py-4">
                <div className="rounded-xl border border-border bg-secondary/30 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Local Runtime
                    </div>
                    <div className="mt-1 text-sm font-medium">{ollamaModel || 'No model configured'}</div>
                    <div className="mt-1 break-all text-xs text-muted-foreground">
                        {ollamaBaseUrl || 'No Ollama URL configured'}
                    </div>
                </div>

                <fieldset>
                    <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Critique Target
                    </legend>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                            <input
                                type="radio"
                                name="ai-critique-target"
                                value="selection"
                                aria-label="Selected Layer"
                                checked={target === 'selection'}
                                disabled={!selectionLabel}
                                onChange={() => setTarget('selection')}
                            />
                            <span>
                                <span className="block font-medium">Selected Layer</span>
                                <span className="block text-xs text-muted-foreground">
                                    {selectionLabel || 'Select a layer on the canvas'}
                                </span>
                            </span>
                        </label>

                        <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                            <input
                                type="radio"
                                name="ai-critique-target"
                                value="canvas"
                                aria-label="Full Canvas"
                                checked={target === 'canvas'}
                                onChange={() => setTarget('canvas')}
                            />
                            <span>
                                <span className="block font-medium">Full Canvas</span>
                                <span className="block text-xs text-muted-foreground">
                                    Review the current composition
                                </span>
                            </span>
                        </label>
                    </div>
                </fieldset>

                <div>
                    <label htmlFor="ai-critique-focus" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Focus Prompt
                    </label>
                    <textarea
                        id="ai-critique-focus"
                        value={focus}
                        onChange={(event) => setFocus(event.target.value)}
                        rows={4}
                        placeholder="Optional: ask it to focus on hierarchy, readability, color, conversion readiness, etc."
                        className="mt-2 w-full rounded-xl border border-input bg-secondary/30 px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2"
                    />
                </div>

                <div className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground">
                    Active target: <span className="text-foreground">{targetLabel}</span>
                </div>

                <button
                    type="button"
                    onClick={() => void handleAnalyze()}
                    disabled={!canAnalyze}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />}
                    {isAnalyzing ? 'Analyzing...' : 'Analyze with Ollama'}
                </button>

                {errorMessage && (
                    <div
                        className="rounded-xl border px-3 py-2 text-sm"
                        style={{
                            borderColor: 'rgba(248, 113, 113, 0.5)',
                            backgroundColor: 'rgba(127, 29, 29, 0.18)',
                            color: '#fecaca',
                        }}
                    >
                        {errorMessage}
                    </div>
                )}

                <div className="rounded-xl border border-border bg-secondary/20 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Critique Output
                    </div>
                    <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-6">
                        {critique || 'Run a critique to get local design feedback here.'}
                    </div>
                </div>
            </div>
        </div>
    );
}
