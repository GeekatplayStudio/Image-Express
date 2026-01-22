'use client';
import { useState, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF } from '@react-three/drei';
import { Check, X, RotateCw, Loader2, ZoomIn, ZoomOut } from 'lucide-react';

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

    // Preload
    useEffect(() => {
        useGLTF.preload(modelUrl);
        setIsLoading(false);
    }, [modelUrl]);

    const handleCapture = () => {
        if (gl) {
            // Render one frame to ensure latest state
            gl.render(gl.scene, gl.camera);
            const dataUrl = gl.domElement.toDataURL('image/png', 1.0);
            onSave(dataUrl, modelUrl);
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
                    {/* Background Pattern */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none" 
                         style={{ backgroundImage: 'radial-gradient(#888 1px, transparent 1px)', backgroundSize: '20px 20px' }}
                    ></div>

                    <Canvas 
                        gl={{ preserveDrawingBuffer: true, alpha: true }} 
                        camera={{ position: [0, 0, 4], fov: 45 }}
                        onCreated={({ gl, scene, camera }) => {
                            setGl({ domElement: gl.domElement, render: () => gl.render(scene, camera), scene, camera });
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