'use client';
import { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric'; // Import all to be safe with versioning, or named imports
import { useDialog } from '@/providers/DialogProvider';
import { useToast } from '@/providers/ToastProvider';
import { ensureObjectId } from '@/lib/fabric-utils';
import { ExtendedFabricObject } from '@/types';

type ArtboardInfo = {
    width: number;
    height: number;
    left: number;
    top: number;
};

type ArtboardRectWithBackground = fabric.Rect & {
    canvasBackgroundColor?: string;
    canvasBackgroundEnabled?: boolean;
};

type CanvasWithArtboard = fabric.Canvas & {
    artboard?: ArtboardInfo;
    artboardRect?: ArtboardRectWithBackground;
    centerArtboard?: () => void;
    hostContainer?: HTMLDivElement;
    workspaceBackground?: string;
    setWorkspaceBackground?: (color: string) => void;
    getWorkspaceBackground?: () => string;
};

type WarpCorner = 'TL' | 'TR' | 'BR' | 'BL';
type WarpPoint = { x: number; y: number };

class WarpedImage extends fabric.Image {
    isWarpedText = true;
    warpTL?: WarpPoint;
    warpTR?: WarpPoint;
    warpBR?: WarpPoint;
    warpBL?: WarpPoint;

    override _render(ctx: CanvasRenderingContext2D) {
        const img = this.getElement() as HTMLImageElement;
        if (!img) return;

        const w = this.width || 0;
        const h = this.height || 0;
        if (!w || !h) return;

        const base = {
            tl: { x: -w / 2, y: -h / 2 },
            tr: { x: w / 2, y: -h / 2 },
            br: { x: w / 2, y: h / 2 },
            bl: { x: -w / 2, y: h / 2 }
        };

        const tl = this.warpTL ?? base.tl;
        const tr = this.warpTR ?? base.tr;
        const br = this.warpBR ?? base.br;
        const bl = this.warpBL ?? base.bl;

        const map = (u: number, v: number) => ({
            x: tl.x * (1 - u) * (1 - v) + tr.x * u * (1 - v) + bl.x * (1 - u) * v + br.x * u * v,
            y: tl.y * (1 - u) * (1 - v) + tr.y * u * (1 - v) + bl.y * (1 - u) * v + br.y * u * v
        });

        const getTransform = (src: WarpPoint, src1: WarpPoint, src2: WarpPoint, dst: WarpPoint, dst1: WarpPoint, dst2: WarpPoint) => {
            const x0 = src.x, y0 = src.y;
            const x1 = src1.x, y1 = src1.y;
            const x2 = src2.x, y2 = src2.y;
            const X0 = dst.x, Y0 = dst.y;
            const X1 = dst1.x, Y1 = dst1.y;
            const X2 = dst2.x, Y2 = dst2.y;

            const denom = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
            if (Math.abs(denom) < 1e-6) return null;

            const a = (X0 * (y1 - y2) + X1 * (y2 - y0) + X2 * (y0 - y1)) / denom;
            const c = (X0 * (x2 - x1) + X1 * (x0 - x2) + X2 * (x1 - x0)) / denom;
            const e = (X0 * (x1 * y2 - x2 * y1) + X1 * (x2 * y0 - x0 * y2) + X2 * (x0 * y1 - x1 * y0)) / denom;

            const b = (Y0 * (y1 - y2) + Y1 * (y2 - y0) + Y2 * (y0 - y1)) / denom;
            const d = (Y0 * (x2 - x1) + Y1 * (x0 - x2) + Y2 * (x1 - x0)) / denom;
            const f = (Y0 * (x1 * y2 - x2 * y1) + Y1 * (x2 * y0 - x0 * y2) + Y2 * (x0 * y1 - x1 * y0)) / denom;

            return { a, b, c, d, e, f };
        };

        const cols = 6;
        const rows = 6;
        for (let yi = 0; yi < rows; yi += 1) {
            for (let xi = 0; xi < cols; xi += 1) {
                const u0 = xi / cols;
                const u1 = (xi + 1) / cols;
                const v0 = yi / rows;
                const v1 = (yi + 1) / rows;

                const dst00 = map(u0, v0);
                const dst10 = map(u1, v0);
                const dst01 = map(u0, v1);
                const dst11 = map(u1, v1);

                const src00 = { x: u0 * w, y: v0 * h };
                const src10 = { x: u1 * w, y: v0 * h };
                const src01 = { x: u0 * w, y: v1 * h };
                const src11 = { x: u1 * w, y: v1 * h };

                const t1 = getTransform(src00, src10, src01, dst00, dst10, dst01);
                if (t1) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(dst00.x, dst00.y);
                    ctx.lineTo(dst10.x, dst10.y);
                    ctx.lineTo(dst01.x, dst01.y);
                    ctx.closePath();
                    ctx.clip();
                    ctx.transform(t1.a, t1.b, t1.c, t1.d, t1.e, t1.f);
                    ctx.drawImage(img, 0, 0, w, h);
                    ctx.restore();
                }

                const t2 = getTransform(src11, src01, src10, dst11, dst01, dst10);
                if (t2) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(dst11.x, dst11.y);
                    ctx.lineTo(dst01.x, dst01.y);
                    ctx.lineTo(dst10.x, dst10.y);
                    ctx.closePath();
                    ctx.clip();
                    ctx.transform(t2.a, t2.b, t2.c, t2.d, t2.e, t2.f);
                    ctx.drawImage(img, 0, 0, w, h);
                    ctx.restore();
                }
            }
        }
    }
}

