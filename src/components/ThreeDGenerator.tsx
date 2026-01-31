'use client';

import { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { Loader2, Plus, RotateCw, Box, Settings2, Sun } from 'lucide-react';
import * as fabric from 'fabric';
import { getApiKey } from './SettingsModal';
import { BackgroundJob } from '@/types';
import { useDialog } from '@/providers/DialogProvider';
import { useToast } from '@/providers/ToastProvider';

interface ThreeDGeneratorProps {
    onAddToCanvas: (dataUrl: string, modelUrl?: string) => void;
    onClose: () => void;
    initialImage?: string; 
    onStartBackgroundJob?: (job: Partial<BackgroundJob>) => void; // Parent handles logic
    activeJob?: BackgroundJob | null; // Pass active job if it exists
}

type CaptureContext = {
    gl: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.Camera;
};

// Helper to capture Threejs context
const CaptureHelper = ({ controlRef }: { controlRef: React.MutableRefObject<CaptureContext | null> }) => {
    const { gl, scene, camera } = useThree();
    useEffect(() => {
        controlRef.current = { gl, scene, camera };
    }, [gl, scene, camera, controlRef]);
    return null;
};

// Component to render the GLTF Model
const ModelViewer = ({ url, onGroundY }: { url: string; onGroundY?: (y: number) => void }) => {
    const { scene } = useGLTF(url);
    useEffect(() => {
        scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        if (onGroundY) {
            const bounds = new THREE.Box3().setFromObject(scene);
            const center = new THREE.Vector3();
            bounds.getCenter(center);
            const groundedY = bounds.min.y - center.y;
            onGroundY(groundedY);
        }
    }, [scene]);
    return <primitive object={scene} />;
};


export default function ThreeDGenerator({ onAddToCanvas, onClose, initialImage, onStartBackgroundJob, activeJob }: ThreeDGeneratorProps) {
    const dialog = useDialog();
    const { toast } = useToast();
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const captureRef = useRef<CaptureContext | null>(null);
    const [resolution, setResolution] = useState<{width: number, height: number}>({ width: 2048, height: 2048 });
    const [showResSettings, setShowResSettings] = useState(false);
    const [mode, setMode] = useState<'text' | 'image'>(initialImage ? 'image' : 'text');
    const [showLightSettings, setShowLightSettings] = useState(false);
    const [lightPosition, setLightPosition] = useState<{ x: number; y: number; z: number }>({ x: 5, y: 5, z: 5 });
    const [lightIntensity, setLightIntensity] = useState(1.2);
    const [lightColor, setLightColor] = useState('#ffffff');
    const [castShadowEnabled, setCastShadowEnabled] = useState(true);
    const [castShadowBlur, setCastShadowBlur] = useState(22);
    const [castShadowIntensity, setCastShadowIntensity] = useState(0.35);
    const [contactShadowEnabled, setContactShadowEnabled] = useState(true);
    const [contactShadowBlur, setContactShadowBlur] = useState(8);
    const [contactShadowIntensity, setContactShadowIntensity] = useState(0.6);
    const [groundY, setGroundY] = useState(-1);

    
    // Use internal state OR prop state
    const jobStatus = activeJob?.status || '';
    const jobProgress = activeJob?.progress || 0;
    const modelUrl = activeJob?.resultUrl || null;
    const isJobRunning = activeJob?.status === 'IN_PROGRESS' || activeJob?.status === 'PENDING';

    useEffect(() => {
        if (activeJob) {
             const loading = activeJob.status === 'IN_PROGRESS' || activeJob.status === 'PENDING';
             // eslint-disable-next-line
             if (isLoading !== loading) setIsLoading(loading);
        } else {
            // eslint-disable-next-line
            if (isLoading) setIsLoading(false);
        }
    }, [activeJob, isLoading]);
    
    // Load API Key

    // Load API Key
    const [selectedProvider, setSelectedProvider] = useState<string>('meshy');
    // const [availableProviders, setAvailableProviders] = useState<string[]>([]); // Deprecated: Always show all
    const SUPPORTED_PROVIDERS = ['meshy', 'tripo', 'hitems'];
    const [hasSavedKey, setHasSavedKey] = useState(true); // Assume true initially to prevent flicker

    useEffect(() => {
        // Load persist selection
        if (typeof window === 'undefined') return;
        const savedProvider = localStorage.getItem('image-express-3d-provider');
        
        if (savedProvider && SUPPORTED_PROVIDERS.includes(savedProvider)) {
             // eslint-disable-next-line
             setSelectedProvider(prev => prev !== savedProvider ? savedProvider : prev);
        }
    }, []);

    // Check for key when provider changes
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const key = localStorage.getItem(`${selectedProvider}_api_key`);
        const hasKey = !!key;
        // eslint-disable-next-line
        setHasSavedKey(prev => prev !== hasKey ? hasKey : prev);
        setApiKey(''); // Clear manual input on switch
    }, [selectedProvider]);

    const getSelectedKey = () => {
         // Should use the centralized util to check params too if needed, but direct localstorage is fine here
         // Need to match STORAGE_KEYS from SettingsModal:
         // MESHY_API_KEY: 'meshy_api_key'
         // TRIPO_API_KEY: 'tripo_api_key'
         return localStorage.getItem(`${selectedProvider}_api_key`) || apiKey;
    };

    const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedProvider(e.target.value);
        localStorage.setItem('image-express-3d-provider', e.target.value);
    };

    const handleGenerate = async () => {
        let key = getSelectedKey();
        if (!key) {
            toast({
                title: 'Missing API key',
                description: `Configure API key for ${selectedProvider}.`,
                variant: 'warning'
            });
            return;
        }

        // Sanitize Globally: Remove 'Bearer', quotes, and surrounding whitespace
        key = key.replace(/Bearer /gi, '').replace(/["']/g, '').trim();
        
        console.log(`[ThreeDGenerator] Generating with provider: ${selectedProvider}`);
        console.log(`[ThreeDGenerator] Key prefix: ${key.substring(0, 5)}... (${key.length} chars)`);

        setIsLoading(true);

        try {
            // ... Logic branches based on Provider ...
            if (selectedProvider === 'meshy') {
                await generateMeshy(key);
            } else if (selectedProvider === 'tripo') {
                 // Tripo Integration
                 await generateTripo(key);
            } else {
                  toast({ title: 'Coming soon', description: 'Service integration in progress.', variant: 'warning' });
                 setIsLoading(false);
            }
        } catch (e) {
            console.error(e);
            setIsLoading(false);
        }
    };

    const generateMeshy = async (key: string) => {
        // reuse existing logic but wrapped
         let body: Record<string, unknown> = {};
            let endpoint = '';
            
            if (mode === 'text') {
                      if (!prompt) {
                          toast({ title: 'Missing prompt', description: 'Please enter a prompt.', variant: 'warning' });
                    setIsLoading(false);
                    return;
                }
                endpoint = 'text-to-3d';
                // Using Meshy V2 API Preview Mode (Cost: 5 credits)
                body = {
                    mode: "preview",
                    prompt: prompt,
                    // Deprecated parameters removed for Meshy-6
                    ai_model: "meshy-6", 
                    topology: "quad",
                    should_remesh: true
                };
            } else {
                // Image to 3D
                if (!initialImage) return;
                endpoint = 'image-to-3d';
                // Using Meshy V1 API
                body = {
                    image_url: initialImage, 
                    enable_pbr: true, 
                    should_texture: true, // Always texture
                    should_remesh: true,
                    ai_model: "meshy-6" 
                };
            }

            // Using local proxy to avoid CORS
            const res = await fetch(`/api/ai/meshy?endpoint=${endpoint}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            // ... (rest of fetch logic)
            const data = await res.json();
             // V2 returns 'result': 'id' string on creation often, or check 'id'
             const taskId = data.result || data.id;

             if (taskId) {
                if (onStartBackgroundJob) {
                    onStartBackgroundJob({
                        id: taskId,
                        type: mode === 'text' ? 'text-to-3d' : 'image-to-3d',
                        provider: 'meshy',
                        status: 'IN_PROGRESS',
                        prompt: mode === 'text' ? prompt : 'Image to 3D',
                        createdAt: Date.now(),
                        apiKey: key // Store key with job to poll correctly
                    });
                }
            } else {
                console.error("Meshy Error", data);
                toast({
                    title: 'Generation failed',
                    description: data.message || 'Unknown error',
                    variant: 'destructive'
                });
                setIsLoading(false);
            }
    };

    const generateTripo = async (key: string) => {
        let body: Record<string, unknown> = {};
        
        if (mode === 'text') {
                 if (!prompt) {
                     toast({ title: 'Missing prompt', description: 'Please enter a prompt.', variant: 'warning' });
                setIsLoading(false);
                return;
            }
            body = {
                type: "text_to_model",
                prompt: prompt
            };
        } else {
            // Image to 3D
            if (!initialImage) return;

            // Handle Base64 Data URL (Upload first)
            if (initialImage.startsWith('data:')) {
                // Convert Base64 to Blob
                try {
                    const fetchRes = await fetch(initialImage);
                    const blob = await fetchRes.blob();
                    
                    // Detect file extension from mime type
                    const mimeType = blob.type; 
                    let fileExt = 'png';
                    // Tripo expects 'jpg' for JPEGs
                    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') fileExt = 'jpg';
                    else if (mimeType === 'image/webp') fileExt = 'webp';

                    const formData = new FormData();
                    formData.append('file', blob, `image.${fileExt}`);

                    // Upload
                    const uploadRes = await fetch('/api/ai/tripo/upload', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${key}`
                        },
                        body: formData
                    });

                    const uploadJson = await uploadRes.json();
                    
                    if (uploadJson.code === 0 && uploadJson.data?.image_token) {
                         body = {
                            type: "image_to_model",
                            file: {
                                type: fileExt,
                                file_token: uploadJson.data.image_token
                            }
                        };
                    } else {
                        console.error("Tripo Upload fail:", uploadJson);
                        toast({
                            title: 'Upload failed',
                            description: uploadJson.message || 'Failed to upload image to Tripo.',
                            variant: 'destructive'
                        });
                        setIsLoading(false);
                        return;
                    }
                } catch (e) {
                     console.error("Failed to process image for upload", e);
                     toast({ title: 'Upload failed', description: 'Failed to process upload.', variant: 'destructive' });
                     setIsLoading(false);
                     return;
                }
            } else {
                // Public URL
                let fileExt = 'png';
                // Basic extension check, defaulting to png if unknown
                if (initialImage.toLowerCase().endsWith('.jpg') || initialImage.toLowerCase().endsWith('.jpeg')) {
                    fileExt = 'jpg';
                } else if (initialImage.toLowerCase().endsWith('.webp')) {
                    fileExt = 'webp';
                }
                
                body = {
                    type: "image_to_model",
                    file: {
                        type: fileExt,
                        url: initialImage
                    }
                };
            }
        }

        // Use local proxy to avoid CORS
        const res = await fetch(`/api/ai/tripo`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await res.json();
        
        if (data.code === 0 && data.data?.task_id) {
            if (onStartBackgroundJob) {
                onStartBackgroundJob({
                    id: data.data.task_id,
                    type: mode === 'text' ? 'text-to-3d' : 'image-to-3d',
                    provider: 'tripo',
                    status: 'IN_PROGRESS',
                    prompt: mode === 'text' ? prompt : 'Image to 3D',
                    createdAt: Date.now(),
                    apiKey: key
                });
            }
        } else {
             console.error("Tripo Start Error Response:", JSON.stringify(data, null, 2));
             // Fallback error extraction
             const errorMsg = data.message || (data.data?.code ? `Code: ${data.data.code}` : null) || data.error || 'Unknown error';
               toast({ title: 'Generation failed', description: errorMsg || 'Error starting Tripo generation.', variant: 'destructive' });
             setIsLoading(false);
        }
    };

    const handleCapture = () => {
        const state = captureRef.current;
        if (state && state.gl && state.scene && state.camera) {
             const { gl, scene, camera } = state;
             try {
                // Save original state
                const originalSize = new THREE.Vector2();
                gl.getSize(originalSize);
                const originalAspect = (camera as THREE.PerspectiveCamera).aspect;
                
                // Resize for high-res capture
                gl.setSize(resolution.width, resolution.height, false);
                (camera as THREE.PerspectiveCamera).aspect = resolution.width / resolution.height;
                (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
                
                // Render
                gl.render(scene, camera);
                
                // Capture
                const data = gl.domElement.toDataURL('image/png');
                
                // Restore
                gl.setSize(originalSize.x, originalSize.y, false);
                (camera as THREE.PerspectiveCamera).aspect = originalAspect;
                (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
                
                onAddToCanvas(data, modelUrl || undefined);
                return;
             } catch (e) {
                 console.error("High-res capture failed, falling back", e);
             }
        }

        const canvas = document.querySelector('#three-d-canvas canvas') as HTMLCanvasElement;
        if (canvas) {
            const data = canvas.toDataURL('image/png');
            onAddToCanvas(data, modelUrl || undefined);
        }
    };

    // Need to import Sparkles if I use it
    return (
        <div className="absolute top-4 left-4 z-50 bg-card/95 backdrop-blur-xl border border-border pb-4 rounded-xl shadow-2xl w-80 animate-in fade-in slide-in-from-left-4 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border/50 bg-secondary/20">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                     <Box size={16} className="text-purple-500" />
                    {initialImage ? 'Image to 3D' : 'AI 3D Generator'}
                </h3>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            {/* Service Selection */}
            {!isJobRunning && !modelUrl && (
                <div className="px-4 pt-3">
                    <label className="text-xs text-muted-foreground font-medium mb-1 block">Provider</label>
                    <select 
                        value={selectedProvider} 
                        onChange={handleProviderChange}
                        className="w-full text-xs p-2 rounded bg-secondary/50 border border-border focus:border-indigo-500 outline-none text-foreground dark:bg-zinc-950 bg-zinc-950"
                    >
                        {SUPPORTED_PROVIDERS.map(p => (
                            <option key={p} value={p} className="bg-zinc-950 text-white">{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                        ))}
                    </select>
                </div>
            )}

            <div className="p-4 space-y-4">

                    {!hasSavedKey && (
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">{selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)} API Key (Quick Input)</label>
                             <input 
                                type="password" 
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="sk-..."
                                className="w-full px-3 py-2 bg-secondary/50 rounded-md border border-border/50 text-sm"
                            />
                        </div>
                    )}

                {initialImage && (
                    <div className="space-y-2">
                         <div className="flex justify-center bg-black/10 p-2 rounded">
                            <img src={initialImage} className="max-h-24 rounded object-contain" alt="Source" />
                        </div>
                        
                        <p className="text-[10px] text-muted-foreground text-center">
                            Note: Meshy automatically isolates the subject. For best results, use images with clear contrast or transparent backgrounds.
                        </p>
                    </div>
                )}

                {!initialImage && (
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Prompt</label>
                        <textarea 
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="A cute ceramic cat..."
                            className="w-full px-3 py-2 bg-secondary/50 rounded-md border border-border/50 text-sm min-h-[80px]"
                        />
                    </div>
                )}

                <button 
                    onClick={handleGenerate}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-md font-medium text-sm hover:bg-primary/90 disabled:opacity-50"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={16}/> : <RotateCw size={16}/>}
                    {isLoading ? 'Generating...' : (initialImage ? 'Transform to 3D' : 'Generate 3D Model')}
                </button>
                {jobStatus && <p className="text-xs text-center text-muted-foreground">
                    {jobStatus === 'SUCCEEDED' ? 'Complete!' : 
                     jobStatus === 'FAILED' ? 'Failed' : 
                     `Generating... ${jobProgress}%`}
                </p>}

                {/* 3D Preview Area */}
                <div id="three-d-canvas" className="w-full aspect-square bg-black/5 rounded-lg overflow-hidden border border-border/30 relative">
                     {modelUrl ? (
                        <>
                            <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 items-end pointer-events-none">
                                <div className="pointer-events-auto flex flex-col items-end gap-1">
                                    <button 
                                        onClick={() => setShowResSettings(!showResSettings)}
                                        className="flex items-center gap-1.5 px-2 py-1 bg-black/20 hover:bg-black/40 text-white rounded-md backdrop-blur-sm transition-colors text-[10px] font-medium border border-white/10"
                                        title="Export Resolution Settings"
                                    >
                                        <Settings2 size={12} />
                                        {resolution.width}x{resolution.height}
                                    </button>
                                    {showResSettings && (
                                        <div className="bg-popover p-3 rounded-lg shadow-xl border border-border text-xs w-48 max-h-64 overflow-y-auto animate-in fade-in zoom-in-95 origin-top-right">
                                            <h4 className="font-semibold mb-2">Export Resolution</h4>
                                            <div className="grid grid-cols-2 gap-2 mb-3">
                                                <div>
                                                    <label className="text-muted-foreground block mb-1 text-[10px] uppercase">Width</label>
                                                    <input 
                                                        type="number" 
                                                        value={resolution.width} 
                                                        onChange={e => {
                                                            const val = parseInt(e.target.value);
                                                            setResolution(p => ({...p, width: val, height: val})) // Keep square by default? No, let's keep aspect ratio usually used for models? Canvas is square usually.
                                                        }}
                                                        className="w-full bg-muted px-2 py-1 rounded border border-border/50 text-right" 
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-muted-foreground block mb-1 text-[10px] uppercase">Height</label>
                                                    <input 
                                                        type="number" 
                                                        value={resolution.height} 
                                                        onChange={e => setResolution(p => ({...p, height: parseInt(e.target.value)}))}
                                                        className="w-full bg-muted px-2 py-1 rounded border border-border/50 text-right" 
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-1">
                                                {[512, 1024, 2048].map(size => (
                                                    <button 
                                                        key={size}
                                                        onClick={() => setResolution({width: size, height: size})} 
                                                        className={`px-2 py-1 rounded text-[10px] border transition-colors ${resolution.width === size ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted hover:bg-muted/80 border-transparent'}`}
                                                    >
                                                        {size}px
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => setShowLightSettings(!showLightSettings)}
                                        className="flex items-center gap-1.5 px-2 py-1 bg-black/20 hover:bg-black/40 text-white rounded-md backdrop-blur-sm transition-colors text-[10px] font-medium border border-white/10"
                                        title="Lighting Settings"
                                    >
                                        <Sun size={12} />
                                        Light
                                    </button>
                                    {showLightSettings && (
                                        <div className="bg-popover p-3 rounded-lg shadow-xl border border-border text-xs w-56 max-h-64 overflow-y-auto animate-in fade-in zoom-in-95 origin-top-right">
                                            <h4 className="font-semibold mb-2">Lighting</h4>
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] text-muted-foreground uppercase">Cast Shadow</span>
                                                    <div
                                                        className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors ${castShadowEnabled ? 'bg-primary' : 'bg-secondary'}`}
                                                        onClick={() => setCastShadowEnabled((prev) => !prev)}
                                                    >
                                                        <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${castShadowEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                                    </div>
                                                </div>
                                                {castShadowEnabled && (
                                                    <div className="space-y-2">
                                                        <div className="space-y-1">
                                                            <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                                                <span>Cast Blur</span>
                                                                <span>{castShadowBlur}</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="60"
                                                                step="1"
                                                                value={castShadowBlur}
                                                                onChange={(e) => setCastShadowBlur(parseInt(e.target.value))}
                                                                data-default="22"
                                                                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                                                <span>Cast Intensity</span>
                                                                <span>{castShadowIntensity.toFixed(2)}</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="1"
                                                                step="0.05"
                                                                value={castShadowIntensity}
                                                                onChange={(e) => setCastShadowIntensity(parseFloat(e.target.value))}
                                                                data-default="0.35"
                                                                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] text-muted-foreground uppercase">Contact Shadow</span>
                                                    <div
                                                        className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors ${contactShadowEnabled ? 'bg-primary' : 'bg-secondary'}`}
                                                        onClick={() => setContactShadowEnabled((prev) => !prev)}
                                                    >
                                                        <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${contactShadowEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                                    </div>
                                                </div>
                                                {contactShadowEnabled && (
                                                    <div className="space-y-2">
                                                        <div className="space-y-1">
                                                            <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                                                <span>Contact Blur</span>
                                                                <span>{contactShadowBlur}</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="20"
                                                                step="1"
                                                                value={contactShadowBlur}
                                                                onChange={(e) => setContactShadowBlur(parseInt(e.target.value))}
                                                                data-default="8"
                                                                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                                                <span>Contact Intensity</span>
                                                                <span>{contactShadowIntensity.toFixed(2)}</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="1"
                                                                step="0.05"
                                                                value={contactShadowIntensity}
                                                                onChange={(e) => setContactShadowIntensity(parseFloat(e.target.value))}
                                                                data-default="0.6"
                                                                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                                        <span>Color</span>
                                                        <span>{lightColor.toUpperCase()}</span>
                                                    </div>
                                                    <div className="relative h-6 w-full rounded border border-border flex items-center px-1 bg-background">
                                                        <div className="w-full h-4 rounded-sm border shadow-sm" style={{ backgroundColor: lightColor }} />
                                                        <input
                                                            type="color"
                                                            value={lightColor}
                                                            onChange={(e) => setLightColor(e.target.value)}
                                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                                        <span>Intensity</span>
                                                        <span>{lightIntensity.toFixed(2)}</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="5"
                                                        step="0.05"
                                                        value={lightIntensity}
                                                        onChange={(e) => setLightIntensity(parseFloat(e.target.value))}
                                                        data-default="1.2"
                                                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                                    />
                                                </div>
                                                {(['x', 'y', 'z'] as const).map((axis) => (
                                                    <div className="space-y-1" key={axis}>
                                                        <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                                            <span>Pos {axis.toUpperCase()}</span>
                                                            <span>{lightPosition[axis].toFixed(1)}</span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min="-10"
                                                            max="10"
                                                            step="0.1"
                                                            value={lightPosition[axis]}
                                                            onChange={(e) =>
                                                                setLightPosition((prev) => ({
                                                                    ...prev,
                                                                    [axis]: parseFloat(e.target.value)
                                                                }))
                                                            }
                                                            data-default="5"
                                                            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <Canvas
                                shadows
                                gl={{ preserveDrawingBuffer: true }}
                                camera={{ position: [0, 0, 4], fov: 50 }}
                                onCreated={({ gl }) => {
                                    gl.shadowMap.enabled = true;
                                    gl.shadowMap.type = THREE.PCFSoftShadowMap;
                                }}
                            >
                                <CaptureHelper controlRef={captureRef} />
                                <ambientLight intensity={0.35} />
                                {(() => {
                                    const shadowMapSize = Math.max(256, 2048 - castShadowBlur * 28);
                                    return (
                                        <directionalLight
                                            key={`shadow-${castShadowBlur}-${castShadowEnabled}`}
                                            position={[lightPosition.x, lightPosition.y, lightPosition.z]}
                                            intensity={lightIntensity}
                                            color={lightColor}
                                            castShadow={castShadowEnabled}
                                            shadow-mapSize-width={shadowMapSize}
                                            shadow-mapSize-height={shadowMapSize}
                                            shadow-radius={castShadowBlur * 1.5}
                                            shadow-bias={-0.0002}
                                            shadow-normalBias={0.02}
                                            shadow-camera-near={0.1}
                                            shadow-camera-far={20}
                                            shadow-camera-left={-3}
                                            shadow-camera-right={3}
                                            shadow-camera-top={3}
                                            shadow-camera-bottom={-3}
                                        />
                                    );
                                })()}
                                {castShadowEnabled && (
                                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY, 0]} receiveShadow>
                                        <planeGeometry args={[8, 8]} />
                                        <shadowMaterial opacity={castShadowIntensity} />
                                    </mesh>
                                )}
                                {contactShadowEnabled && (
                                    <ContactShadows
                                        position={[0, groundY + 0.02, 0]}
                                        scale={3.5}
                                        blur={contactShadowBlur}
                                        opacity={contactShadowIntensity}
                                        far={1.2}
                                        color="#000000"
                                    />
                                )}
                                <Stage environment="city" intensity={0.6} shadows={false}>
                                    <ModelViewer url={modelUrl} onGroundY={setGroundY} />
                                </Stage>
                                <OrbitControls makeDefault autoRotate />
                            </Canvas>
                        </>
                     ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                             Preview will appear here
                        </div>
                     )}
                     
                     {modelUrl && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                             <button 
                                onClick={handleCapture}
                                className="flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-full text-xs font-bold shadow-lg hover:scale-105 transition-transform"
                            >
                                <Plus size={12} /> Add to Canvas
                            </button>
                            <button
                                onClick={async () => {
                                    const confirmed = await dialog.confirm('Save generated 3D model to assets?', { title: 'Save 3D model' });
                                    if(confirmed) {
                                        try {
                                            const res = await fetch('/api/assets/save-url', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    url: modelUrl,
                                                    filename: prompt.slice(0, 15) || 'generated-3d',
                                                    type: 'models'
                                                })
                                            });
                                            if(res.ok) {
                                                toast({ title: 'Saved', description: 'Saved to assets.', variant: 'success' });
                                            } else {
                                                toast({ title: 'Save failed', description: 'Failed to save asset.', variant: 'destructive' });
                                            }
                                        } catch(e) { console.error(e); }
                                    }
                                }}
                                className="p-2 bg-secondary text-foreground rounded-full shadow-lg hover:bg-secondary/80 border border-border"
                                title="Save to Assets"
                            >
                                <Box size={14} />
                            </button>
                        </div>
                     )}
                </div>
            </div>
        </div>
    );
}
