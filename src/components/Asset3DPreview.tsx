'use client';

import React, { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2, RotateCcw, Sun } from 'lucide-react';
import { Center, Environment, OrbitControls, Resize, useGLTF } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { canRenderModelThumbnail } from '@/lib/modelThumbnail';

interface Asset3DPreviewProps {
    url: string;
    /** Optional filename used to warn for non-GLB formats */
    name?: string;
    className?: string;
    autoRotate?: boolean;
    enableZoom?: boolean;
}

function Model({ url }: { url: string }) {
    const { scene } = useGLTF(url);
    const clonedScene = useMemo(() => scene.clone(), [scene]);
    return (
        <Resize scale={3.5}>
            <Center>
                <primitive object={clonedScene} />
            </Center>
        </Resize>
    );
}

class ModelErrorBoundary extends Component<
    { children: ReactNode; onError: () => void },
    { hasError: boolean }
> {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch() {
        this.props.onError();
    }

    render() {
        if (this.state.hasError) return null;
        return this.props.children;
    }
}

export default function Asset3DPreview({
    url,
    name,
    className,
    autoRotate = true,
    enableZoom = true,
}: Asset3DPreviewProps) {
    const [showLightSettings, setShowLightSettings] = useState(false);
    const [lightPosition, setLightPosition] = useState({ x: 5, y: 5, z: 5 });
    const [lightIntensity, setLightIntensity] = useState(1.2);
    const [rotate, setRotate] = useState(autoRotate);
    const [failed, setFailed] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        setFailed(false);
        setReloadKey((value) => value + 1);
    }, [url]);

    const unsupported = Boolean(name && !canRenderModelThumbnail(name));

    if (unsupported) {
        return (
            <div className={`w-full h-full min-h-[220px] rounded-lg border border-border bg-secondary/20 flex flex-col items-center justify-center gap-2 text-muted-foreground p-4 ${className || ''}`}>
                <AlertTriangle size={22} className="text-amber-500" />
                <p className="text-xs text-center">Interactive preview supports GLB/GLTF. Convert or export this model to GLB for live 3D preview.</p>
            </div>
        );
    }

    if (failed) {
        return (
            <div className={`w-full h-full min-h-[220px] rounded-lg border border-border bg-secondary/20 flex flex-col items-center justify-center gap-3 text-muted-foreground p-4 ${className || ''}`}>
                <AlertTriangle size={22} className="text-destructive" />
                <p className="text-xs text-center">Could not load this 3D model.</p>
                <button
                    type="button"
                    onClick={() => { setFailed(false); setReloadKey((value) => value + 1); }}
                    className="h-8 px-3 rounded-md border border-border text-xs inline-flex items-center gap-1.5 hover:bg-secondary"
                >
                    <RotateCcw size={12} /> Retry
                </button>
            </div>
        );
    }

    return (
        <div className={`w-full h-full bg-slate-100 dark:bg-zinc-900 rounded-lg overflow-hidden shadow-xl border border-border relative ${className || ''}`}>
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground gap-2 pointer-events-none z-0">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-xs">Loading 3D…</span>
            </div>
            <div className="absolute top-2 right-2 z-20 flex flex-col items-end gap-1 pointer-events-none">
                <div className="pointer-events-auto flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => setRotate((prev) => !prev)}
                        className="flex items-center gap-1.5 px-2 py-1 bg-black/20 hover:bg-black/40 text-black dark:text-white rounded-md backdrop-blur-sm transition-colors text-[10px] font-medium border border-white/10"
                        title={rotate ? 'Pause auto-rotate' : 'Auto-rotate'}
                    >
                        {rotate ? 'Spin' : 'Still'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowLightSettings(!showLightSettings)}
                        className="flex items-center gap-1.5 px-2 py-1 bg-black/20 hover:bg-black/40 text-black dark:text-white rounded-md backdrop-blur-sm transition-colors text-[10px] font-medium border border-white/10"
                        title="Lighting Settings"
                    >
                        <Sun size={12} />
                        Light
                    </button>
                </div>
                {showLightSettings && (
                    <div className="pointer-events-auto bg-popover p-3 rounded-lg shadow-xl border border-border text-xs w-56 animate-in fade-in zoom-in-95 origin-top-right">
                        <h4 className="font-semibold mb-2">Lighting</h4>
                        <div className="space-y-3">
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
                                                [axis]: parseFloat(e.target.value),
                                            }))
                                        }
                                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <Canvas
                key={reloadKey}
                camera={{ position: [0, 0, 5], fov: 50 }}
                className="relative z-0"
                onCreated={({ gl }) => {
                    gl.domElement.addEventListener('webglcontextlost', () => setFailed(true), { once: true });
                }}
            >
                <Suspense fallback={null}>
                    <ambientLight intensity={0.35} />
                    <directionalLight
                        position={[lightPosition.x, lightPosition.y, lightPosition.z]}
                        intensity={lightIntensity}
                    />
                    <ModelErrorBoundary onError={() => setFailed(true)}>
                        <Model url={url} />
                    </ModelErrorBoundary>
                    <Environment preset="city" />
                    <OrbitControls
                        autoRotate={rotate}
                        autoRotateSpeed={3.2}
                        enableZoom={enableZoom}
                        minDistance={2}
                        maxDistance={12}
                    />
                </Suspense>
            </Canvas>
            <div className="absolute bottom-2 left-2 z-10 text-[10px] text-muted-foreground bg-background/70 border border-border rounded px-1.5 py-0.5 pointer-events-none">
                Drag orbit · Scroll zoom
            </div>
        </div>
    );
}
