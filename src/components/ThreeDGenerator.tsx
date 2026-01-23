'use client';

import { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Loader2, Plus, RotateCw, Box } from 'lucide-react';
import * as fabric from 'fabric';
import { getApiKey } from './SettingsModal';
import { BackgroundJob } from '@/types';

interface ThreeDGeneratorProps {
    onAddToCanvas: (dataUrl: string, modelUrl?: string) => void;
    onClose: () => void;
    initialImage?: string; 
    onStartBackgroundJob?: (job: Partial<BackgroundJob>) => void; // Parent handles logic
    activeJob?: BackgroundJob | null; // Pass active job if it exists
}

// Component to render the GLTF Model
const ModelViewer = ({ url }: { url: string }) => {
    const { scene } = useGLTF(url);
    return <primitive object={scene} />;
};

export default function ThreeDGenerator({ onAddToCanvas, onClose, initialImage, onStartBackgroundJob, activeJob }: ThreeDGeneratorProps) {
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [mode, setMode] = useState<'text' | 'image'>(initialImage ? 'image' : 'text');
    
    // Use internal state OR prop state
    const jobStatus = activeJob?.status || '';
    const jobProgress = activeJob?.progress || 0;
    const modelUrl = activeJob?.resultUrl || null;
    const isJobRunning = activeJob?.status === 'IN_PROGRESS' || activeJob?.status === 'PENDING';

    useEffect(() => {
        if (activeJob) {
             setIsLoading(activeJob.status === 'IN_PROGRESS' || activeJob.status === 'PENDING');
        } else {
             setIsLoading(false);
        }
    }, [activeJob]);
    
    // Load API Key

    // Load API Key
    const [selectedProvider, setSelectedProvider] = useState<string>('meshy');
    // const [availableProviders, setAvailableProviders] = useState<string[]>([]); // Deprecated: Always show all
    const SUPPORTED_PROVIDERS = ['meshy', 'tripo', 'hitems'];
    const [hasSavedKey, setHasSavedKey] = useState(true); // Assume true initially to prevent flicker

    useEffect(() => {
        // Load persist selection
        const savedProvider = localStorage.getItem('image-express-3d-provider');
        
        if (savedProvider && SUPPORTED_PROVIDERS.includes(savedProvider)) {
            setSelectedProvider(savedProvider);
        }
    }, []);

    // Check for key when provider changes
    useEffect(() => {
        const key = localStorage.getItem(`${selectedProvider}_api_key`);
        setHasSavedKey(!!key);
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
            alert(`Please configure API Key for ${selectedProvider} in settings or enter it below`);
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
                 alert("Service integration in progress");
                 setIsLoading(false);
            }
        } catch (e) {
            console.error(e);
            setIsLoading(false);
        }
    };

    const generateMeshy = async (key: string) => {
        // reuse existing logic but wrapped
         let body = {};
            let endpoint = '';
            
            if (mode === 'text') {
                 if (!prompt) {
                    alert('Please enter prompt');
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
                alert("Error starting generation: " + (data.message || 'Unknown error'));
                setIsLoading(false);
            }
    };

    const generateTripo = async (key: string) => {
        let body: any = {};
        
        if (mode === 'text') {
             if (!prompt) {
                alert('Please enter prompt');
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
                        alert("Failed to upload image to Tripo. Error: " + (uploadJson.message || 'Unknown'));
                        setIsLoading(false);
                        return;
                    }
                } catch (e) {
                     console.error("Failed to process image for upload", e);
                     alert("Failed to process upload: " + String(e));
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
             alert(`Error starting Tripo generation: ${errorMsg}`);
             setIsLoading(false);
        }
    };

    const handleCapture = () => {
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
                        className="w-full text-xs p-2 rounded bg-secondary/50 border border-border focus:border-indigo-500 outline-none"
                    >
                        {SUPPORTED_PROVIDERS.map(p => (
                            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
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
                        <Canvas gl={{ preserveDrawingBuffer: true }} camera={{ position: [0, 0, 4], fov: 50 }}>
                            <Stage environment="city" intensity={0.6}>
                                <ModelViewer url={modelUrl} />
                            </Stage>
                            <OrbitControls makeDefault autoRotate />
                        </Canvas>
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
                                    if(confirm('Save generated 3D model to assets?')) {
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
                                            if(res.ok) alert('Saved to assets!');
                                            else alert('Failed to save');
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
