import React from 'react';
import { 
    AdjustmentLayerType, 
    AdjustmentLayerSettings, 
    CurvesAdjustmentSettings, 
    CurvesChannel, 
    LevelsAdjustmentSettings, 
    HueSaturationSettings, 
    ExposureSettings, 
    SaturationVibranceSettings 
} from '@/types';

interface AdjustmentControlsProps {
    type: AdjustmentLayerType;
    settings: AdjustmentLayerSettings;
    onChange: (settings: AdjustmentLayerSettings) => void;
}

export function AdjustmentControls({ type, settings, onChange }: AdjustmentControlsProps) {

    const updateSettings = (partial: Partial<AdjustmentLayerSettings>) => {
        onChange({ ...settings, ...partial } as AdjustmentLayerSettings);
    };

    if (type === 'curves') {
        const curves = settings as CurvesAdjustmentSettings;
        const channel = curves.channel ?? 'rgb';
        const points = curves.pointsByChannel?.[channel] ?? curves.points ?? [{ x: 0, y: 0 }, { x: 1, y: 1 }];
        const sorted = [...points].sort((a, b) => a.x - b.x);
        
        const toSvgX = (value: number) => value * 160;
        const toSvgY = (value: number) => 160 - value * 160;
        const curveStroke = channel === 'r'
            ? '#ef4444'
            : channel === 'g'
                ? '#22c55e'
                : channel === 'b'
                    ? '#3b82f6'
                    : channel === 'luminosity'
                        ? '#e5e7eb'
                        : '#a855f7';
        
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

        const handleAddPoint = (event: { currentTarget: SVGSVGElement; clientX: number; clientY: number; button?: number; target: EventTarget | null }) => {
            if ((event.target as Element | null)?.tagName?.toLowerCase() === 'circle') return;
            if (typeof event.button === 'number' && event.button !== 0) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
            const y = Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height));
            const next = [...sorted, { x, y }].sort((a, b) => a.x - b.x);
            const nextByChannel = { ...(curves.pointsByChannel ?? {}), [channel]: next };
            // Update logic specific to Curves structure
            updateSettings({ channel, pointsByChannel: nextByChannel, points: sorted /* legacy prop sync */ } as unknown as Partial<AdjustmentLayerSettings>);
        };
        
        // Helper to update specific curves props
        const updateCurves = (newCurves: CurvesAdjustmentSettings) => {
            onChange(newCurves);
        }

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
            updateCurves({ ...curves, channel, pointsByChannel: nextByChannel });
        };

        const handlePointChange = (index: number, x: number, y: number) => {
            const next = sorted.map((point, i) => (i === index ? { x, y } : point));
            const normalized = next.sort((a, b) => a.x - b.x);
            const nextByChannel = { ...(curves.pointsByChannel ?? {}), [channel]: normalized };
             updateCurves({ ...curves, channel, pointsByChannel: nextByChannel });
        };

        const startDrag = (index: number) => (event: React.PointerEvent<SVGCircleElement>) => {
            event.preventDefault();
            event.stopPropagation();
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
            updateCurves({ ...curves, channel, pointsByChannel: nextByChannel });
        };

        return (
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] text-muted-foreground">Click to add points, Shift-click to remove.</div>
                    <select
                        value={channel}
                        onChange={(e) => {
                            const nextChannel = e.target.value as CurvesChannel;
                            const existing = curves.pointsByChannel ?? { [channel]: sorted }; // Save current points if switching
                            updateCurves({ ...curves, channel: nextChannel, pointsByChannel: existing });
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
                <svg
                    width={160}
                    height={160}
                    viewBox="0 0 160 160"
                    className="border border-border/50 rounded-md bg-background"
                    onPointerDown={handleAddPointPointer}
                    onMouseDown={handleAddPointMouse}
                    onDoubleClick={resetCurve}
                    style={{ touchAction: 'none', pointerEvents: 'all', cursor: 'crosshair' }}
                >
                    <path d="M 0 160 L 160 0" stroke="#27272a" strokeWidth={1} fill="none" />
                    <path d={path} stroke={curveStroke} strokeWidth={2} fill="none" />
                    {sorted.map((point, index) => (
                        <circle
                            key={`${point.x}-${point.y}-${index}`}
                            cx={toSvgX(point.x)}
                            cy={toSvgY(point.y)}
                            r={4}
                            fill="#a855f7"
                            stroke="#fff"
                            strokeWidth={1}
                            onPointerDown={startDrag(index)}
                            onClick={removePoint(index)}
                        />
                    ))}
                </svg>
            </div>
        );
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
