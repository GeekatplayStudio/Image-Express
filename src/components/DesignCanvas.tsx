'use client';
import { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric'; // Import all to be safe with versioning, or named imports
import { useDialog } from '@/providers/DialogProvider';
import { useToast } from '@/providers/ToastProvider';

type ArtboardInfo = {
    width: number;
    height: number;
    left: number;
    top: number;
};

type CanvasWithArtboard = fabric.Canvas & {
    artboard?: ArtboardInfo;
    artboardRect?: fabric.Rect;
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
        const img = (this as unknown as { _element?: HTMLImageElement })._element;
        if (!img) return;

        const w = this.width ?? 0;
        const h = this.height ?? 0;
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
                    ctx.transform(t1.a, t1.b, t1.c, t1.d, t1.e - w / 2, t1.f - h / 2);
                    ctx.drawImage(img, 0, 0);
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
                    ctx.transform(t2.a, t2.b, t2.c, t2.d, t2.e - w / 2, t2.f - h / 2);
                    ctx.drawImage(img, 0, 0);
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
    const workspaceColorRef = useRef('#1E1E1E');
    const dialog = useDialog();
    const { toast } = useToast();
    const dialogRef = useRef(dialog);
    const toastRef = useRef(toast);

  const [selectionDims, setSelectionDims] = useState<{ width: number, height: number } | null>(null);
    const [workspaceColor, setWorkspaceColor] = useState('#1E1E1E');

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
        const extendedCanvas = canvas as CanvasWithArtboard;

        const attachTextDistortControls = () => {
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

            const getCanvasPointer = (eventData: any, target: fabric.Object, transform: fabric.Transform) => {
                const targetCanvas = (transform as unknown as { canvas?: fabric.Canvas }).canvas ?? target.canvas;
                if (!targetCanvas) return { x: eventData.clientX, y: eventData.clientY };
                const getPointer = (targetCanvas as unknown as { getPointer?: (e: any) => { x: number; y: number } }).getPointer;
                return typeof getPointer === 'function'
                    ? getPointer.call(targetCanvas, eventData)
                    : (fabric.util as unknown as { getPointer?: (e: any, el?: HTMLCanvasElement) => { x: number; y: number } })
                        .getPointer?.(eventData, (targetCanvas as unknown as { upperCanvasEl?: HTMLCanvasElement }).upperCanvasEl)
                        ?? { x: eventData.clientX, y: eventData.clientY };
            };

            const createWarpControl = (corner: WarpCorner, x: number, y: number) => new fabric.Control({
                x,
                y,
                cursorStyleHandler: () => 'crosshair',
                render: renderDistortControl,
                actionHandler: (eventData, transform) => {
                    const target = transform.target as WarpedImage;
                    const pointer = getCanvasPointer(eventData, target, transform);
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
                } as any;
                obj.setCoords();
            };

            const convertTextToWarped = async (obj: fabric.Object) => {
                const targetCanvas = canvas;
                if (!targetCanvas) return null;
                const textObj = obj as fabric.IText;
                const center = textObj.getCenterPoint();
                const multiplier = 2;
                const dataUrl = textObj.toDataURL({ format: 'png', withoutTransform: true, multiplier });
                const img = await fabric.FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' });
                const element = (img as unknown as { _element?: HTMLImageElement; _originalElement?: HTMLImageElement; getElement?: () => HTMLImageElement })._element
                    || (img as unknown as { _originalElement?: HTMLImageElement })._originalElement
                    || (img as unknown as { getElement?: () => HTMLImageElement }).getElement?.();
                if (!element) return null;

                const warped = new WarpedImage(element, {
                    left: center.x,
                    top: center.y,
                    angle: textObj.angle,
                    scaleX: (textObj.scaleX ?? 1) / multiplier,
                    scaleY: (textObj.scaleY ?? 1) / multiplier,
                    originX: 'center',
                    originY: 'center',
                    opacity: textObj.opacity,
                    shadow: textObj.shadow,
                    objectCaching: false
                } as any);
                warped.warpTL = undefined;
                warped.warpTR = undefined;
                warped.warpBR = undefined;
                warped.warpBL = undefined;

                targetCanvas.remove(textObj);
                targetCanvas.add(warped);
                applyControlsToWarped(warped);
                targetCanvas.setActiveObject(warped);
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

            const applyControls = (proto?: { controls?: any }) => {
                if (!proto?.controls) return;
                proto.controls = {
                    ...proto.controls,
                    tl: createConvertControl(-0.5, -0.5),
                    tr: createConvertControl(0.5, -0.5)
                } as any;
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
                } as any;
                obj.setCoords();
            };

            applyControls((fabric.IText as unknown as { prototype?: { controls?: any } })?.prototype);
            applyControls((fabric.Textbox as unknown as { prototype?: { controls?: any } })?.prototype);
            applyControls((fabric.Text as unknown as { prototype?: { controls?: any } })?.prototype);

            canvas.on('selection:created', (e) => applyControlsToObject(e.selected?.[0] ?? canvas.getActiveObject()));
            canvas.on('selection:updated', (e) => applyControlsToObject(e.selected?.[0] ?? canvas.getActiveObject()));
            canvas.on('object:added', (e) => applyControlsToObject(e.target));
        };

        attachTextDistortControls();

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
    });
        canvas.add(artboard);
    // In Fabric.js v6+, methods like sendToBack are on the object itself using canvas.moveObjectTo(obj, index) or obj methods
    // Actually, in v6 it is canvas.moveObjectTo(object, index) or canvas.sendObjectToBack(object)
    // Let's check Fabric 6 docs or try standard method.
    // If sendToBack is not on canvas, it might be removed in v6.
    // We can use insertAt(0) when adding? Or canvas.sendObjectToBack(artboard).
    canvas.sendObjectToBack(artboard);
        extendedCanvas.artboardRect = artboard;

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
        // Pan with Alt + Left Click
        if (evt.altKey && evt.button === 0) {
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
            canvas.setViewportTransform(canvas.viewportTransform!); // commit
            isDragging = false;
            canvas.selection = true; // Re-enable selection
            canvas.defaultCursor = 'default';
            canvas.setCursor('default');
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
         if (onModified) onModified();
    };

    canvas.on('object:modified', notifyModified);
    canvas.on('object:added', notifyModified);
    canvas.on('object:removed', notifyModified);
    
    // Right Click Handling (Native Listener to prevent browser menu)
    const upperCanvas = canvas.lowerCanvasEl.parentElement?.querySelector('.upper-canvas');
    const handleContextMenu = (e: Event) => {
         e.preventDefault();
         if (onRightClick) onRightClick(e as MouseEvent);
    };
    
    if (upperCanvas) {
        upperCanvas.addEventListener('contextmenu', handleContextMenu);
    }

    fabricRef.current = canvas;
    onCanvasReady(canvas);

    return () => {
            extendedCanvas.hostContainer = undefined;
            extendedCanvas.workspaceBackground = undefined;
            extendedCanvas.getWorkspaceBackground = undefined;
            extendedCanvas.setWorkspaceBackground = undefined;
      if (upperCanvas) upperCanvas.removeEventListener('contextmenu', handleContextMenu);
      canvas.off('object:modified', notifyModified);
      canvas.off('object:added', notifyModified);
      canvas.off('object:removed', notifyModified);
      canvas.dispose();
      resizeObserver.disconnect();
    };
    }, [onRightClick, onCanvasReady, onModified, initialWidth, initialHeight, dialog, toast]);

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
                <span>Alt + Click & Drag to Pan • Scroll to Zoom</span>
            )}
        </div>
    </div>
  );
}
