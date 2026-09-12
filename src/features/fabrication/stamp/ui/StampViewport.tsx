/**
 * 3D Stamp Tool - 3D Viewport
 * Real-time Three.js viewport with OrbitControls, directional lighting presets,
 * quick camera snaps (including direct Die Face inspection), and slicer verification metrics.
 */

import React, { useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Eye, EyeOff, Layers, CheckCircle2, AlertTriangle, Download, Maximize2, Minimize2, Grid } from 'lucide-react';
import { AssembledStampResult } from '../domain/stampModelBuilder';
import { StampConfig, StampMaterialTheme } from '../domain/stampTypes';

interface StampViewportProps {
    assembly: AssembledStampResult | null;
    config: StampConfig;
    onThemeChange: (theme: StampMaterialTheme) => void;
    imprintDataUrl?: string;
    showPlatform?: boolean;
    onTogglePlatform?: () => void;
    showStampPodium?: boolean;
    onToggleStampPodium?: () => void;
}

/**
 * Renders the 3D model in Three.js scene with optional podium/handle visibility.
 */
function StampScene({
    assembly,
    showStampPodium = true,
}: {
    assembly: AssembledStampResult;
    showStampPodium?: boolean;
}) {
    // The die always renders; the podium and handle are attached only while shown, so the
    // scene graph stays the source of truth instead of mutating meshes held in props.
    // `dispose={null}` because the builder owns these meshes - the exporters reuse the same
    // geometries, so unmounting a hidden podium must not free them.
    return (
        <group>
            <primitive object={assembly.dieMesh} dispose={null} />
            {showStampPodium && <primitive object={assembly.podiumMesh} dispose={null} />}
            {showStampPodium && assembly.handleMesh && (
                <primitive object={assembly.handleMesh} dispose={null} />
            )}
        </group>
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

/**
 * Real Slicer Print Bed / Studio Build Plate
 * Positioned exactly under the stamp at floorY.
 */
function BuildPlate({
    floorY,
    widthMm,
    depthMm,
}: {
    floorY: number;
    widthMm: number;
    depthMm: number;
}) {
    const plateSize = Math.max(100, Math.max(widthMm, depthMm) * 2.2);
    const divisions = Math.max(10, Math.round(plateSize / 10));

    return (
        <group position={[0, floorY, 0]}>
            {/* Base plate slab */}
            <mesh position={[0, -0.6, 0]} receiveShadow>
                <boxGeometry args={[plateSize, 1.2, plateSize]} />
                <meshStandardMaterial color="#1e293b" metalness={0.65} roughness={0.35} />
            </mesh>
            {/* Top bed surface (frosted build sheet) */}
            <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[plateSize, plateSize]} />
                <meshStandardMaterial color="#0b0f19" roughness={0.7} metalness={0.2} />
            </mesh>
            {/* 10mm Major Grid overlay */}
            <gridHelper
                args={[plateSize, divisions, '#38bdf8', '#334155']}
                position={[0, 0.03, 0]}
            />
        </group>
    );
}

export interface StampViewportHandle {
    snapToDieFace: () => void;
    snapToPerspective: () => void;
    snapToSide: () => void;
    snapToTop: () => void;
}

const StampViewport = React.forwardRef<StampViewportHandle, StampViewportProps>(function StampViewport({
    assembly,
    config,
    onThemeChange,
    imprintDataUrl,
    showPlatform: externalShowPlatform,
    onTogglePlatform: externalTogglePlatform,
    showStampPodium: externalShowStampPodium,
    onToggleStampPodium: externalToggleStampPodium,
}: StampViewportProps, ref) {
    const floorY = -(config.dimensions.basePlateThicknessMm + config.dimensions.reliefDepthMm);

    // Camera position state for view snaps
    const [cameraPos, setCameraPos] = useState<[number, number, number]>([45, 35, 50]);
    const [lookAt, setLookAt] = useState<[number, number, number]>([0, 8, 0]);
    const [isStencilExpanded, setIsStencilExpanded] = useState(false);

    // Internal state fallbacks if external state not provided
    const [internalShowPlatform, setInternalShowPlatform] = useState<boolean>(true);
    const [internalShowStampPodium, setInternalShowStampPodium] = useState<boolean>(true);

    const showPlatform = externalShowPlatform !== undefined ? externalShowPlatform : internalShowPlatform;
    const handleTogglePlatform = () => {
        if (externalTogglePlatform) {
            externalTogglePlatform();
        } else {
            setInternalShowPlatform((prev) => !prev);
        }
    };

    const showStampPodium = externalShowStampPodium !== undefined ? externalShowStampPodium : internalShowStampPodium;
    const handleToggleStampPodium = () => {
        if (externalToggleStampPodium) {
            externalToggleStampPodium();
        } else {
            setInternalShowStampPodium((prev) => !prev);
        }
    };

    const canvasContainerRef = useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const el = canvasContainerRef.current;
        if (!el) return;
        const stopPropagation = (e: Event) => {
            e.stopPropagation();
        };
        el.addEventListener('mousedown', stopPropagation);
        el.addEventListener('pointerdown', stopPropagation);
        el.addEventListener('wheel', stopPropagation, { passive: true });
        return () => {
            el.removeEventListener('mousedown', stopPropagation);
            el.removeEventListener('pointerdown', stopPropagation);
            el.removeEventListener('wheel', stopPropagation);
        };
    }, []);

    const snapToPerspective = () => {
        setCameraPos([45, 35, 50]);
        setLookAt([0, 8, 0]);
    };

    /**
     * Inspect Die Face: snaps camera directly underneath looking up at the contact bottom,
     * and automatically removes the platform so user can see under the stamp unobstructed.
     */
    const snapToDieFace = () => {
        if (showPlatform) {
            handleTogglePlatform();
        }
        setCameraPos([0, floorY - 35, 12]);
        setLookAt([0, floorY, 0]);
    };

    const snapToSide = () => {
        setCameraPos([60, floorY + 8, 0]);
        setLookAt([0, floorY + 8, 0]);
    };

    const snapToTop = () => {
        setCameraPos([0, 85, 0.01]);
        setLookAt([0, 15, 0]);
    };

    React.useImperativeHandle(ref, () => ({
        snapToDieFace,
        snapToPerspective,
        snapToSide,
        snapToTop,
    }));

    return (
        <div className="relative w-full h-full min-h-[420px] rounded-xl overflow-hidden bg-gradient-to-b from-slate-900 via-slate-950 to-zinc-950 border border-border/60 flex flex-col select-none">
            {/* Top Toolbar: View Snaps, Plate Visibility Toggles & Theme */}
            <div className="absolute top-2.5 left-2.5 right-2.5 z-10 flex items-center justify-between pointer-events-none gap-2 flex-wrap">
                {/* Left: Camera Angles & Quick Snaps */}
                <div className="flex items-center gap-1 bg-background/90 backdrop-blur-md px-2 py-1 rounded-lg border border-border/70 shadow-lg pointer-events-auto">
                    <span className="text-[10px] font-semibold text-muted-foreground mr-0.5 uppercase tracking-wider">Angle:</span>
                    <button
                        type="button"
                        onClick={snapToPerspective}
                        className="px-2 py-0.5 rounded text-[11px] font-medium hover:bg-secondary transition-colors"
                        title="Perspective 3D View"
                    >
                        3D Angle
                    </button>
                    <button
                        type="button"
                        onClick={snapToDieFace}
                        className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30 transition-colors flex items-center gap-1.5"
                        title="Inspect Die Bottom Face (Hides build plate and snaps camera directly underneath)"
                    >
                        <Eye size={12} />
                        Inspect Bottom (See Under)
                    </button>
                    <button
                        type="button"
                        onClick={snapToSide}
                        className="px-2 py-0.5 rounded text-[11px] font-medium hover:bg-secondary transition-colors"
                        title="Side Profile View"
                    >
                        Side Profile
                    </button>
                    <button
                        type="button"
                        onClick={snapToTop}
                        className="px-2 py-0.5 rounded text-[11px] font-medium hover:bg-secondary transition-colors"
                        title="Top Handle View"
                    >
                        Top
                    </button>
                </div>

                {/* Right: Plate Visibility Toggles & Material Theme */}
                <div className="flex items-center gap-1.5 pointer-events-auto flex-wrap">
                    {/* Slicer Build Bed Plate Toggle */}
                    <button
                        type="button"
                        onClick={handleTogglePlatform}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-md border ${
                            showPlatform
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/60 hover:bg-amber-500/30'
                        }`}
                        title={showPlatform ? 'Hide 3D Slicer Build Bed to see underneath the stamp' : 'Show 3D Slicer Build Bed'}
                    >
                        {showPlatform ? <Grid size={13} /> : <EyeOff size={13} />}
                        {showPlatform ? 'Build Plate: ON' : 'Build Plate: OFF (Hidden)'}
                    </button>

                    {/* Stamp Backing Base Plate (Podium) Toggle */}
                    <button
                        type="button"
                        onClick={handleToggleStampPodium}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-md border ${
                            showStampPodium
                                ? 'bg-background/90 text-foreground border-border/70 hover:bg-secondary'
                                : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 hover:bg-cyan-500/30'
                        }`}
                        title={showStampPodium ? 'Hide stamp backing podium and handle to view relief die only' : 'Show stamp backing podium and handle'}
                    >
                        <Layers size={13} />
                        {showStampPodium ? 'Stamp Base: ON' : 'Stamp Base: OFF (Die Only)'}
                    </button>

                    {/* Material Theme */}
                    <div className="flex items-center gap-1 bg-background/90 backdrop-blur-md px-2 py-1 rounded-lg border border-border/70 shadow-md">
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
            </div>

            {/* 3D Canvas */}
            <div
                ref={canvasContainerRef}
                className="flex-1 w-full h-full relative pointer-events-auto select-none"
                style={{ touchAction: 'none' }}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
            >
                {assembly ? (
                    <Canvas
                        shadows
                        camera={{ position: cameraPos, fov: 42 }}
                        className="w-full h-full"
                    >
                        <color attach="background" args={['#0e131f']} />
                        {/* High-Clarity Studio Lighting Rig */}
                        <ambientLight intensity={1.1} />
                        {/* Top Key Light casting crisp shadows onto the build plate */}
                        <directionalLight
                            position={[45, 80, 45]}
                            intensity={2.2}
                            castShadow
                            shadow-mapSize-width={2048}
                            shadow-mapSize-height={2048}
                            shadow-bias={-0.0001}
                        />
                        {/* Cool fill light preventing pitch-black shadows */}
                        <directionalLight position={[-45, 60, -35]} intensity={1.3} color="#f8fafc" />
                        {/* Dedicated Relief Face Illuminator: illuminates touching bottom on plate brightly */}
                        <directionalLight position={[0, floorY - 30, 20]} intensity={2.8} color="#ffffff" />
                        {/* Edge Specular Rim Light */}
                        <directionalLight position={[0, 30, -60]} intensity={1.8} color="#e0f2fe" />

                        <CameraRig targetPos={cameraPos} targetLookAt={lookAt} />
                        <StampScene assembly={assembly} />

                        {/* Real Slicer Build Plate with millimeter grid (Can be removed to see under) */}
                        {showPlatform && (
                            <BuildPlate
                                floorY={floorY}
                                widthMm={config.dimensions.widthMm}
                                depthMm={config.dimensions.depthMm}
                            />
                        )}

                        {showPlatform && (
                            <ContactShadows
                                position={[0, floorY + 0.05, 0]}
                                opacity={0.7}
                                scale={Math.max(80, config.dimensions.widthMm * 2)}
                                blur={2.0}
                                far={25}
                            />
                        )}
                    </Canvas>
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                        Generating 3D model...
                    </div>
                )}
            </div>

            {/* Real-time stencil / imprint overlay */}
            {imprintDataUrl && (
                <div
                    className={`absolute bottom-11 right-2.5 z-20 flex flex-col bg-background/90 backdrop-blur-md rounded-xl border border-border/70 shadow-2xl p-2 select-none pointer-events-auto transition-all duration-200 ${
                        isStencilExpanded ? 'w-56' : 'w-36'
                    }`}
                >
                    <div className="flex items-center justify-between gap-1 mb-1.5 pb-1 border-b border-border/50">
                        <div className="flex items-center gap-1 min-w-0">
                            <span className="w-2 h-2 rounded-full bg-black border border-white/40 shrink-0" />
                            <span className="text-[10px] font-semibold text-foreground truncate">
                                Stencil Preview
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setIsStencilExpanded((prev) => !prev)}
                                className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                title={isStencilExpanded ? 'Collapse' : 'Expand'}
                            >
                                {isStencilExpanded ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                            </button>
                            <a
                                href={imprintDataUrl}
                                download="stamp-stencil-mask.png"
                                className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                title="Download Stencil Mask (PNG)"
                            >
                                <Download size={11} />
                            </a>
                        </div>
                    </div>

                    {/* Stencil Canvas on Light / Checkerboard */}
                    <div
                        className={`relative rounded-lg overflow-hidden border border-border/60 bg-white flex items-center justify-center p-1 transition-all duration-200 ${
                            isStencilExpanded ? 'h-48' : 'h-28'
                        }`}
                        style={{
                            backgroundImage:
                                'linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)',
                            backgroundSize: '12px 12px',
                            backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0',
                        }}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={imprintDataUrl}
                            alt="Stamp Stencil Preview"
                            className="w-full h-full object-contain pointer-events-none filter drop-shadow-xs"
                        />
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[9px] text-muted-foreground">
                        <span className="truncate">Black = Relief</span>
                        <span className="font-mono text-primary font-bold">
                            {(config.artwork.lineThickening ?? 0) > 0 ? `+${config.artwork.lineThickening}px` : 'Norm'}
                        </span>
                    </div>
                </div>
            )}

            {/* Floating Status Banners if either plate is hidden */}
            {(!showPlatform || !showStampPodium) && (
                <div className="absolute bottom-12 left-2.5 z-20 flex flex-col gap-1.5 pointer-events-auto max-w-[280px]">
                    {!showPlatform && (
                        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-amber-950/85 text-amber-200 border border-amber-500/50 shadow-lg text-[10px] backdrop-blur-md">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <EyeOff size={13} className="text-amber-400 shrink-0" />
                                <span className="truncate">Build Bed hidden (underneath view)</span>
                            </div>
                            <button
                                type="button"
                                onClick={handleTogglePlatform}
                                className="px-2 py-0.5 rounded font-semibold bg-amber-500/30 hover:bg-amber-500/50 text-amber-100 border border-amber-400/40 shrink-0 transition-colors"
                            >
                                Show Bed
                            </button>
                        </div>
                    )}
                    {!showStampPodium && (
                        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-cyan-950/85 text-cyan-200 border border-cyan-500/50 shadow-lg text-[10px] backdrop-blur-md">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <Layers size={13} className="text-cyan-400 shrink-0" />
                                <span className="truncate">Stamp Base hidden (Die Only)</span>
                            </div>
                            <button
                                type="button"
                                onClick={handleToggleStampPodium}
                                className="px-2 py-0.5 rounded font-semibold bg-cyan-500/30 hover:bg-cyan-500/50 text-cyan-100 border border-cyan-400/40 shrink-0 transition-colors"
                            >
                                Show Base
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Bottom Verification & Dimension Bar */}
            {assembly && (
                <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10 flex flex-wrap items-center justify-between gap-2 bg-background/85 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-border/50 shadow-lg text-[10px] pointer-events-auto">
                    <div className="flex items-center gap-2">
                        <div
                            className={`flex items-center gap-1 font-medium ${
                                assembly.metrics.isManifold ? 'text-emerald-500' : 'text-amber-500'
                            }`}
                            title={
                                assembly.metrics.isManifold
                                    ? 'Every part is a closed shell wound outwards — ready to slice'
                                    : 'A part is not a closed outward-facing solid; slicers may need to repair it'
                            }
                        >
                            {assembly.metrics.isManifold ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                            <span>{assembly.metrics.isManifold ? 'Watertight' : 'Check Mesh'}</span>
                        </div>
                        <span className="text-border">|</span>
                        <div className="font-mono text-muted-foreground">
                            <span className="text-foreground font-medium">
                                {assembly.metrics.widthMm}×{assembly.metrics.depthMm}×{assembly.metrics.totalHeightMm}mm
                            </span>
                        </div>
                        <span className="text-border">|</span>
                        <div className="font-mono text-muted-foreground">
                            Relief: <span className="text-primary font-medium">{assembly.metrics.reliefDepthMm}mm</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-muted-foreground">
                        <span title="Solid volume of all printed parts">
                            {(assembly.metrics.solidVolumeMm3 / 1000).toFixed(1)} cm³
                        </span>
                        <span>{assembly.metrics.triangleCount.toLocaleString()} tris</span>
                    </div>
                </div>
            )}
        </div>
    );
});

export default StampViewport;

