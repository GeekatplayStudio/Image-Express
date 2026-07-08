import React from 'react';
import { Pipette } from 'lucide-react';
import { 
    AdjustmentLayerType, 
    AdjustmentLayerSettings, 
    CurvesAdjustmentSettings, 
    CurvesChannel, 
    CurvesPickerTarget,
    LevelsAdjustmentSettings, 
    HueSaturationSettings, 
    ExposureSettings, 
    SaturationVibranceSettings,
    BrightnessContrastSettings,
    ColorBalanceSettings,
    LightAndColorSettings,
    SolidColorSettings,
} from '@/types';
import { APP_THEME } from '@/lib/theme-tokens';

interface AdjustmentControlsProps {
    type: AdjustmentLayerType;
    settings: AdjustmentLayerSettings;
    onChange: (settings: AdjustmentLayerSettings) => void;
}

type EyeDropperLike = {
    open: () => Promise<{ sRGBHex: string }>;
};

const CURVES_HISTOGRAM_PATH = 'M 0 160 L 0 132 C 7 119, 15 153, 24 143 C 33 132, 42 78, 52 109 C 61 138, 70 113, 80 140 C 89 156, 99 101, 109 128 C 119 155, 130 91, 140 118 C 148 140, 154 130, 160 136 L 160 160 Z';

const CURVE_PICKER_LABELS: Record<CurvesPickerTarget, string> = {
    shadow: 'Black point',
    midtone: 'Gray point',
    highlight: 'White point',
};

const CURVE_PICKER_OUTPUTS: Record<CurvesPickerTarget, number> = {
    shadow: 0,
    midtone: 0.5,
    highlight: 1,
};

const CURVE_CHANNEL_APPEARANCE: Record<CurvesChannel, {
    stroke: string;
    background: string;
    grid: string;
    diagonal: string;
    histogramFill: string;
    pointStroke: string;
    pointFill: string;
}> = {
    rgb: {
        stroke: APP_THEME.curveDefaultStroke,
        background: 'linear-gradient(135deg, rgba(15,23,42,0.96) 0%, rgba(31,41,55,0.96) 100%)',
        grid: 'rgba(255,255,255,0.10)',
        diagonal: 'rgba(255,255,255,0.18)',
        histogramFill: 'rgba(244,244,245,0.24)',
        pointStroke: '#ffffff',
        pointFill: APP_THEME.curveDefaultStroke,
    },
    luminosity: {
        stroke: '#ffffff',
        background: 'linear-gradient(135deg, rgba(10,10,10,0.98) 0%, rgba(86,86,86,0.88) 52%, rgba(236,236,236,0.94) 100%)',
        grid: 'rgba(255,255,255,0.18)',
        diagonal: 'rgba(255,255,255,0.28)',
        histogramFill: 'rgba(255,255,255,0.32)',
        pointStroke: '#ffffff',
        pointFill: '#111827',
    },
    r: {
        stroke: '#ef4444',
        background: 'linear-gradient(135deg, rgba(127,29,29,0.92) 0%, rgba(69,10,10,0.92) 38%, rgba(17,24,39,0.92) 58%, rgba(8,145,178,0.28) 100%)',
        grid: 'rgba(255,255,255,0.10)',
        diagonal: 'rgba(255,255,255,0.20)',
        histogramFill: 'rgba(248,113,113,0.34)',
        pointStroke: '#ffffff',
        pointFill: '#ef4444',
    },
    g: {
        stroke: '#22c55e',
        background: 'linear-gradient(135deg, rgba(22,101,52,0.94) 0%, rgba(34,197,94,0.22) 24%, rgba(17,24,39,0.90) 58%, rgba(190,24,93,0.28) 82%, rgba(131,24,67,0.48) 100%)',
        grid: 'rgba(255,255,255,0.10)',
        diagonal: 'rgba(255,255,255,0.20)',
        histogramFill: 'rgba(74,222,128,0.30)',
        pointStroke: '#ffffff',
        pointFill: '#22c55e',
    },
    b: {
        stroke: '#3b82f6',
        background: 'linear-gradient(135deg, rgba(30,64,175,0.92) 0%, rgba(59,130,246,0.24) 24%, rgba(15,23,42,0.90) 58%, rgba(202,138,4,0.28) 82%, rgba(161,161,11,0.46) 100%)',
        grid: 'rgba(255,255,255,0.10)',
        diagonal: 'rgba(255,255,255,0.20)',
        histogramFill: 'rgba(96,165,250,0.34)',
        pointStroke: '#ffffff',
        pointFill: '#3b82f6',
    },
};

