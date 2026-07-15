// Delete-hotkey and pan/zoom navigation wiring for the design canvas.
// Extracted from DesignCanvas.tsx to keep files small and behavior testable.
import * as fabric from 'fabric';
import { duplicateCanvasObjects } from '@/components/Editor/duplicateCanvasSelection';

const isEditableElement = (element: Element | null): boolean => {
    if (!element || !(element instanceof HTMLElement)) return false;
    if (element.isContentEditable) return true;
    const tagName = element.tagName;
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
    if (element.getAttribute('role') === 'textbox') return true;
    return Boolean(element.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]'));
};

/** Delete/Backspace removes the active selection, but never while typing. Returns cleanup. */
export function installDeleteHotkeys(canvas: fabric.Canvas, container: HTMLElement): () => void {
    let suppressDeleteHotkeysUntilCanvas = false;

    const handleFocusIn = (event: FocusEvent) => {
        const target = event.target instanceof Element ? event.target : null;
        if (isEditableElement(target)) {
            suppressDeleteHotkeysUntilCanvas = true;
        }
    };

    const handleCanvasMouseDown = () => {
        suppressDeleteHotkeysUntilCanvas = false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;

        const hasEditableInPath = (event: KeyboardEvent): boolean => {
            const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
            return path.some((node) => node instanceof HTMLElement && isEditableElement(node));
        };

        const hasEditableSelectionAnchor = (): boolean => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return false;
            const anchorNode = selection.anchorNode;
            if (!anchorNode) return false;
            const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode.parentElement;
            return isEditableElement(anchorElement);
        };

        const eventTarget = e.target instanceof Element ? e.target : null;
        const activeElement = document.activeElement instanceof Element ? document.activeElement : null;
        if (
            isEditableElement(eventTarget)
            || isEditableElement(activeElement)
            || hasEditableInPath(e)
            || hasEditableSelectionAnchor()
        ) {
            suppressDeleteHotkeysUntilCanvas = true;
            return;
        }
        if (suppressDeleteHotkeysUntilCanvas) {
            return;
        }

        const activeObjects = canvas.getActiveObjects();
        if (activeObjects && activeObjects.length > 0) {
            const activeObject = canvas.getActiveObject();
            if (activeObject && (activeObject as fabric.IText).isEditing) {
                return;
            }

            e.preventDefault();
            canvas.discardActiveObject();
            activeObjects.forEach((obj) => {
                canvas.remove(obj);
            });
            canvas.requestRenderAll();
        }
    };

    void container; // container kept in signature for future scoping; hotkeys are window-level today
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn, true);
    canvas.on('mouse:down', handleCanvasMouseDown);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('focusin', handleFocusIn, true);
        canvas.off('mouse:down', handleCanvasMouseDown);
    };
}

/**
 * Space/hand-tool panning, wheel zoom-to-point and alt-click duplicate.
 * `onUserNavigate` fires whenever the user takes control of the viewport.
 * Returns cleanup.
 */
