'use client';

import { useMemo, useRef } from 'react';
import { Canvas, ThreeEvent, useFrame } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { ConstellationEdge, ConstellationNode } from '@/features/color-constellation/contracts/types';
import { oklchToScenePosition } from '@/features/color-constellation/domain/oklch';
import ConstellationVolumeCloud from '@/components/ColorConstellation/ConstellationVolumeCloud';

type ConstellationVolume3DProps = {
    nodes: ConstellationNode[];
    edges: ConstellationEdge[];
    activeNodeId: string | null;
    onSelectNode: (nodeId: string) => void;
    /** Pick a seed color from the decorative volume cloud. */
    onPickVolumeHex?: (hex: string) => void;
    className?: string;
};

/**
 * Shared OKLCH → scene scale for volume + nodes so they share one coordinate system.
 * Decision: keep moderate so the cylinder fills the viewport without crushing into a ball.
 */
const CHROMA_SCALE = 8.5;

/**
 * Harmony nodes must read ABOVE the volume beads (beads ≈ 0.05–0.09).
 * Decision: ~3× bead size so roles stay clickable and recognizable.
 */
const NODE_RADIUS = 0.2;
const NODE_RADIUS_ACTIVE = 0.26;

function AxisGuides() {
    return (
        <group>
            <Line
                points={[[0, -2.2, 0], [0, 2.2, 0]]}
                color="#64748b"
                lineWidth={1.25}
                transparent
                opacity={0.4}
            />
            <mesh position={[0, 2.15, 0]}>
                <sphereGeometry args={[0.045, 12, 12]} />
                <meshBasicMaterial color="#f8fafc" toneMapped={false} />
            </mesh>
            <mesh position={[0, -2.15, 0]}>
                <sphereGeometry args={[0.045, 12, 12]} />
                <meshBasicMaterial color="#0f172a" />
            </mesh>
        </group>
    );
}

function ConstellationNodeMesh({
    node,
    active,
    onSelect,
}: {
    node: ConstellationNode;
    active: boolean;
    onSelect: (id: string) => void;
}) {
    const groupRef = useRef<THREE.Group>(null);
    const position = oklchToScenePosition(node.oklch, CHROMA_SCALE);
    const radius = active ? NODE_RADIUS_ACTIVE : NODE_RADIUS;

    useFrame((state) => {
        if (!groupRef.current) return;
        if (active) {
            groupRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 3) * 0.05);
        } else {
            groupRef.current.scale.setScalar(1);
        }
    });

    const handlePointer = (event: ThreeEvent<PointerEvent>) => {
        // Decision: stop orbit-drag from starting when picking a node.
        event.stopPropagation();
        onSelect(node.id);
    };

    return (
        <group ref={groupRef} position={position} renderOrder={10}>
            {active && (
                <mesh>
                    <sphereGeometry args={[radius * 1.55, 20, 20]} />
                    <meshBasicMaterial
                        color={node.hex}
                        transparent
                        opacity={0.28}
                        depthWrite={false}
                        blending={THREE.AdditiveBlending}
                        toneMapped={false}
                    />
                </mesh>
            )}
            <mesh onClick={handlePointer} onPointerDown={handlePointer}>
                <sphereGeometry args={[radius, 28, 28]} />
                <meshStandardMaterial
                    color={node.hex}
                    emissive={node.hex}
                    emissiveIntensity={active ? 0.9 : 0.45}
                    roughness={0.25}
                    metalness={0.2}
                    toneMapped={false}
                />
            </mesh>
            <mesh position={[radius * 0.28, radius * 0.3, radius * 0.34]}>
                <sphereGeometry args={[radius * 0.22, 12, 12]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.5} depthWrite={false} />
            </mesh>
        </group>
    );
}

function ConstellationLinks({ nodes, edges }: { nodes: ConstellationNode[]; edges: ConstellationEdge[] }) {
    const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
    return (
        <group>
            {edges.map((edge) => {
                const from = byId.get(edge.fromId);
                const to = byId.get(edge.toId);
                if (!from || !to) return null;
                return (
                    <Line
                        key={`${edge.fromId}-${edge.toId}`}
                        points={[
                            oklchToScenePosition(from.oklch, CHROMA_SCALE),
                            oklchToScenePosition(to.oklch, CHROMA_SCALE),
                        ]}
                        color={from.hex}
                        lineWidth={2}
                        transparent
                        opacity={0.75}
                    />
                );
            })}
        </group>
    );
}

export default function ConstellationVolume3D({
    nodes,
    edges,
    activeNodeId,
    onSelectNode,
    onPickVolumeHex,
    className,
}: ConstellationVolume3DProps) {
    return (
        <div className={className} data-testid="constellation-volume-3d">
            <Canvas
                camera={{ position: [5.2, 1.6, 5.2], fov: 36 }}
                dpr={[1, 1.75]}
                gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
                onCreated={({ gl }) => {
                    gl.domElement.addEventListener('webglcontextlost', (event) => event.preventDefault(), { once: true });
                    gl.toneMapping = THREE.NoToneMapping;
                    gl.outputColorSpace = THREE.SRGBColorSpace;
                }}
            >
                <color attach="background" args={['#05080f']} />
                <ambientLight intensity={0.75} />
                <directionalLight position={[5, 8, 4]} intensity={1.25} />
                <ConstellationVolumeCloud onPickHex={onPickVolumeHex} />
                <AxisGuides />
                <ConstellationLinks nodes={nodes} edges={edges} />
                {nodes.map((node) => (
                    <ConstellationNodeMesh
                        key={node.id}
                        node={node}
                        active={node.id === activeNodeId}
                        onSelect={onSelectNode}
                    />
                ))}
                <OrbitControls
                    enablePan={false}
                    minDistance={3.5}
                    maxDistance={10}
                    // Decision: slow auto-rotate for presence, not so fast that picking becomes impossible.
                    autoRotate
                    autoRotateSpeed={0.25}
                    target={[0, 0, 0]}
                />
            </Canvas>
        </div>
    );
}
