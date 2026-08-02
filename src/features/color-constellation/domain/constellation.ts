import type { ConstellationEdge, ConstellationNode, ConstellationRole, HarmonyKind, Oklch } from '../contracts/types';
import { clipOklchToSrgb, hexToOklch, normalizeHex, oklchToHex } from './oklch';

const ROLE_ORDER: ConstellationRole[] = [
    'primary', 'secondary', 'tertiary', 'hover', 'pressed', 'highlight', 'shadow', 'background', 'neutral',
];

function hueOffsets(kind: HarmonyKind): number[] {
    switch (kind) {
        case 'complementary':
            return [0, 180];
        case 'analogous':
            return [0, -30, 30];
        case 'split-complementary':
            return [0, 150, 210];
        case 'triadic':
            return [0, 120, 240];
        case 'tetradic':
            return [0, 90, 180, 270];
        case 'pentadic':
            return [0, 72, 144, 216, 288];
        case 'hexadic':
            return [0, 60, 120, 180, 240, 300];
        default:
            return [0];
    }
}

/** Legacy wheel count (2–6) → nearest constellation harmony kind. */
export function harmonyKindFromCount(count: number): HarmonyKind {
    if (count <= 2) return 'complementary';
    if (count === 3) return 'triadic';
    if (count === 4) return 'tetradic';
    if (count === 5) return 'pentadic';
    return 'hexadic';
}

export function buildHarmonyNodes(baseHex: string, kind: HarmonyKind): ConstellationNode[] {
    const base = hexToOklch(normalizeHex(baseHex));
    const offsets = hueOffsets(kind);
    return offsets.map((offset, index) => {
        const isPrimary = index === 0;
        // Decision: primary keeps the exact seed (even #000 / grey).
        // Siblings need enough chroma/lightness to read as suggested colors —
        // otherwise a black seed collapses the whole family onto the neutral axis.
        let l = base.l;
        let c = base.c;
        if (!isPrimary) {
            // Target vivid-enough siblings; clipOklchToSrgb may reduce c slightly per hue.
            if (c < 0.16) c = 0.18;
            if (l < 0.08) l = 0.5;
            if (l > 0.92) l = 0.62;
        }
        const oklch = clipOklchToSrgb({
            l,
            c,
            h: (((base.h + offset) % 360) + 360) % 360,
        });
        return {
            id: `node_${index}_${kind}`,
            role: ROLE_ORDER[index] || 'neutral',
            oklch,
            hex: isPrimary ? normalizeHex(baseHex) : oklchToHex(oklch),
            pinned: isPrimary,
        };
    });
}

export function buildHarmonyEdges(nodes: ConstellationNode[]): ConstellationEdge[] {
    if (nodes.length < 2) return [];
    const edges: ConstellationEdge[] = [];
    const primary = nodes[0];
    for (let i = 1; i < nodes.length; i += 1) {
        edges.push({ fromId: primary.id, toId: nodes[i].id });
    }
    // Ring connections for multi-hue families
    if (nodes.length >= 3) {
        for (let i = 1; i < nodes.length - 1; i += 1) {
            edges.push({ fromId: nodes[i].id, toId: nodes[i + 1].id });
        }
    }
    return edges;
}

/** Translate entire constellation in OKLCH (preserve relationships). */
export function transformConstellation(
    nodes: ConstellationNode[],
    delta: Partial<Oklch>,
): ConstellationNode[] {
    return nodes.map((node) => {
        if (node.pinned && (delta.h !== undefined || delta.c !== undefined)) {
            // Pinned primary still allows lightness shifts for “brighten palette”
            if (delta.l === undefined) return node;
        }
        const next: Oklch = {
            l: Math.max(0, Math.min(1, node.oklch.l + (delta.l ?? 0))),
            c: Math.max(0, node.oklch.c + (delta.c ?? 0)),
            h: (((node.oklch.h + (delta.h ?? 0)) % 360) + 360) % 360,
        };
        const clipped = clipOklchToSrgb(next);
        return { ...node, oklch: clipped, hex: oklchToHex(clipped) };
    });
}

export function updateNodeOklch(nodes: ConstellationNode[], nodeId: string, oklch: Oklch): ConstellationNode[] {
    const clipped = clipOklchToSrgb(oklch);
    return nodes.map((node) => (
        node.id === nodeId
            ? { ...node, oklch: clipped, hex: oklchToHex(clipped) }
            : node
    ));
}

export function nodesToHexPalette(nodes: ConstellationNode[]): string[] {
    return nodes.map((node) => node.hex);
}
