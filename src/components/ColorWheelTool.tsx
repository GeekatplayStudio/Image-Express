import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Info, Pipette, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColorPalette } from '@/types';
import { useI18n } from '@/providers/I18nProvider';

interface ColorWheelToolProps {
    onColorSelect: (color: string) => void;
    currentPalette: ColorPalette | null;
    onPaletteSelect: (palette: ColorPalette | null) => void;
    selectedColor?: string;
    variant?: 'floating' | 'panel';
}

type DragTarget = 'hue' | 'sv';

type HarmonyPalette = {
    id: string;
    name: string;
    colors: string[];
    createdAt: number;
};

const FLOATING_RING_SIZE = 240;
const FLOATING_RING_THICKNESS = 30;
const FLOATING_SV_SIZE = 164;
const PANEL_RING_SIZE = 210;
const PANEL_RING_THICKNESS = 26;
const PANEL_SV_SIZE = 142;

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

export const ColorWheelTool = ({ onColorSelect, currentPalette, onPaletteSelect, selectedColor: controlledColor, variant = 'floating' }: ColorWheelToolProps) => {
    const [internalSelectedColor, setInternalSelectedColor] = useState(() => normalizeHex(controlledColor ?? '#000000'));
    const [harmonyCount, setHarmonyCount] = useState(5);
    const [harmonyPaletteName, setHarmonyPaletteName] = useState('');
    const [isHarmonyListCollapsed, setIsHarmonyListCollapsed] = useState(false);
    const [savedHarmonyPalettes, setSavedHarmonyPalettes] = useState<HarmonyPalette[]>(() => {
        if (typeof window === 'undefined') return [];
        try {
            const raw = window.localStorage.getItem('saved-harmony-palettes');
            if (!raw) return [];
            const parsed = JSON.parse(raw) as HarmonyPalette[];
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter((entry) => entry && typeof entry.name === 'string' && Array.isArray(entry.colors))
                .map((entry) => ({
                    id: entry.id || `harmony-${Date.now()}-${Math.random()}`,
                    name: entry.name,
                    createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now(),
                    colors: entry.colors.map(normalizeHex).filter((color) => /^#[0-9a-f]{6}$/i.test(color)),
                }))
                .filter((entry) => entry.colors.length >= 2)
                .slice(0, 24);
        } catch {
            return [];
        }
    });
    const [editingHarmonyId, setEditingHarmonyId] = useState<string | null>(null);
    const [editingHarmonyName, setEditingHarmonyName] = useState('');
    const [harmonyImportStatus, setHarmonyImportStatus] = useState<string | null>(null);
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
    const harmonyImportInputRef = useRef<HTMLInputElement>(null);

    // Supports both local wheel interaction and external updates (e.g. eyedropper sample event).
    const selectedColor = useMemo(
        () => normalizeHex(typeof controlledColor === 'string' ? controlledColor : internalSelectedColor),
        [controlledColor, internalSelectedColor]
    );

    const { t } = useI18n();

    const { h, s, v } = useMemo(() => {
        const rgb = hexToRgb(selectedColor);
        return rgbToHsv(rgb.r, rgb.g, rgb.b);
    }, [selectedColor]);

    const rgb = useMemo(() => hexToRgb(selectedColor), [selectedColor]);

    const ringSize = variant === 'panel' ? PANEL_RING_SIZE : FLOATING_RING_SIZE;
    const ringThickness = variant === 'panel' ? PANEL_RING_THICKNESS : FLOATING_RING_THICKNESS;
    const svSize = variant === 'panel' ? PANEL_SV_SIZE : FLOATING_SV_SIZE;

    const harmonyColors = useMemo(() => getHarmonyColors(selectedColor, harmonyCount), [selectedColor, harmonyCount]);

    useEffect(() => {
        localStorage.setItem('saved-color-swatches', JSON.stringify(savedSwatches));
    }, [savedSwatches]);

    useEffect(() => {
        localStorage.setItem('saved-harmony-palettes', JSON.stringify(savedHarmonyPalettes));
    }, [savedHarmonyPalettes]);

    const applyColor = useCallback((color: string) => {
        const normalized = normalizeHex(color);
        setInternalSelectedColor(normalized);
        onColorSelect(normalized);
    }, [onColorSelect]);

    const saveHarmonyPalette = () => {
        const trimmed = harmonyPaletteName.trim();
        const name = trimmed.length > 0 ? trimmed : `Harmony ${harmonyColors.length} • ${selectedColor.toUpperCase()}`;
        const payload: HarmonyPalette = {
            id: `harmony-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
            name,
            colors: harmonyColors,
            createdAt: Date.now(),
        };
        setSavedHarmonyPalettes((prev) => [payload, ...prev].slice(0, 24));
        setHarmonyPaletteName('');
        setHarmonyImportStatus(null);
    };

    const exportHarmonyPalettes = () => {
        if (savedHarmonyPalettes.length === 0) {
            setHarmonyImportStatus('No harmony sets to export');
            return;
        }
        const payload = {
            version: 1,
            exportedAt: Date.now(),
            palettes: savedHarmonyPalettes.map((palette) => ({
                name: palette.name,
                colors: palette.colors,
                createdAt: palette.createdAt,
            })),
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `harmony-palettes-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);
        setHarmonyImportStatus('Harmony sets exported');
    };

    const importHarmonyPalettes = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const raw = await file.text();
            const parsed = JSON.parse(raw) as unknown;
            const candidate = Array.isArray(parsed)
                ? parsed
                : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { palettes?: unknown }).palettes)
                    ? (parsed as { palettes: unknown[] }).palettes
                    : []);

            const imported = (candidate as Array<{ name?: unknown; colors?: unknown; createdAt?: unknown }>)
                .filter((entry) => typeof entry?.name === 'string' && Array.isArray(entry?.colors))
                .map((entry, index) => {
                    const colors = (entry.colors as unknown[])
                        .filter((color): color is string => typeof color === 'string')
                        .map(normalizeHex)
                        .filter((color) => /^#[0-9a-f]{6}$/i.test(color));
                    return {
                        id: `harmony-import-${Date.now()}-${index}-${Math.floor(Math.random() * 100000)}`,
                        name: (entry.name as string).trim() || `Imported Harmony ${index + 1}`,
                        colors,
                        createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now(),
                    } as HarmonyPalette;
                })
                .filter((entry) => entry.colors.length >= 2)
                .slice(0, 24);

            if (imported.length === 0) {
                setHarmonyImportStatus('No valid harmony sets found in file');
            } else {
                setSavedHarmonyPalettes((prev) => {
                    const bySignature = new Set(prev.map((entry) => `${entry.name}::${entry.colors.join(',')}`));
                    const uniqueImported = imported.filter((entry) => !bySignature.has(`${entry.name}::${entry.colors.join(',')}`));
                    return [...uniqueImported, ...prev].slice(0, 24);
                });
                setHarmonyImportStatus(`Imported ${imported.length} harmony set${imported.length === 1 ? '' : 's'}`);
            }
        } catch {
            setHarmonyImportStatus('Invalid harmony JSON file');
        } finally {
            event.target.value = '';
        }
    };

    const applyHarmonyPalette = (palette: HarmonyPalette) => {
        if (palette.colors.length < 2) return;
        setHarmonyCount(Math.max(2, Math.min(6, palette.colors.length)));
        applyColor(palette.colors[0]);
    };

    const startRenameHarmonyPalette = (palette: HarmonyPalette) => {
        setEditingHarmonyId(palette.id);
        setEditingHarmonyName(palette.name);
    };

    const saveRenameHarmonyPalette = () => {
        if (!editingHarmonyId) return;
        const nextName = editingHarmonyName.trim();
        if (!nextName) return;
        setSavedHarmonyPalettes((prev) => prev.map((palette) => (
            palette.id === editingHarmonyId
                ? { ...palette, name: nextName }
                : palette
        )));
        setEditingHarmonyId(null);
        setEditingHarmonyName('');
    };

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
    const hueHandleRadius = (ringSize / 2) - (ringThickness / 2);
    const hueHandleX = (ringSize / 2) + (Math.cos(hueRadians) * hueHandleRadius);
    const hueHandleY = (ringSize / 2) + (Math.sin(hueRadians) * hueHandleRadius);

    const svX = s * svSize;
    const svY = (1 - v) * svSize;

    return (
        <div className={cn(
            variant === 'panel'
                ? 'w-full rounded-xl border border-border/70 bg-card p-3 overflow-x-hidden'
                : 'fixed left-[74px] top-16 z-[40] w-[430px] max-h-[calc(100vh-5rem)] overflow-y-auto scrollbar-thin rounded-2xl border border-border/70 bg-card/95 p-4 shadow-2xl backdrop-blur-sm'
        )}>
            <div className="mb-3 flex items-center justify-between">
                <h3 className={cn('font-semibold tracking-tight', variant === 'panel' ? 'text-sm' : 'text-2xl')}>{t('wheel.foregroundColor')}</h3>
                {variant !== 'panel' && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-secondary/50"
                            title={t('wheel.info')}
                            aria-label={t('wheel.info')}
                        >
                            <Info size={18} />
                        </button>
                        <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-secondary/50"
                            title={t('wheel.eyedropper')}
                            aria-label={t('wheel.eyedropper')}
                        >
                            <Pipette size={18} />
                        </button>
                    </div>
                )}
            </div>

            <div className={cn('flex gap-5', variant === 'panel' && 'flex-col gap-4')}>
                <div className="flex flex-col items-center gap-3">
                    <div
                        ref={ringRef}
                        className="relative cursor-crosshair rounded-full border border-border/60 shadow-[0_10px_24px_rgba(0,0,0,0.28)]"
                        style={{
                            width: `${ringSize}px`,
                            height: `${ringSize}px`,
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
                                left: `${ringThickness}px`,
                                top: `${ringThickness}px`,
                                width: `${ringSize - (ringThickness * 2)}px`,
                                height: `${ringSize - (ringThickness * 2)}px`,
                            }}
                        />

                        <div
                            ref={squareRef}
                            className="absolute overflow-hidden rounded-2xl border border-black/40 shadow-[0_10px_24px_rgba(0,0,0,0.3)]"
                            style={{
                                left: `${(ringSize - svSize) / 2}px`,
                                top: `${(ringSize - svSize) / 2}px`,
                                width: `${svSize}px`,
                                height: `${svSize}px`,
                                backgroundColor: `hsl(${h}, 100%, 50%)`,
                            }}
                            onMouseDown={(event) => {
                                event.stopPropagation();
                                setDragTarget('sv');
                                updateSvFromClient(event.clientX, event.clientY);
                            }}
                        >
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white via-white/70 to-transparent" />
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black to-transparent" />
                            <div
                                className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_6px_rgba(0,0,0,0.6)]"
                                style={{ left: `${svX}px`, top: `${svY}px` }}
                            />
                        </div>

                        <div
                            className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_1px_6px_rgba(0,0,0,0.6)]"
                            style={{ left: `${hueHandleX}px`, top: `${hueHandleY}px` }}
                        />
                    </div>

                    <div className="flex w-full items-center justify-between gap-2">
                        <button
                            type="button"
                            className="h-12 w-12 rounded-full border border-border shadow-sm"
                            style={{ backgroundColor: selectedColor }}
                            aria-label={t('wheel.selectedPreview')}
                        />
                        <div className="flex-1 rounded-lg border border-border/60 bg-black px-3 py-2 text-right font-mono text-2xl tracking-wide text-white">
                            {selectedColor.toUpperCase()}
                        </div>
                    </div>
                </div>

                <div className={cn('flex min-w-[110px] flex-col gap-3', variant === 'panel' && 'min-w-0')}>
                    <label className="text-xs text-muted-foreground">RGB</label>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="rounded-lg border border-border/60 bg-background px-2 py-1 text-center">{rgb.r}</div>
                        <div className="rounded-lg border border-border/60 bg-background px-2 py-1 text-center">{rgb.g}</div>
                        <div className="rounded-lg border border-border/60 bg-background px-2 py-1 text-center">{rgb.b}</div>
                    </div>

                    <label className="text-xs text-muted-foreground">{t('picker.harmony')}</label>
                    <select
                        className="rounded-lg border border-border/60 bg-secondary/40 px-2 py-1 text-xs"
                        value={harmonyCount}
                        onChange={(event) => setHarmonyCount(Number(event.target.value))}
                        aria-label={t('wheel.harmonyMode')}
                    >
                        <option value={2}>{t('wheel.complementary')}</option>
                        <option value={3}>{t('wheel.triadic')}</option>
                        <option value={4}>{t('wheel.tetradic')}</option>
                        <option value={5}>{t('wheel.pentadic')}</option>
                        <option value={6}>{t('wheel.hexadic')}</option>
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
                                aria-label={t('wheel.useHarmonyColor', { color })}
                                title={color.toUpperCase()}
                            />
                        ))}
                    </div>

                    <div className="space-y-2 rounded-lg border border-border/50 bg-secondary/20 p-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('wheel.saveHarmonySet')}</div>
                        <div className="flex flex-wrap gap-2">
                            <input
                                type="text"
                                value={harmonyPaletteName}
                                onChange={(event) => setHarmonyPaletteName(event.target.value)}
                                placeholder={t('wheel.paletteName')}
                                className="h-8 flex-1 rounded border border-border/60 bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                                aria-label={t('wheel.harmonyPaletteName')}
                            />
                            <button
                                type="button"
                                onClick={saveHarmonyPalette}
                                className="h-8 rounded border border-border/60 bg-background px-2 text-xs hover:bg-secondary/50"
                                aria-label={t('wheel.saveHarmonyPalette')}
                            >
                                {t('common.save')}
                            </button>
                            <button
                                type="button"
                                onClick={exportHarmonyPalettes}
                                className="h-8 rounded border border-border/60 bg-background px-2 text-xs hover:bg-secondary/50"
                                aria-label={t('wheel.exportPalettes')}
                            >
                                {t('common.export')}
                            </button>
                            <button
                                type="button"
                                onClick={() => harmonyImportInputRef.current?.click()}
                                className="h-8 rounded border border-border/60 bg-background px-2 text-xs hover:bg-secondary/50"
                                aria-label={t('wheel.importPalettes')}
                            >
                                {t('common.import')}
                            </button>
                            <input
                                ref={harmonyImportInputRef}
                                type="file"
                                accept="application/json,.json"
                                className="hidden"
                                onChange={importHarmonyPalettes}
                                aria-label={t('wheel.importJson')}
                            />
                        </div>
                        {harmonyImportStatus && (
                            <div className="text-[10px] text-muted-foreground">{harmonyImportStatus}</div>
                        )}
                        {savedHarmonyPalettes.length > 0 && (
                            <div className="space-y-2">
                                <button
                                    type="button"
                                    onClick={() => setIsHarmonyListCollapsed((prev) => !prev)}
                                    className="w-full h-7 rounded border border-border/60 bg-background px-2 text-left text-[10px] uppercase tracking-wide text-muted-foreground hover:bg-secondary/40"
                                >
                                    {isHarmonyListCollapsed ? t('wheel.showHarmonySets') : t('wheel.hideHarmonySets')} ({savedHarmonyPalettes.length})
                                </button>
                                {!isHarmonyListCollapsed && (
                                    <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
                                        {savedHarmonyPalettes.map((palette) => (
                                            <div key={palette.id} className="rounded border border-border/50 bg-background/80 p-2">
                                                <div className="mb-1 flex items-center justify-between gap-2">
                                                    {editingHarmonyId === palette.id ? (
                                                        <div className="flex w-full items-center gap-1">
                                                            <input
                                                                type="text"
                                                                value={editingHarmonyName}
                                                                onChange={(event) => setEditingHarmonyName(event.target.value)}
                                                                className="h-7 flex-1 rounded border border-border/60 bg-background px-2 text-[11px] outline-none focus:ring-1 focus:ring-primary"
                                                                aria-label={t('wheel.renameHarmonyPalette', { name: palette.name })}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={saveRenameHarmonyPalette}
                                                                className="h-7 rounded border border-border/60 bg-background px-2 text-[10px] hover:bg-secondary/50"
                                                            >
                                                                {t('common.save')}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setEditingHarmonyId(null);
                                                                    setEditingHarmonyName('');
                                                                }}
                                                                className="h-7 rounded border border-border/60 bg-background px-2 text-[10px] hover:bg-secondary/50"
                                                            >
                                                                {t('common.cancel')}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => applyHarmonyPalette(palette)}
                                                                className="truncate text-left text-[11px] font-medium hover:text-primary"
                                                                title={palette.name}
                                                            >
                                                                {palette.name}
                                                            </button>
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => startRenameHarmonyPalette(palette)}
                                                                    className="h-6 rounded border border-border/60 bg-background px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                                                                    aria-label={t('wheel.renameHarmonyPalette', { name: palette.name })}
                                                                >
                                                                    {t('common.rename')}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSavedHarmonyPalettes((prev) => prev.filter((entry) => entry.id !== palette.id))}
                                                                    className="text-muted-foreground hover:text-foreground"
                                                                    aria-label={t('wheel.deleteHarmonyPalette', { name: palette.name })}
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                                <div className="grid grid-cols-6 gap-1">
                                                    {palette.colors.map((swatch, index) => (
                                                        <button
                                                            key={`${palette.id}-${swatch}-${index}`}
                                                            type="button"
                                                            className="h-4 rounded border border-border/60"
                                                            style={{ backgroundColor: swatch }}
                                                            onClick={() => applyColor(swatch)}
                                                            title={swatch.toUpperCase()}
                                                            aria-label={t('wheel.applyHarmonyColor', { color: swatch })}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-4 border-t border-border/60 pt-3">
                <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold">{t('wheel.swatches')}</h4>
                    <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 hover:bg-secondary/50"
                        onClick={() => {
                            if (savedSwatches.includes(selectedColor)) return;
                            setSavedSwatches((prev) => [selectedColor, ...prev].slice(0, 20));
                        }}
                        aria-label={t('wheel.addSwatch')}
                        title={t('wheel.addSwatch')}
                    >
                        <Plus size={16} />
                    </button>
                </div>

                <div className={cn('grid gap-2', variant === 'panel' ? 'grid-cols-6' : 'grid-cols-8')}>
                    {savedSwatches.map((color, index) => (
                        <button
                            key={`${color}-${index}`}
                            type="button"
                            className="group relative h-8 rounded border border-border/70"
                            style={{ backgroundColor: color }}
                            onClick={() => applyColor(color)}
                            aria-label={t('wheel.useSavedSwatch', { color })}
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
                    {t('wheel.activePalette')} <span className="font-medium text-foreground">{currentPalette.name}</span>
                    <button
                        type="button"
                        className="ml-2 text-primary hover:underline"
                        onClick={() => onPaletteSelect(null)}
                    >
                        {t('common.clear')}
                    </button>
                </div>
            )}
        </div>
    );
};
