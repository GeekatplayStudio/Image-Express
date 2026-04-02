import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as fabric from 'fabric';
import { useToast } from '@/providers/ToastProvider';
import { ExtendedFabricObject } from '@/types';
import useEscapeKey from '@/hooks/useEscapeKey';
import useSingleFlight from '@/hooks/useSingleFlight';
import StabilityGeneratorContent from './stability-generator/StabilityGeneratorContent';
import {
    addResultImageToCanvas,
    captureCanvasAndMask,
    captureSelectionImage,
    captureSourceImage,
    clearCanvasMask,
} from './stability-generator/stabilityGeneratorCanvas';
import { createStabilityRequestHandlers } from './stability-generator/stabilityGeneratorRequests';
import type { StabilityGeneratorProps, StabilityGeneratorTab } from './stability-generator/types';

const INPAINT_MASK_BRUSH_COLOR = 'rgba(255, 84, 156, 0.38)';

/**
 * StabilityGenerator
 * 
 * A specialized interface for Stability AI's suite of generation tools:
 * - Text to Image (Core/Ultra)
 * - Image to Image (Reimagine)
 * - Inpainting (Masked editing)
 * - Upscaling (Conservative/Creative)
 * - Background Removal
 */
export default function StabilityGenerator({
    isOpen,
    onClose,
    canvas,
    apiKey,
    onJobCreated,
    onAssetSave,
    initialTab = 'generate',
    autoStartInpaintMasking = false,
    showInpaintQuickDock = false,
    providerLabel = 'Stability AI',
}: StabilityGeneratorProps) {
    const { toast } = useToast();
    useEscapeKey(onClose, { enabled: isOpen });
    const runSingleFlight = useSingleFlight();
    // --- UI State ---
    const [activeTab, setActiveTab] = useState<StabilityGeneratorTab>(initialTab);
    const [isProcessing, setIsProcessing] = useState(false);
    
    // --- Generation Parameters ---
    const [prompt, setPrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState('1:1');
    const [strength, setStrength] = useState([0.35]); // Impact strength for Img2Img (0-1). Lower = closer to original.
    
    // --- Image Data State ---
    const [resultImage, setResultImage] = useState<string | null>(null);         // The final output
    const [selectedCanvasImage, setSelectedCanvasImage] = useState<string | null>(null); // Source image from canvas
    const [sourceType, setSourceType] = useState<'selection' | 'canvas'>('selection'); 
    const [flattenSelection, setFlattenSelection] = useState(true); // If true, selection includes all visible layers (crop) 
    
    // --- Inpainting State ---
    const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);         // Generated mask blob URL
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);                       // Canvas ref for drawing mask
    const [isDrawingMask, setIsDrawingMask] = useState(false);
    const [brushSize, setBrushSize] = useState([40]);
    const selectionCaptureTimerRef = useRef<number | null>(null);
    const [isCanvasMasking, setIsCanvasMasking] = useState(false); // Controls main canvas painting mode
    const hasAutoStartedMaskingRef = useRef(false);

    // --- Outpainting State ---
    const [outpaintDirs, setOutpaintDirs] = useState({ left: false, right: false, up: false, down: false });

    useEffect(() => {
        if (!isOpen) {
            hasAutoStartedMaskingRef.current = false;
            return;
        }
        setActiveTab(initialTab);
    }, [isOpen, initialTab]);

    /**
     * Helper: Handle successful generation (Update UI + Auto-save)
     */
    const handleSuccess = (base64Raw: string) => {
        // Construct full Data URI
        const fullUrl = `data:image/png;base64,${base64Raw}`;
        setResultImage(fullUrl);
        
        // Auto-save to 'Generated' assets
        if (onAssetSave) {
            // Slight delay to ensure UI updates first? No need.
            onAssetSave(fullUrl); 
            // Optional: Don't toast here if the save itself toasts, but usually save is silent?
            // ImageGeneratorModal's saveToAssets logs error but doesn't toast success. 
            // We can toast here.
            toast({ title: 'Asset Saved', description: 'Image added to Generated library.', variant: 'success' });
        }
    };

    /**
     * Helper: Extract image data from canvas.
     * Can extract specific object (isolated) OR crop region (all layers).
     */
    const captureSelectionImageCallback = useCallback(() => captureSelectionImage(canvas, flattenSelection), [canvas, flattenSelection]);

    const captureSourceImageCallback = useCallback(
        () => captureSourceImage(canvas, sourceType, captureSelectionImageCallback),
        [canvas, sourceType, captureSelectionImageCallback]
    );

    /**
     * Effect: Monitor Canvas Selection
     * Automatically updates `selectedCanvasImage` when user selects an image on the board.
     */
    const scheduleSelectionCapture = useCallback(() => {
        if (!canvas) return;
        if (selectionCaptureTimerRef.current) {
            window.clearTimeout(selectionCaptureTimerRef.current);
        }
        selectionCaptureTimerRef.current = window.setTimeout(() => {
            const img = captureSelectionImageCallback();
            setSelectedCanvasImage(img);
        }, 150);
    }, [captureSelectionImageCallback, canvas]);

    useEffect(() => {
        if (!canvas) return;

        const handleSelection = () => {
            const active = canvas.getActiveObject();
            if (active) {
                 if (sourceType === 'selection') setSourceType('selection'); 
                 scheduleSelectionCapture();
            } else {
                 if (selectionCaptureTimerRef.current) {
                     window.clearTimeout(selectionCaptureTimerRef.current);
                     selectionCaptureTimerRef.current = null;
                 }
                 setSelectedCanvasImage(null);
            }
        };

        canvas.on('selection:created', handleSelection);
        canvas.on('selection:updated', handleSelection);
        canvas.on('selection:cleared', handleSelection);
        handleSelection();

        return () => {
             canvas.off('selection:created', handleSelection);
             canvas.off('selection:updated', handleSelection);
             canvas.off('selection:cleared', handleSelection);
             if (selectionCaptureTimerRef.current) {
                 window.clearTimeout(selectionCaptureTimerRef.current);
                 selectionCaptureTimerRef.current = null;
             }
        };
    }, [canvas, scheduleSelectionCapture, sourceType, flattenSelection]); // Re-run if flatten mode changes

    // Update preview when flatten mode changes
    useEffect(() => {
        if (sourceType === 'selection' && canvas?.getActiveObject()) {
            scheduleSelectionCapture();
        }
    }, [flattenSelection, scheduleSelectionCapture, sourceType, canvas]);

    // Selection-driven tabs must restore normal object picking, even if the user
    // entered AI from a brush-like tool or previously enabled inpaint masking.
    useEffect(() => {
        if (!canvas || !isOpen) return;

        const needsSelectionMode = activeTab === 'img2img'
            || activeTab === 'outpaint'
            || activeTab === 'upscale'
            || activeTab === 'removebox'
            || (activeTab === 'inpaint' && !isCanvasMasking);

        if (!needsSelectionMode) return;

        if (isCanvasMasking && activeTab !== 'inpaint') {
            setIsCanvasMasking(false);
        }

        canvas.isDrawingMode = false;
        canvas.selection = true;
        canvas.defaultCursor = 'default';
        canvas.hoverCursor = 'move';
        canvas.requestRenderAll();
    }, [activeTab, canvas, isCanvasMasking, isOpen]);

    // Cleanup masking on unmount.
    useEffect(() => {
        return () => {
            if (canvas) {
                canvas.isDrawingMode = false;
            }
        };
    }, [canvas]);

    /**
     * Toggles the main canvas into "Mask Painting" mode.
     */
    const toggleCanvasMasking = useCallback(() => {
        if (!canvas) return;
        
        if (isCanvasMasking) {
            // Stop Masking
            canvas.isDrawingMode = false;
            setIsCanvasMasking(false);
        } else {
            // Start Masking
            // Deselect active object to prevent accidentally editing it, but keep it in view
            canvas.discardActiveObject();
            canvas.requestRenderAll();

            canvas.isDrawingMode = true;
            const brush = new fabric.PencilBrush(canvas);
            brush.color = INPAINT_MASK_BRUSH_COLOR;
            brush.width = brushSize[0];
            canvas.freeDrawingBrush = brush;
            setIsCanvasMasking(true);

            // Tag new paths as masks
            // We rely on the global listener in useEffect to tag paths
        }
    }, [brushSize, canvas, isCanvasMasking]);

    useEffect(() => {
        if (!isOpen) return;
        if (!autoStartInpaintMasking) return;
        if (activeTab !== 'inpaint') return;
        if (!canvas) return;
        if (isCanvasMasking) return;
        if (hasAutoStartedMaskingRef.current) return;
        hasAutoStartedMaskingRef.current = true;
        toggleCanvasMasking();
    }, [activeTab, autoStartInpaintMasking, canvas, isCanvasMasking, isOpen, toggleCanvasMasking]);

    // Listener for path creation to tag masks
    useEffect(() => {
        if (!canvas || !isCanvasMasking) return;
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handlePathCreated = (e: any) => {
             const path = e.path;
             if (path) {
                 path.set({ isMask: true, excludeFromExport: true, selectable: false });
             }
        };
        
        canvas.on('path:created', handlePathCreated);
        
        // Sync brush size changes live
        if (canvas.freeDrawingBrush) {
            canvas.freeDrawingBrush.width = brushSize[0];
        }

        return () => {
            canvas.off('path:created', handlePathCreated);
        };
    }, [canvas, isCanvasMasking, brushSize]);


    /**
     * Clears all mask paths from the canvas.
     */
    const clearCanvasMaskHandler = useCallback(() => clearCanvasMask(canvas), [canvas]);

    const captureCanvasAndMaskCallback = useCallback(
        () => captureCanvasAndMask(canvas, INPAINT_MASK_BRUSH_COLOR),
        [canvas]
    );

    const {
        handleGenerate,
        handleRemoveBg,
        handleUpscale,
        handleImg2Img,
        handleOutpaint,
        handleInpaint,
    } = createStabilityRequestHandlers({
        apiKey,
        prompt,
        aspectRatio,
        strength,
        selectedCanvasImage,
        sourceType,
        flattenSelection,
        maskDataUrl,
        outpaintDirs,
        isCanvasMasking,
        canvas,
        runSingleFlight,
        toast,
        onJobCreated,
        onClose,
        setIsProcessing,
        setResultImage,
        handleSuccess,
        captureSourceImage: captureSourceImageCallback,
        captureCanvasAndMask: captureCanvasAndMaskCallback,
        toggleCanvasMasking,
    });


    // --- Helper to add to Canvas ---
    const addToCanvas = useCallback(() => {
        void addResultImageToCanvas(canvas, resultImage);
    }, [canvas, resultImage]);

    const handleTabChange = (nextTab: string) => {
        setActiveTab(nextTab as StabilityGeneratorTab);
    };

    // --- Mask Painting Logic ---
    
    /**
     * Initialize the Inpaint Canvas whenever a new image is selected.
     * It mimics the dimensions of the selected image and resets the mask.
     */
    useEffect(() => {
        if (activeTab === 'inpaint' && selectedCanvasImage && maskCanvasRef.current) {
            const ctx = maskCanvasRef.current.getContext('2d');
            if (!ctx) return;
            
            const img = new window.Image();
            img.src = selectedCanvasImage;
            img.onload = () => {
                // Set canvas match the display ratio (width fixed to 300px for CSS layout reasons usually)
                // But generally we want high res. For now, we match logical pixel size.
                // NOTE: Here we hardcode width to 300 to match the UI container, but a real app should be responsive.
                maskCanvasRef.current!.width = img.width; 
                maskCanvasRef.current!.height = img.height;
                
                // Draw the underlying image for reference (although we usually only need the mask on this canvas)
                // Actually, this canvas overlays the <img> tag in the UI so we really only need to draw the mask.
                // But for "erasing" metaphors keeping the image in sync is helpful.
                ctx.drawImage(img, 0, 0, maskCanvasRef.current!.width, maskCanvasRef.current!.height);
                
                // Add a semi-transparent dark layer to signify "unmanipulated" areas if we were doing "reveal" logic
                // For standard inpainting: We usually show original image, and user paints WHITE over areas to change.
                ctx.clearRect(0,0, maskCanvasRef.current!.width, maskCanvasRef.current!.height);
                // We start with transparent (no mask).
            };
        }
    }, [activeTab, selectedCanvasImage]);

    /**
     * Handles drawing on the mask canvas.
     * Currently creates a simple white stroke which Stability AI interprets as "regenerate this area".
     */
    const drawMask = (e: React.MouseEvent) => {
        if (!isDrawingMask || !maskCanvasRef.current) return;
        const rect = maskCanvasRef.current.getBoundingClientRect();
        const scaleX = maskCanvasRef.current.width / rect.width;
        const scaleY = maskCanvasRef.current.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        const ctx = maskCanvasRef.current.getContext('2d');
        if (!ctx) return;
        
        // We draw with composite 'source-over' to add to the mask.
        // White color = The Mask.
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; // Slightly transparent for user feedback, but backend needs solid mask
        ctx.beginPath();
        ctx.arc(x, y, (brushSize[0] / 2) * Math.max(scaleX, scaleY), 0, Math.PI * 2);
        ctx.fill();
        
        // Note: When sending to API, we might need to process this canvas to be purely Black/White
    };
    
    if (!isOpen) return null;

    return (
        <StabilityGeneratorContent
            activeTab={activeTab}
            isProcessing={isProcessing}
            prompt={prompt}
            aspectRatio={aspectRatio}
            strength={strength}
            resultImage={resultImage}
            selectedCanvasImage={selectedCanvasImage}
            sourceType={sourceType}
            flattenSelection={flattenSelection}
            isDrawingMask={isDrawingMask}
            maskCanvasRef={maskCanvasRef}
            brushSize={brushSize}
            isCanvasMasking={isCanvasMasking}
            outpaintDirs={outpaintDirs}
            showInpaintQuickDock={showInpaintQuickDock}
            providerLabel={providerLabel}
            onTabChange={handleTabChange}
            onPromptChange={setPrompt}
            onAspectRatioChange={setAspectRatio}
            onStrengthChange={setStrength}
            onSourceTypeChange={setSourceType}
            onFlattenSelectionChange={setFlattenSelection}
            onSetIsDrawingMask={setIsDrawingMask}
            onPersistMaskDataUrl={() => {
                if (maskCanvasRef.current) {
                    setMaskDataUrl(maskCanvasRef.current.toDataURL());
                }
            }}
            onDrawMask={drawMask}
            onBrushSizeChange={setBrushSize}
            onToggleCanvasMasking={toggleCanvasMasking}
            onClearCanvasMask={clearCanvasMaskHandler}
            onOutpaintDirectionToggle={(direction) => {
                setOutpaintDirs((previous) => ({ ...previous, [direction]: !previous[direction] }));
            }}
            onGenerate={handleGenerate}
            onImg2Img={handleImg2Img}
            onOutpaint={handleOutpaint}
            onInpaint={handleInpaint}
            onUpscale={handleUpscale}
            onRemoveBg={handleRemoveBg}
            onAddToCanvas={addToCanvas}
        />
    );
}

// End of StabilityGenerator.tsx
