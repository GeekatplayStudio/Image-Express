'use client';
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Canvas, ThreeEvent } from '@react-three/fiber';
import { OrbitControls as DreiOrbitControls, Stage, useGLTF, ContactShadows, Line } from '@react-three/drei';
import { Check, X, RotateCw, Sun, Camera, Box, Palette, Wand2, Monitor } from 'lucide-react';
import * as THREE from 'three';
import * as fabric from 'fabric';
import DraggableResizablePanel from '@/components/ui/DraggableResizablePanel';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { ExtendedFabricObject, ThreeDSettings } from '@/types';
import useEscapeKey from '@/hooks/useEscapeKey';

interface ThreeDLayerEditorProps {
    modelUrl: string;
    existingObject?: fabric.Object;
    onSave: (dataUrl: string, modelUrl: string, settings: ThreeDSettings) => void;
    onClose: () => void;
}

type CaptureGL = {
    domElement: HTMLCanvasElement;
    render: () => void;
    scene: THREE.Scene;
    camera: THREE.Camera;
    glInstance: THREE.WebGLRenderer;
};

type Vec3 = { x: number; y: number; z: number };

const GIZMO_ORBIT_RADIUS = 2.2;
const GIZMO_GROUP_NAME = 'light-gizmo-group';

type LightPreset = {
    name: string;
    swatch: string;
    direction: Vec3;
    intensity: number;
    color: string;
    ambient: number;
};

const LIGHT_PRESETS: LightPreset[] = [
    { name: 'Studio', swatch: '#f5f5f5', direction: { x: 4, y: 6, z: 4 }, intensity: 1.3, color: '#ffffff', ambient: 0.4 },
    { name: 'Golden Hour', swatch: '#ffb36b', direction: { x: 6, y: 1.6, z: 3 }, intensity: 1.6, color: '#ffb36b', ambient: 0.3 },
    { name: 'Noon', swatch: '#fff3c4', direction: { x: 0.5, y: 8, z: 2 }, intensity: 1.8, color: '#fff7e0', ambient: 0.5 },
    { name: 'Dramatic', swatch: '#c9c9c9', direction: { x: -6, y: 4, z: -1.5 }, intensity: 2.2, color: '#ffffff', ambient: 0.12 },
    { name: 'Rim', swatch: '#cfe4ff', direction: { x: 0, y: 3, z: -7 }, intensity: 2.4, color: '#cfe4ff', ambient: 0.2 },
    { name: 'Soft', swatch: '#efeae2', direction: { x: 3, y: 5, z: 5 }, intensity: 0.9, color: '#fff6ec', ambient: 0.7 },
    { name: 'Moonlight', swatch: '#7ea0ff', direction: { x: -4, y: 3.5, z: 4 }, intensity: 1.1, color: '#8fa8ff', ambient: 0.15 },
];

const ENVIRONMENTS = ['studio', 'city', 'apartment', 'dawn', 'sunset', 'forest', 'park', 'night', 'lobby', 'warehouse'] as const;

const CAMERA_VIEWS: { name: string; direction: Vec3 }[] = [
    { name: 'Front', direction: { x: 0, y: 0.25, z: 1 } },
    { name: '¾ Left', direction: { x: -1, y: 0.45, z: 1 } },
    { name: '¾ Right', direction: { x: 1, y: 0.45, z: 1 } },
    { name: 'Side', direction: { x: 1, y: 0.15, z: 0 } },
    { name: 'Top', direction: { x: 0.01, y: 1, z: 0.15 } },
];

const vecLength = (v: Vec3) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
const vecScaleTo = (v: Vec3, length: number): Vec3 => {
    const l = vecLength(v);
    return { x: (v.x / l) * length, y: (v.y / l) * length, z: (v.z / l) * length };
};

const ModelViewer = ({ url, onGroundY }: { url: string; onGroundY?: (y: number) => void }) => {
    const { scene } = useGLTF(url);
    const clone = useMemo(() => scene.clone(), [scene]);
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
    }, [clone, onGroundY]);
    return <primitive object={clone} />;
};

