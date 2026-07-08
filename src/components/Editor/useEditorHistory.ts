import { useCallback, useRef, useState } from 'react';
import * as fabric from 'fabric';

import type { DesignJson } from '@/components/Editor/editorView.types';
import { duplicateActiveCanvasSelection } from '@/components/Editor/duplicateCanvasSelection';

type UseEditorHistoryArgs = {
    canvas: fabric.Canvas | null;
    customHistoryProps: string[];
    setIsDirty: (value: boolean) => void;
};

export function useEditorHistory({
    canvas,
    customHistoryProps,
    setIsDirty,
}: UseEditorHistoryArgs) {
    const undoStackRef = useRef<string[]>([]);
    const redoStackRef = useRef<string[]>([]);
    const isRestoringRef = useRef(false);
    const historyReadyRef = useRef(false);
    const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 });

    const getHistorySnapshot = useCallback(() => {
        if (!canvas) return null;
        const json = (canvas as unknown as { toJSON: (properties?: string[]) => DesignJson }).toJSON(customHistoryProps);
        return JSON.stringify(json);
    }, [canvas, customHistoryProps]);

    const refreshHistoryState = useCallback(() => {
        setHistoryState({ undo: undoStackRef.current.length, redo: redoStackRef.current.length });
    }, []);

    const resetHistory = useCallback(() => {
        if (!canvas) return;
        const snapshot = getHistorySnapshot();
        if (!snapshot) return;
        undoStackRef.current = [snapshot];
        redoStackRef.current = [];
        historyReadyRef.current = true;
        refreshHistoryState();
    }, [canvas, getHistorySnapshot, refreshHistoryState]);

    const pushHistory = useCallback(() => {
        if (!canvas || isRestoringRef.current || !historyReadyRef.current) return;
        const snapshot = getHistorySnapshot();
        if (!snapshot) return;
        const undoStack = undoStackRef.current;
        if (undoStack.length > 0 && undoStack[undoStack.length - 1] === snapshot) return;
        undoStack.push(snapshot);
        if (undoStack.length > 50) undoStack.shift();
        redoStackRef.current = [];
        refreshHistoryState();
    }, [canvas, getHistorySnapshot, refreshHistoryState]);

    const restoreFromSnapshot = useCallback((snapshot: string) => {
        if (!canvas) return;
        isRestoringRef.current = true;
        const json = JSON.parse(snapshot);
        canvas.loadFromJSON(json, () => {
            canvas.requestRenderAll();
            isRestoringRef.current = false;
            setIsDirty(true);
        });
    }, [canvas, setIsDirty]);

    const handleUndo = useCallback(() => {
        if (!canvas) return;
        const undoStack = undoStackRef.current;
        if (undoStack.length < 2) return;
        const current = undoStack.pop();
        if (current) redoStackRef.current.push(current);
        const previous = undoStack[undoStack.length - 1];
        if (previous) restoreFromSnapshot(previous);
        refreshHistoryState();
    }, [canvas, refreshHistoryState, restoreFromSnapshot]);

    const handleRedo = useCallback(() => {
        if (!canvas) return;
        const redoStack = redoStackRef.current;
        if (redoStack.length === 0) return;
        const next = redoStack.pop();
        if (next) {
            undoStackRef.current.push(next);
            restoreFromSnapshot(next);
        }
        refreshHistoryState();
    }, [canvas, refreshHistoryState, restoreFromSnapshot]);

    const handleDuplicate = useCallback(async () => {
        if (!canvas) return;
        const clones = await duplicateActiveCanvasSelection(canvas, { offsetX: 20, offsetY: 20 });

        if (clones.length > 0) {
            pushHistory();
            setIsDirty(true);
        }
    }, [canvas, pushHistory, setIsDirty]);

    return {
        historyReadyRef,
        historyState,
        resetHistory,
        pushHistory,
        handleUndo,
        handleRedo,
        handleDuplicate,
    };
}
