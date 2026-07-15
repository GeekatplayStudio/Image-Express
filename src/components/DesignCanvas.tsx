'use client';
import { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric'; // Import all to be safe with versioning, or named imports
import { useDialog } from '@/providers/DialogProvider';
import { useToast } from '@/providers/ToastProvider';
import { patchTextRender } from '@/components/canvas/designCanvasWarp';
import { installDeleteHotkeys, installPanZoomNavigation } from '@/components/canvas/designCanvasInteractions';
import { ExtendedFabricObject } from '@/types';

patchTextRender(fabric.IText);
patchTextRender(fabric.Textbox);

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

        // Text free-distort controls are disabled (unstable); see designCanvasWarp.ts for the warp renderer.

        const cleanupDeleteHotkeys = installDeleteHotkeys(canvas, container);

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

    // Any editing interaction also counts: without this, opening/closing a
    // side panel resizes the container and re-centers the view mid-edit,
    // which reads as the canvas "jumping around".
    const markInteractedOnEdit = () => { hasUserInteracted = true; };
    canvas.on('selection:created', markInteractedOnEdit);
    canvas.on('object:modified', markInteractedOnEdit);

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
    
    // Navigation (pan & zoom) — see designCanvasInteractions.ts
    const cleanupPanZoom = installPanZoomNavigation(canvas, container, () => { hasUserInteracted = true; });
    
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

    // --- Group enter/exit (Photoshop-style) ---
    // Double-click a group to "enter" it: children become directly clickable.
    // Selecting anything outside the group leaves it again.
    let enteredGroup: fabric.Group | null = null;

    const isInsideGroup = (obj: fabric.Object | null | undefined, group: fabric.Group): boolean => {
        let parent: fabric.Object | undefined = obj || undefined;
        while (parent) {
            if (parent === group) return true;
            parent = parent.group;
        }
        return false;
    };

    const exitEnteredGroupIfOutside = () => {
        if (!enteredGroup) return;
        const active = canvas.getActiveObject();
        if (active && isInsideGroup(active, enteredGroup)) return;
        enteredGroup.set({ interactive: false });
        enteredGroup.dirty = true;
        enteredGroup = null;
        canvas.requestRenderAll();
    };

    canvas.on('selection:created', exitEnteredGroupIfOutside);
    canvas.on('selection:updated', exitEnteredGroupIfOutside);
    canvas.on('selection:cleared', exitEnteredGroupIfOutside);

    // Groups loaded from saved designs predate subTargetCheck — normalize on add.
    const normalizeGroupTargeting = (event: { target?: fabric.Object }) => {
        const target = event?.target;
        if (!target || target.type !== 'group') return;
        if ((target as ExtendedFabricObject).isAdjustmentLayer) return;
        const group = target as fabric.Group;
        if (!group.subTargetCheck) {
            group.set({ subTargetCheck: true });
        }
    };
    canvas.on('object:added', normalizeGroupTargeting);

    // Double Click: enter groups, otherwise center artboard on mouse position
    canvas.on('mouse:dblclick', (opt) => {
        if (opt.target && opt.target.type === 'group' && !(opt.target as ExtendedFabricObject).isAdjustmentLayer) {
            const group = opt.target as fabric.Group;
            group.set({ subTargetCheck: true, interactive: true });
            enteredGroup = group;

            // When fabric already resolved sub-targets, select the deepest one now;
            // otherwise the next click lands on a child because the group is interactive.
            const subTargets = opt.subTargets || [];
            const deepest = subTargets[subTargets.length - 1];
            if (deepest) {
                canvas.setActiveObject(deepest);
            }
            canvas.requestRenderAll();
            return;
        }

        if (opt.target) return; // Ignore double-clicks on non-group objects

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
    canvas.off('selection:created', markInteractedOnEdit);
    canvas.off('object:modified', markInteractedOnEdit);
            canvas.off('text:editing:entered', enableTextSpellcheck);
      cleanupDeleteHotkeys();
      cleanupPanZoom();
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
