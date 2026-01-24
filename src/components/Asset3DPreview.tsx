'use client';

import { useGLTF, Center, OrbitControls, Environment, Resize } from '@react-three/drei';
import { Suspense, useMemo } from 'react';
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
    return (
        <div className="w-full h-full bg-slate-100 rounded-lg overflow-hidden shadow-xl border border-border">
            <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
                <Suspense fallback={null}>
                    <ambientLight intensity={0.8} />
                    <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />
                    
                    <Model url={url} />
                    
                    <Environment preset="city" />
                    <OrbitControls autoRotate autoRotateSpeed={4} enableZoom={false} />
                </Suspense>
            </Canvas>
        </div>
    );
}