/**
 * A draggable "sun" rendered on a fixed orbit sphere around the model.
 * Dragging changes the light DIRECTION (distance is controlled separately),
 * so the widget always stays visible regardless of actual light distance.
 */
const LightGizmo = ({
    lightPosition,
    lightColor,
    visible,
    controlsRef,
    onDirectionChange,
}: {
    lightPosition: Vec3;
    lightColor: string;
    visible: boolean;
    controlsRef: React.RefObject<OrbitControlsImpl | null>;
    onDirectionChange: (direction: Vec3) => void;
}) => {
    const draggingRef = useRef(false);
    const gizmoPos = useMemo(() => vecScaleTo(lightPosition, GIZMO_ORBIT_RADIUS), [lightPosition]);

    const projectRayToOrbit = (ray: THREE.Ray): Vec3 => {
        // Intersect the pointer ray with the gizmo orbit sphere (centered at origin).
        const o = ray.origin;
        const d = ray.direction;
        const b = 2 * o.dot(d);
        const c = o.lengthSq() - GIZMO_ORBIT_RADIUS * GIZMO_ORBIT_RADIUS;
        const disc = b * b - 4 * c;
        let point: THREE.Vector3;
        if (disc >= 0) {
            const t = (-b - Math.sqrt(disc)) / 2;
            point = o.clone().addScaledVector(d, t >= 0 ? t : (-b + Math.sqrt(disc)) / 2);
        } else {
            // Ray misses the sphere: snap to the closest point on it.
            point = o.clone().addScaledVector(d, -b / 2).normalize().multiplyScalar(GIZMO_ORBIT_RADIUS);
        }
        return { x: point.x, y: point.y, z: point.z };
    };

    const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        draggingRef.current = true;
        (e.target as Element).setPointerCapture(e.pointerId);
        if (controlsRef.current) controlsRef.current.enabled = false;
    };

    const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
        if (!draggingRef.current) return;
        e.stopPropagation();
        onDirectionChange(projectRayToOrbit(e.ray));
    };

    const endDrag = (e: ThreeEvent<PointerEvent>) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        (e.target as Element).releasePointerCapture(e.pointerId);
        if (controlsRef.current) controlsRef.current.enabled = true;
    };

    return (
        <group name={GIZMO_GROUP_NAME} visible={visible}>
            <Line
                points={[[gizmoPos.x, gizmoPos.y, gizmoPos.z], [0, 0, 0]]}
                color={lightColor}
                lineWidth={1}
                dashed
                dashScale={8}
                transparent
                opacity={0.55}
            />
            <mesh
                position={[gizmoPos.x, gizmoPos.y, gizmoPos.z]}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onPointerOver={() => { document.body.style.cursor = 'grab'; }}
                onPointerOut={() => { document.body.style.cursor = 'auto'; }}
            >
                <sphereGeometry args={[0.16, 24, 24]} />
                <meshBasicMaterial color={lightColor} toneMapped={false} />
            </mesh>
            <mesh position={[gizmoPos.x, gizmoPos.y, gizmoPos.z]}>
                <sphereGeometry args={[0.26, 24, 24]} />
                <meshBasicMaterial color={lightColor} transparent opacity={0.25} toneMapped={false} />
            </mesh>
        </group>
    );
};

