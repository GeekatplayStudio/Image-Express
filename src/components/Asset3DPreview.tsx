'use client';

import { useGLTF, Center, OrbitControls, Environment, Resize } from '@react-three/drei';
import { Suspense, useMemo, useState } from 'react';
import { Sun } from 'lucide-react';
import { Canvas } from '@react-three/fiber';

interface Asset3DPreviewProps {
    url: string;
}

function Model({ url }: { url: string }) {
    const { scene } = useGLTF(url);
    const clonedScene = useMemo(() => scene.clone(), [scene]);

    // Resize normalizes the object to size 1, then we scale it up
    return (
        <Resize scale={3.5}>
            <Center>
                <primitive object={clonedScene} />
            </Center>
        </Resize>
    );
}

export default function Asset3DPreview({ url }: Asset3DPreviewProps) {
    const [showLightSettings, setShowLightSettings] = useState(false);
    const [lightPosition, setLightPosition] = useState<{ x: number; y: number; z: number }>({ x: 5, y: 5, z: 5 });
    const [lightIntensity, setLightIntensity] = useState(1.2);

    return (
        <div className="w-full h-full bg-slate-100 rounded-lg overflow-hidden shadow-xl border border-border relative">
            <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1 pointer-events-none">
                <div className="pointer-events-auto flex flex-col items-end gap-1">
                    <button
                        onClick={() => setShowLightSettings(!showLightSettings)}
                        className="flex items-center gap-1.5 px-2 py-1 bg-black/20 hover:bg-black/40 text-black dark:text-white rounded-md backdrop-blur-sm transition-colors text-[10px] font-medium border border-white/10"
                        title="Lighting Settings"
                    >
                        <Sun size={12} />
                        Light
                    </button>
                    {showLightSettings && (
                        <div className="bg-popover p-3 rounded-lg shadow-xl border border-border text-xs w-56 animate-in fade-in zoom-in-95 origin-top-right">
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

            <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
                <Suspense fallback={null}>
                    <ambientLight intensity={0.35} />
                    <directionalLight
                        position={[lightPosition.x, lightPosition.y, lightPosition.z]}
                        intensity={lightIntensity}
                    />
                    
                    <Model url={url} />
                    
                    <Environment preset="city" />
                    <OrbitControls autoRotate autoRotateSpeed={4} enableZoom={false} />
                </Suspense>
            </Canvas>
        </div>
    );
}
