import React, { useState, useEffect, useRef } from 'react';
import { X, Wand2, Loader2, RotateCw, GripHorizontal } from 'lucide-react';
import * as fabric from 'fabric';
import StabilityGenerator from './AI/StabilityGenerator';

/**
 * ImageGeneratorModal
 * 
 * A floating, draggable modal window for AI Image Generation.
 * Features:
 * - "Magic Zone" creation on canvas (defining area for generation)
 * - Integration with Local ComfyUI and Remote APIs (Stability, OpenAI, etc)
 * - Interface for prompt entry and generation control
 * - Auto-saving of generated results to the "Generated" asset library
 */
interface ImageGeneratorModalProps {
  /** Visibility state */
  isOpen?: boolean;
  /** Reference to the main Fabric.js canvas */
  canvas?: fabric.Canvas | null;
  /** Callback to close the modal */
  onClose: () => void;
  /** Optional callback when image is generated (legacy support) */
  onGenerate?: (imageSrc: string) => void;
  /** Default width for the generation zone */
  initialWidth?: number;
  /** Default height for the generation zone */
  initialHeight?: number;
  /** Optional API Key override */
  apiKey?: string; 
}

export default function ImageGeneratorModal({
  isOpen = true,
  canvas,
  onClose,
  onGenerate,
  initialWidth = 512,
  initialHeight = 512,
  apiKey,
}: ImageGeneratorModalProps) {
  // --- Generation State ---
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  
  // --- UI State (Draggable Window) ---
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  
  // --- Canvas Zone Management ---
  const [zoneWidth, setZoneWidth] = useState(initialWidth);
  const [zoneHeight, setZoneHeight] = useState(initialHeight);
  const zoneObjectRef = useRef<fabric.Rect | null>(null);

  // --- Configuration ---
  const [config, setConfig] = useState({
    provider: 'local',
    serverUrl: 'http://127.0.0.1:8188',
    apiKey: '',
  });

  // --- Provider Selection ---
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('comfy'); // Default

  // Init: Synch with LocalStorage settings
  useEffect(() => {
    if (typeof window !== 'undefined') {
        const comfyUrl = localStorage.getItem('image-express-comfy-url');
        const savedApiKey = localStorage.getItem('image-express-gen-key');

        // Check for Available API Keys in storage
        const stability = localStorage.getItem('stability_api_key');
        const openai = localStorage.getItem('openai_api_key');
        const google = localStorage.getItem('google_api_key');
        const banana = localStorage.getItem('banana_api_key');
        
        const providers = ['comfy']; // Local ComfyUI is always an option
        if (stability) providers.push('stability');
        if (openai) providers.push('openai');
        if (google) providers.push('google');
        if (banana) providers.push('banana');
        
        setAvailableProviders(providers);

        // Load previously selected provider
        const savedProvider = localStorage.getItem('image-express-gen-provider');
        if (savedProvider && providers.includes(savedProvider)) {
            setSelectedProvider(savedProvider);
        } else {
             // Fallback logic
             const legacyProvider = localStorage.getItem('image-express-provider');
             if (legacyProvider === 'api' && providers.length > 1) {
                  setSelectedProvider(providers[1]); 
             } else {
                 setSelectedProvider('comfy');
             }
        }
        
        setConfig({
            provider: 'comfy', // Base default
            serverUrl: comfyUrl || 'http://127.0.0.1:8188',
            apiKey: savedApiKey || '',
        });
    }
  }, []);

  /**
   * Updates selected provider and persists choice.
   */
  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newVal = e.target.value;
      setSelectedProvider(newVal);
      localStorage.setItem('image-express-gen-provider', newVal);
  };
    
  /**
   * Retreives the API key for a specific provider from storage.
   */
  const getProviderKey = (provider: string) => {
      if (provider === 'comfy') return '';
      return localStorage.getItem(`${provider}_api_key`) || '';
  }

  // --- Modal View Mode (Local Zone vs Stability Specific UI) ---
  const [mode, setMode] = useState<'zone' | 'stability'>('zone');

  // Initial Window Position
  useEffect(() => {
    if (typeof window !== 'undefined' && !hasMoved) {
       // Position next to the AI Zone icon (approx 5th item in toolbar)
       setPosition({ 
           x: 90, 
           y: 220 
       });
    }
  }, [hasMoved]); 

  // --- Zone Logic: Create/Destroy on Canvas ---
  useEffect(() => {
    if (!canvas) return;

    // Check if user already selected a rect to transform into a zone
    const activeObj = canvas.getActiveObject();
    
    if (activeObj && activeObj.type === 'rect') {
        // Use existing selection as zone
        setZoneWidth(activeObj.width! * activeObj.scaleX!);
        setZoneHeight(activeObj.height! * activeObj.scaleY!);
        zoneObjectRef.current = activeObj as fabric.Rect;
    } else {
        // Create new UI Zone indicator
        const zone = new fabric.Rect({
            left: 100,
            top: 100,
            width: 512,
            height: 512,
            fill: 'rgba(139, 92, 246, 0.1)', // Transluscent Purple
            stroke: '#8b5cf6',
            strokeWidth: 2,
            strokeDashArray: [5, 5], // Dashed line
            transparentCorners: false,
            cornerColor: '#8b5cf6',
            cornerStrokeColor: '#fff',
        });
        
        canvas.add(zone);
        canvas.setActiveObject(zone);
        zoneObjectRef.current = zone;
        
        // Listen for scaling to update dimensions state
        zone.on('scaling', () => {
             setZoneWidth(Math.round(zone.width! * zone.scaleX!));
             setZoneHeight(Math.round(zone.height! * zone.scaleY!));
        });
        
        canvas.requestRenderAll();
    }

    // Cleanup: Remove zone when modal closes
    return () => {
        if (zoneObjectRef.current && canvas.contains(zoneObjectRef.current)) {
            canvas.remove(zoneObjectRef.current);
            canvas.requestRenderAll();
        }
    };
  }, [canvas]);

  // --- Draggable Window Handlers ---
  const handleMouseDown = (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('.no-drag')) return; // Prevent drag interaction on inputs
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
        
        // Compute new position based on delta
        const newX = e.clientX - dragStartPos.current.x;
        const newY = e.clientY - dragStartPos.current.y;
        
        setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    // Attach global listeners while dragging to catch mouse leaving the window
    if (isDragging) {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);


  // --- Helper Functions ---

  /**
   * Polls a local ComfyUI instance for generation results.
   * @param promptId The ID of the queued job
   * @param host The base URL of the ComfyUI server
   */
  const pollComfyResult = async (promptId: string, host: string) => {
      const maxRetries = 60; // Wait up to 60 seconds
      let attempts = 0;

      const interval = setInterval(async () => {
          attempts++;
          try {
              const res = await fetch(`${host}/history/${promptId}`);
              const history = await res.json();
              
              // Check if output is ready
              if (history && history[promptId] && history[promptId].outputs) {
                  clearInterval(interval);
                  const outputs = history[promptId].outputs;
                  let imageName = null;
                  
                  // Find first image output from any node
                  for (const nodeId in outputs) {
                      if (outputs[nodeId].images && outputs[nodeId].images.length > 0) {
                          imageName = outputs[nodeId].images[0];
                          break;
                      }
                  }

                  if (imageName) {
                      // Construct URL for ComfyUI view endpoint
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
              // ignore errors during polling
          }
      }, 1000);
  };

  /**
   * Saves a generated image (URL or Data URI) to the persistent workspace assets.
   * Target folder: public/assets/generated/images
   */
  const saveToAssets = async (url: string) => {
    try {
        if (url.startsWith('data:')) {
            // Case: Base64 Data URI (e.g. from Stability API)
            const blob = await (await fetch(url)).blob();
            const file = new File([blob], `generated-${Date.now()}.png`, { type: 'image/png' });
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', 'images');
            formData.append('category', 'generated');
            
            await fetch('/api/assets/upload', {
                method: 'POST',
                body: formData
            });
        } else {
            // Case: External URL (e.g. from ComfyUI or other Remote URL)
             await fetch('/api/assets/save-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: url,
                    filename: `generated-${Date.now()}.png`,
                    type: 'images',
                    category: 'generated'
                })
            });
        }
    } catch (e) {
        console.error("Failed to auto-save asset", e);
    }
  };

  /**
   * Finalizes the generation process:
   * 1. Auto-saves the image
   * 2. Adds the image to the Fabric.js canvas
   * 3. Fits image to the "Magic Zone" if it exists, or centers it
   */
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
             // Use Artboard dimensions if available
             // @ts-ignore
             const artboard = canvas.artboard || { width: canvas.width || 800, height: canvas.height || 600 };
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
        } else {
            // Fit to Zone
            const z = zoneObjectRef.current;
            img.set({
                left: z.left,
                top: z.top,
                scaleX: (z.width! * z.scaleX!) / img.width!,
                scaleY: (z.height! * z.scaleY!) / img.height!,
            });
            // Remove the zone indicator guide
            canvas.remove(z);
            // Replace with actual image
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

  const placeImageOnCanvas = () => {
    handleAddToCanvas();
  };

  /**
   * Main Generation Handler.
   * Routes request to appropriate provider (Comfy, Stability, etc).
   */
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
      const currentKey = getProviderKey(selectedProvider);
      
      const response = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          width: currentW,
          height: currentH,
          serverUrl: config.serverUrl,
          provider: selectedProvider === 'comfy' ? 'comfy' : 'remote',
          specificProvider: selectedProvider, 
          apiKey: currentKey
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Generation failed');
      }

      if (selectedProvider === 'comfy') {
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


  if (!isOpen) return null;

  return (
    <div 
      className="fixed z-[100] bg-card border border-border shadow-2xl rounded-xl overflow-hidden flex flex-col w-[350px] animate-in fade-in zoom-in-95 duration-200"
      style={{
          left: position.x,
          top: position.y
      }}
    >
      {/* 
        Modal Header - Draggable Handle 
      */}
      <div 
        className="h-10 bg-secondary/50 border-b flex items-center justify-between px-3 cursor-move select-none"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
           <Wand2 size={16} className="text-purple-500"/>
           AI Generation Zone
        </div>
        <button onClick={onClose} className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors no-drag">
           <X size={16} />
        </button>
      </div>
      
      {/* 
        Mode Switcher: Simple Zone vs Dedicated Provider UI (Stability) 
      */}
      <div className="flex border-b bg-muted/20">
          <button 
             onClick={() => setMode('zone')}
             className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${mode === 'zone' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
             Local / Zone
          </button>
          <button 
             onClick={() => setMode('stability')}
             className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${mode === 'stability' ? 'border-purple-500 text-purple-600 bg-purple-500/5' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
             Stability AI
          </button>
      </div>

      <div className="p-4 bg-background max-h-[70vh] overflow-y-auto no-drag">
        {mode === 'stability' ? (
             /* Stability AI Specific UI */
             <StabilityGenerator 
                 isOpen={true}
                 onClose={onClose}
                 canvas={canvas || null}
                 apiKey={apiKey || getProviderKey('stability')}
                 embedded={true} 
                 onAssetSave={saveToAssets}
             />
        ) : (
        <>
            {/* 
              Generic / ComfyUI Zone Content 
              Renders controls for dimensions based on canvas selection
            */}
            <div className="space-y-4">
               {/* Controls */}
               <div className="space-y-2">
                 <label className="text-xs font-medium text-muted-foreground flex justify-between">
                    Prompt
                    <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-foreground">{zoneWidth}x{zoneHeight}</span>
                 </label>
                 <textarea 
                    className="w-full text-sm p-3 rounded-lg border bg-background focus:ring-2 focus:ring-primary/20 min-h-[80px] resize-none transition-all placeholder:text-muted-foreground/50"
                    placeholder="Describe what you want to appear in the zone..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                 />
               </div>

               {/* Provider Select */}
               <div className="grid grid-cols-2 gap-2">
                   <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Provider</label>
                      <select 
                         className="w-full text-xs p-2 rounded-md border bg-background"
                         value={selectedProvider}
                         onChange={handleProviderChange}
                      >
                         {availableProviders.map(p => (
                             <option className="bg-zinc-950 text-white" key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                         ))}
                      </select>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Aspect</label>
                      <div className="w-full text-xs p-2 rounded-md border bg-secondary/20 text-muted-foreground truncate" title="Resize zone on canvas to change">
                          Custom ({zoneWidth}x{zoneHeight})
                      </div>
                   </div>
               </div>

               {/* Generate Button */}
               <button 
                  onClick={handleGenerate}
                  disabled={isGenerating || !prompt}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-sm"
               >
                  {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                  {isGenerating ? 'Dreaming...' : 'Generate Image'}
               </button>

               {statusMessage && (
                  <div className={`text-xs text-center py-2 px-3 rounded-md ${statusMessage.includes('Error') ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-secondary-foreground'}`}>
                      {statusMessage}
                  </div>
               )}
               
               {/* Result Preview Area */}
               {generatedImage && (
                   <div className="relative group rounded-lg overflow-hidden border bg-checkerboard aspect-square animate-in zoom-in-95">
                       <img src={generatedImage} className="w-full h-full object-contain" alt="Generated" />
                       
                       <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                           <button 
                              onClick={placeImageOnCanvas}
                              className="bg-white text-black px-4 py-1.5 rounded-full text-xs font-bold hover:bg-white/90 transform hover:scale-105 transition-all"
                           >
                              Place on Canvas
                           </button>
                           <button 
                              onClick={() => setGeneratedImage(null)}
                              className="text-white/70 hover:text-white text-xs underline"
                           >
                              Discard
                           </button>
                       </div>
                   </div>
               )}
            </div>
        </>
        )}
      </div>
    </div>
  );
}
