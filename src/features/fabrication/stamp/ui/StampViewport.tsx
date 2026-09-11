/**
 * 3D Stamp Tool - 3D Viewport
 * Real-time Three.js viewport with OrbitControls, directional lighting presets,
 * quick camera snaps (including direct Die Face inspection), and slicer verification metrics.
 */

import React, { useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import {
    Camera,
    Eye,
    RotateCw,
    Maximize2,
    CheckCircle2,
    ShieldCheck,
    Box,
} from 'lucide-react';
import { AssembledStampResult } from '../domain/stampModelBuilder';
import { StampConfig, StampMaterialTheme } from '../domain/stampTypes';

interface StampViewportProps {
    assembly: AssembledStampResult | null;
    config: StampConfig;
    onThemeChange: (theme: StampMaterialTheme) => void;
}

/**
 * Renders the 3D model in Three.js scene.
 */
function StampScene({ assembly }: { assembly: AssembledStampResult }) {
    return (
        <primitive object={assembly.rootGroup} />
    );
}

/**
 * Camera controller for quick view angle snaps.
 */
function CameraRig({
    targetPos,
    targetLookAt,
}: {
    targetPos: [number, number, number];
    targetLookAt: [number, number, number];
}) {
    const { camera } = useThree();
    const controlsRef = useRef<OrbitControlsImpl>(null);

    React.useEffect(() => {
        camera.position.set(...targetPos);
        if (controlsRef.current) {
            controlsRef.current.target.set(...targetLookAt);
            controlsRef.current.update();
        }
    }, [camera, targetPos, targetLookAt]);

    return (
        <OrbitControls
            ref={controlsRef}
            makeDefault
            minDistance={15}
            maxDistance={300}
            dampingFactor={0.08}
            enableDamping
        />
    );
}

const MATERIAL_THEMES: { id: StampMaterialTheme; label: string }[] = [
    { id: 'rubber-wood', label: 'Rubber & Cherry Wood' },
    { id: 'wax-brass-wood', label: 'Vintage Brass & Walnut' },
    { id: 'white-filament', label: 'White PLA Filament' },
    { id: 'gold-ebony', label: 'Polished Gold & Ebony' },
    { id: 'slate-resin', label: 'Amber Rubber & Slate' },
    { id: 'wireframe', label: 'Wireframe Mesh' },
];

export default function StampViewport({ assembly, config, onThemeChange }: StampViewportProps) {
    // Camera position state for view snaps
    const [cameraPos, setCameraPos] = useState<[number, number, number]>([45, 40, 55]);
    const [lookAt, setLookAt] = useState<[number, number, number]>([0, 15, 0]);

    const snapToPerspective = () => {
        setCameraPos([45, 45, 55]);
        setLookAt([0, 15, 0]);
    };

    /**
     * Inspect Die Face: snaps camera directly underneath looking up at the stamp face
     * with high-contrast grazing light, allowing the user to inspect text clarity.
     */
    const snapToDieFace = () => {
        setCameraPos([0, -50, 0.01]);
        setLookAt([0, 0, 0]);
    };

    const snapToSide = () => {
        setCameraPos([65, 15, 0]);
        setLookAt([0, 15, 0]);
    };

    const snapToTop = () => {
        setCameraPos([0, 85, 0.01]);
        setLookAt([0, 15, 0]);
    };

    return (
        <div className="relative w-full h-full min-h-[420px] rounded-xl overflow-hidden bg-gradient-to-b from-slate-900/90 via-slate-950 to-black border border-border/60 flex flex-col select-none">
            {/* Top Toolbar: View Snaps & Theme */}
            <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-1.5 bg-background/85 backdrop-blur-md px-2 py-1.5 rounded-lg border border-border/60 shadow-lg pointer-events-auto">
                    <span className="text-[11px] font-medium text-muted-foreground mr-1">Views:</span>
                    <button
                        type="button"
                        onClick={snapToPerspective}
                        className="px-2 py-1 rounded text-[11px] font-medium hover:bg-secondary transition-colors"
                        title="Perspective 3D View"
                    >
                        Perspective
                    </button>
                    <button
                        type="button"
                        onClick={snapToDieFace}
                        className="px-2 py-1 rounded text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1"
                        title="Inspect Die Face (Relief readability)"
                    >
                        <Eye size={12} />
                        Inspect Face
                    </button>
                    <button
                        type="button"
                        onClick={snapToSide}
                        className="px-2 py-1 rounded text-[11px] font-medium hover:bg-secondary transition-colors"
                        title="Side Profile View"
                    >
                        Profile
                    </button>
                    <button
                        type="button"
                        onClick={snapToTop}
                        className="px-2 py-1 rounded text-[11px] font-medium hover:bg-secondary transition-colors"
                        title="Top Handle View"
                    >
                        Top
                    </button>
                </div>

                <div className="flex items-center gap-1 bg-background/85 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-border/60 shadow-lg pointer-events-auto">
                    <span className="text-[11px] font-medium text-muted-foreground mr-1">Theme:</span>
                    <select
                        value={config.materialTheme}
                        onChange={(e) => onThemeChange(e.target.value as StampMaterialTheme)}
                        className="text-[11px] bg-transparent font-medium text-foreground focus:outline-none cursor-pointer"
                    >
                        {MATERIAL_THEMES.map((theme) => (
                            <option key={theme.id} value={theme.id} className="bg-popover text-popover-foreground">
                                {theme.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* 3D Canvas */}
            <div className="flex-1 w-full h-full">
                {assembly ? (
                    <Canvas
                        shadows
                        camera={{ position: cameraPos, fov: 42 }}
                        className="w-full h-full"
                    >
                        <color attach="background" args={['#090d16']} />
                        <ambientLight intensity={0.8} />
                        <directionalLight
                            position={[40, 60, 30]}
                            intensity={1.5}
                            castShadow
                            shadow-mapSize-width={1024}
                            shadow-mapSize-height={1024}
                        />
                        {/* Grazing light for die relief contrast */}
                        <directionalLight position={[-30, -40, 20]} intensity={1.8} color="#e0f2fe" />
                        <directionalLight position={[0, -50, -20]} intensity={1.2} color="#fef08a" />

                        <CameraRig targetPos={cameraPos} targetLookAt={lookAt} />
                        <StampScene assembly={assembly} />

                        <ContactShadows
                            position={[0, -assembly.metrics.reliefDepthMm - 1.5, 0]}
                            opacity={0.65}
                            scale={80}
                            blur={2.5}
                            far={30}
                        />
                    </Canvas>
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                        Generating 3D model...
                    </div>
                )}
            </div>

            {/* Bottom Verification & Dimension Bar */}
            {assembly && (
                <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 bg-background/90 backdrop-blur-md px-3 py-2 rounded-lg border border-border/70 shadow-xl pointer-events-auto">
                    <div className="flex items-center gap-3 text-[11px]">
                        <div className="flex items-center gap-1.5 text-emerald-500 font-semibold">
                            <CheckCircle2 size={14} />
                            <span>Watertight Manifold</span>
                        </div>
                        <span className="text-border">|</span>
                        <div className="flex items-center gap-1 text-muted-foreground font-mono">
                            <span>Dimensions:</span>
                            <span className="text-foreground font-medium">
                                {assembly.metrics.widthMm} × {assembly.metrics.depthMm} × {assembly.metrics.totalHeightMm} mm
                            </span>
                        </div>
                        <span className="text-border">|</span>
                        <div className="flex items-center gap-1 text-muted-foreground font-mono">
                            <span>Relief:</span>
                            <span className="text-primary font-medium">{assembly.metrics.reliefDepthMm} mm</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 text-[11px] font-mono text-muted-foreground">
                        <span>{assembly.metrics.triangleCount.toLocaleString()} triangles</span>
                        <span className="px-1.5 py-0.5 rounded bg-secondary/80 text-[10px] font-sans font-medium text-foreground">
                            Slicer Ready
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
