'use client';
import { useEffect, useRef } from 'react';
import * as fabric from 'fabric'; // Import all to be safe with versioning, or named imports

interface DesignCanvasProps {
  onCanvasReady: (canvas: fabric.Canvas) => void;
  onModified?: () => void;
  onRightClick?: (e: MouseEvent) => void;
}

export default function DesignCanvas({ onCanvasReady, onModified, onRightClick }: DesignCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    // Initialize Fabric Canvas
    // Using named import if available, else fallback provided by * as fabric
    const CanvasClass = fabric.Canvas;
    
    const container = containerRef.current;
    
    // Config
    const DESIGN_WIDTH = 1080;
    const DESIGN_HEIGHT = 1080;

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
    // @ts-ignore
    canvas.artboard = { width: DESIGN_WIDTH, height: DESIGN_HEIGHT, left: 0, top: 0 };

    // --- Create Artboard (The White Page) ---
    const artboard = new fabric.Rect({
        left: 0,
        top: 0,
        width: DESIGN_WIDTH,
        height: DESIGN_HEIGHT,
        fill: '#ffffff',
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

    // Center the view on the artboard
    const centerArtboard = () => {
         const vW = canvas.width!;
         const vH = canvas.height!;
         const panX = (vW - DESIGN_WIDTH) / 2;
         const panY = (vH - DESIGN_HEIGHT) / 2;
         canvas.setViewportTransform([1, 0, 0, 1, panX, panY]); // Zoom 1
    };
    
    // Initial centering
    centerArtboard();
    
    // Responsive Resize
    let isFirstResize = true;
    const resizeObserver = new ResizeObserver(() => {
        if (!container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        
        canvas.setDimensions({ width: w, height: h });
        
        // Only center on the very first resize detection to avoid jarring resets
        // Note: Fabric canvas init might happen before this observer fires depending on React timing
        if (isFirstResize) {
             centerArtboard();
             isFirstResize = false;
        }
        
        canvas.requestRenderAll();
    });
    resizeObserver.observe(container);
    
    // --- Navigation (Pan & Zoom) ---
    let isDragging = false;
    let lastPosX = 0;
    let lastPosY = 0;

    canvas.on('mouse:wheel', (opt) => {
        // Enforce full-size canvas during zoom interaction to prevent clipping drift
        if (container) {
             const vw = container.clientWidth;
             const vh = container.clientHeight;
             if (canvas.width !== vw || canvas.height !== vh) {
                 canvas.setDimensions({ width: vw, height: vh });
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
            isDragging = true;
            canvas.selection = false; // Disable selection while panning
            lastPosX = evt.clientX;
            lastPosY = evt.clientY;
            canvas.defaultCursor = 'grabbing';
            canvas.setCursor('grabbing');
        }
    });

    canvas.on('mouse:move', (opt) => {
        if (isDragging) {
            const e = opt.e as MouseEvent;
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
  }, [onRightClick]); // Add onRightClick dependence to ensure latest handler is used

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
        
        {/* Helper Note */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded pointer-events-none z-20">
            Alt + Click & Drag to Pan • Scroll to Zoom
        </div>
    </div>
  );
}
