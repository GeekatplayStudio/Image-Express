'use client';
import { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric'; // Import all to be safe with versioning, or named imports

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

  const [selectionDims, setSelectionDims] = useState<{ width: number, height: number } | null>(null);

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
    
    // Attach custom property to canvas for other components to know the "Page" dimensions
    (canvas as fabric.Canvas & { artboard: { width: number; height: number; left: number; top: number } }).artboard = { width: DESIGN_WIDTH, height: DESIGN_HEIGHT, left: 0, top: 0 };

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

    // Center the view on the artboard (Fit within view)
    const centerArtboard = () => {
         const vW = canvas.width!;
         const vH = canvas.height!;
         
         if (!vW || !vH) return; // Wait for dimensions
         
         // Calculate zoom to fit artboard with some padding (e.g. 50px)
         const padding = 50;
         const availableW = vW - padding * 2;
         const availableH = vH - padding * 2;
         
         // Determine scale to fit
         const scaleX = availableW / DESIGN_WIDTH;
         const scaleY = availableH / DESIGN_HEIGHT;
         
         // Fit logic
         let fitScale = Math.min(scaleX, scaleY);
         if (fitScale < 0.001) fitScale = 0.001;
         if (fitScale > 1) fitScale = 1; 
         
         const panX = (vW - DESIGN_WIDTH * fitScale) / 2;
         const panY = (vH - DESIGN_HEIGHT * fitScale) / 2;
         
         canvas.setViewportTransform([fitScale, 0, 0, fitScale, panX, panY]);
         canvas.requestRenderAll();
    };
    centerArtboardRef.current = centerArtboard;
    
    // Initial centering (immediate)
    centerArtboard();
    
    // Responsive Resize monitoring
    // We allow auto-centering for a short window (e.g. 1 second) after mount/resize starts
    // to ensure we catch the final layout state after any sidebar animations or flex adjustments.
    const mountTime = Date.now();
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
        
        const artboardCenterX = DESIGN_WIDTH / 2;
        const artboardCenterY = DESIGN_HEIGHT / 2;
        
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
      if (upperCanvas) upperCanvas.removeEventListener('contextmenu', handleContextMenu);
      canvas.off('object:modified', notifyModified);
      canvas.off('object:added', notifyModified);
      canvas.off('object:removed', notifyModified);
      canvas.dispose();
      resizeObserver.disconnect();
    };
  }, [onRightClick, onCanvasReady, onModified, initialWidth, initialHeight]);

  return (
    <div ref={containerRef} className="w-full h-full bg-[#1E1E1E] relative overflow-hidden block">
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
