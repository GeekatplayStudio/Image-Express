import { useEffect, useRef } from 'react';
import * as fabric from 'fabric';

import type { ToolbarHandle } from '@/components/Toolbar';
import type { ExtendedFabricObject } from '@/types';

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
    /** Ctrl/Cmd+S — save the page/album (persistence flow prompts for a name when new). */
    onSave?: () => void;
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
    onSave,
}: UseEditorKeyboardShortcutsArgs) {
    // Internal object clipboard for Ctrl+C/X/V (canvas objects, not OS clipboard).
    const objectClipboardRef = useRef<fabric.Object[]>([]);

    useEffect(() => {
        if (!canvas) return;

        const assignFreshId = (object: fabric.Object) => {
            const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `object-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            (object as ExtendedFabricObject).id = id;
        };

        const snapshotSelection = async (): Promise<fabric.Object[]> => {
            const active = canvas.getActiveObjects();
            if (active.length === 0) return [];
            // Discard first so multi-selection members report absolute coords,
            // then restore the selection so copying is non-destructive.
            canvas.discardActiveObject();
            const clones = await Promise.all(active.map((object) => object.clone()));
            if (active.length === 1) {
                canvas.setActiveObject(active[0]);
            } else {
                canvas.setActiveObject(new fabric.ActiveSelection(active, { canvas }));
            }
            canvas.requestRenderAll();
            return clones as unknown as fabric.Object[];
        };

        const copySelection = async () => {
            const clones = await snapshotSelection();
            if (clones.length > 0) {
                objectClipboardRef.current = clones;
            }
        };

        const cutSelection = async () => {
            const active = canvas.getActiveObjects();
            if (active.length === 0) return;
            const clones = await snapshotSelection();
            if (clones.length === 0) return;
            objectClipboardRef.current = clones;
            canvas.discardActiveObject();
            active.forEach((object) => {
                if (object.group) object.group.remove(object);
                else canvas.remove(object);
            });
            canvas.requestRenderAll();
            canvas.fire('object:modified');
        };

        const pasteClipboard = async () => {
            const stored = objectClipboardRef.current;
            if (stored.length === 0) return;

            canvas.discardActiveObject();
            const added: fabric.Object[] = [];
            for (const item of stored) {
                const clone = (await item.clone()) as unknown as fabric.Object;
                clone.set({
                    left: (clone.left || 0) + 16,
                    top: (clone.top || 0) + 16,
                    evented: true,
                });
                assignFreshId(clone);
                canvas.add(clone);
                added.push(clone);
                // Cascade successive pastes like Photoshop's paste-in-place + nudge.
                item.set({ left: (item.left || 0) + 16, top: (item.top || 0) + 16 });
            }

            if (added.length === 1) {
                canvas.setActiveObject(added[0]);
            } else if (added.length > 1) {
                canvas.setActiveObject(new fabric.ActiveSelection(added, { canvas }));
            }
            canvas.requestRenderAll();
            canvas.fire('object:modified');
        };

        const handler = (event: KeyboardEvent) => {
            if (isTypingTarget(event.target)) return;

            const key = event.key.toLowerCase();
            const meta = event.metaKey || event.ctrlKey;
            if (!meta) return;

            if (!event.shiftKey && !event.altKey && key === 's') {
                // Always swallow the browser's save-page dialog, even if no
                // save handler is wired up.
                event.preventDefault();
                onSave?.();
                return;
            }
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
                return;
            }

            // Object clipboard (Photoshop-style layer copy/paste). Skip when the
            // user has a text selection in the page so normal copy still works.
            const hasDomSelection = !!window.getSelection()?.toString();
            if (!event.shiftKey && !event.altKey && key === 'c' && !hasDomSelection) {
                if (canvas.getActiveObjects().length === 0) return;
                event.preventDefault();
                void copySelection();
                return;
            }
            if (!event.shiftKey && !event.altKey && key === 'x' && !hasDomSelection) {
                if (canvas.getActiveObjects().length === 0) return;
                event.preventDefault();
                void cutSelection();
                return;
            }
            if (!event.shiftKey && !event.altKey && key === 'v') {
                if (objectClipboardRef.current.length === 0) return;
                event.preventDefault();
                void pasteClipboard();
                return;
            }
            if (!event.shiftKey && !event.altKey && key === 'a') {
                // Select all layers (skip artboard/helper objects).
                event.preventDefault();
                const canvasWithArtboard = canvas as fabric.Canvas & { artboardRect?: fabric.Object };
                const selectable = canvas.getObjects().filter((object) => {
                    const ext = object as ExtendedFabricObject;
                    if (object === canvasWithArtboard.artboardRect || ext.name === 'Artboard') return false;
                    if (ext.isAdjustmentLayer || ext.isRetouchLayer) return false;
                    return object.visible !== false;
                });
                if (selectable.length === 0) return;
                canvas.discardActiveObject();
                if (selectable.length === 1) {
                    canvas.setActiveObject(selectable[0]);
                } else {
                    canvas.setActiveObject(new fabric.ActiveSelection(selectable, { canvas }));
                }
                canvas.requestRenderAll();
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [canvas, onDuplicate, onRedo, onSave, onUndo]);

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
