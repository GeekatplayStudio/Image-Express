import { useState } from 'react';
import type * as fabric from 'fabric';

import { loadUiPreferences } from '@/lib/ui-preferences';
import type { RasterBlendMode, RasterBrushPreset } from '@/lib/raster-engine';

export function useEditorTopToolState() {
    const [autoSelectEnabled, setAutoSelectEnabled] = useState(true);
    const [selectionMode, setSelectionMode] = useState<'layer' | 'group'>('layer');
    const [showTransformControls, setShowTransformControls] = useState(true);
    const [selectFeather, setSelectFeather] = useState(0);
    const [selectAntiAlias, setSelectAntiAlias] = useState(true);
    const [selectionModifyPixels, setSelectionModifyPixels] = useState(12);

    const [wandTopThreshold, setWandTopThreshold] = useState(48);
    const [healingTopSize, setHealingTopSize] = useState(24);
    const [healingTopHardness, setHealingTopHardness] = useState(70);
    const [healingTopSampleAllLayers, setHealingTopSampleAllLayers] = useState(true);
    const [historyBrushTopSize, setHistoryBrushTopSize] = useState(24);
    const [historyBrushTopHardness, setHistoryBrushTopHardness] = useState(70);
    const [historyBrushTopSampleAllLayers, setHistoryBrushTopSampleAllLayers] = useState(true);
    const [blurTopSize, setBlurTopSize] = useState(28);
    const [blurTopStrength, setBlurTopStrength] = useState(45);
    const [blurTopSampleAllLayers, setBlurTopSampleAllLayers] = useState(true);
    const [sharpenTopSize, setSharpenTopSize] = useState(28);
    const [sharpenTopStrength, setSharpenTopStrength] = useState(42);
    const [sharpenTopSampleAllLayers, setSharpenTopSampleAllLayers] = useState(true);
    const [dodgeTopSize, setDodgeTopSize] = useState(28);
    const [dodgeTopExposure, setDodgeTopExposure] = useState(30);
    const [dodgeTopProtectTones, setDodgeTopProtectTones] = useState(true);
    const [cloneTopSize, setCloneTopSize] = useState(24);
    const [cloneTopHardness, setCloneTopHardness] = useState(70);
    const [cloneTopAligned, setCloneTopAligned] = useState(true);
    const [cloneTopSampleAllLayers, setCloneTopSampleAllLayers] = useState(true);
    const [cloneSourcePoint, setCloneSourcePoint] = useState<fabric.Point | null>(null);

    const [expandToolRailLabelsOnHover, setExpandToolRailLabelsOnHover] = useState(() => (
        loadUiPreferences().expandToolRailLabelsOnHover
    ));

    const [paintBrushPreset, setPaintBrushPreset] = useState<RasterBrushPreset>('Pencil');
    const [paintBrushSize, setPaintBrushSize] = useState(10);
    const [paintBrushHardness, setPaintBrushHardness] = useState(80);
    const [paintBrushOpacity, setPaintBrushOpacity] = useState(100);
    const [paintBrushFlow, setPaintBrushFlow] = useState(100);
    const [paintBrushSmoothing, setPaintBrushSmoothing] = useState(50);
    const [paintBlendMode, setPaintBlendMode] = useState<RasterBlendMode>('source-over');

    const [penTopMode, setPenTopMode] = useState<'path' | 'shape'>('path');
    const [penTopPathOperation, setPenTopPathOperation] = useState<'add' | 'subtract' | 'intersect'>('add');
    const [penTopAutoAddDelete, setPenTopAutoAddDelete] = useState(true);
    const [penTopRubberBand, setPenTopRubberBand] = useState(true);

    const [handTopLockPan, setHandTopLockPan] = useState(true);

    return {
        autoSelectEnabled,
        setAutoSelectEnabled,
        selectionMode,
        setSelectionMode,
        showTransformControls,
        setShowTransformControls,
        selectFeather,
        setSelectFeather,
        selectAntiAlias,
        setSelectAntiAlias,
        selectionModifyPixels,
        setSelectionModifyPixels,
        wandTopThreshold,
        setWandTopThreshold,
        healingTopSize,
        setHealingTopSize,
        healingTopHardness,
        setHealingTopHardness,
        healingTopSampleAllLayers,
        setHealingTopSampleAllLayers,
        historyBrushTopSize,
        setHistoryBrushTopSize,
        historyBrushTopHardness,
        setHistoryBrushTopHardness,
        historyBrushTopSampleAllLayers,
        setHistoryBrushTopSampleAllLayers,
        blurTopSize,
        setBlurTopSize,
        blurTopStrength,
        setBlurTopStrength,
        blurTopSampleAllLayers,
        setBlurTopSampleAllLayers,
        sharpenTopSize,
        setSharpenTopSize,
        sharpenTopStrength,
        setSharpenTopStrength,
        sharpenTopSampleAllLayers,
        setSharpenTopSampleAllLayers,
        dodgeTopSize,
        setDodgeTopSize,
        dodgeTopExposure,
        setDodgeTopExposure,
        dodgeTopProtectTones,
        setDodgeTopProtectTones,
        cloneTopSize,
        setCloneTopSize,
        cloneTopHardness,
        setCloneTopHardness,
        cloneTopAligned,
        setCloneTopAligned,
        cloneTopSampleAllLayers,
        setCloneTopSampleAllLayers,
        cloneSourcePoint,
        setCloneSourcePoint,
        expandToolRailLabelsOnHover,
        setExpandToolRailLabelsOnHover,
        paintBrushPreset,
        setPaintBrushPreset,
        paintBrushSize,
        setPaintBrushSize,
        paintBrushHardness,
        setPaintBrushHardness,
        paintBrushOpacity,
        setPaintBrushOpacity,
        paintBrushFlow,
        setPaintBrushFlow,
        paintBrushSmoothing,
        setPaintBrushSmoothing,
        paintBlendMode,
        setPaintBlendMode,
        penTopMode,
        setPenTopMode,
        penTopPathOperation,
        setPenTopPathOperation,
        penTopAutoAddDelete,
        setPenTopAutoAddDelete,
        penTopRubberBand,
        setPenTopRubberBand,
        handTopLockPan,
        setHandTopLockPan,
    };
}
