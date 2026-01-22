import React, { useState, useEffect, useRef } from 'react';
import { X, Wand2, Loader2, RotateCw, GripHorizontal } from 'lucide-react';
import * as fabric from 'fabric';

/**
 * ImageGeneratorModal
 * Floating draggable window for AI Image Generation.
 * Supports auto-saving generated assets and placing them on canvas.
 */
interface ImageGeneratorModalProps {
  isOpen?: boolean;
  canvas?: fabric.Canvas | null;
  onClose: () => void;
  onGenerate?: (imageSrc: string) => void;
  initialWidth?: number;
  initialHeight?: number;
}

export default function ImageGeneratorModal({
  isOpen = true,
  canvas,
  onClose,
  onGenerate,
  initialWidth = 512,
  initialHeight = 512,
}: ImageGeneratorModalProps) {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  
  // Draggable State
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  
  // Zone Management
  const [zoneWidth, setZoneWidth] = useState(initialWidth);
  const [zoneHeight, setZoneHeight] = useState(initialHeight);
  const zoneObjectRef = useRef<fabric.Rect | null>(null);

  // Load config
  const [config, setConfig] = useState({
    provider: 'local',
    serverUrl: 'http://127.0.0.1:8188',
    apiKey: '',
  });

  // Initial Position
  useEffect(() => {
    if (typeof window !== 'undefined' && !hasMoved) {
       // Position next to the AI Zone icon (approx 5th item)
       setPosition({ 
           x: 90, 
           y: 220 
       });
    }
  }, []);

  useEffect(() => {
    // Sync with global settings from SettingsModal
    if (typeof window !== 'undefined') {
        const provider = localStorage.getItem('image-express-provider');
        const comfyUrl = localStorage.getItem('image-express-comfy-url');
        const apiKey = localStorage.getItem('image-express-gen-key');
        
        setConfig({
            provider: provider || 'local', // 'comfy' (from SettingsModal) might be value, let's normalize
            serverUrl: comfyUrl || 'http://127.0.0.1:8188',
            apiKey: apiKey || '',
        });
    }
  }, []);

  // Initialize Zone on Canvas
  useEffect(() => {
    if (!canvas) return;

    // Check if user already selected something to transform into a zone
    const activeObj = canvas.getActiveObject();
    
    if (activeObj && activeObj.type === 'rect') {
        // Use existing selection
        setZoneWidth(activeObj.width! * activeObj.scaleX!);
        setZoneHeight(activeObj.height! * activeObj.scaleY!);
        zoneObjectRef.current = activeObj as fabric.Rect;
    } else {
        // Create new Zone
        const zone = new fabric.Rect({
            left: 100,
            top: 100,
            width: 512,
            height: 512,
            fill: 'rgba(139, 92, 246, 0.1)', // Purple transparent
            stroke: '#8b5cf6',
            strokeWidth: 2,
            strokeDashArray: [5, 5],
            transparentCorners: false,
            cornerColor: '#8b5cf6',
            cornerStrokeColor: '#fff',
        });
        
        canvas.add(zone);
        canvas.setActiveObject(zone);
        zoneObjectRef.current = zone;
        
        // Listen for scaling to update dimensions
        zone.on('scaling', () => {
             setZoneWidth(Math.round(zone.width! * zone.scaleX!));
             setZoneHeight(Math.round(zone.height! * zone.scaleY!));
        });
        
        canvas.requestRenderAll();
    }

    // Cleanup
    return () => {
        if (zoneObjectRef.current && canvas.contains(zoneObjectRef.current)) {
            canvas.remove(zoneObjectRef.current);
            canvas.requestRenderAll();
        }
    };
  }, [canvas]);

  // Drag Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
      // Only start drag if clicking header
      setIsDragging(true);
      setHasMoved(true);
      dragStartPos.current = {
          x: e.clientX - position.x,
          y: e.clientY - position.y
      };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        
        // Compute new position
        const newX = e.clientX - dragStartPos.current.x;
        const newY = e.clientY - dragStartPos.current.y;
        
        setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    if (isDragging) {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleGenerate = async () => {
    if (!prompt) return;

    setIsGenerating(true);
    setStatusMessage('Queueing generation...');
    setGeneratedImage(null);

    // Update zone dims from current object state just in case
    if (zoneObjectRef.current) {
        const z = zoneObjectRef.current;
        const w = Math.round(z.width! * z.scaleX!);
        const h = Math.round(z.height! * z.scaleY!);
        setZoneWidth(w);
        setZoneHeight(h);
    }
    
    // Use current state for API call
    const currentW = zoneObjectRef.current ? Math.round(zoneObjectRef.current.width! * zoneObjectRef.current.scaleX!) : zoneWidth;
    const currentH = zoneObjectRef.current ? Math.round(zoneObjectRef.current.height! * zoneObjectRef.current.scaleY!) : zoneHeight;


    try {
      const response = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          width: currentW,
          height: currentH,
          serverUrl: config.serverUrl,
          provider: config.provider === 'comfy' ? 'comfy' : 'remote',
          apiKey: config.apiKey
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Generation failed');
      }

      if (config.provider === 'comfy') {
          setStatusMessage('Processing on ComfyUI...');
          await pollComfyResult(data.promptId, config.serverUrl);
      } else {
         // Handle Remote API Success
         if (data.imageUrl) {
             setGeneratedImage(data.imageUrl);
             setStatusMessage('Generation complete!');
         } else {
             setStatusMessage('Finished, but no image returned.');
         }
         setIsGenerating(false);
      }

    } catch (error) {
      console.error(error);
      setStatusMessage(`Error: ${(error as any).message}`);
      setIsGenerating(false);
    }
  };

  const pollComfyResult = async (promptId: string, host: string) => {
      const maxRetries = 60; 
      let attempts = 0;

      const interval = setInterval(async () => {
          attempts++;
          try {
              const res = await fetch(`${host}/history/${promptId}`);
              const history = await res.json();
              
              if (history && history[promptId] && history[promptId].outputs) {
                  clearInterval(interval);
                  const outputs = history[promptId].outputs;
                  let imageName = null;
                  
                  for (const nodeId in outputs) {
                      if (outputs[nodeId].images && outputs[nodeId].images.length > 0) {
                          imageName = outputs[nodeId].images[0];
                          break;
                      }
                  }

                  if (imageName) {
                      const imgUrl = `${host}/view?filename=${imageName.filename}&subfolder=${imageName.subfolder}&type=${imageName.type}`;
                      setGeneratedImage(imgUrl);
                      setStatusMessage('Generation complete!');
                  }
                  setIsGenerating(false);
              } else if (attempts >= maxRetries) {
                  clearInterval(interval);
                  setStatusMessage('Timeout waiting for ComfyUI.');
                  setIsGenerating(false);
              }
          } catch (e) {
              // ignore
          }
      }, 1000);
  };

  const saveToAssets = async (url: string) => {
    try {
        if (url.startsWith('data:')) {
            // Upload Base64
            const blob = await (await fetch(url)).blob();
            const file = new File([blob], `generated-${Date.now()}.png`, { type: 'image/png' });
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', 'images');
            
            await fetch('/api/assets/upload', {
                method: 'POST',
                body: formData
            });
        } else {
            // Upload URL
             await fetch('/api/assets/save-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: url,
                    filename: `generated-${Date.now()}.png`,
                    type: 'images'
                })
            });
        }
    } catch (e) {
        console.error("Failed to auto-save asset", e);
    }
  };

  const handleAddToCanvas = () => {
    if (!generatedImage || !canvas) {
        if (onGenerate && generatedImage) onGenerate(generatedImage);
        onClose();
        return;
    }

    // Auto-save generated image to assets history
    saveToAssets(generatedImage);

    fabric.Image.fromURL(generatedImage, { crossOrigin: 'anonymous' }).then((img) => {
        if (!zoneObjectRef.current) {
            canvas.add(img);
        } else {
            const z = zoneObjectRef.current;
            img.set({
                left: z.left,
                top: z.top,
                scaleX: (z.width! * z.scaleX!) / img.width!,
                scaleY: (z.height! * z.scaleY!) / img.height!,
            });
            canvas.remove(z);
            canvas.add(img);
            canvas.setActiveObject(img);
        }
        canvas.requestRenderAll();
        onClose(); 
    }).catch(err => {
        console.error("Failed to load image to canvas", err);
        setStatusMessage("Failed to place image on canvas");
    });
  };

  if (!isOpen) return null;

  return (
    <div 
        className="fixed z-50 w-[350px] shadow-2xl animate-in fade-in duration-300 rounded-lg overflow-hidden border bg-background"
        style={{ 
            left: position.x, 
            top: position.y,
            // If moved, disable auto positioning classes, otherwise use default
            transform: !hasMoved ? 'none' : 'none'
        }}
    >
        {/* Header - Draggable Area */}
        <div 
            className="flex items-center justify-between p-3 border-b bg-muted/30 cursor-move select-none"
            onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
               <GripHorizontal className="w-4 h-4 text-muted-foreground/50" />
               <h2 className="font-semibold flex items-center gap-2 text-sm pointer-events-none">
                <Wand2 className="w-4 h-4 text-purple-500" />
                AI Zone Generator
               </h2>
          </div>
          <button 
             onClick={onClose} 
             // Stop propagation so clicking close doesn't start drag
             onMouseDown={(e) => e.stopPropagation()}
             className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-6 w-6"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-xs">Prompt</label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              placeholder="A futuristic city with neon lights..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGenerating}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground bg-secondary/30 p-2 rounded border border-dashed">
             <span>Zone Size:</span>
             <span className="font-mono">{Math.round(zoneWidth)} x {Math.round(zoneHeight)}</span>
          </div>

          {!generatedImage && isGenerating && (
             <div className="flex flex-col items-center justify-center py-4 space-y-2 text-xs text-muted-foreground">
                 <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                 <span>{statusMessage}</span>
             </div>
          )}

          {generatedImage && (
            <div className="rounded-md border overflow-hidden aspect-video relative group bg-checkerboard">
                <img src={generatedImage} alt="Generated" className="w-full h-full object-contain" />
            </div>
          )}
          
          {/* Footer Actions */}
          <div className="pt-2 flex flex-col gap-2">
            {!generatedImage ? (
                <button 
                    onClick={handleGenerate} 
                    disabled={isGenerating || !prompt} 
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md transition-all hover:scale-[1.02] h-9 px-4 py-2"
                >
                    {isGenerating ? 'Generating...' : 'Generate Frame'}
                </button>
            ) : (
                <div className="flex gap-2">
                    <button 
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 flex-1" 
                        onClick={() => setGeneratedImage(null)}
                    >
                        Retry
                    </button>
                    <button 
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 flex-1" 
                        onClick={handleAddToCanvas}
                    >
                        Accept
                    </button>
                </div>
            )}
            <p className="text-[10px] text-center text-muted-foreground">
                Using {config.provider === 'comfy' ? 'Local ComfyUI' : 'Cloud API'}
            </p>
          </div>

        </div>
    </div>
  );
}
