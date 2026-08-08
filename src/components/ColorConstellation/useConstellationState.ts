'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColorPalette } from '@/types';
import type { ConstellationNode, HarmonyKind, SavedHarmonyPalette } from '@/features/color-constellation/contracts/types';
import {
    buildHarmonyEdges,
    buildHarmonyNodes,
    nodesToHexPalette,
    transformConstellation,
    updateNodeOklch,
} from '@/features/color-constellation/domain/constellation';
import { hexToOklch, normalizeHex } from '@/features/color-constellation/domain/oklch';
import {
    exportHarmonyJson,
    importHarmonyJson,
    loadHarmonyPalettes,
    loadSwatches,
    saveHarmonyPalettes,
    saveSwatches,
} from '@/features/color-constellation/application/constellationStore';

type UseConstellationStateArgs = {
    selectedColor?: string;
    onColorSelect: (color: string) => void;
    currentPalette: ColorPalette | null;
    onPaletteSelect: (palette: ColorPalette | null) => void;
    t: (key: string, params?: Record<string, string | number>) => string;
};

export function useConstellationState({
    selectedColor,
    onColorSelect,
    currentPalette,
    onPaletteSelect,
    t,
}: UseConstellationStateArgs) {
    const initialSeed = normalizeHex(selectedColor ?? '#3366cc');
    const [activeHex, setActiveHex] = useState(initialSeed);
    const [harmonyKind, setHarmonyKind] = useState<HarmonyKind>('triadic');
    const [nodes, setNodes] = useState<ConstellationNode[]>(() => buildHarmonyNodes(initialSeed, 'triadic'));
    const [activeNodeId, setActiveNodeId] = useState<string | null>(() => {
        const built = buildHarmonyNodes(initialSeed, 'triadic');
        return built[0]?.id ?? null;
    });
    const [savedHarmonies, setSavedHarmonies] = useState<SavedHarmonyPalette[]>(() => loadHarmonyPalettes());
    const [swatches, setSwatches] = useState<string[]>(() => loadSwatches());
    const [harmonyName, setHarmonyName] = useState('');
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [swatchFlash, setSwatchFlash] = useState<string | null>(null);
    const [showSets, setShowSets] = useState(false);

    const edges = useMemo(() => buildHarmonyEdges(nodes), [nodes]);

    /**
     * Re-seed from the external `selectedColor` control.
     *
     * Adjusted during render rather than in an effect — React's documented
     * pattern for derived-from-props state. The effect version rendered once
     * with the stale palette and then rendered again with the new one, so a
     * colour picked outside the constellation briefly showed the previous
     * harmony. Guarded on the previous prop value, so it runs only on change.
     */
    const [lastSeed, setLastSeed] = useState<string | null>(null);
    if (selectedColor && selectedColor !== lastSeed) {
        setLastSeed(selectedColor);
        const next = normalizeHex(selectedColor);
        if (next !== activeHex) {
            const rebuilt = buildHarmonyNodes(next, harmonyKind);
            setActiveHex(next);
            setNodes(rebuilt);
            setActiveNodeId(rebuilt[0]?.id ?? null);
        }
    }

    useEffect(() => {
        saveHarmonyPalettes(savedHarmonies);
    }, [savedHarmonies]);

    useEffect(() => {
        saveSwatches(swatches);
    }, [swatches]);

    const applyHex = useCallback((hex: string) => {
        const safe = normalizeHex(hex);
        setActiveHex(safe);
        onColorSelect(safe);
    }, [onColorSelect]);

    const selectNode = useCallback((nodeId: string) => {
        const node = nodes.find((entry) => entry.id === nodeId);
        if (!node) return;
        setActiveNodeId(nodeId);
        applyHex(node.hex);
    }, [nodes, applyHex]);

    const rebuildHarmony = useCallback((kind: HarmonyKind, seedHex = activeHex) => {
        setHarmonyKind(kind);
        const next = buildHarmonyNodes(seedHex, kind);
        setNodes(next);
        setActiveNodeId(next[0]?.id ?? null);
        applyHex(next[0]?.hex ?? seedHex);
    }, [activeHex, applyHex]);

    const setActiveOklch = useCallback((partial: { l?: number; c?: number; h?: number }) => {
        const seedNode = nodes.find((entry) => entry.id === activeNodeId) || nodes[0];
        if (!seedNode) return;
        const next = {
            l: partial.l ?? seedNode.oklch.l,
            c: partial.c ?? seedNode.oklch.c,
            h: partial.h ?? seedNode.oklch.h,
        };
        if (activeNodeId) {
            const updated = updateNodeOklch(nodes, activeNodeId, next);
            setNodes(updated);
            const node = updated.find((entry) => entry.id === activeNodeId);
            if (node) applyHex(node.hex);
            return;
        }
        const updated = updateNodeOklch(nodes, seedNode.id, next);
        setNodes(updated);
        applyHex(updated[0]?.hex ?? activeHex);
    }, [nodes, activeNodeId, activeHex, applyHex]);

    const nudgePalette = useCallback((delta: { l?: number; c?: number; h?: number }) => {
        const next = transformConstellation(nodes, delta);
        setNodes(next);
        const focus = next.find((entry) => entry.id === activeNodeId) || next[0];
        if (focus) {
            setActiveNodeId(focus.id);
            applyHex(focus.hex);
        }
    }, [nodes, activeNodeId, applyHex]);

    const saveHarmonySet = useCallback(() => {
        const colors = nodesToHexPalette(nodes);
        if (colors.length < 2) return;
        const name = harmonyName.trim() || t('constellation.harmonyDefaultName', {
            count: colors.length,
            color: activeHex.toUpperCase(),
        });
        const entry: SavedHarmonyPalette = {
            id: `harmony-${Date.now()}-${Math.floor(Math.random() * 1e5)}`,
            name,
            colors,
            createdAt: Date.now(),
        };
        setSavedHarmonies((prev) => [entry, ...prev].slice(0, 24));
        setHarmonyName('');
        setStatusMessage(t('constellation.harmonySaved'));
        onPaletteSelect({ id: entry.id, name: entry.name, colors: entry.colors });
    }, [nodes, harmonyName, activeHex, t, onPaletteSelect]);

    const deleteHarmony = useCallback((id: string) => {
        setSavedHarmonies((prev) => prev.filter((entry) => entry.id !== id));
        if (currentPalette?.id === id) onPaletteSelect(null);
    }, [currentPalette?.id, onPaletteSelect]);

    const loadHarmony = useCallback((palette: SavedHarmonyPalette) => {
        if (palette.colors.length === 0) return;
        applyHex(palette.colors[0]);
        const rebuilt = buildHarmonyNodes(palette.colors[0], harmonyKind);
        // Prefer exact saved colors when lengths match
        if (palette.colors.length === rebuilt.length) {
            const mapped = rebuilt.map((node, index) => ({
                ...node,
                hex: normalizeHex(palette.colors[index]),
                oklch: hexToOklch(palette.colors[index]),
            }));
            setNodes(mapped);
            setActiveNodeId(mapped[0]?.id ?? null);
        } else {
            setNodes(rebuilt);
            setActiveNodeId(rebuilt[0]?.id ?? null);
        }
        onPaletteSelect({ id: palette.id, name: palette.name, colors: palette.colors });
        setStatusMessage(t('constellation.harmonyLoaded', { name: palette.name }));
    }, [applyHex, harmonyKind, onPaletteSelect, t]);

    const addSwatch = useCallback(() => {
        setSwatches((prev) => {
            if (prev.includes(activeHex)) {
                setSwatchFlash(t('constellation.swatchExists', { color: activeHex.toUpperCase() }));
                return prev;
            }
            setSwatchFlash(t('constellation.swatchAdded', { color: activeHex.toUpperCase() }));
            return [activeHex, ...prev].slice(0, 64);
        });
    }, [activeHex, t]);

    const removeSwatch = useCallback((hex: string) => {
        setSwatches((prev) => prev.filter((entry) => entry !== hex));
    }, []);

    const exportHarmonies = useCallback(() => {
        if (savedHarmonies.length === 0) {
            setStatusMessage(t('constellation.exportEmpty'));
            return;
        }
        const blob = new Blob([exportHarmonyJson(savedHarmonies)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `harmony-palettes-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
        setStatusMessage(t('constellation.exportDone'));
    }, [savedHarmonies, t]);

    const importHarmonies = useCallback(async (file: File) => {
        try {
            const text = await file.text();
            const imported = importHarmonyJson(text);
            if (imported.length === 0) {
                setStatusMessage(t('constellation.importEmpty'));
                return;
            }
            setSavedHarmonies((prev) => [...imported, ...prev].slice(0, 24));
            setStatusMessage(t('constellation.importDone', { count: imported.length }));
        } catch {
            setStatusMessage(t('constellation.importInvalid'));
        }
    }, [t]);

    const activeNode = nodes.find((entry) => entry.id === activeNodeId) || nodes[0] || null;

    return {
        activeHex,
        activeNode,
        nodes,
        edges,
        harmonyKind,
        harmonyName,
        setHarmonyName,
        savedHarmonies,
        swatches,
        statusMessage,
        swatchFlash,
        showSets,
        setShowSets,
        applyHex,
        selectNode,
        rebuildHarmony,
        setActiveOklch,
        nudgePalette,
        saveHarmonySet,
        deleteHarmony,
        loadHarmony,
        addSwatch,
        removeSwatch,
        exportHarmonies,
        importHarmonies,
    };
}
