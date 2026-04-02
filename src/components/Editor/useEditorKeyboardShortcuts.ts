import { useEffect } from 'react';
import * as fabric from 'fabric';

import type { ToolbarHandle } from '@/components/Toolbar';

type UseEditorKeyboardShortcutsArgs = {
    canvas: fabric.Canvas | null;
    toolbarRef: React.MutableRefObject<ToolbarHandle | null>;
    showExportQualityModal: boolean;
    hasOpenMenu: boolean;
    closeExportQualityModal: () => void;
    closeEditorMenus: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onDuplicate: () => void;
};

const isTypingTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

export function useEditorKeyboardShortcuts({
    canvas,
    toolbarRef,
    showExportQualityModal,
    hasOpenMenu,
    closeExportQualityModal,
    closeEditorMenus,
    onUndo,
    onRedo,
    onDuplicate,
}: UseEditorKeyboardShortcutsArgs) {
    useEffect(() => {
        if (!canvas) return;

        const handler = (event: KeyboardEvent) => {
            if (isTypingTarget(event.target)) return;

            const key = event.key.toLowerCase();
            const meta = event.metaKey || event.ctrlKey;
            if (!meta) return;

            if ((!event.shiftKey && !event.altKey && key === 'z') || (event.altKey && key === 'z')) {
                event.preventDefault();
                onUndo();
                return;
            }
            if (key === 'y' || (event.shiftKey && key === 'z')) {
                event.preventDefault();
                onRedo();
                return;
            }
            if (!event.shiftKey && !event.altKey && key === 'd') {
                event.preventDefault();
                canvas.discardActiveObject();
                canvas.requestRenderAll();
                return;
            }

            if (!event.shiftKey && !event.altKey && key === 'j') {
                event.preventDefault();
                onDuplicate();
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [canvas, onDuplicate, onRedo, onUndo]);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (isTypingTarget(event.target)) return;

            const key = event.key.toLowerCase();
            let tool: string | undefined;

            if (key === 'w') {
                tool = event.shiftKey ? 'wand' : 'quick-select';
            } else {
                const toolMap: Record<string, string> = {
                    v: 'select',
                    q: 'quick-select',
                    k: 'selection-brush',
                    m: 'marquee',
                    l: 'lasso',
                    j: 'healing',
                    y: 'history-brush',
                    b: 'paint',
                    r: 'blur',
                    o: 'dodge',
                    s: 'clone-stamp',
                    a: 'path-select',
                    c: 'crop',
                    i: 'eyedropper',
                    g: 'gradient',
                    h: 'hand',
                    p: 'pen',
                    t: 'text',
                    u: 'shapes',
                    z: 'zoom',
                };
                tool = toolMap[key];
            }

            if (!tool) return;

            event.preventDefault();
            toolbarRef.current?.triggerTool(tool);
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [toolbarRef]);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (isTypingTarget(event.target)) return;

            if (showExportQualityModal) {
                event.preventDefault();
                closeExportQualityModal();
                return;
            }

            if (hasOpenMenu) {
                event.preventDefault();
                closeEditorMenus();
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [closeEditorMenus, closeExportQualityModal, hasOpenMenu, showExportQualityModal]);
}
