import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Info, Pipette, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColorPalette } from '@/types';

interface ColorWheelToolProps {
    onColorSelect: (color: string) => void;
    currentPalette: ColorPalette | null;
    onPaletteSelect: (palette: ColorPalette | null) => void;
}

type DragTarget = 'hue' | 'sv';

const RING_SIZE = 220;
const RING_THICKNESS = 28;
const SV_SIZE = 132;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const normalizeHex = (hex: string) => {
    const clean = hex.replace('#', '').trim();
    if (clean.length === 3) {
        const expanded = clean.split('').map((token) => token + token).join('');
        return `#${expanded}`;
    }
    if (clean.length !== 6) return '#000000';
    return `#${clean.toLowerCase()}`;
};

const hexToRgb = (hex: string) => {
    const safe = normalizeHex(hex);
    return {
        r: parseInt(safe.slice(1, 3), 16),
        g: parseInt(safe.slice(3, 5), 16),
        b: parseInt(safe.slice(5, 7), 16),
    };
};

const rgbToHex = (r: number, g: number, b: number) => {
    const toHex = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const rgbToHsv = (r: number, g: number, b: number) => {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;

    let hue = 0;
    if (delta !== 0) {
        if (max === rn) {
            hue = 60 * (((gn - bn) / delta) % 6);
        } else if (max === gn) {
            hue = 60 * (((bn - rn) / delta) + 2);
        } else {
            hue = 60 * (((rn - gn) / delta) + 4);
        }
    }

    if (hue < 0) hue += 360;
    const saturation = max === 0 ? 0 : delta / max;
    const value = max;
    return { h: hue, s: saturation, v: value };
};

const hsvToRgb = (h: number, s: number, v: number) => {
    const hh = ((h % 360) + 360) % 360;
    const c = v * s;
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
    const m = v - c;

    let rp = 0;
    let gp = 0;
    let bp = 0;

    if (hh < 60) {
        rp = c;
        gp = x;
    } else if (hh < 120) {
        rp = x;
        gp = c;
    } else if (hh < 180) {
        gp = c;
        bp = x;
    } else if (hh < 240) {
        gp = x;
        bp = c;
    } else if (hh < 300) {
        rp = x;
        bp = c;
    } else {
        rp = c;
        bp = x;
    }

    return {
        r: Math.round((rp + m) * 255),
        g: Math.round((gp + m) * 255),
        b: Math.round((bp + m) * 255),
    };
};

const getHarmonyColors = (baseHex: string, count: number) => {
    const { h, s, v } = rgbToHsv(...Object.values(hexToRgb(baseHex)) as [number, number, number]);
    const step = 360 / Math.max(2, count);
    const colors: string[] = [normalizeHex(baseHex)];
    for (let index = 1; index < Math.max(2, count); index += 1) {
        const rgb = hsvToRgb(h + (index * step), s, v);
        colors.push(rgbToHex(rgb.r, rgb.g, rgb.b));
    }
    return colors;
};

export const ColorWheelTool = ({ onColorSelect, currentPalette, onPaletteSelect }: ColorWheelToolProps) => {
    const [selectedColor, setSelectedColor] = useState('#000000');
    const [harmonyCount, setHarmonyCount] = useState(5);
    const [savedSwatches, setSavedSwatches] = useState<string[]>(() => {
        if (typeof window === 'undefined') return [];
        try {
            const saved = window.localStorage.getItem('saved-color-swatches');
            if (!saved) return [];
            const parsed = JSON.parse(saved) as string[];
            if (!Array.isArray(parsed)) return [];
            return parsed
                .map(normalizeHex)
                .filter((color) => /^#[0-9a-f]{6}$/i.test(color));
        } catch {
            return [];
        }
    });
    const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
    const ringRef = useRef<HTMLDivElement>(null);
    const squareRef = useRef<HTMLDivElement>(null);

    const { h, s, v } = useMemo(() => {
        const rgb = hexToRgb(selectedColor);
        return rgbToHsv(rgb.r, rgb.g, rgb.b);
    }, [selectedColor]);

    const rgb = useMemo(() => hexToRgb(selectedColor), [selectedColor]);

    const harmonyColors = useMemo(() => getHarmonyColors(selectedColor, harmonyCount), [selectedColor, harmonyCount]);

    useEffect(() => {
        localStorage.setItem('saved-color-swatches', JSON.stringify(savedSwatches));
    }, [savedSwatches]);

    const applyColor = useCallback((color: string) => {
        const normalized = normalizeHex(color);
        setSelectedColor(normalized);
        onColorSelect(normalized);
    }, [onColorSelect]);

    const updateHueFromClient = useCallback((clientX: number, clientY: number) => {
        const ring = ringRef.current;
        if (!ring) return;
        const rect = ring.getBoundingClientRect();
        const centerX = rect.left + (rect.width / 2);
        const centerY = rect.top + (rect.height / 2);
        const angle = Math.atan2(clientY - centerY, clientX - centerX);
        const degrees = ((angle * 180) / Math.PI + 360) % 360;
        const nextRgb = hsvToRgb(degrees, s, v);
        applyColor(rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b));
    }, [applyColor, s, v]);

    const updateSvFromClient = useCallback((clientX: number, clientY: number) => {
        const square = squareRef.current;
        if (!square) return;
        const rect = square.getBoundingClientRect();
        const x = clamp01((clientX - rect.left) / rect.width);
        const y = clamp01((clientY - rect.top) / rect.height);
        const saturation = x;
        const value = 1 - y;
        const nextRgb = hsvToRgb(h, saturation, value);
        applyColor(rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b));
    }, [applyColor, h]);

    useEffect(() => {
        if (!dragTarget) return;

        const handleMouseMove = (event: MouseEvent) => {
            if (dragTarget === 'hue') {
                updateHueFromClient(event.clientX, event.clientY);
                return;
            }
            updateSvFromClient(event.clientX, event.clientY);
        };

        const handleMouseUp = () => {
            setDragTarget(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragTarget, updateHueFromClient, updateSvFromClient]);

    const hueRadians = (h * Math.PI) / 180;
    const hueHandleRadius = (RING_SIZE / 2) - (RING_THICKNESS / 2);
    const hueHandleX = (RING_SIZE / 2) + (Math.cos(hueRadians) * hueHandleRadius);
    const hueHandleY = (RING_SIZE / 2) + (Math.sin(hueRadians) * hueHandleRadius);

    const svX = s * SV_SIZE;
    const svY = (1 - v) * SV_SIZE;

    return (
        <div className="fixed left-[74px] top-16 z-[40] w-[360px] rounded-2xl border border-border/70 bg-card/95 p-4 shadow-2xl backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-2xl font-semibold tracking-tight">Foreground color</h3>
                <div className="flex items-center gap-2 text-muted-foreground">
                    <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-secondary/50"
                        title="Color wheel info"
                        aria-label="Color wheel info"
                    >
                        <Info size={18} />
                    </button>
                    <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-secondary/50"
                        title="Eyedropper"
                        aria-label="Eyedropper"
                    >
                        <Pipette size={18} />
                    </button>
                </div>
            </div>

            <div className="flex gap-4">
                <div className="flex flex-col items-center gap-3">
                    <div
                        ref={ringRef}
                        className="relative cursor-crosshair rounded-full"
                        style={{
                            width: `${RING_SIZE}px`,
                            height: `${RING_SIZE}px`,
                            background: 'conic-gradient(red, #ff0, #0f0, #0ff, #00f, #f0f, red)',
                        }}
                        onMouseDown={(event) => {
                            setDragTarget('hue');
                            updateHueFromClient(event.clientX, event.clientY);
                        }}
                    >
                        <div
                            className="absolute rounded-full bg-card"
                            style={{
                                left: `${RING_THICKNESS}px`,
                                top: `${RING_THICKNESS}px`,
                                width: `${RING_SIZE - (RING_THICKNESS * 2)}px`,
                                height: `${RING_SIZE - (RING_THICKNESS * 2)}px`,
                            }}
                        />

                        <div
                            ref={squareRef}
                            className="absolute overflow-hidden rounded-xl border border-black/30"
                            style={{
                                left: `${(RING_SIZE - SV_SIZE) / 2}px`,
                                top: `${(RING_SIZE - SV_SIZE) / 2}px`,
                                width: `${SV_SIZE}px`,
                                height: `${SV_SIZE}px`,
                                backgroundColor: `hsl(${h}, 100%, 50%)`,
                            }}
                            onMouseDown={(event) => {
                                event.stopPropagation();
                                setDragTarget('sv');
                                updateSvFromClient(event.clientX, event.clientY);
                            }}
                        >
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white to-transparent" />
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black to-transparent" />
                            <div
                                className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                                style={{ left: `${svX}px`, top: `${svY}px` }}
                            />
                        </div>

                        <div
                            className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow"
                            style={{ left: `${hueHandleX}px`, top: `${hueHandleY}px` }}
                        />
                    </div>

                    <div className="flex w-full items-center justify-between gap-2">
                        <button
                            type="button"
                            className="h-12 w-12 rounded-full border border-border shadow-sm"
                            style={{ backgroundColor: selectedColor }}
                            aria-label="Selected color preview"
                        />
                        <div className="flex-1 rounded-lg border border-border/60 bg-black px-3 py-2 text-right font-mono text-2xl tracking-wide text-white">
                            {selectedColor.toUpperCase()}
                        </div>
                    </div>
                </div>

                <div className="flex min-w-[110px] flex-col gap-3">
                    <label className="text-xs text-muted-foreground">RGB</label>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="rounded-lg border border-border/60 bg-background px-2 py-1 text-center">{rgb.r}</div>
                        <div className="rounded-lg border border-border/60 bg-background px-2 py-1 text-center">{rgb.g}</div>
                        <div className="rounded-lg border border-border/60 bg-background px-2 py-1 text-center">{rgb.b}</div>
                    </div>

                    <label className="text-xs text-muted-foreground">Harmony</label>
                    <select
                        className="rounded-lg border border-border/60 bg-secondary/40 px-2 py-1 text-xs"
                        value={harmonyCount}
                        onChange={(event) => setHarmonyCount(Number(event.target.value))}
                        aria-label="Harmony mode"
                    >
                        <option value={2}>Complementary</option>
                        <option value={3}>Triadic</option>
                        <option value={4}>Tetradic</option>
                        <option value={5}>Pentadic</option>
                        <option value={6}>Hexadic</option>
                    </select>

                    <div className="grid grid-cols-2 gap-2">
                        {harmonyColors.map((color, index) => (
                            <button
                                key={`${color}-${index}`}
                                type="button"
                                className={cn(
                                    'h-8 rounded border border-border/70 transition-transform hover:scale-[1.03]',
                                    color.toLowerCase() === selectedColor.toLowerCase() && 'ring-2 ring-primary/70 ring-offset-1 ring-offset-card'
                                )}
                                style={{ backgroundColor: color }}
                                onClick={() => applyColor(color)}
                                aria-label={`Use harmony color ${color}`}
                                title={color.toUpperCase()}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-4 border-t border-border/60 pt-3">
                <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Swatches</h4>
                    <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 hover:bg-secondary/50"
                        onClick={() => {
                            if (savedSwatches.includes(selectedColor)) return;
                            setSavedSwatches((prev) => [selectedColor, ...prev].slice(0, 20));
                        }}
                        aria-label="Add swatch"
                        title="Add swatch"
                    >
                        <Plus size={16} />
                    </button>
                </div>

                <div className="grid grid-cols-8 gap-2">
                    {savedSwatches.map((color, index) => (
                        <button
                            key={`${color}-${index}`}
                            type="button"
                            className="group relative h-8 rounded border border-border/70"
                            style={{ backgroundColor: color }}
                            onClick={() => applyColor(color)}
                            aria-label={`Use saved swatch ${color}`}
                        >
                            <span className="sr-only">{color}</span>
                            <span
                                role="button"
                                tabIndex={-1}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setSavedSwatches((prev) => prev.filter((entry) => entry !== color));
                                }}
                                className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-card text-muted-foreground shadow group-hover:flex"
                            >
                                <Trash2 size={10} />
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {currentPalette && (
                <div className="mt-3 rounded-lg border border-border/60 bg-secondary/20 p-2 text-xs text-muted-foreground">
                    Active palette: <span className="font-medium text-foreground">{currentPalette.name}</span>
                    <button
                        type="button"
                        className="ml-2 text-primary hover:underline"
                        onClick={() => onPaletteSelect(null)}
                    >
                        Clear
                    </button>
                </div>
            )}
        </div>
    );
};