function normalizeHexColor(color: string) {
    const normalized = color.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
    if (/^#[0-9a-f]{3}$/.test(normalized)) {
        return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
    }
    return '#808080';
}

function hexToRgb(color: string) {
    const normalized = normalizeHexColor(color);
    return {
        r: Number.parseInt(normalized.slice(1, 3), 16),
        g: Number.parseInt(normalized.slice(3, 5), 16),
        b: Number.parseInt(normalized.slice(5, 7), 16),
    };
}

function getCurveSampleValue(channel: CurvesChannel, color: string) {
    const { r, g, b } = hexToRgb(color);
    if (channel === 'r') return r / 255;
    if (channel === 'g') return g / 255;
    if (channel === 'b') return b / 255;
    return ((0.299 * r) + (0.587 * g) + (0.114 * b)) / 255;
}

function insertOrReplaceAnchor(points: { x: number; y: number }[], target: CurvesPickerTarget, anchorX: number) {
    const normalizedAnchorX = Math.min(1, Math.max(0, anchorX));
    const anchorPoint = { x: normalizedAnchorX, y: CURVE_PICKER_OUTPUTS[target] };
    const basePoints = [...points].sort((left, right) => left.x - right.x);

    if (target === 'shadow') {
        const withoutShadowInterior = basePoints.filter((point, index) => index === 0 || point.x > normalizedAnchorX + 0.001);
        return [{ x: normalizedAnchorX, y: 0 }, ...withoutShadowInterior.slice(1)].sort((left, right) => left.x - right.x);
    }

    if (target === 'highlight') {
        const withoutHighlightInterior = basePoints.filter((point, index) => index === basePoints.length - 1 || point.x < normalizedAnchorX - 0.001);
        return [...withoutHighlightInterior.slice(0, -1), { x: normalizedAnchorX, y: 1 }].sort((left, right) => left.x - right.x);
    }

    const middleIndex = basePoints.findIndex((point, index) => index > 0 && index < basePoints.length - 1);
    if (middleIndex === -1) {
        return [...basePoints, anchorPoint].sort((left, right) => left.x - right.x);
    }

    const nextPoints = [...basePoints];
    nextPoints[middleIndex] = anchorPoint;
    return nextPoints.sort((left, right) => left.x - right.x);
}

