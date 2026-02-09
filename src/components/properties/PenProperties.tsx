import React, { useState, useEffect } from 'react';
import * as fabric from 'fabric';
import { PenModeSetting } from '@/lib/pen-utils';

export type CanvasWithPenDraft = fabric.Canvas & {
    penDraftState?: { mode: PenModeSetting; closure: 'open' | 'closed'; points: number };
};

interface PenPropertiesProps {
    canvas: fabric.Canvas | null;
}

export function PenProperties({ canvas }: PenPropertiesProps) {
    // We need to listen to canvas events to update the UI when pen state changes
    // The original code in PropertiesPanel likely re-rendered because PropertiesPanel
    // re-renders on many things. Here we might need local state mirroring the canvas state.

    // Looking at the original code, it read directly from usage in render:
    // const penDraftState = (canvas as CanvasWithPenDraft)?.penDraftState;
    // But this implies PropertiesPanel re-rendered when penDraftState changed.
    // How did it know to re-render?
    // Probably via 'pen:state:changed' event or similar if it existed, or just shared parent state.
    // However, PropertiesPanel has no useEffect listening for pen state specifically shown in valid snippets.
    // Just generic selection events.

    // Let's assume we need to trigger re-renders or accept props.
    // The original code was:
    // const firePenEvent = (eventName: string, detail?: any) => { canvas?.fire(eventName, detail); };
    
    const [draftState, setDraftState] = useState<{ mode: PenModeSetting; closure: 'open' | 'closed'; points: number } | undefined>(
        (canvas as CanvasWithPenDraft)?.penDraftState
    );

    useEffect(() => {
        if (!canvas) return;
        
        const updateState = () => {
             const state = (canvas as CanvasWithPenDraft).penDraftState;
             setDraftState(state ? { ...state } : undefined);
        };

        // We assume the PenTool emits an event when state changes, or we poll?
        // If the original didn't have an event listener, maybe it relied on the fact that
        // interacting with the canvas triggered generic updates.
        // Let's add a listener for a custom event if we can find one, otherwise relying on common events.
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        canvas.on('pen:state:updated' as any, updateState); // Hypothetical event
        canvas.on('mouse:up', updateState); // Fallback
        
        return () => {
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
            canvas.off('pen:state:updated' as any, updateState);
            canvas.off('mouse:up', updateState);
        };
    }, [canvas]);

    // Force read on render if available
    const currentDraftState = (canvas as CanvasWithPenDraft)?.penDraftState || draftState;
    const penDraftMode = currentDraftState?.mode || 'straight';
    const penDraftClosure = currentDraftState?.closure || 'open';
    const penDraftPoints = currentDraftState?.points || 0;

    const firePenEvent = (eventName: 'pen:config:set' | 'pen:finish-request' | 'pen:clear-request', detail?: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        canvas?.fire(eventName as any, detail);
        // Optimistically update if needed, or wait for event
        // State on canvas is source of truth
    };

    return (
        <div className="h-full bg-card flex flex-col">
            <div className="p-4 border-b">
                <h2 className="font-semibold mb-1">Pen Tool</h2>
                <p className="text-xs text-muted-foreground">
                    Click to add points. Drag to curve.
                </p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Mode</div>
                    <div className="grid grid-cols-3 gap-1">
                        {(['straight', 'smooth', 'bezier'] as const).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => firePenEvent('pen:config:set', { mode })}
                                className={`text-[10px] px-1.5 py-1 rounded border transition-colors capitalize ${penDraftMode === mode ? 'bg-primary/20 text-primary border-primary/30' : 'bg-secondary/20 text-muted-foreground border-border/50 hover:bg-secondary/50'}`}
                            >
                                {mode === 'bezier' ? 'Bezier' : mode}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Path</div>
                    <div className="grid grid-cols-2 gap-1">
                        <button
                            onClick={() => firePenEvent('pen:config:set', { closure: 'open' })}
                            className={`text-[10px] px-2 py-1 rounded border transition-colors ${penDraftClosure === 'open' ? 'bg-primary/20 text-primary border-primary/30' : 'bg-secondary/20 text-muted-foreground border-border/50 hover:bg-secondary/50'}`}
                        >
                            Open
                        </button>
                        <button
                            onClick={() => firePenEvent('pen:config:set', { closure: 'closed' })}
                            className={`text-[10px] px-2 py-1 rounded border transition-colors ${penDraftClosure === 'closed' ? 'bg-primary/20 text-primary border-primary/30' : 'bg-secondary/20 text-muted-foreground border-border/50 hover:bg-secondary/50'}`}
                        >
                            Closed
                        </button>
                    </div>
                </div>

                <div className="text-xs text-muted-foreground">
                    Points placed: <span className="font-semibold text-foreground">{penDraftPoints}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => firePenEvent('pen:finish-request')}
                        className="text-xs px-2 py-1.5 rounded border bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 transition-colors"
                    >
                        Finish Path
                    </button>
                    <button
                        onClick={() => firePenEvent('pen:clear-request')}
                        className="text-xs px-2 py-1.5 rounded border bg-secondary/20 border-border/50 text-muted-foreground hover:bg-secondary/50 transition-colors"
                    >
                        Clear Draft
                    </button>
                </div>
            </div>
        </div>
    );
}
