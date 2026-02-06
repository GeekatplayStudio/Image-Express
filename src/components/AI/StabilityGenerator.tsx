import React, { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Wand2, Loader2, Image as ImageIcon, Eraser, Move, Layers, Maximize, Check, Sparkles, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Scan } from 'lucide-react';
import * as fabric from 'fabric';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Slider } from '../ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { useToast } from '@/providers/ToastProvider';
import { BackgroundJob } from '@/types';

/**
 * Props for the Stability Generator Component
 */
interface StabilityGeneratorProps {
    /** Whether the generator modal is open */
    isOpen: boolean;
    /** Callback to close the generator */
    onClose: () => void;
    /** Reference to the main Fabric.js canvas for context */
    canvas: fabric.Canvas | null;
    /** Stability AI API Key */
    apiKey: string | undefined;
    /** Callback when a long-running job (like video/upscale) is started */
    onJobCreated?: (job: BackgroundJob) => void;
    /** Whether this is running inside another modal (simplified view) */
    embedded?: boolean;
    /** Callback to save the generated result to the backend asset library */
    onAssetSave?: (url: string) => void;
}

type CanvasWithArtboard = fabric.Canvas & {
    artboard?: { width: number; height: number; left?: number; top?: number };
    artboardRect?: fabric.Rect;
};

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
export default function StabilityGenerator({ isOpen, onClose, canvas, apiKey, onJobCreated, onAssetSave }: StabilityGeneratorProps) {
    const { toast } = useToast();
    // --- UI State ---
    const [activeTab, setActiveTab] = useState('generate');
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
    const [brushSize, setBrushSize] = useState([20]);
    const selectionCaptureTimerRef = useRef<number | null>(null);

    // --- Outpainting State ---
    const [outpaintDirs, setOutpaintDirs] = useState({ left: false, right: false, up: false, down: false });

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
    const captureSelectionImage = useCallback(() => {
        if (!canvas) return null;

        const active = canvas.getActiveObject();
        if (!active) return null;

        // Option A: Flattened (All layers visible in selection box)
        if (flattenSelection) {
            const originalVpt = canvas.viewportTransform;
            const rect = active.getBoundingRect();
            
            canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
            canvas.requestRenderAll();

            try {
                return canvas.toDataURL({
                    format: 'png',
                    multiplier: 1,
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height
                });
            } finally {
                if (originalVpt) {
                    canvas.setViewportTransform(originalVpt);
                    canvas.requestRenderAll();
                }
            }
        }

        // Option B: Isolated (Just the selected object)
        return active.toDataURL({
            format: 'png',
            multiplier: 1
        });
    }, [canvas, flattenSelection]);

    const captureSourceImage = useCallback(() => {
        if (!canvas) return null;

        const active = canvas.getActiveObject();

        // 1. Full Canvas Mode
        if (sourceType === 'canvas') {
            const extCanvas = canvas as CanvasWithArtboard;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let cropOptions: any = { format: 'png', multiplier: 1 };
             
             if (extCanvas.artboard) {
                 cropOptions = { ...cropOptions, ...extCanvas.artboard };
             } else if (extCanvas.artboardRect) {
                 const rect = extCanvas.artboardRect;
                 cropOptions = {
                     ...cropOptions,
                     left: rect.left ?? 0,
                     top: rect.top ?? 0,
                     width: (rect.width ?? 0) * (rect.scaleX ?? 1),
                     height: (rect.height ?? 0) * (rect.scaleY ?? 1)
                 };
             }

             const originalVpt = canvas.viewportTransform;
             canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
             canvas.requestRenderAll();
             
             try {
                return canvas.toDataURL(cropOptions);
             } finally {
                if (originalVpt) {
                    canvas.setViewportTransform(originalVpt);
                    canvas.requestRenderAll();
                }
             }
        }
        
        // 2. Selection Mode
        if (active) {
            return captureSelectionImage();
        }
        
        return null;
    }, [canvas, sourceType, captureSelectionImage]);

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
            const img = captureSelectionImage();
            setSelectedCanvasImage(img);
        }, 150);
    }, [captureSelectionImage, canvas]);

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

    // --- API Handlers ---

    /**
     * Generates an image from text prompt.
     * Uses Stability Core API.
     */
    const handleGenerate = async () => {
        if (!apiKey) {
            toast({ title: 'Missing API key', description: 'Please set Stability API Key in settings.', variant: 'warning' });
            return;
        }
        if (!prompt || prompt.trim() === '') {
            toast({ title: 'Missing Prompt', description: 'Please describe the image you want to generate.', variant: 'warning' });
            return;
        }

        setIsProcessing(true);
        setResultImage(null);

        try {
            const formData = new FormData();
            formData.append('prompt', prompt);
            formData.append('aspect_ratio', aspectRatio);
            formData.append('output_format', 'png');
            
            console.log('[Stability] Generating Image:', { prompt, aspectRatio });

            const res = await fetch('/api/ai/stability/generate', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: formData
            });
            
            const data = await res.json();
            if (data.success) {
                handleSuccess(data.image);
            } else {
                toast({ title: 'Generation failed', description: data.message || 'Error generating image.', variant: 'destructive' });
            }

        } catch (e) {
            console.error(e);
            toast({ title: 'Generation failed', description: 'Something went wrong.', variant: 'destructive' });
        } finally {
            setIsProcessing(false);
        }
    };

    /**
     * Removes the background from the selected canvas image.
     */
    const handleRemoveBg = async () => {
        if (!apiKey) {
            toast({ title: 'Missing API key', description: 'Please set Stability API Key.', variant: 'warning' });
            return;
        }
        if (!selectedCanvasImage) {
            toast({ title: 'No image selected', description: 'Select an image on canvas first.', variant: 'warning' });
            return;
        }
        
        setIsProcessing(true);
        try {
            // Fetch blob from selected image URL to send as file
            const blobInfo = await fetch(selectedCanvasImage).then(r => r.blob());
            
            const formData = new FormData();
            formData.append('image', blobInfo);
            formData.append('output_format', 'png');

            const res = await fetch('/api/ai/stability/remove-bg', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: formData
            });

            const data = await res.json();
            if (data.success) {
                handleSuccess(data.image);
            } else {
                toast({ title: 'Remove BG failed', description: data.message || 'Error removing background.', variant: 'destructive' });
            }
        } catch (e) {
            console.error(e);
            toast({ title: 'Remove BG failed', description: 'Something went wrong.', variant: 'destructive' });
        } finally {
            setIsProcessing(false);
        }
    };

    /**
     * Upscales the selected image.
     * @param type 'conservative' (details) or 'creative' (hallucinate details)
     */
    const handleUpscale = async (type: 'conservative' | 'creative') => {
        if (!apiKey) {
            toast({ title: 'Missing API key', description: 'Please set Stability API Key.', variant: 'warning' });
            return;
        }
        if (!selectedCanvasImage) {
            toast({ title: 'No image selected', description: 'Select an image on canvas first.', variant: 'warning' });
            return;
        }

        setIsProcessing(true);
        try {
            const blobInfo = await fetch(selectedCanvasImage).then(r => r.blob());
            const formData = new FormData();
            formData.append('image', blobInfo);
            formData.append('prompt', prompt); // Only used for creative upscale
            formData.append('output_format', 'png');

            console.log(`[Stability] Sending Upscale (${type}):`, { prompt, blobSize: blobInfo.size });

            const res = await fetch(`/api/ai/stability/upscale?type=${type}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: formData
            });

            const data = await res.json();
            if (data.success) {
                if (data.status === 'IN_PROGRESS') {
                    // Hand off to job queue manager
                    onJobCreated?.({
                        id: data.id,
                        type: 'stability-upscale',
                        status: 'IN_PROGRESS',
                        createdAt: Date.now(),
                        apiKey: apiKey,
                        provider: 'stability'
                    });
                    toast({ title: 'Upscale started', description: 'Creative upscale running in background.', variant: 'success' });
                    onClose(); 
                } else {
                    handleSuccess(data.image);
                }
            } else {
                toast({ title: 'Upscale failed', description: data.message || 'Error starting upscale.', variant: 'destructive' });
            }
        } catch (e) {
            console.error(e);
            toast({ title: 'Upscale failed', description: 'Something went wrong.', variant: 'destructive' });
        } finally {
            setIsProcessing(false);
        }
    };

    /**
     * Performs Image-to-Image generation based on canvas selection + prompt.
     */
    const handleImg2Img = async () => {
         if (!apiKey) {
             toast({ title: 'Missing API key', description: 'Please set Stability API Key.', variant: 'warning' });
             return;
         }
         
         // Use our robust capture helper (handles cropping, visible layers, etc.)
         const sourceImage = captureSourceImage();
         
         console.log('[Stability] Img2Img Capture:', { 
            length: sourceImage?.length, 
            sourceType, 
            flattenSelection 
         });

         if (!sourceImage) {
             console.warn('[Stability] No source image captured');
             toast({ title: 'No image source', description: 'Select an image or use full canvas.', variant: 'warning' });
             return;
         }
         
         setIsProcessing(true);
         try {
            const blobInfo = await fetch(sourceImage).then(r => r.blob());
            const formData = new FormData();
            formData.append('image', blobInfo);
            formData.append('prompt', prompt);
            formData.append('strength', String(strength[0])); // 0.0 = Identical to Original, 1.0 = Completely New
            formData.append('mode', 'image-to-image');
            formData.append('output_format', 'png');

            console.log('[Stability] Sending Img2Img:', { prompt, strength: strength[0], blobSize: blobInfo.size });

            const res = await fetch('/api/ai/stability/img2img', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: formData
            });
            
            const data = await res.json();
            if (data.success) {
                handleSuccess(data.image);
            } else {
                toast({ title: 'Img2Img failed', description: data.message || 'Error generating image.', variant: 'destructive' });
            }
         } catch (e) {
            console.error(e);
            toast({ title: 'Img2Img failed', description: 'Something went wrong.', variant: 'destructive' });
         } finally {
             setIsProcessing(false);
         }
    };

    /**
     * Performs Outpainting (extending the image).
     */
    const handleOutpaint = async () => {
        if (!apiKey) {
            toast({ title: 'Missing API key', description: 'Please set Stability API Key.', variant: 'warning' });
            return;
        }

        const sourceImage = captureSourceImage();
        if (!sourceImage) {
             toast({ title: 'No image source', description: 'Select an image/area to outpaint from.', variant: 'warning' });
             return;
        }

        // Validate directions - Stability requires at least one direction
        if (!outpaintDirs.left && !outpaintDirs.right && !outpaintDirs.up && !outpaintDirs.down) {
             toast({ title: 'No direction', description: 'Select at least one direction to expand.', variant: 'warning' });
             return;
        }

        setIsProcessing(true);
        try {
            const blobInfo = await fetch(sourceImage).then(r => r.blob());
            const formData = new FormData();
            formData.append('image', blobInfo);
            formData.append('prompt', prompt);
            formData.append('output_format', 'png');
            
            if(outpaintDirs.left) formData.append('left', 'true');
            if(outpaintDirs.right) formData.append('right', 'true');
            if(outpaintDirs.up) formData.append('up', 'true');
            if(outpaintDirs.down) formData.append('down', 'true');

            // Pass creativity/strength if supported, for now just prompt and directions
            
            const res = await fetch('/api/ai/stability/outpaint', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: formData
            });

            const data = await res.json();
             if (data.success) {
                handleSuccess(data.image);
            } else {
                toast({ title: 'Outpaint failed', description: data.message || 'Error outpainting.', variant: 'destructive' });
            }
        } catch (e) {
            console.error(e);
             toast({ title: 'Outpaint failed', description: 'Something went wrong.', variant: 'destructive' });
        } finally {
             setIsProcessing(false);
        }
    };


    /**
     * Performs Inpainting (replacing masked area) based on canvas selection + mask.
     */
    const handleInpaint = async () => {
        if (!apiKey) {
            toast({ title: 'Missing API key', description: 'Please set Stability API Key.', variant: 'warning' });
            return;
        }
        if (!selectedCanvasImage) {
            toast({ title: 'No image selected', description: 'Select an image on canvas first.', variant: 'warning' });
            return;
        }
        if (!maskDataUrl) {
            toast({ title: 'No mask', description: 'Please draw a mask on the image.', variant: 'warning' });
            return;
        }

        setIsProcessing(true);
        try {
           const imageBlob = await fetch(selectedCanvasImage).then(r => r.blob());
           // Convert mask data URL to blob
           const maskBlob = await fetch(maskDataUrl).then(r => r.blob());

           const formData = new FormData();
           formData.append('image', imageBlob);
           formData.append('mask', maskBlob);
           formData.append('prompt', prompt);
           formData.append('output_format', 'png');

           const res = await fetch('/api/ai/stability/inpaint', {
               method: 'POST',
               headers: { 'Authorization': `Bearer ${apiKey}` },
               body: formData
           });
           
           const data = await res.json();
           if (data.success) {
               handleSuccess(data.image);
           } else {
               toast({ title: 'Inpaint failed', description: data.message || 'Error running inpaint.', variant: 'destructive' });
           }
        } catch (e) {
            console.error(e);
            toast({ title: 'Inpaint failed', description: 'Something went wrong.', variant: 'destructive' });
        } finally {
            setIsProcessing(false);
        }
   };


    // --- Helper to add to Canvas ---
    const addToCanvas = () => {
        if (!canvas || !resultImage) return;

        fabric.Image.fromURL(resultImage, {}).then((img) => {
            // Use Artboard dimensions if available
            const artboard = (canvas as CanvasWithArtboard).artboard || { width: canvas.width || 800, height: canvas.height || 600 };
             const targetWidth = artboard.width;
             const targetHeight = artboard.height;
             
             // Scale down if larger than 80% of canvas to ensure visibility
             if (img.width! > targetWidth * 0.8 || img.height! > targetHeight * 0.8) {
                 const scale = Math.min(
                     (targetWidth * 0.8) / img.width!,
                     (targetHeight * 0.8) / img.height!
                 );
                 img.scale(scale);
             }
            canvas.centerObject(img);
            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.requestRenderAll();
        });
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
            
            const img = new Image();
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
        <div className="flex flex-col h-full w-full">
            {/* Content Body */}
            <div className="flex-1 space-y-4">
                {/* --- Tool Selector Tabs --- */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-6 h-auto p-1 bg-muted/50 mb-4">
                        <TabsTrigger value="generate" title="Text to Image"><ImageIcon size={16} /></TabsTrigger>
                        <TabsTrigger value="inpaint" title="Inpaint"><Eraser size={16} /></TabsTrigger>
                        <TabsTrigger value="img2img" title="Img2Img"><Layers size={16} /></TabsTrigger>
                        <TabsTrigger value="outpaint" title="Outpaint"><Scan size={16} /></TabsTrigger>
                        <TabsTrigger value="upscale" title="Upscale"><Maximize size={16} /></TabsTrigger>
                        <TabsTrigger value="removebox" title="Remove BG"><Move size={16} /></TabsTrigger>
                    </TabsList>

                    {/* --- TAB: TEXT TO IMAGE --- */}
                    <TabsContent value="generate" className="space-y-4">
                        <div className="space-y-2">
                             <Label>Prompt</Label>
                             <Input 
                                placeholder="A cyberpunk cat..." 
                                value={prompt} 
                                onChange={e => setPrompt(e.target.value)}
                             />
                        </div>
                        <div className="space-y-2">
                             <Label>Aspect Ratio</Label>
                             <Select value={aspectRatio} onValueChange={setAspectRatio}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1:1">Square (1:1)</SelectItem>
                                    <SelectItem value="16:9">Widescreen (16:9)</SelectItem>
                                    <SelectItem value="9:16">Portrait (9:16)</SelectItem>
                                    <SelectItem value="21:9">Cinema (21:9)</SelectItem>
                                </SelectContent>
                             </Select>
                        </div>
                        <Button className="w-full" onClick={handleGenerate} disabled={isProcessing}>
                            {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <Wand2 className="mr-2" />}
                            Generate
                        </Button>
                    </TabsContent>

                    {/* --- TAB: IMAGE TO IMAGE (REIMAGINE) --- */}
                    <TabsContent value="img2img" className="space-y-4">
                         
                         <div className="flex items-center space-x-2 bg-muted/30 p-2 rounded-lg">
                             <Button 
                                variant={sourceType === 'selection' ? 'secondary' : 'ghost'}
                                size="sm"
                                className="flex-1 text-xs"
                                onClick={() => setSourceType('selection')}
                                disabled={!selectedCanvasImage}
                             >
                                 Selection
                             </Button>
                             <Button 
                                variant={sourceType === 'canvas' ? 'secondary' : 'ghost'}
                                size="sm"
                                className="flex-1 text-xs"
                                onClick={() => setSourceType('canvas')}
                             >
                                 Full Canvas
                             </Button>
                         </div>

                         {/* Flatten Selection Option */}
                         {sourceType === 'selection' && (
                             <div className="flex items-center space-x-2 py-2">
                                <Switch id="flatten-mode" checked={flattenSelection} onCheckedChange={setFlattenSelection} />
                                <Label htmlFor="flatten-mode" className="text-xs">
                                    Include overlapping objects (Flatten)
                                </Label>
                             </div>
                         )}

                         {sourceType === 'selection' && !selectedCanvasImage ? (
                             <div className="p-4 border border-dashed rounded text-center text-muted-foreground flex flex-col items-center gap-2">
                                 <p>Select an object to edit.</p>
                                 <span className="text-xs opacity-50">- or -</span>
                                 <Button variant="ghost" size="sm" onClick={() => setSourceType('canvas')} className="underline">Use Full Canvas</Button>
                             </div>
                         ) : (
                             <div className="space-y-4">
                                 {/* Construct preview manually if canvas mode */}
                                {sourceType === 'selection' && selectedCanvasImage && (
                                    <div className="relative w-full h-32 bg-muted/50 rounded border border-border/50 overflow-hidden">
                                        <Image
                                            src={selectedCanvasImage}
                                            alt="Source"
                                            fill
                                            sizes="100vw"
                                            className="object-contain"
                                            unoptimized
                                        />
                                    </div>
                                )}
                                 {sourceType === 'canvas' && (
                                     <div className="w-full h-24 bg-muted/50 rounded flex items-center justify-center text-xs text-muted-foreground border border-border/50">
                                         Full Canvas Preview (All Layers)
                                     </div>
                                 )}

                                 <div className="space-y-2">
                                     <Label>Prompt</Label>
                                     <Input value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Make it look like a sketch..." />
                                 </div>
                                 <div className="space-y-2">
                                     <Label>Creativity Strength ({Math.round(strength[0] * 100)}%)</Label>
                                     <Slider value={strength} onValueChange={(val) => setStrength(val)} min={0} max={1} step={0.05} />
                                     <p className="text-[10px] text-muted-foreground flex justify-between">
                                         <span>0% (No Change)</span>
                                         <span>35% (Balanced)</span>
                                         <span>100% (New Image)</span>
                                     </p>
                                 </div>
                                 <Button className="w-full" onClick={handleImg2Img} disabled={isProcessing}>
                                    {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <Layers className="mr-2" />}
                                    Reimagine {sourceType === 'canvas' ? 'Canvas' : 'Selection'}
                                 </Button>
                             </div>
                         )}
                    </TabsContent>

                    {/* --- TAB: OUTPAINTING --- */}
                    <TabsContent value="outpaint" className="space-y-4">
                        {!selectedCanvasImage ? (
                             <div className="p-4 border border-dashed rounded text-center text-muted-foreground">
                                 Select an image on the canvas first to extend.
                             </div>
                        ) : (
                             <div className="space-y-4">
                                 <div className="w-full h-32 bg-muted p-2">
                                     <div className="relative w-full h-full">
                                         <Image
                                             src={selectedCanvasImage}
                                             alt="Selected canvas preview"
                                             fill
                                             sizes="100vw"
                                             className="object-contain"
                                             unoptimized
                                         />
                                     </div>
                                 </div>
                                 
                                 <div className="space-y-2">
                                     <Label>Expansion Directions</Label>
                                     <div className="grid grid-cols-3 gap-2 w-32 mx-auto">
                                         <div />
                                         <Button variant={outpaintDirs.up ? "default" : "outline"} size="icon" onClick={() => setOutpaintDirs(d => ({...d, up: !d.up}))}><ArrowUp size={16}/></Button>
                                         <div />
                                         <Button variant={outpaintDirs.left ? "default" : "outline"} size="icon" onClick={() => setOutpaintDirs(d => ({...d, left: !d.left}))}><ArrowLeft size={16}/></Button>
                                         <div className="flex items-center justify-center text-xs text-muted-foreground">Src</div>
                                         <Button variant={outpaintDirs.right ? "default" : "outline"} size="icon" onClick={() => setOutpaintDirs(d => ({...d, right: !d.right}))}><ArrowRight size={16}/></Button>
                                         <div />
                                         <Button variant={outpaintDirs.down ? "default" : "outline"} size="icon" onClick={() => setOutpaintDirs(d => ({...d, down: !d.down}))}><ArrowDown size={16}/></Button>
                                         <div />
                                     </div>
                                 </div>

                                 <div className="space-y-2">
                                     <Label>Prompt</Label>
                                     <Input value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="What to fill the space with..." />
                                 </div>

                                 <Button className="w-full" onClick={handleOutpaint} disabled={isProcessing}>
                                    {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <Scan className="mr-2" />}
                                    Outpaint (Expand)
                                 </Button>
                             </div>
                        )}
                    </TabsContent>

                    {/* --- TAB: INPAINTING --- */}
                    <TabsContent value="inpaint" className="space-y-4">
                        {!selectedCanvasImage ? (
                             <div className="p-4 border border-dashed rounded text-center text-muted-foreground">
                                 Select an image on the canvas first.
                             </div>
                        ) : (
                            <div className="space-y-2">
                                <Label>Draw Mask (White = Edit Area)</Label>
                                <div className="relative border rounded overflow-hidden cursor-crosshair bg-black"
                                     onMouseDown={() => setIsDrawingMask(true)}
                                     onMouseUp={() => {
                                         setIsDrawingMask(false);
                                         if(maskCanvasRef.current) setMaskDataUrl(maskCanvasRef.current.toDataURL());
                                     }}
                                     onMouseMove={drawMask}
                                >
                                    {/* Underlay Image */}
                                    {/* eslint-disable-next-line @next/next/no-img-element -- Preserve natural sizing for canvas overlay alignment. */}
                                    <img src={selectedCanvasImage} alt="Inpaint source preview" className="w-full h-auto opacity-50 pointer-events-none select-none" />
                                    {/* Overlay Canvas for Masking */}
                                    <canvas ref={maskCanvasRef} className="absolute inset-0 w-full h-full mix-blend-screen" />
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span>Brush Size: {brushSize}px</span>
                                    <Slider className="w-32" value={brushSize} onValueChange={(val) => setBrushSize(val)} min={5} max={50} data-default="20" />
                                </div>
                                
                                <div className="space-y-2 mt-2">
                                     <Label>Prompt</Label>
                                     <Input value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="What to put in the masked area..." />
                                </div>

                                <Button className="w-full" onClick={handleInpaint} disabled={isProcessing}>
                                    {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <Eraser className="mr-2" />}
                                    Inpaint
                                </Button>
                            </div>
                        )}
                    </TabsContent>

                     {/* --- TAB: UPSCALE --- */}
                     <TabsContent value="upscale" className="space-y-4">
                         {!selectedCanvasImage ? (
                             <div className="p-4 border border-dashed rounded text-center text-muted-foreground">
                                 Select an image on the canvas first.
                             </div>
                         ) : (
                             <div className="space-y-4">
                                 <div className="relative w-full h-32 bg-muted overflow-hidden">
                                     <Image
                                         src={selectedCanvasImage}
                                         alt="Selected canvas preview"
                                         fill
                                         sizes="100vw"
                                         className="object-contain"
                                         unoptimized
                                     />
                                 </div>
                                 <Button className="w-full" variant="secondary" onClick={() => handleUpscale('conservative')} disabled={isProcessing}>
                                     Conservative (Fast, Faithful)
                                 </Button>
                                 <div className="space-y-2">
                                    <Label>Creative Upscale Prompt (Optional)</Label>
                                    <Input value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Adds detail..." />
                                    <Button className="w-full" onClick={() => handleUpscale('creative')} disabled={isProcessing}>
                                        <Sparkles className="mr-2 h-4 w-4" /> Creative (Slow, Re-imagines)
                                    </Button>
                                 </div>
                             </div>
                         )}
                     </TabsContent>
                     
                     {/* --- TAB: REMOVE BACKGROUND --- */}
                     <TabsContent value="removebox" className="space-y-4">
                         {!selectedCanvasImage ? (
                             <div className="p-4 border border-dashed rounded text-center text-muted-foreground">
                                 Select an image on the canvas first.
                             </div>
                         ) : (
                             <div className="space-y-4">
                                 <div className="relative w-full h-32 bg-muted overflow-hidden">
                                     <Image
                                         src={selectedCanvasImage}
                                         alt="Selected canvas preview"
                                         fill
                                         sizes="100vw"
                                         className="object-contain"
                                         unoptimized
                                     />
                                 </div>
                                 <p className="text-sm text-muted-foreground">
                                     Remove background from the selected image. This consumes credits.
                                 </p>
                                 <Button className="w-full" onClick={handleRemoveBg} disabled={isProcessing}>
                                    {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <Move className="mr-2" />}
                                    Remove Background
                                 </Button>
                             </div>
                         )}
                     </TabsContent>

                </Tabs>
                
                {/* --- RESULT AREA --- */}
                {resultImage && (
                    <div className="mt-4 border-t pt-4 animate-in fade-in slide-in-from-bottom-2">
                        <Label>Result</Label>
                        <div className="relative group rounded-md overflow-hidden border mt-2">
                            {/* eslint-disable-next-line @next/next/no-img-element -- Preserve natural sizing for generated output preview. */}
                            <img src={resultImage} alt="Generated result" className="w-full h-auto bg-[url('/checker.png')] bg-repeat" />
                            <div className="absolute inset-x-0 bottom-0 bg-black/70 p-2 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button size="sm" onClick={addToCanvas}>
                                    <Check className="mr-2 h-4 w-4" /> Add to Canvas
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// End of StabilityGenerator.tsx