export function installPanZoomNavigation(
    canvas: fabric.Canvas,
    container: HTMLElement,
    onUserNavigate: () => void
): () => void {
    let isDragging = false;
    let lastPosX = 0;
    let lastPosY = 0;
    let isSpacePressed = false;
    let handModeLocked = false;

    const isTypingTarget = (target: EventTarget | null) => {
        if (!(target instanceof HTMLElement)) return false;
        if (target.isContentEditable) return true;
        const tag = target.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const stopPanning = () => {
        if (!isDragging) return;
        canvas.setViewportTransform(canvas.viewportTransform!);
        isDragging = false;
        canvas.selection = !handModeLocked;
        canvas.defaultCursor = handModeLocked ? 'grab' : 'default';
        canvas.hoverCursor = handModeLocked ? 'grab' : 'move';
        canvas.setCursor(handModeLocked ? 'grab' : 'default');
    };

    const handlePanKeyDown = (event: KeyboardEvent) => {
        if (event.code !== 'Space') return;
        if (isTypingTarget(event.target)) return;
        isSpacePressed = true;
        event.preventDefault();
    };

    const handlePanKeyUp = (event: KeyboardEvent) => {
        if (event.code !== 'Space') return;
        isSpacePressed = false;
        stopPanning();
    };

    const handlePanWindowBlur = () => {
        isSpacePressed = false;
        stopPanning();
    };

    const handModeBridge = canvas as unknown as {
        on: (eventName: string, cb: (payload?: { enabled?: boolean }) => void) => void;
        off: (eventName: string, cb: (payload?: { enabled?: boolean }) => void) => void;
    };

    const handleHandModeSet = (payload?: { enabled?: boolean }) => {
        handModeLocked = Boolean(payload?.enabled);
        canvas.selection = !handModeLocked;
        canvas.defaultCursor = handModeLocked ? 'grab' : 'default';
        canvas.hoverCursor = handModeLocked ? 'grab' : 'move';
        if (!isDragging) {
            canvas.setCursor(handModeLocked ? 'grab' : 'default');
        }
        canvas.requestRenderAll();
    };

    handModeBridge.on('hand:mode:set', handleHandModeSet);

    window.addEventListener('keydown', handlePanKeyDown);
    window.addEventListener('keyup', handlePanKeyUp);
    window.addEventListener('blur', handlePanWindowBlur);

    const handleWheel = (opt: { e: WheelEvent }) => {
        onUserNavigate();

        // Enforce full-size canvas during zoom interaction to prevent clipping drift
        if (container) {
            const rect = container.getBoundingClientRect();
            const w = Math.ceil(rect.width);
            const h = Math.ceil(rect.height);
            if (canvas.width !== w || canvas.height !== h) {
                canvas.setDimensions({ width: w, height: h });
                canvas.calcOffset();
            }
        }

        const delta = opt.e.deltaY;
        let zoom = canvas.getZoom();
        zoom *= 0.999 ** delta;
        if (zoom > 20) zoom = 20;
        if (zoom < 0.05) zoom = 0.05;

        const point = new fabric.Point(opt.e.offsetX, opt.e.offsetY);
        canvas.zoomToPoint(point, zoom);

        opt.e.preventDefault();
        opt.e.stopPropagation();
        canvas.requestRenderAll();
    };

    const handleAltClickDuplicate = (opt: { e?: Event; target?: fabric.Object }) => {
        const evt = opt.e as MouseEvent | undefined;
        if (!evt || evt.button !== 0 || !evt.altKey) return;
        if (isSpacePressed || handModeLocked) return;

        const target = opt.target;
        if (!target || target.selectable === false || target.evented === false) return;

        const activeObjects = canvas.getActiveObjects();
        const sourceObjects = activeObjects.includes(target) ? activeObjects : [target];
        if (sourceObjects.length === 0) return;

        evt.preventDefault();
        evt.stopPropagation();

        void duplicateCanvasObjects(canvas, sourceObjects, { offsetX: 0, offsetY: 0 });
    };

    const handleMouseDown = (opt: { e: Event; target?: fabric.Object }) => {
        const evt = opt.e as MouseEvent;
        // Pan with Space + Left Click on empty canvas so object/pen controls stay usable.
        if ((isSpacePressed || handModeLocked) && evt.button === 0 && !opt.target) {
            onUserNavigate();
            isDragging = true;
            canvas.selection = false;
            lastPosX = evt.clientX;
            lastPosY = evt.clientY;
            canvas.defaultCursor = 'grabbing';
            canvas.setCursor('grabbing');
        }
    };

    const handleMouseMove = (opt: { e: Event }) => {
        const e = opt.e as MouseEvent;
        if (isDragging) {
            const vpt = canvas.viewportTransform!;
            vpt[4] += e.clientX - lastPosX;
            vpt[5] += e.clientY - lastPosY;
            canvas.requestRenderAll();
            lastPosX = e.clientX;
            lastPosY = e.clientY;
        }
    };

    const handleMouseUp = () => {
        if (isDragging) {
            stopPanning();
        }
    };

    canvas.on('mouse:wheel', handleWheel);
    canvas.on('mouse:down:before', handleAltClickDuplicate);
    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    return () => {
        canvas.off('mouse:wheel', handleWheel);
        canvas.off('mouse:down:before', handleAltClickDuplicate);
        canvas.off('mouse:down', handleMouseDown);
        canvas.off('mouse:move', handleMouseMove);
        canvas.off('mouse:up', handleMouseUp);
        window.removeEventListener('keydown', handlePanKeyDown);
        window.removeEventListener('keyup', handlePanKeyUp);
        window.removeEventListener('blur', handlePanWindowBlur);
        handModeBridge.off('hand:mode:set', handleHandModeSet);
    };
}
