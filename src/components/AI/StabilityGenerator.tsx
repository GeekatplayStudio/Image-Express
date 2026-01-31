import React, { useState, useRef, useEffect } from 'react';
import { X, Wand2, Loader2, Image as ImageIcon, Eraser, Move, Layers, Maximize, Check, Sparkles } from 'lucide-react';
import * as fabric from 'fabric';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Slider } from '../ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
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
    artboard?: { width: number; height: number };
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
export default function StabilityGenerator({ isOpen, onClose, canvas, apiKey, onJobCreated, embedded, onAssetSave }: StabilityGeneratorProps) {
    const { toast } = useToast();
    // --- UI State ---
    const [activeTab, setActiveTab] = useState('generate');
    const [isProcessing, setIsProcessing] = useState(false);
    
    // --- Generation Parameters ---
    const [prompt, setPrompt] = useState('');
    const [negativePrompt, setNegativePrompt] = useState(''); // Note: Not widely supported in newer Stability Core models
    const [aspectRatio, setAspectRatio] = useState('1:1');
    const [strength, setStrength] = useState([0.7]); // Impact strength for Img2Img (0-1)
    
    // --- Image Data State ---
    const [resultImage, setResultImage] = useState<string | null>(null);         // The final output
    const [selectedCanvasImage, setSelectedCanvasImage] = useState<string | null>(null); // Source image from canvas
    
    // --- Inpainting State ---
    const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);         // Generated mask blob URL
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);                       // Canvas ref for drawing mask
    const [isDrawingMask, setIsDrawingMask] = useState(false);
    const [brushSize, setBrushSize] = useState([20]);

    // --- Window Positioning (if not embedded) ---
    const [position, setPosition] = useState({ x: 100, y: 100 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });

    /**
     * Effect: Monitor Canvas Selection
     * Automatically updates `selectedCanvasImage` when user selects an image on the board.
     * This allows Img2Img and Inpainting to know what to operate on.
     */
    useEffect(() => {
        if (!canvas) return;

        const handleSelection = () => {
            const active = canvas.getActiveObject();
            if (active && (active.type === 'image' || active instanceof fabric.Image)) {
                 const img = active as fabric.Image;
                 // Get the source URL
                 const src = img.getSrc();
                 setSelectedCanvasImage(src);
            } else {
                 setSelectedCanvasImage(null);
            }
        };

        canvas.on('selection:created', handleSelection);
        canvas.on('selection:updated', handleSelection);
        canvas.on('selection:cleared', () => setSelectedCanvasImage(null));

        return () => {
            canvas.off('selection:created', handleSelection);
            canvas.off('selection:updated', handleSelection);
            canvas.off('selection:cleared');
        };
    }, [canvas]);

    /**
     * Draggable Logic (Window Movement)
     * Only active if `embedded` is false/undefined.
     */
    const handleMouseDown = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.no-drag')) return;
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            setPosition({
                x: e.clientX - dragStartRef.current.x,
                y: e.clientY - dragStartRef.current.y
            });
        };
        const handleMouseUp = () => setIsDragging(false);

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

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
        setIsProcessing(true);
        setResultImage(null);

        try {
            const formData = new FormData();
            formData.append('prompt', prompt);
            formData.append('aspect_ratio', aspectRatio);
            formData.append('output_format', 'png');
            
            const res = await fetch('/api/ai/stability/generate', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: formData
            });
            
            const data = await res.json();
            if (data.success) {
                setResultImage(`data:image/png;base64,${data.image}`);
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
                setResultImage(`data:image/png;base64,${data.image}`);
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
                    setResultImage(`data:image/png;base64,${data.image}`);
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
         if (!selectedCanvasImage) {
             toast({ title: 'No image selected', description: 'Select an image on canvas first.', variant: 'warning' });
             return;
         }
         
         setIsProcessing(true);
         try {
            const blobInfo = await fetch(selectedCanvasImage).then(r => r.blob());
            const formData = new FormData();
            formData.append('image', blobInfo);
            formData.append('prompt', prompt);
            formData.append('strength', String(strength[0])); // Control how much to respect original image
            formData.append('mode', 'image-to-image');
            formData.append('output_format', 'png');

            const res = await fetch('/api/ai/stability/img2img', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: formData
            });
            
            const data = await res.json();
            if (data.success) {
                setResultImage(`data:image/png;base64,${data.image}`);
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
               setResultImage(`data:image/png;base64,${data.image}`);
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

        if (onAssetSave) {
            onAssetSave(resultImage);
        }

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
                maskCanvasRef.current!.width = 300; 
                maskCanvasRef.current!.height = 300 * (img.height / img.width);
                
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
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const ctx = maskCanvasRef.current.getContext('2d');
        if (!ctx) return;
        
        // We draw with composite 'source-over' to add to the mask.
        // White color = The Mask.
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; // Slightly transparent for user feedback, but backend needs solid mask
        ctx.beginPath();
        ctx.arc(x, y, brushSize[0]/2, 0, Math.PI * 2);
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
                    <TabsList className="grid w-full grid-cols-5 h-auto p-1 bg-muted/50 mb-4">
                        <TabsTrigger value="generate" title="Text to Image"><ImageIcon size={16} /></TabsTrigger>
                        <TabsTrigger value="inpaint" title="Inpaint"><Eraser size={16} /></TabsTrigger>
                        <TabsTrigger value="img2img" title="Img2Img"><Layers size={16} /></TabsTrigger>
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
                         {!selectedCanvasImage ? (
                             <div className="p-4 border border-dashed rounded text-center text-muted-foreground">
                                 Select an image on the canvas first.
                             </div>
                         ) : (
                             <div className="space-y-4">
                                 <img src={selectedCanvasImage} alt="Source" className="w-full h-32 object-contain bg-muted" />
                                 <div className="space-y-2">
                                     <Label>Prompt</Label>
                                     <Input value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Make it look like a sketch..." />
                                 </div>
                                 <div className="space-y-2">
                                     <Label>Strength ({strength[0]})</Label>
                                     <Slider value={strength} onValueChange={(val) => setStrength(val)} min={0} max={1} step={0.05} data-default="0.7" />
                                     <p className="text-xs text-muted-foreground">0 = No change, 1 = Full change</p>
                                 </div>
                                 <Button className="w-full" onClick={handleImg2Img} disabled={isProcessing}>
                                    {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <Layers className="mr-2" />}
                                    Reimagine
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
                                    <img src={selectedCanvasImage} className="w-full h-auto opacity-50 pointer-events-none select-none" />
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
                                 <img src={selectedCanvasImage} className="w-full h-32 object-contain bg-muted" />
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
                                 <img src={selectedCanvasImage} className="w-full h-32 object-contain bg-muted" />
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
                            <img src={resultImage} className="w-full h-auto bg-[url('/checker.png')] bg-repeat" />
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