function CurvesControls({ settings: curves, onChange }: { settings: CurvesAdjustmentSettings, onChange: (s: CurvesAdjustmentSettings) => void }) {
    const channel = curves.channel ?? 'rgb';
    const points = curves.pointsByChannel?.[channel] ?? curves.points ?? [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const appearance = CURVE_CHANNEL_APPEARANCE[channel];
    const pickerTarget = curves.pickerTarget ?? 'midtone';
    const pickerColors = React.useMemo(() => curves.pickerColors ?? {}, [curves.pickerColors]);
    
    const [activePointIndex, setActivePointIndex] = React.useState<number | null>(null);
    const [isSampling, setIsSampling] = React.useState(false);
    const hiddenColorInputRef = React.useRef<HTMLInputElement | null>(null);
    const pendingPickerTargetRef = React.useRef<CurvesPickerTarget>('midtone');

    const updateCurves = React.useCallback((newCurves: CurvesAdjustmentSettings) => {
        onChange(newCurves);
    }, [onChange]);

    const toSvgX = (value: number) => value * 160;
    const toSvgY = (value: number) => 160 - value * 160;
    const curveStroke = appearance.stroke;
    
    const smoothPath = () => {
        if (sorted.length < 2) return '';
        const pts = sorted.map((p) => ({ x: toSvgX(p.x), y: toSvgY(p.y) }));
        const get = (idx: number) => {
            if (idx < 0) return pts[0];
            if (idx >= pts.length) return pts[pts.length - 1];
            return pts[idx];
        };
        const segments: string[] = [];
        for (let i = 0; i < pts.length - 1; i += 1) {
            const p0 = get(i - 1);
            const p1 = get(i);
            const p2 = get(i + 1);
            const p3 = get(i + 2);
            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;
            if (i === 0) {
                segments.push(`M ${p1.x} ${p1.y}`);
            }
            segments.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
        }
        return segments.join(' ');
    };
    const path = smoothPath();

    const applyPickedColor = React.useCallback((target: CurvesPickerTarget, color: string) => {
        const normalizedColor = normalizeHexColor(color);
        const sampleValue = getCurveSampleValue(channel, normalizedColor);
        const nextPoints = insertOrReplaceAnchor(sorted, target, sampleValue);
        const nextByChannel = { ...(curves.pointsByChannel ?? {}), [channel]: nextPoints };
        const nextPickerColors = { ...(curves.pickerColors ?? {}), [target]: normalizedColor };
        updateCurves({
            ...curves,
            channel,
            points: nextPoints,
            pointsByChannel: nextByChannel,
            pickerTarget: target,
            pickerColors: nextPickerColors,
        });
        setActivePointIndex(nextPoints.findIndex((point) => point.x === sampleValue && point.y === CURVE_PICKER_OUTPUTS[target]));
    }, [channel, curves, sorted, updateCurves]);

    const openFallbackColorInput = React.useCallback((target: CurvesPickerTarget) => {
        pendingPickerTargetRef.current = target;
        if (!hiddenColorInputRef.current) return;
        hiddenColorInputRef.current.value = pickerColors[target] ?? '#808080';
        hiddenColorInputRef.current.click();
    }, [pickerColors]);

    const handlePickerSample = React.useCallback(async (target: CurvesPickerTarget) => {
        updateCurves({ ...curves, pickerTarget: target });
        const EyeDropperConstructor = (window as Window & { EyeDropper?: new () => EyeDropperLike }).EyeDropper;
        if (!EyeDropperConstructor) {
            openFallbackColorInput(target);
            return;
        }

        try {
            setIsSampling(true);
            pendingPickerTargetRef.current = target;
            const eyeDropper = new EyeDropperConstructor();
            const result = await eyeDropper.open();
            applyPickedColor(target, result.sRGBHex);
        } catch {
            // Ignore cancelled picks and retain the current curve state.
        } finally {
            setIsSampling(false);
        }
    }, [applyPickedColor, curves, openFallbackColorInput, updateCurves]);

    const handleAddPoint = (event: { currentTarget: SVGSVGElement; clientX: number; clientY: number; button?: number; target: EventTarget | null }) => {
        if ((event.target as Element | null)?.tagName?.toLowerCase() === 'circle') return;
        if (typeof event.button === 'number' && event.button !== 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        const y = Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height));
        const next = [...sorted, { x, y }].sort((a, b) => a.x - b.x);
        const nextByChannel = { ...(curves.pointsByChannel ?? {}), [channel]: next };
        updateCurves({ ...curves, channel, pointsByChannel: nextByChannel, points: next });
        
        const newIndex = next.findIndex(p => p.x === x && p.y === y);
        setActivePointIndex(newIndex !== -1 ? newIndex : null);
    };

    const handleAddPointPointer = (event: React.PointerEvent<SVGSVGElement>) => {
        event.preventDefault();
        handleAddPoint(event);
    };

    const handleAddPointMouse = (event: React.MouseEvent<SVGSVGElement>) => {
        event.preventDefault();
        handleAddPoint(event);
    };

    const resetCurve = () => {
        const nextByChannel = { ...(curves.pointsByChannel ?? {}), [channel]: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
        updateCurves({ ...curves, channel, pointsByChannel: nextByChannel, points: nextByChannel[channel] ?? [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
        setActivePointIndex(null);
    };

    const handlePointChange = (index: number, x: number, y: number) => {
        const next = sorted.map((point, i) => (i === index ? { x, y } : point));
        const normalized = next.sort((a, b) => a.x - b.x);
        const newIndex = normalized.findIndex(p => p.x === x && p.y === y);
        setActivePointIndex(newIndex);
        
        const nextByChannel = { ...(curves.pointsByChannel ?? {}), [channel]: normalized };
        updateCurves({ ...curves, channel, pointsByChannel: nextByChannel, points: normalized });
    };

    const startDrag = (index: number) => (event: React.PointerEvent<SVGCircleElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setActivePointIndex(index);
        const rect = (event.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
        const move = (moveEvent: PointerEvent) => {
            const x = Math.min(1, Math.max(0, (moveEvent.clientX - rect.left) / rect.width));
            const y = Math.min(1, Math.max(0, 1 - (moveEvent.clientY - rect.top) / rect.height));
            handlePointChange(index, x, y);
        };
        const stop = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop);
    };

    const removePoint = (index: number) => (event: React.MouseEvent<SVGCircleElement>) => {
        event.stopPropagation();
        if (!event.shiftKey || index === 0 || index === sorted.length - 1) return;
        event.preventDefault();
        const next = sorted.filter((_, i) => i !== index);
        const nextByChannel = { ...(curves.pointsByChannel ?? {}), [channel]: next };
        updateCurves({ ...curves, channel, pointsByChannel: nextByChannel, points: next });
        setActivePointIndex(null);
    };

    const activePoint = activePointIndex !== null ? sorted[activePointIndex] : null;

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] text-muted-foreground">Click adds point. Shift-click removes.</div>
                <select
                    value={channel}
                    onChange={(e) => {
                        const nextChannel = e.target.value as CurvesChannel;
                        const existing = curves.pointsByChannel ?? { [channel]: sorted }; // Save current points if switching
                        updateCurves({ ...curves, channel: nextChannel, pointsByChannel: existing });
                        setActivePointIndex(null);
                    }}
                    className="bg-secondary/50 border border-border rounded-md px-2 py-1 text-[10px] text-foreground outline-none focus:ring-1 focus:ring-primary"
                >
                    <option value="rgb">RGB</option>
                    <option value="luminosity">Luminosity</option>
                    <option value="r">Red</option>
                    <option value="g">Green</option>
                    <option value="b">Blue</option>
                </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
                {(['shadow', 'midtone', 'highlight'] as CurvesPickerTarget[]).map((target) => {
                    const isActive = pickerTarget === target;
                    return (
                        <button
                            key={target}
                            type="button"
                            onClick={() => void handlePickerSample(target)}
                            className={`flex min-h-12 items-center gap-2 rounded-md border px-2 py-2 text-left transition-colors ${isActive ? 'border-white/60 bg-white/12' : 'border-border/60 bg-secondary/20 hover:bg-secondary/35'}`}
                            title={CURVE_PICKER_LABELS[target]}
                            disabled={isSampling}
                        >
                            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/25 bg-black/25 text-white">
                                <Pipette size={14} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[10px] font-medium text-foreground">{CURVE_PICKER_LABELS[target]}</span>
                                <span className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                                    <span className="inline-block h-3 w-3 rounded-full border border-white/30" style={{ backgroundColor: pickerColors[target] ?? '#808080' }} />
                                    {pickerColors[target] ? pickerColors[target]?.toUpperCase() : 'Sample'}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/50 bg-secondary/20 px-2 py-1.5 text-[10px] text-muted-foreground">
                <span>Picker source</span>
                <span>{typeof window !== 'undefined' && 'EyeDropper' in window ? (isSampling ? 'Sampling from screen...' : 'Screen picker') : 'Manual color picker fallback'}</span>
            </div>
            <input
                ref={hiddenColorInputRef}
                type="color"
                className="sr-only"
                onChange={(event) => applyPickedColor(pendingPickerTargetRef.current, event.target.value)}
                aria-label="Curves point color picker"
            />
            <div
                data-testid="curves-surface"
                className="relative w-full aspect-square border border-border/50 rounded-md overflow-hidden group shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                style={{ background: appearance.background }}
            >
                <svg
                    width="100%"
                    height="100%"
                    viewBox="0 0 160 160"
                    preserveAspectRatio="none"
                    className="absolute inset-0 w-full h-full"
                    onPointerDown={handleAddPointPointer}
                    onMouseDown={handleAddPointMouse}
                    onDoubleClick={resetCurve}
                    style={{ touchAction: 'none', pointerEvents: 'all', cursor: 'crosshair', userSelect: 'none' }}
                >
                    <path d={CURVES_HISTOGRAM_PATH} fill={appearance.histogramFill} />
                    <line x1="40" y1="0" x2="40" y2="160" stroke={appearance.grid} strokeWidth={0.5} strokeDasharray="4 2" />
                    <line x1="80" y1="0" x2="80" y2="160" stroke={appearance.grid} strokeWidth={0.5} strokeDasharray="4 2" />
                    <line x1="120" y1="0" x2="120" y2="160" stroke={appearance.grid} strokeWidth={0.5} strokeDasharray="4 2" />
                    <line x1="0" y1="120" x2="160" y2="120" stroke={appearance.grid} strokeWidth={0.5} strokeDasharray="4 2" />
                    <line x1="0" y1="80" x2="160" y2="80" stroke={appearance.grid} strokeWidth={0.5} strokeDasharray="4 2" />
                    <line x1="0" y1="40" x2="160" y2="40" stroke={appearance.grid} strokeWidth={0.5} strokeDasharray="4 2" />

                    <path d="M 0 160 L 160 0" stroke={appearance.diagonal} strokeWidth={1} fill="none" />
                    <path d={path} stroke={curveStroke} strokeWidth={2} fill="none" vectorEffect="non-scaling-stroke" />
                    {sorted.map((point, index) => (
                        <circle
                            key={`${point.x}-${point.y}-${index}`}
                            cx={toSvgX(point.x)}
                            cy={toSvgY(point.y)}
                            r={activePointIndex === index ? 8 : 6} 
                            fill={activePointIndex === index ? '#ffffff' : appearance.pointFill}
                            stroke={activePointIndex === index ? appearance.pointFill : appearance.pointStroke}
                            strokeWidth={2}
                            onPointerDown={startDrag(index)}
                            onClick={removePoint(index)}
                            className="transition-all"
                            style={{ cursor: 'pointer' }}
                        />
                    ))}
                </svg>
            </div>
            
            {/* Point Info Display */}
            {activePoint && activePointIndex !== null && (
                <div className="flex gap-4 text-xs font-mono bg-secondary/30 p-2 rounded justify-center">
                     <div className="flex gap-2 items-center">
                         <span className="text-muted-foreground uppercase text-[10px]">Input</span>
                         <input 
                            type="number" 
                            min="0" 
                            max="255"
                            className="w-12 h-6 bg-background border border-border rounded px-1 text-right"
                            value={Math.round(activePoint.x * 255)}
                            onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                handlePointChange(activePointIndex, Math.max(0, Math.min(255, val)) / 255, activePoint.y);
                            }}
                         />
                     </div>
                     <div className="flex gap-2 items-center">
                         <span className="text-muted-foreground uppercase text-[10px]">Output</span>
                         <input 
                            type="number" 
                            min="0" 
                            max="255"
                            className="w-12 h-6 bg-background border border-border rounded px-1 text-right"
                            value={Math.round(activePoint.y * 255)}
                            onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                handlePointChange(activePointIndex, activePoint.x, Math.max(0, Math.min(255, val)) / 255);
                            }}
                         />
                     </div>
                </div>
            )}
        </div>
    );
}

export function AdjustmentControls({ type, settings, onChange }: AdjustmentControlsProps) {

    const updateSettings = (partial: Partial<AdjustmentLayerSettings>) => {
        onChange({ ...settings, ...partial } as AdjustmentLayerSettings);
    };

    if (type === 'curves') {
        return <CurvesControls settings={settings as CurvesAdjustmentSettings} onChange={onChange} />;
    }

    if (type === 'levels') {
        const levels = settings as LevelsAdjustmentSettings;
        const updateLevels = (partial: Partial<LevelsAdjustmentSettings>) => updateSettings(partial);
        return (
            <div className="space-y-3">
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Black</span>
                        <span>{levels.black.toFixed(2)}</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={levels.black}
                        onChange={(e) => updateLevels({ black: parseFloat(e.target.value) })}
                        onDoubleClick={() => updateLevels({ black: 0 })}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Mid</span>
                        <span>{levels.mid.toFixed(2)}</span>
                    </div>
                    <input
                        type="range"
                        min="0.5"
                        max="2"
                        step="0.01"
                        value={levels.mid}
                        onChange={(e) => updateLevels({ mid: parseFloat(e.target.value) })}
                        onDoubleClick={() => updateLevels({ mid: 1 })}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>White</span>
                        <span>{levels.white.toFixed(2)}</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={levels.white}
                        onChange={(e) => updateLevels({ white: parseFloat(e.target.value) })}
                        onDoubleClick={() => updateLevels({ white: 1 })}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            </div>
        );
    }

    if (type === 'hue-saturation') {
        const hueSat = settings as HueSaturationSettings;
        const updateHueSat = (partial: Partial<HueSaturationSettings>) => updateSettings(partial);
        return (
            <div className="space-y-3">
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Hue</span>
                        <span>{hueSat.hue.toFixed(2)}</span>
                    </div>
                    <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.01"
                        value={hueSat.hue}
                        onChange={(e) => updateHueSat({ hue: parseFloat(e.target.value) })}
                        onDoubleClick={() => updateHueSat({ hue: 0 })}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Saturation</span>
                        <span>{hueSat.saturation.toFixed(2)}</span>
                    </div>
                    <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.01"
                        value={hueSat.saturation}
                        onChange={(e) => updateHueSat({ saturation: parseFloat(e.target.value) })}
                        onDoubleClick={() => updateHueSat({ saturation: 0 })}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Lightness</span>
                        <span>{hueSat.lightness.toFixed(2)}</span>
                    </div>
                    <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.01"
                        value={hueSat.lightness}
                        onChange={(e) => updateHueSat({ lightness: parseFloat(e.target.value) })}
                        onDoubleClick={() => updateHueSat({ lightness: 0 })}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            </div>
        );
    }

    if (type === 'exposure') {
        const exposure = settings as ExposureSettings;
        const updateExposure = (partial: Partial<ExposureSettings>) => updateSettings(partial);
        return (
            <div className="space-y-3">
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Exposure</span>
                        <span>{exposure.exposure.toFixed(2)}</span>
                    </div>
                    <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.01"
                        value={exposure.exposure}
                        onChange={(e) => updateExposure({ exposure: parseFloat(e.target.value) })}
                        onDoubleClick={() => updateExposure({ exposure: 0 })}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Contrast</span>
                        <span>{exposure.contrast.toFixed(2)}</span>
                    </div>
                    <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.01"
                        value={exposure.contrast}
                        onChange={(e) => updateExposure({ contrast: parseFloat(e.target.value) })}
                        onDoubleClick={() => updateExposure({ contrast: 0 })}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            </div>
        );
    }

    if (type === 'brightness-contrast') {
        const bc = settings as BrightnessContrastSettings;
        const updateBC = (partial: Partial<BrightnessContrastSettings>) => updateSettings(partial);
        return (
            <div className="space-y-3">
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Brightness</span>
                        <span>{bc.brightness.toFixed(2)}</span>
                    </div>
                    <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.01"
                        value={bc.brightness}
                        onChange={(e) => updateBC({ brightness: parseFloat(e.target.value) })}
                        onDoubleClick={() => updateBC({ brightness: 0 })}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Contrast</span>
                        <span>{bc.contrast.toFixed(2)}</span>
                    </div>
                    <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.01"
                        value={bc.contrast}
                        onChange={(e) => updateBC({ contrast: parseFloat(e.target.value) })}
                        onDoubleClick={() => updateBC({ contrast: 0 })}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            </div>
        );
    }

    if (type === 'color-balance') {
        const balance = settings as ColorBalanceSettings;
        const updateBalance = (partial: Partial<ColorBalanceSettings>) => updateSettings(partial);
        return (
            <div className="space-y-3">
                {([
                    { key: 'red', label: 'Red / Cyan' },
                    { key: 'green', label: 'Green / Magenta' },
                    { key: 'blue', label: 'Blue / Yellow' },
                ] as const).map((row) => (
                    <div key={row.key} className="space-y-2">
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{row.label}</span>
                            <span>{((balance[row.key] as number) || 0).toFixed(2)}</span>
                        </div>
                        <input
                            type="range"
                            min="-1"
                            max="1"
                            step="0.01"
                            value={(balance[row.key] as number) || 0}
                            onChange={(e) => updateBalance({ [row.key]: parseFloat(e.target.value) } as Partial<ColorBalanceSettings>)}
                            onDoubleClick={() => updateBalance({ [row.key]: 0 } as Partial<ColorBalanceSettings>)}
                            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                ))}
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <input
                        type="checkbox"
                        checked={balance.preserveLuminosity !== false}
                        onChange={(e) => updateBalance({ preserveLuminosity: e.target.checked })}
                    />
                    Preserve luminosity
                </label>
            </div>
        );
    }

    if (type === 'light-and-color') {
        const lac = settings as LightAndColorSettings;
        const updateLac = (partial: Partial<LightAndColorSettings>) => updateSettings(partial);
        return (
            <div className="space-y-3">
                {([
                    { key: 'temperature', label: 'Temperature' },
                    { key: 'tint', label: 'Tint' },
                    { key: 'exposure', label: 'Exposure' },
                    { key: 'saturation', label: 'Saturation' },
                    { key: 'vibrance', label: 'Vibrance' },
                ] as const).map((row) => (
                    <div key={row.key} className="space-y-2">
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{row.label}</span>
                            <span>{((lac[row.key] as number) || 0).toFixed(2)}</span>
                        </div>
                        <input
                            type="range"
                            min="-1"
                            max="1"
                            step="0.01"
                            value={(lac[row.key] as number) || 0}
                            onChange={(e) => updateLac({ [row.key]: parseFloat(e.target.value) } as Partial<LightAndColorSettings>)}
                            onDoubleClick={() => updateLac({ [row.key]: 0 } as Partial<LightAndColorSettings>)}
                            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                ))}
            </div>
        );
    }

    if (type === 'solid-color') {
        const solid = settings as SolidColorSettings;
        const updateSolid = (partial: Partial<SolidColorSettings>) => updateSettings(partial);
        return (
            <div className="space-y-3">
                <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground">Color</div>
                    <input
                        type="color"
                        value={solid.color || '#ff8800'}
                        onChange={(e) => updateSolid({ color: e.target.value })}
                        className="h-8 w-full rounded border border-border bg-background"
                    />
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Opacity</span>
                        <span>{(solid.opacity ?? 0.5).toFixed(2)}</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={solid.opacity ?? 0.5}
                        onChange={(e) => updateSolid({ opacity: parseFloat(e.target.value) })}
                        onDoubleClick={() => updateSolid({ opacity: 0.5 })}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </div>
                <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground">Blend Mode</div>
                    <select
                        value={solid.mode || 'tint'}
                        onChange={(e) => updateSolid({ mode: e.target.value as SolidColorSettings['mode'] })}
                        className="w-full bg-secondary/50 border border-border rounded-md px-2 py-1 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-primary"
                    >
                        <option value="tint">Tint</option>
                        <option value="multiply">Multiply</option>
                        <option value="screen">Screen</option>
                        <option value="overlay">Overlay</option>
                        <option value="add">Add</option>
                        <option value="subtract">Subtract</option>
                        <option value="darken">Darken</option>
                        <option value="lighten">Lighten</option>
                        <option value="diff">Difference</option>
                        <option value="exclusion">Exclusion</option>
                    </select>
                </div>
            </div>
        );
    }

    if (type === 'black-white') {
        return (
            <div className="text-[11px] text-muted-foreground">Black &amp; White has no sliders. Use opacity to blend.</div>
        );
    }

    const sat = settings as SaturationVibranceSettings;
    return (
        <div className="space-y-3">
            <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Saturation</span>
                    <span>{sat.saturation.toFixed(2)}</span>
                </div>
                <input
                    type="range"
                    min="-1"
                    max="1"
                    step="0.01"
                    value={sat.saturation}
                    onChange={(e) => onChange({ ...sat, saturation: parseFloat(e.target.value) })}
                    onDoubleClick={() => onChange({ ...sat, saturation: 0 })}
                    className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                />
            </div>
            <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Vibrance</span>
                    <span>{sat.vibrance.toFixed(2)}</span>
                </div>
                <input
                    type="range"
                    min="-1"
                    max="1"
                    step="0.01"
                    value={sat.vibrance}
                    onChange={(e) => onChange({ ...sat, vibrance: parseFloat(e.target.value) })}
                    onDoubleClick={() => onChange({ ...sat, vibrance: 0 })}
                    className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                />
            </div>
        </div>
    );
}
