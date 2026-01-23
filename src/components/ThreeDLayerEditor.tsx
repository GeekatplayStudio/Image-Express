'use client';
import { useState, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF } from '@react-three/drei';
import { Check, X, RotateCw, Loader2, ZoomIn, ZoomOut, Settings2 } from 'lucide-react';
import * as THREE from 'three';

interface ThreeDLayerEditorProps {
    modelUrl: string;
    existingObject?: any; // The fabric object if editing an existing one
    onSave: (dataUrl: string, modelUrl: string) => void;
    onClose: () => void;
}

const ModelViewer = ({ url }: { url: string }) => {
    const { scene } = useGLTF(url);
    // Clone scene to avoid reusing same primitive if multiple viewers exist (though here unique)
    const clone = scene.clone();
    return <primitive object={clone} />;
};

export default function ThreeDLayerEditor({ modelUrl, existingObject, onSave, onClose }: ThreeDLayerEditorProps) {
    const [isLoading, setIsLoading] = useState(true);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [gl, setGl] = useState<any>(null);
    const [resolution, setResolution] = useState<{width: number, height: number}>({ width: 2048, height: 2048 });
    const [showResSettings, setShowResSettings] = useState(false);

    useEffect(() => {
        if (existingObject) {
            // Try to infer desired resolution from the object on canvas
            // Use 2x scale factor for Retina/HighDPI quality by default
            const scaleX = existingObject.scaleX || 1;
            const scaleY = existingObject.scaleY || 1;
            const width = existingObject.width || 512;
            const height = existingObject.height || 512;
            
            const targetW = Math.max(Math.round(width * scaleX * 2), 1024);
            const targetH = Math.max(Math.round(height * scaleY * 2), 1024);
            
            setResolution({ width: targetW, height: targetH });
        }
    }, [existingObject]);

    // Preload
    useEffect(() => {
        useGLTF.preload(modelUrl);
        setIsLoading(false);
    }, [modelUrl]);

    const handleCapture = () => {
        if (gl && gl.glInstance) {
             const { glInstance: renderer, scene, camera } = gl;
             try {
                // Save original state
                const originalSize = new THREE.Vector2();
                renderer.getSize(originalSize);
                const originalAspect = (camera as THREE.PerspectiveCamera).aspect;
                
                // Resize for high-res capture
                renderer.setSize(resolution.width, resolution.height, false);
                (camera as THREE.PerspectiveCamera).aspect = resolution.width / resolution.height;
                (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
                
                // Render
                renderer.render(scene, camera);
                
                // Capture
                const dataUrl = renderer.domElement.toDataURL('image/png', 1.0);
                
                // Restore
                renderer.setSize(originalSize.x, originalSize.y, false);
                (camera as THREE.PerspectiveCamera).aspect = originalAspect;
                (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
                
                // Force sync render to restore view
                renderer.render(scene, camera);

                onSave(dataUrl, modelUrl);
             } catch (e) {
                 console.error("High-res capture failed", e);
                 // Fallback
                 gl.render();
                 const dataUrl = gl.domElement.toDataURL('image/png', 1.0);
                 onSave(dataUrl, modelUrl);
             }
        }
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card w-[500px] h-[600px] rounded-xl shadow-2xl flex flex-col overflow-hidden border border-border">
                {/* Header */}
                <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
                    <h3 className="font-semibold flex items-center gap-2">
                        <RotateCw size={18} className="text-primary" />
                        3D View Editor
                    </h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X size={20} />
                    </button>
                </div>

                {/* 3D Viewport */}
                <div className="flex-1 relative bg-secondary/20 checkerboard-bg">
                    
                    <div className="absolute top-2 right-2 z-10 flex flex-col items-end pointer-events-none">
                        <div className="pointer-events-auto flex flex-col items-end gap-1">
                            <button 
                                onClick={() => setShowResSettings(!showResSettings)}
                                className="flex items-center gap-1.5 px-2 py-1 bg-black/20 hover:bg-black/40 text-black dark:text-white rounded-md backdrop-blur-sm transition-colors text-[10px] font-medium border border-white/10"
                                title="Export Resolution Settings"
                            >
                                <Settings2 size={12} />
                                {resolution.width}x{resolution.height}
                            </button>
                            {showResSettings && (
                                <div className="bg-popover p-3 rounded-lg shadow-xl border border-border text-xs w-48 animate-in fade-in zoom-in-95 origin-top-right">
                                    <h4 className="font-semibold mb-2">Export Resolution</h4>
                                    <div className="grid grid-cols-2 gap-2 mb-3">
                                        <div>
                                            <label className="text-muted-foreground block mb-1 text-[10px] uppercase">Width</label>
                                            <input 
                                                type="number" 
                                                value={resolution.width} 
                                                onChange={e => {
                                                    const val = parseInt(e.target.value);
                                                    setResolution(p => ({...p, width: val, height: val}))
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
                                        {[512, 1024, 2048, 4096].map(size => (
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
                        </div>
                    </div>

                    {/* Background Pattern */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none" 
                         style={{ backgroundImage: 'radial-gradient(#888 1px, transparent 1px)', backgroundSize: '20px 20px' }}
                    ></div>

                    <Canvas 
                        gl={{ preserveDrawingBuffer: true, alpha: true }} 
                        camera={{ position: [0, 0, 4], fov: 45 }}
                        onCreated={({ gl, scene, camera }) => {
                            setGl({ domElement: gl.domElement, render: () => gl.render(scene, camera), scene, camera, glInstance: gl });
                        }}
                    >
                        <Stage environment="city" intensity={0.6} adjustCamera={true}>
                            <ModelViewer url={modelUrl} />
                        </Stage>
                        <OrbitControls makeDefault autoRotate={false} />
                    </Canvas>
                    
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-muted-foreground bg-background/80 px-3 py-1 rounded-full backdrop-blur">
                        Drag to Rotate • Scroll to Zoom
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="p-4 border-t border-border flex justify-end gap-3 bg-card">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleCapture}
                        className="px-6 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shadow-lg shadow-primary/20 flex items-center gap-2"
                    >
                        <Check size={16} />
                        {existingObject ? 'Update View' : 'Add to Canvas'}
                    </button>
                </div>
            </div>
        </div>
    );
}