'use client';
import { useState, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF, ContactShadows } from '@react-three/drei';
import { Check, X, RotateCw, Loader2, ZoomIn, ZoomOut, Settings2, Sun } from 'lucide-react';
import * as THREE from 'three';
import * as fabric from 'fabric';
import DraggableResizablePanel from '@/components/ui/DraggableResizablePanel';

interface ThreeDLayerEditorProps {
    modelUrl: string;
    existingObject?: fabric.Object; // The fabric object if editing an existing one
    onSave: (dataUrl: string, modelUrl: string) => void;
    onClose: () => void;
}

type CaptureGL = {
    domElement: HTMLCanvasElement;
    render: () => void;
    scene: THREE.Scene;
    camera: THREE.Camera;
    glInstance: THREE.WebGLRenderer;
};

const ModelViewer = ({ url, onGroundY }: { url: string; onGroundY?: (y: number) => void }) => {
    const { scene } = useGLTF(url);
    // Clone scene to avoid reusing same primitive if multiple viewers exist (though here unique)
    const clone = scene.clone();
    useEffect(() => {
        clone.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        if (onGroundY) {
            const bounds = new THREE.Box3().setFromObject(clone);
            const center = new THREE.Vector3();
            bounds.getCenter(center);
            const groundedY = bounds.min.y - center.y;
            onGroundY(groundedY);
        }
    }, [clone]);
    return <primitive object={clone} />;
};


export default function ThreeDLayerEditor({ modelUrl, existingObject, onSave, onClose }: ThreeDLayerEditorProps) {
    const [isLoading, setIsLoading] = useState(true);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [gl, setGl] = useState<CaptureGL | null>(null);
    const [resolution, setResolution] = useState<{width: number, height: number}>({ width: 2048, height: 2048 });
    const [showResSettings, setShowResSettings] = useState(false);
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
                // eslint-disable-next-line
                (camera as THREE.PerspectiveCamera).aspect = resolution.width / resolution.height;
                (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
                
                // Render
                renderer.render(scene, camera);
                
                // Capture
                const dataUrl = renderer.domElement.toDataURL('image/png', 1.0);
                
                // Restore
                renderer.setSize(originalSize.x, originalSize.y, false);
                // eslint-disable-next-line
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
            <DraggableResizablePanel
                className="bg-card rounded-xl shadow-2xl overflow-hidden border border-border"
                initialPosition={{ x: 140, y: 100 }}
                initialSize={{ width: 520, height: 620 }}
                minWidth={420}
                minHeight={520}
            >
                {/* Header */}
                <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30 draggable-handle cursor-move">
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

                    {/* Background Pattern */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none" 
                         style={{ backgroundImage: 'radial-gradient(#888 1px, transparent 1px)', backgroundSize: '20px 20px' }}
                    ></div>

                    <Canvas 
                        shadows
                        gl={{ preserveDrawingBuffer: true, alpha: true }} 
                        camera={{ position: [0, 0, 4], fov: 45 }}
                        onCreated={({ gl, scene, camera }) => {
                            gl.shadowMap.enabled = true;
                            gl.shadowMap.type = THREE.PCFSoftShadowMap;
                            setGl({ domElement: gl.domElement, render: () => gl.render(scene, camera), scene, camera, glInstance: gl });
                        }}
                    >
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
                        <Stage environment="city" intensity={0.6} adjustCamera={true} shadows={false}>
                            <ModelViewer url={modelUrl} onGroundY={setGroundY} />
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
            </DraggableResizablePanel>
        </div>
    );
}