const SectionTitle = ({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) => (
    <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mt-4 mb-2 first:mt-0">
        {icon}
        {children}
    </h4>
);

const MiniSlider = ({
    label, value, min, max, step, onChange, format,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
    format?: (v: number) => string;
}) => (
    <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
            <span>{label}</span>
            <span>{format ? format(value) : value}</span>
        </div>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
        />
    </div>
);

const MiniToggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase">{label}</span>
        <div
            className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors ${checked ? 'bg-primary' : 'bg-secondary'}`}
            onClick={() => onChange(!checked)}
        >
            <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
        </div>
    </div>
);

const ThreeDLayerEditor = ({ modelUrl, existingObject, onSave, onClose }: ThreeDLayerEditorProps) => {
    const [gl, setGl] = useState<CaptureGL | null>(null);
    const [resolution, setResolution] = useState<{ width: number, height: number }>({ width: 2048, height: 2048 });
    const [lightPosition, setLightPosition] = useState<Vec3>({ x: 5, y: 5, z: 5 });
    const [lightIntensity, setLightIntensity] = useState(1.2);
    const [lightColor, setLightColor] = useState('#ffffff');
    const [ambientIntensity, setAmbientIntensity] = useState(0.35);
    const [environment, setEnvironment] = useState<string>('city');
    const [envIntensity, setEnvIntensity] = useState(0.6);
    const [castShadowEnabled, setCastShadowEnabled] = useState(true);
    const [castShadowBlur, setCastShadowBlur] = useState(22);
    const [castShadowIntensity, setCastShadowIntensity] = useState(0.35);
    const [contactShadowEnabled, setContactShadowEnabled] = useState(true);
    const [contactShadowBlur, setContactShadowBlur] = useState(8);
    const [contactShadowIntensity, setContactShadowIntensity] = useState(0.6);
    const [modelRotationY, setModelRotationY] = useState(0);
    const [modelScale, setModelScale] = useState(1);
    const [gizmoVisible, setGizmoVisible] = useState(true);
    const [activePreset, setActivePreset] = useState<string | null>(null);
    const [groundY, setGroundY] = useState(-1);
    const controlsRef = useRef<OrbitControlsImpl | null>(null);
    const canvasWrapperRef = useRef<HTMLDivElement>(null);
    const modelGroupRef = useRef<THREE.Group>(null);
    const cameraInitializedRef = useRef(false);

    useEscapeKey(onClose);

    useEffect(() => {
        if (!existingObject) return;
        const extended = existingObject as ExtendedFabricObject;
        const settings = extended.threeDSettings;

        if (settings) {
            setLightPosition(settings.lightPosition);
            setLightIntensity(settings.lightIntensity);
            setLightColor(settings.lightColor);
            setCastShadowEnabled(settings.castShadowEnabled);
            setCastShadowBlur(settings.castShadowBlur);
            setCastShadowIntensity(settings.castShadowIntensity);
            setContactShadowEnabled(settings.contactShadowEnabled);
            setContactShadowBlur(settings.contactShadowBlur);
            setContactShadowIntensity(settings.contactShadowIntensity);
            setResolution(settings.resolution);
            if (typeof settings.ambientIntensity === 'number') setAmbientIntensity(settings.ambientIntensity);
            if (settings.environment) setEnvironment(settings.environment);
            if (typeof settings.envIntensity === 'number') setEnvIntensity(settings.envIntensity);
            if (typeof settings.modelRotationY === 'number') setModelRotationY(settings.modelRotationY);
            if (typeof settings.modelScale === 'number') setModelScale(settings.modelScale);
        } else {
            const scaleX = existingObject.scaleX || 1;
            const scaleY = existingObject.scaleY || 1;
            const width = existingObject.width || 512;
            const height = existingObject.height || 512;

            const targetW = Math.max(Math.round(width * scaleX * 2), 1024);
            const targetH = Math.max(Math.round(height * scaleY * 2), 1024);

            setResolution({ width: targetW, height: targetH });
        }
    }, [existingObject]);

    useEffect(() => {
        if (!existingObject || cameraInitializedRef.current) return;
        const extended = existingObject as ExtendedFabricObject;
        const settings = extended.threeDSettings;
        if (!settings || !gl || !controlsRef.current) return;

        const { cameraPosition, cameraTarget } = settings;
        if (cameraPosition) {
            gl.camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
        }
        if (cameraTarget) {
            controlsRef.current.target.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);
        }
        controlsRef.current.update();
        cameraInitializedRef.current = true;
    }, [existingObject, gl]);

    useEffect(() => {
        useGLTF.preload(modelUrl);
    }, [modelUrl]);

    // Model transform is applied by mutating the group directly; the R3F
    // frameloop picks it up without recreating the Stage (which reloads env maps).
    useEffect(() => {
        if (!modelGroupRef.current) return;
        modelGroupRef.current.rotation.y = (modelRotationY * Math.PI) / 180;
        modelGroupRef.current.scale.setScalar(modelScale);
    }, [modelRotationY, modelScale]);

    const stageContent = useMemo(() => (
        <Stage environment={environment as 'city'} intensity={envIntensity} adjustCamera={false} shadows={false}>
            <group ref={modelGroupRef}>
                <ModelViewer url={modelUrl} onGroundY={setGroundY} />
            </group>
        </Stage>
    ), [modelUrl, environment, envIntensity]);

    const lightDistance = vecLength(lightPosition);
    const lightDistanceRef = useRef(lightDistance);
    lightDistanceRef.current = lightDistance;

    const handleGizmoDirection = useCallback((direction: Vec3) => {
        setActivePreset(null);
        setLightPosition(vecScaleTo(direction, lightDistanceRef.current));
    }, []);

    const applyPreset = (preset: LightPreset) => {
        setActivePreset(preset.name);
        setLightPosition(vecScaleTo(preset.direction, lightDistance));
        setLightIntensity(preset.intensity);
        setLightColor(preset.color);
        setAmbientIntensity(preset.ambient);
    };

    const applyCameraView = (direction: Vec3) => {
        if (!gl || !controlsRef.current) return;
        const controls = controlsRef.current;
        const target = controls.target;
        const dist = gl.camera.position.distanceTo(target);
        const dir = vecScaleTo(direction, dist);
        gl.camera.position.set(target.x + dir.x, target.y + dir.y, target.z + dir.z);
        controls.update();
    };

    const resetCamera = () => {
        if (!gl || !controlsRef.current) return;
        gl.camera.position.set(0, 0, 4);
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
    };

    const buildSettings = (): ThreeDSettings => {
        const controls = controlsRef.current;
        return {
            lightPosition,
            lightIntensity,
            lightColor,
            castShadowEnabled,
            castShadowBlur,
            castShadowIntensity,
            contactShadowEnabled,
            contactShadowBlur,
            contactShadowIntensity,
            resolution,
            ambientIntensity,
            environment,
            envIntensity,
            modelRotationY,
            modelScale,
            cameraPosition: controls
                ? { x: controls.object.position.x, y: controls.object.position.y, z: controls.object.position.z }
                : undefined,
            cameraTarget: controls
                ? { x: controls.target.x, y: controls.target.y, z: controls.target.z }
                : undefined
        };
    };

    const withGizmoHidden = (scene: THREE.Scene, fn: () => void) => {
        const gizmo = scene.getObjectByName(GIZMO_GROUP_NAME);
        const wasVisible = gizmo?.visible ?? false;
        if (gizmo) gizmo.visible = false;
        try {
            fn();
        } finally {
            if (gizmo) gizmo.visible = wasVisible;
        }
    };

    const handleCapture = () => {
        if (gl && gl.glInstance) {
            const { glInstance: renderer, scene, camera } = gl;
            try {
                const originalSize = new THREE.Vector2();
                renderer.getSize(originalSize);
                const originalAspect = (camera as THREE.PerspectiveCamera).aspect;

                renderer.setSize(resolution.width, resolution.height, false);
                // eslint-disable-next-line react-hooks/immutability
                (camera as THREE.PerspectiveCamera).aspect = resolution.width / resolution.height;
                (camera as THREE.PerspectiveCamera).updateProjectionMatrix();

                withGizmoHidden(scene, () => renderer.render(scene, camera));

                const dataUrl = renderer.domElement.toDataURL('image/png', 1.0);

                renderer.setSize(originalSize.x, originalSize.y, false);

                // eslint-disable-next-line react-hooks/immutability
                (camera as THREE.PerspectiveCamera).aspect = originalAspect;
                (camera as THREE.PerspectiveCamera).updateProjectionMatrix();

                renderer.render(scene, camera);

                onSave(dataUrl, modelUrl, buildSettings());
            } catch (e) {
                console.error("High-res capture failed", e);
                withGizmoHidden(gl.scene, () => gl.render());
                const dataUrl = gl.domElement.toDataURL('image/png', 1.0);
                onSave(dataUrl, modelUrl, buildSettings());
            }
        }
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <DraggableResizablePanel
                className="bg-card rounded-xl shadow-2xl overflow-hidden border border-border flex flex-col"
                initialPosition={{ x: 100, y: 60 }}
                initialSize={{ width: 820, height: 640 }}
                minWidth={640}
                minHeight={520}
            >
                <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30 draggable-handle cursor-move shrink-0">
                    <h3 className="font-semibold flex items-center gap-2">
                        <RotateCw size={18} className="text-primary" />
                        3D View Editor
                    </h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 flex min-h-0">
                    <div
                        ref={canvasWrapperRef}
                        className="flex-1 relative bg-secondary/20 checkerboard-bg pointer-events-auto select-none min-h-0 overflow-hidden"
                        style={{ touchAction: 'none' }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onWheel={(e) => e.stopPropagation()}
                    >
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
                            <ambientLight intensity={ambientIntensity} />
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
                            {stageContent}
                            <LightGizmo
                                lightPosition={lightPosition}
                                lightColor={lightColor}
                                visible={gizmoVisible}
                                controlsRef={controlsRef}
                                onDirectionChange={handleGizmoDirection}
                            />
                            <DreiOrbitControls
                                ref={controlsRef}
                                makeDefault
                                autoRotate={false}
                                enableDamping={false}
                            />
                        </Canvas>

                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-muted-foreground bg-background/80 px-3 py-1 rounded-full backdrop-blur pointer-events-none whitespace-nowrap">
                            Drag sun to light • Drag to rotate • Scroll to zoom
                        </div>
                    </div>

                    <div className="w-60 border-l border-border bg-card/60 overflow-y-auto p-3 text-xs shrink-0">
                        <SectionTitle icon={<Wand2 size={12} />}>Light Presets</SectionTitle>
                        <div className="grid grid-cols-2 gap-1.5">
                            {LIGHT_PRESETS.map((preset) => (
                                <button
                                    key={preset.name}
                                    onClick={() => applyPreset(preset)}
                                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-[10px] transition-colors text-left ${activePreset === preset.name
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'bg-muted hover:bg-muted/70 border-transparent'}`}
                                >
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10" style={{ backgroundColor: preset.swatch }} />
                                    {preset.name}
                                </button>
                            ))}
                        </div>

                        <SectionTitle icon={<Sun size={12} />}>Light</SectionTitle>
                        <div className="space-y-2.5">
                            <MiniToggle label="Show Sun Widget" checked={gizmoVisible} onChange={setGizmoVisible} />
                            <MiniSlider label="Intensity" value={lightIntensity} min={0} max={5} step={0.05} onChange={setLightIntensity} format={(v) => v.toFixed(2)} />
                            <MiniSlider
                                label="Distance"
                                value={lightDistance}
                                min={2}
                                max={15}
                                step={0.1}
                                onChange={(d) => setLightPosition(vecScaleTo(lightPosition, d))}
                                format={(v) => v.toFixed(1)}
                            />
                            <MiniSlider label="Ambient" value={ambientIntensity} min={0} max={1.5} step={0.05} onChange={setAmbientIntensity} format={(v) => v.toFixed(2)} />
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
                        </div>

                        <SectionTitle icon={<Palette size={12} />}>Environment</SectionTitle>
                        <div className="space-y-2.5">
                            <select
                                value={environment}
                                onChange={(e) => setEnvironment(e.target.value)}
                                className="w-full bg-muted px-2 py-1.5 rounded border border-border/50 text-xs capitalize"
                            >
                                {ENVIRONMENTS.map((env) => (
                                    <option key={env} value={env} className="capitalize">{env}</option>
                                ))}
                            </select>
                            <MiniSlider label="Env Intensity" value={envIntensity} min={0} max={2} step={0.05} onChange={setEnvIntensity} format={(v) => v.toFixed(2)} />
                        </div>

                        <SectionTitle icon={<Sun size={12} />}>Shadows</SectionTitle>
                        <div className="space-y-2.5">
                            <MiniToggle label="Cast Shadow" checked={castShadowEnabled} onChange={setCastShadowEnabled} />
                            {castShadowEnabled && (
                                <>
                                    <MiniSlider label="Cast Blur" value={castShadowBlur} min={0} max={60} step={1} onChange={setCastShadowBlur} />
                                    <MiniSlider label="Cast Intensity" value={castShadowIntensity} min={0} max={1} step={0.05} onChange={setCastShadowIntensity} format={(v) => v.toFixed(2)} />
                                </>
                            )}
                            <MiniToggle label="Contact Shadow" checked={contactShadowEnabled} onChange={setContactShadowEnabled} />
                            {contactShadowEnabled && (
                                <>
                                    <MiniSlider label="Contact Blur" value={contactShadowBlur} min={0} max={20} step={1} onChange={setContactShadowBlur} />
                                    <MiniSlider label="Contact Intensity" value={contactShadowIntensity} min={0} max={1} step={0.05} onChange={setContactShadowIntensity} format={(v) => v.toFixed(2)} />
                                </>
                            )}
                        </div>

                        <SectionTitle icon={<Box size={12} />}>Model</SectionTitle>
                        <div className="space-y-2.5">
                            <MiniSlider label="Rotate" value={modelRotationY} min={-180} max={180} step={1} onChange={setModelRotationY} format={(v) => `${v}°`} />
                            <MiniSlider label="Scale" value={modelScale} min={0.2} max={3} step={0.05} onChange={setModelScale} format={(v) => `${v.toFixed(2)}×`} />
                        </div>

                        <SectionTitle icon={<Camera size={12} />}>Camera</SectionTitle>
                        <div className="grid grid-cols-2 gap-1.5">
                            {CAMERA_VIEWS.map((view) => (
                                <button
                                    key={view.name}
                                    onClick={() => applyCameraView(view.direction)}
                                    className="px-2 py-1.5 rounded-md bg-muted hover:bg-muted/70 text-[10px] transition-colors"
                                >
                                    {view.name}
                                </button>
                            ))}
                            <button
                                onClick={resetCamera}
                                className="px-2 py-1.5 rounded-md bg-muted hover:bg-muted/70 text-[10px] transition-colors"
                            >
                                Reset
                            </button>
                        </div>

                        <SectionTitle icon={<Monitor size={12} />}>Export Resolution</SectionTitle>
                        <div className="space-y-2.5">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-muted-foreground block mb-1 text-[10px] uppercase">Width</label>
                                    <input
                                        type="number"
                                        value={resolution.width}
                                        onChange={e => {
                                            const val = parseInt(e.target.value);
                                            setResolution(p => ({ ...p, width: val }))
                                        }}
                                        className="w-full bg-muted px-2 py-1 rounded border border-border/50 text-right"
                                    />
                                </div>
                                <div>
                                    <label className="text-muted-foreground block mb-1 text-[10px] uppercase">Height</label>
                                    <input
                                        type="number"
                                        value={resolution.height}
                                        onChange={e => setResolution(p => ({ ...p, height: parseInt(e.target.value) }))}
                                        className="w-full bg-muted px-2 py-1 rounded border border-border/50 text-right"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-4 gap-1">
                                {[512, 1024, 2048, 4096].map(size => (
                                    <button
                                        key={size}
                                        onClick={() => setResolution({ width: size, height: size })}
                                        className={`px-1 py-1 rounded text-[10px] border transition-colors ${resolution.width === size && resolution.height === size ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted hover:bg-muted/80 border-transparent'}`}
                                    >
                                        {size}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-border flex justify-end gap-3 bg-card shrink-0">
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
};

export default React.memo(ThreeDLayerEditor);
