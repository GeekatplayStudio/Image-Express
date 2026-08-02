'use client';

import { useMemo } from 'react';
import { Instances, Instance } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { buildVolumeSamples } from '@/features/color-constellation/domain/volumeSamples';

/**
 * Decorative OKLCH gamut cloud.
 *
 * Decisions:
 * - Beads stay SMALL (context, not the picker UI) so they do not form an opaque blob
 *   and do not bury the harmony nodes.
 * - Clicks ARE allowed: picking a bead seeds the constellation (Volume-like exploration).
 * - Density is moderate — enough to read the volume, sparse enough to click through to nodes.
 */
const BEAD_MIN = 0.055;
const BEAD_MAX = 0.095;

type ConstellationVolumeCloudProps = {
    onPickHex?: (hex: string) => void;
};

export default function ConstellationVolumeCloud({ onPickHex }: ConstellationVolumeCloudProps) {
    const samples = useMemo(
        () => buildVolumeSamples({
            lightnessSteps: 7,
            chromaSteps: 4,
            hueSteps: 28,
            maxChroma: 0.32,
            chromaScale: 8.5,
        }),
        [],
    );

    const limit = Math.max(samples.length, 1);

    const handleClick = (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        if (!onPickHex) return;
        const index = event.instanceId;
        if (index == null || index < 0 || index >= samples.length) return;
        onPickHex(samples[index].hex);
    };

    return (
        <Instances
            limit={limit}
            range={samples.length}
            frustumCulled={false}
            onClick={handleClick}
        >
            <sphereGeometry args={[1, 12, 12]} />
            <meshBasicMaterial toneMapped={false} transparent opacity={0.88} depthWrite={false} />
            {samples.map((sample, index) => {
                const radius = BEAD_MIN + sample.weight * (BEAD_MAX - BEAD_MIN);
                return (
                    <Instance
                        key={`vol-${index}`}
                        position={sample.position}
                        scale={radius}
                        color={sample.hex}
                    />
                );
            })}
        </Instances>
    );
}