interface DesignCanvasProps {
  onCanvasReady: (canvas: fabric.Canvas) => void;
  onModified?: () => void;
  onRightClick?: (e: MouseEvent) => void;
  initialWidth?: number;
  initialHeight?: number;
}

export default function DesignCanvas({ onCanvasReady, onModified, onRightClick, initialWidth = 1080, initialHeight = 1080 }: DesignCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const centerArtboardRef = useRef<(() => void) | null>(null);
        const onCanvasReadyRef = useRef(onCanvasReady);
        const onModifiedRef = useRef(onModified);
        const onRightClickRef = useRef(onRightClick);
    const workspaceColorRef = useRef('#1E1E1E');
    const dialog = useDialog();
    const { toast } = useToast();
    const dialogRef = useRef(dialog);
    const toastRef = useRef(toast);

  const [selectionDims, setSelectionDims] = useState<{ width: number, height: number } | null>(null);
    const [workspaceColor, setWorkspaceColor] = useState('#1E1E1E');

    useEffect(() => {
        onCanvasReadyRef.current = onCanvasReady;
        onModifiedRef.current = onModified;
        onRightClickRef.current = onRightClick;
    }, [onCanvasReady, onModified, onRightClick]);

    useEffect(() => {
        dialogRef.current = dialog;
        toastRef.current = toast;
    }, [dialog, toast]);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    // Initialize Fabric Canvas
    // Using named import if available, else fallback provided by * as fabric
    const CanvasClass = fabric.Canvas;
    
    const container = containerRef.current;
    
    // Config
    const DESIGN_WIDTH = initialWidth;
    const DESIGN_HEIGHT = initialHeight;

                const canvas = new CanvasClass(canvasRef.current, {
      width: container.clientWidth,
      height: container.clientHeight,
      // We use transparent background for the main canvas, and rely on the "Artboard" rect for the white page.
      // This allows the container's CSS provided gray/pattern to show through in the "workspace" area.
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
      controlsAboveOverlay: true, 
    });
    
    // Initializing filter backend if needed - blocked by readonly fabric namespace in strict mode
    // if ((fabric as unknown as { Canvas2dFilterBackend?: new () => unknown }).Canvas2dFilterBackend) {
    //  // (fabric as unknown as { filterBackend?: unknown; Canvas2dFilterBackend?: new () => unknown }).filterBackend = new (fabric as unknown as { Canvas2dFilterBackend: new () => unknown }).Canvas2dFilterBackend();
    // }
    
    const extendedCanvas = canvas as CanvasWithArtboard;

        const attachTextDistortControls = () => {
            // Disabled: text-to-warp conversion is currently unstable.
            return;
            const renderDistortControl: fabric.Control['render'] = (ctx, left, top, styleOverride, fabricObject) => {
                const size = styleOverride?.cornerSize ?? fabricObject.cornerSize ?? 12;
                ctx.save();
                ctx.fillStyle = '#a78bfa';
                ctx.strokeStyle = '#f5f3ff';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(left, top, size / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            };

            const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

            const getCanvasPointer = (eventData: MouseEvent | TouchEvent | PointerEvent, target: fabric.Object) => {
                const targetCanvas = target.canvas;
                if (!targetCanvas) return { x: 0, y: 0 }; // Fallback
                
                // fabric.Canvas has getPointer but types might be missing in some versions or strict mode
                return (targetCanvas as unknown as { getPointer: (e: MouseEvent | TouchEvent | PointerEvent) => fabric.Point }).getPointer(eventData);
            };

            const createWarpControl = (corner: WarpCorner, x: number, y: number) => new fabric.Control({
                x,
                y,
                cursorStyleHandler: () => 'crosshair',
                render: renderDistortControl,
                actionHandler: (eventData, transform) => {
                    const target = transform.target as WarpedImage;
                    const pointer = getCanvasPointer(eventData, target);
                    const pointerPoint = new fabric.Point(pointer.x, pointer.y);
                    const invert = (fabric.util as unknown as { invertTransform: (m: number[]) => number[] }).invertTransform;
                    const transformPoint = (fabric.util as unknown as { transformPoint: (p: fabric.Point, m: number[]) => fabric.Point }).transformPoint;
                    const inverted = invert(target.calcTransformMatrix());
                    const local = transformPoint(pointerPoint, inverted);
                    const w = (target.width ?? 1) / 2;
                    const h = (target.height ?? 1) / 2;
                    const next = {
                        x: clamp(local.x, -w * 1.5, w * 1.5),
                        y: clamp(local.y, -h * 1.5, h * 1.5)
                    };
                    if (corner === 'TL') target.warpTL = next;
                    if (corner === 'TR') target.warpTR = next;
                    if (corner === 'BR') target.warpBR = next;
                    if (corner === 'BL') target.warpBL = next;
                    target.setCoords();
                    target.canvas?.requestRenderAll();
                    return true;
                }
            });

            const applyControlsToWarped = (obj: WarpedImage) => {
                obj.controls = {
                    ...obj.controls,
                    tl: createWarpControl('TL', -0.5, -0.5),
                    tr: createWarpControl('TR', 0.5, -0.5),
                    bl: createWarpControl('BL', -0.5, 0.5),
                    br: createWarpControl('BR', 0.5, 0.5)
                };
                obj.setCoords();
            };

            const convertTextToWarped = async (obj: fabric.Object) => {
                const targetCanvas = canvas;
                if (!targetCanvas) return null;
                const textObj = obj as fabric.IText;
                const parentGroup = (textObj as unknown as { group?: fabric.Group }).group;
                const center = textObj.getCenterPoint();
                const multiplier = 2;
                const originalTransform = targetCanvas.viewportTransform ? ([...targetCanvas.viewportTransform] as fabric.TMat2D) : undefined;
                let dataUrl = '';
                try {
                    if (originalTransform) {
                        targetCanvas.setViewportTransform([1, 0, 0, 1, 0, 0] as fabric.TMat2D);
                        targetCanvas.requestRenderAll();
                    }
                    dataUrl = textObj.toDataURL({ format: 'png', withoutTransform: true, multiplier });
                } catch (error) {
                    console.error('Warp conversion failed while rasterizing text:', error);
                    return null;
                } finally {
                    if (originalTransform) {
                        targetCanvas.setViewportTransform(originalTransform);
                        targetCanvas.requestRenderAll();
                    }
                }

                const img = await fabric.FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' });
                const element = img.getElement();
                if (!element) return null;

                const isGrouped = Boolean(parentGroup);
                const originX = isGrouped ? (textObj.originX ?? 'left') : 'center';
                const originY = isGrouped ? (textObj.originY ?? 'top') : 'center';
                const left = isGrouped ? (textObj.left ?? 0) : center.x;
                const top = isGrouped ? (textObj.top ?? 0) : center.y;

                const warped = new WarpedImage(element, {
                    left,
                    top,
                    angle: textObj.angle,
                    scaleX: (textObj.scaleX ?? 1) / multiplier,
                    scaleY: (textObj.scaleY ?? 1) / multiplier,
                    originX,
                    originY,
                    opacity: textObj.opacity,
                    shadow: textObj.shadow,
                    objectCaching: false
                });
                warped.warpTL = undefined;
                warped.warpTR = undefined;
                warped.warpBR = undefined;
                warped.warpBL = undefined;
// Ensure ID and Name to prevent Layer Tree issues
                ensureObjectId(warped);
                const extendedWarped = warped as unknown as ExtendedFabricObject;
                if (!extendedWarped.name) extendedWarped.name = `Warped ${textObj.text?.substring(0, 10) || 'Text'}`;

                if (parentGroup) {
                    const group = parentGroup as fabric.Group & { addWithUpdate?: (obj: fabric.Object) => void };
                    if (group.addWithUpdate) {
                        group.addWithUpdate(warped);
                    } else {
                        group.add(warped);
                    }
                    group.setCoords();
                } else {
                    targetCanvas.add(warped);
                }

                textObj.set({
                    visible: false,
                    evented: false,
                    selectable: false,
                    opacity: 0,
                    excludeFromExport: true
                });
                textObj.setCoords();

                applyControlsToWarped(warped);
                if (parentGroup) {
                    targetCanvas.setActiveObject(parentGroup);
                } else {
                    targetCanvas.setActiveObject(warped);
                }
                targetCanvas.requestRenderAll();
                return warped;
            };

            const createConvertControl = (x: number, y: number) => new fabric.Control({
                x,
                y,
                cursorStyleHandler: () => 'crosshair',
                render: renderDistortControl,
                mouseDownHandler: (_eventData, transform) => {
                    const target = transform.target as fabric.Object & { isWarpedText?: boolean };
                    if (target.isWarpedText) return true;
                    if (!['text', 'i-text', 'textbox'].includes(target.type || '')) return true;
                    void (async () => {
                        const ok = await dialogRef.current.confirm('Enable free distort?', {
                            title: 'Convert text to warp',
                            description: 'This converts text to a shape, so it will no longer be editable as text.',
                            confirmText: 'Convert',
                            cancelText: 'Cancel'
                        });
                        if (!ok) {
                            toastRef.current({ title: 'Conversion canceled', description: 'Text remains editable.' });
                            return;
                        }
                        await convertTextToWarped(target);
                        toastRef.current({ title: 'Text converted', description: 'Free distort enabled. Text is no longer editable.' , variant: 'warning' });
                    })();
                    return false;
                }
            });

            const applyControls = (proto?: { controls?: Record<string, fabric.Control> }) => {
                if (!proto?.controls) return;
                const controls = proto.controls; 
                controls.tl = createConvertControl(-0.5, -0.5);
                controls.tr = createConvertControl(0.5, -0.5);
            };

            const applyControlsToObject = (obj?: fabric.Object | null) => {
                if (!obj) return;
                if ((obj as { isWarpedText?: boolean }).isWarpedText) {
                    applyControlsToWarped(obj as WarpedImage);
                    return;
                }
                if (!['text', 'i-text', 'textbox'].includes(obj.type || '')) return;
                
                obj.controls = {
                    ...obj.controls,
                    tl: createConvertControl(-0.5, -0.5),
                    tr: createConvertControl(0.5, -0.5)
                };
                obj.setCoords();
            };

            applyControls(fabric.IText.prototype as unknown as { controls?: Record<string, fabric.Control> });
            applyControls(fabric.Textbox.prototype as unknown as { controls?: Record<string, fabric.Control> });
            applyControls(fabric.Text.prototype as unknown as { controls?: Record<string, fabric.Control> });

            canvas.on('selection:created', (e) => applyControlsToObject(e.selected?.[0] ?? canvas.getActiveObject()));
            canvas.on('selection:updated', (e) => applyControlsToObject(e.selected?.[0] ?? canvas.getActiveObject()));
            canvas.on('object:added', (e) => applyControlsToObject(e.target));
        };

        attachTextDistortControls();

        const isEditableElement = (element: Element | null): boolean => {
            if (!element || !(element instanceof HTMLElement)) return false;
            if (element.isContentEditable) return true;
            const tagName = element.tagName;
            if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
            if (element.getAttribute('role') === 'textbox') return true;
            return Boolean(element.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]'));
        };

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

         // Keyboard event listener for Delete/Backspace
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const hasEditableInPath = (event: KeyboardEvent): boolean => {
                    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
                    return path.some((node) => node instanceof HTMLElement && isEditableElement(node));
                };

                const hasEditableSelectionAnchor = (): boolean => {
                    const selection = window.getSelection();
                    if (!selection || selection.rangeCount === 0) return false;
                    const anchorNode = selection.anchorNode;
                    if (!anchorNode) return false;
                    const anchorElement = anchorNode instanceof Element
                        ? anchorNode
                        : anchorNode.parentElement;
                    return isEditableElement(anchorElement);
                };

                const isCanvasInteractionContext = (): boolean => {
                    const eventTarget = e.target instanceof Element ? e.target : null;
                    if (eventTarget === canvas.upperCanvasEl || eventTarget === canvas.lowerCanvasEl) {
                        return true;
                    }
                    if (eventTarget instanceof HTMLElement && container.contains(eventTarget) && eventTarget.tagName === 'CANVAS') {
                        return true;
                    }
                    const activeElement = document.activeElement instanceof Element ? document.activeElement : null;
                    if (activeElement === canvas.upperCanvasEl || activeElement === canvas.lowerCanvasEl) {
                        return true;
                    }
                    if (activeElement instanceof HTMLElement && container.contains(activeElement) && activeElement.tagName === 'CANVAS') {
                        return true;
                    }
                    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
                    return path.some((node) => node === canvas.upperCanvasEl || node === canvas.lowerCanvasEl);
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

                // Check if we have an active object that is valid to delete
                const activeObjects = canvas.getActiveObjects();
                if (activeObjects && activeObjects.length > 0) {
                     // If it's a text object currently being edited, do NOT delete
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
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        document.addEventListener('focusin', handleFocusIn, true);
        canvas.on('mouse:down', handleCanvasMouseDown);

        // Attach custom property to canvas for other components to know the "Page" dimensions
        extendedCanvas.artboard = { width: DESIGN_WIDTH, height: DESIGN_HEIGHT, left: 0, top: 0 };
        extendedCanvas.hostContainer = container;
        extendedCanvas.workspaceBackground = workspaceColorRef.current;
        extendedCanvas.getWorkspaceBackground = () => workspaceColorRef.current;
        extendedCanvas.setWorkspaceBackground = (color: string) => {
            if (workspaceColorRef.current === color) return;
            workspaceColorRef.current = color;
            setWorkspaceColor(color);
            extendedCanvas.workspaceBackground = color;
            (canvas.fire as (eventName: string, options?: Record<string, unknown>) => fabric.Canvas)(
                'workspace:color',
                { color }
            );
            canvas.requestRenderAll();
        };

    // --- Create Artboard (The White Page) ---
    const artboard = new fabric.Rect({
        left: 0,
        top: 0,
        width: DESIGN_WIDTH,
        height: DESIGN_HEIGHT,
        fill: '#ffffff',
        originX: 'left', // EXPLICITLY set origin to Top-Left to avoid Center-Origin defaults in Fabric v7?
        originY: 'top',
        selectable: false,
        evented: false, // Don't intercept events, let them fall through to canvas/selection
        excludeFromExport: true, // We will handle export by cropping manually usually
        shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 20, offsetX: 0, offsetY: 0, includeDefaultValues: false })
    }) as ArtboardRectWithBackground;
        artboard.canvasBackgroundColor = '#ffffff';
        artboard.canvasBackgroundEnabled = true;
        canvas.add(artboard);
    // In Fabric.js v6+, methods like sendToBack are on the object itself using canvas.moveObjectTo(obj, index) or obj methods
    // Actually, in v6 it is canvas.moveObjectTo(object, index) or canvas.sendObjectToBack(object)
    // Let's check Fabric 6 docs or try standard method.
    // If sendToBack is not on canvas, it might be removed in v6.
    // We can use insertAt(0) when adding? Or canvas.sendObjectToBack(artboard).
    canvas.sendObjectToBack(artboard);
        extendedCanvas.artboardRect = artboard;
        const syncArtboardFromRect = (target?: fabric.Object) => {
            if (!extendedCanvas.artboardRect) return;
            if (target && target !== extendedCanvas.artboardRect) return;
            const rect = extendedCanvas.artboardRect;
            const width = rect.width ?? rect.getScaledWidth?.() ?? DESIGN_WIDTH;
            const height = rect.height ?? rect.getScaledHeight?.() ?? DESIGN_HEIGHT;
            const left = rect.left ?? 0;
            const top = rect.top ?? 0;
            const previous = extendedCanvas.artboard;
            if (previous && previous.width === width && previous.height === height && previous.left === left && previous.top === top) {
                return;
            }
            extendedCanvas.artboard = { width, height, left, top };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (canvas as any).fire('artboard:resize', { width, height, left, top });
        };

    const keepArtboardAtBack = () => {
        if (!extendedCanvas.artboardRect) return;
        canvas.sendObjectToBack(extendedCanvas.artboardRect);
    };
    canvas.on('object:added', keepArtboardAtBack);
    canvas.on('object:modified', keepArtboardAtBack);
    canvas.on('object:removed', keepArtboardAtBack);
    const handleArtboardModified = (evt?: fabric.ModifiedEvent) => {
        syncArtboardFromRect(evt?.target as fabric.Object | undefined);
    };
    canvas.on('object:modified', handleArtboardModified);
    syncArtboardFromRect();

    // Center the view on the artboard (Fit within view)
    const centerArtboard = () => {
            const vW = canvas.width!;
            const vH = canvas.height!;
            const artboard = extendedCanvas.artboard || { width: DESIGN_WIDTH, height: DESIGN_HEIGHT, left: 0, top: 0 };
         
            if (!vW || !vH) return; // Wait for dimensions
         
            // Calculate zoom to fit artboard with some padding (e.g. 50px)
            const padding = 50;
            const availableW = vW - padding * 2;
            const availableH = vH - padding * 2;
         
            // Determine scale to fit
            const scaleX = availableW / artboard.width;
            const scaleY = availableH / artboard.height;
         
            // Fit logic
            let fitScale = Math.min(scaleX, scaleY);
            if (fitScale < 0.001) fitScale = 0.001;
            if (fitScale > 1) fitScale = 1; 
         
            const panX = (vW - artboard.width * fitScale) / 2 - artboard.left * fitScale;
            const panY = (vH - artboard.height * fitScale) / 2 - artboard.top * fitScale;
         
            canvas.setViewportTransform([fitScale, 0, 0, fitScale, panX, panY]);
            canvas.requestRenderAll();
    };
    centerArtboardRef.current = centerArtboard;
        extendedCanvas.centerArtboard = centerArtboard;
    
    // Initial centering (immediate)
    centerArtboard();
    
    // Responsive Resize monitoring
    // We allow auto-centering for a short window (e.g. 1 second) after mount/resize starts
    // to ensure we catch the final layout state after any sidebar animations or flex adjustments.
    // Track if user has manually moved/zoomed the canvas. If false, we keep auto-centering on resize.
    let hasUserInteracted = false;

    const resizeObserver = new ResizeObserver(() => {
        if (!container) return;
        // Use getBoundingClientRect for sub-pixel precision to avoid 1px gaps/clipping
        const rect = container.getBoundingClientRect();
        // Use ceil to ensure we cover the sub-pixel gap. Overflow hidden on container will handle clipping.
        const w = Math.ceil(rect.width);
        const h = Math.ceil(rect.height);
        
        // Skip if size is invalid
        if (w === 0 || h === 0) return;
        
        canvas.setDimensions({ width: w, height: h });
        canvas.calcOffset(); // Recalculate offsets to ensure pointer events map correctly
        
        // Always re-center on resize if the user hasn't taken control yet.
        // This ensures that as the sidebar/window expands, the artboard stays centered.
        if (!hasUserInteracted) {
             centerArtboard();
        }
        
        canvas.requestRenderAll();
    });
    resizeObserver.observe(container);
    
    // --- Navigation (Pan & Zoom) ---
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

    canvas.on('mouse:wheel', (opt) => {
        hasUserInteracted = true; // User took control
        
        // Enforce full-size canvas during zoom interaction to prevent clipping drift
        if (container) {
             const rect = container.getBoundingClientRect();
             const w = Math.ceil(rect.width);
             const h = Math.ceil(rect.height);
             
             // Only update if actually changed to avoid thrashing
             if (canvas.width !== w || canvas.height !== h) {
                canvas.setDimensions({ width: w, height: h });
                canvas.calcOffset();
             }
        }

        const delta = opt.e.deltaY;
        let zoom = canvas.getZoom();
        zoom *= 0.999 ** delta;
        
        // Slightly looser limits
        if (zoom > 20) zoom = 20;
        if (zoom < 0.05) zoom = 0.05; 
        
        // Zoom to point
        const point = new fabric.Point(opt.e.offsetX, opt.e.offsetY);
        canvas.zoomToPoint(point, zoom);
        
        opt.e.preventDefault();
        opt.e.stopPropagation();
        
        // Important: Re-render to show updates immediately
        canvas.requestRenderAll();
    });

    canvas.on('mouse:down', (opt) => {
        const evt = opt.e as MouseEvent;
        // Pan with Space + Left Click on empty canvas so object/pen controls stay usable.
        if ((isSpacePressed || handModeLocked) && evt.button === 0 && !opt.target) {
            hasUserInteracted = true; // User took control
            isDragging = true;
            canvas.selection = false; // Disable selection while panning
            lastPosX = evt.clientX;
            lastPosY = evt.clientY;
            canvas.defaultCursor = 'grabbing';
            canvas.setCursor('grabbing');
        }
    });

    canvas.on('mouse:move', (opt) => {
        const e = opt.e as MouseEvent;
        if (isDragging) {
            const vpt = canvas.viewportTransform!;
            vpt[4] += e.clientX - lastPosX;
            vpt[5] += e.clientY - lastPosY;
            canvas.requestRenderAll();
            lastPosX = e.clientX;
            lastPosY = e.clientY;
        }
    });

    canvas.on('mouse:up', () => {
        if (isDragging) {
            stopPanning();
        }
    });
    
    // Selection & Object Mutation Monitoring
    const updateSelectionDims = () => {
        const active = canvas.getActiveObject();
        if (active) {
            // getScaledWidth returns the visual width (including scale)
            setSelectionDims({ 
                width: Math.round(active.getScaledWidth()), 
                height: Math.round(active.getScaledHeight()) 
            });
        } else {
            setSelectionDims(null);
        }
    };
    
    // Wire up events
    canvas.on('selection:created', updateSelectionDims);
    canvas.on('selection:updated', updateSelectionDims);
    canvas.on('selection:cleared', () => setSelectionDims(null));
    canvas.on('object:scaling', updateSelectionDims);
    canvas.on('object:resizing', updateSelectionDims);

    const enableTextSpellcheck = (event?: { target?: fabric.Object }) => {
        const target = event?.target as (fabric.IText & { hiddenTextarea?: HTMLTextAreaElement; textSpellcheck?: boolean }) | undefined;
        if (!target) return;
        if (!(target.type === 'text' || target.type === 'i-text' || target.type === 'textbox')) return;
        const textarea = target.hiddenTextarea;
        if (textarea) {
            textarea.spellcheck = target.textSpellcheck !== false;
            textarea.autocapitalize = 'sentences';
            textarea.autocomplete = 'off';
            textarea.autocorrect = true;
        }
    };

    canvas.on('text:editing:entered', enableTextSpellcheck);

    // Double Click to Center Artboard on Mouse Position
    canvas.on('mouse:dblclick', (opt) => {
        if (opt.target) return; // Ignore if user clicked an object

        const evt = opt.e as MouseEvent;
        const clickX = evt.offsetX;
        const clickY = evt.offsetY;
        
        const zoom = canvas.getZoom();
        
        // We want the Center of the Artboard (DESIGN_WIDTH/2, DESIGN_HEIGHT/2)
        // to move to the exact Mouse Position (clickX, clickY) where the user clicked.
        
        // Formula: ScreenCoord = (WorldCoord * Zoom) + Pan
        // We solve for Pan:
        // Pan = ScreenCoord - (WorldCoord * Zoom)
        
        const artboard = extendedCanvas.artboard || { width: DESIGN_WIDTH, height: DESIGN_HEIGHT, left: 0, top: 0 };
        const artboardCenterX = artboard.left + artboard.width / 2;
        const artboardCenterY = artboard.top + artboard.height / 2;
        
        const newPanX = clickX - (artboardCenterX * zoom);
        const newPanY = clickY - (artboardCenterY * zoom);

        canvas.setViewportTransform([zoom, 0, 0, zoom, newPanX, newPanY]);
        canvas.requestRenderAll();
        
        console.log('[DesignCanvas] Double-click: Centered Artboard to Mouse UI');
    });

    // Modification Listeners
    const notifyModified = () => {
            if (onModifiedRef.current) onModifiedRef.current();
    };

    canvas.on('object:modified', notifyModified);
    canvas.on('object:added', notifyModified);
    canvas.on('object:removed', notifyModified);
    
    // Right Click Handling (Native Listener to prevent browser menu)
    const upperCanvas = canvas.lowerCanvasEl.parentElement?.querySelector('.upper-canvas');
    const handleContextMenu = (e: Event) => {
         e.preventDefault();
            if (onRightClickRef.current) onRightClickRef.current(e as MouseEvent);
    };
    
    if (upperCanvas) {
        upperCanvas.addEventListener('contextmenu', handleContextMenu);
    }

    fabricRef.current = canvas;
    onCanvasReadyRef.current(canvas);

    return () => {
            extendedCanvas.hostContainer = undefined;
            extendedCanvas.workspaceBackground = undefined;
            extendedCanvas.getWorkspaceBackground = undefined;
            extendedCanvas.setWorkspaceBackground = undefined;
      if (upperCanvas) upperCanvas.removeEventListener('contextmenu', handleContextMenu);
    canvas.off('object:modified', notifyModified);
    canvas.off('object:added', notifyModified);
    canvas.off('object:removed', notifyModified);
    canvas.off('object:added', keepArtboardAtBack);
    canvas.off('object:modified', keepArtboardAtBack);
    canvas.off('object:removed', keepArtboardAtBack);
    canvas.off('object:modified', handleArtboardModified);
            canvas.off('text:editing:entered', enableTextSpellcheck);
      window.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('focusin', handleFocusIn, true);
        canvas.off('mouse:down', handleCanvasMouseDown);
      window.removeEventListener('keydown', handlePanKeyDown);
      window.removeEventListener('keyup', handlePanKeyUp);
      window.removeEventListener('blur', handlePanWindowBlur);
      handModeBridge.off('hand:mode:set', handleHandModeSet);
      canvas.dispose();
      resizeObserver.disconnect();
    };
    }, [initialWidth, initialHeight]);

    useEffect(() => {
        workspaceColorRef.current = workspaceColor;
        const canvas = fabricRef.current as CanvasWithArtboard | null;
        if (canvas) {
            canvas.workspaceBackground = workspaceColor;
        }
    }, [workspaceColor]);

  return (
        <div
            ref={containerRef}
            className="w-full h-full relative overflow-hidden block"
            style={{ backgroundColor: workspaceColor }}
        >
        {/* Workspace Background Pattern using CSS */}
        <div className="absolute inset-0 pointer-events-none opacity-20" 
             style={{ 
                 backgroundImage: 'radial-gradient(#4d4d4d 1px, transparent 1px)', 
                 backgroundSize: '20px 20px' 
             }} 
        />
        <div className="absolute inset-0 z-10 w-full h-full">
            <canvas ref={canvasRef} />
        </div>

        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded pointer-events-none z-20 transition-all">
            {selectionDims ? (
                 <span className="font-mono font-bold text-amber-300">
                    {selectionDims.width}px × {selectionDims.height}px
                 </span>
            ) : (
                <span>Space + Click & Drag to Pan • Scroll to Zoom</span>
            )}
        </div>
    </div>
  );
}
