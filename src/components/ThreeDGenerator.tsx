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
        if (activeJob && !isLoading) {
             setIsLoading(isJobRunning);
        }
    }, [activeJob]);
    
    // Load API Key
    useEffect(() => {
        const key = getApiKey('meshy');
        if (key) setApiKey(key);
    }, []);

    const handleGenerate = async () => {
        if (!apiKey) {
            alert('Please enter API Key');
            return;
        }

        setIsLoading(true);
        // setStatus('Starting generation...'); // Handled by prop now

        try {
            let body = {};
            let endpoint = '';
            
            if (mode === 'text') {
                 if (!prompt) {
                    alert('Please enter prompt');
                    setIsLoading(false);
                    return;
                }
                endpoint = 'text-to-3d';
                body = {
                    mode: "preview",
                    prompt: prompt,
                    art_style: "realistic",
                    negative_prompt: "low quality, low res",
                    ai_model: "latest", // Meshy 6
                    topology: "quad",
                    should_remesh: true
                };
            } else {
                // Image to 3D
                if (!initialImage) return;
                endpoint = 'image-to-3d';
                body = {
                    image_url: initialImage, 
                    enable_pbr: true, // High res texture maps
                    should_texture: true,
                    should_remesh: true,
                    ai_model: "latest" // Meshy 6
                };
            }

            // Using openapi/v1 as per documentation for latest features
            const res = await fetch(`https://api.meshy.ai/openapi/v1/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            const data = await res.json();
            if (data.result) {
                // Pass back to parent to manage state
                onStartBackgroundJob?.({
                    id: data.result,
                    type: mode === 'text' ? 'text-to-3d' : 'image-to-3d',
                    status: 'PENDING',
                    progress: 0,
                    prompt: mode === 'text' ? prompt : 'Image Conversion',
                    apiKey: apiKey,
                    createdAt: Date.now()
                });
            } else {
                throw new Error(data.message || 'Failed to start. Note: For Image-to-3D, Meshy requires a public accessible URL, not a local data URL.');
            }
        } catch (e: any) {
            console.error(e);
            alert('Error: ' + e.message);
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

            <div className="p-4 space-y-4">
                 <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Meshy API Key</label>
                    <input 
                        type="password" 
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-..."
                        className="w-full px-3 py-2 bg-secondary/50 rounded-md border border-border/50 text-sm"
                    />
                </div>

                {initialImage && (
                    <div className="space-y-2">
                         <div className="flex justify-center bg-black/10 p-2 rounded">
                            <img src={initialImage} className="max-h-24 rounded object-contain" alt="Source" />
                        </div>
                        <p className="text-[10px] text-muted-foreground text-center">
                            Note: Meshy automatically isolates the subject. For best results, use images with clear contrast or transparent backgrounds.
                            <br/><span className="text-primary font-medium">✨ High-Res & PBR Enabled</span>
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
