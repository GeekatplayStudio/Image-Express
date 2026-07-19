import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/I18nProvider';

// --- Color Utils ---

// Force hex to be #RRGGBB
const normalizeHex = (hex: string) => {
    let clean = hex.replace('#', '');
    if (clean.length === 3) {
        clean = clean.split('').map(c => c + c).join('');
    }
    if (clean.length !== 6) return '#000000';
    return '#' + clean;
};

const hexToHsl = (hex: string) => {
    const r = parseInt(hex.substring(1, 3), 16) / 255;
    const g = parseInt(hex.substring(3, 5), 16) / 255;
    const b = parseInt(hex.substring(5, 7), 16) / 255;

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; 
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
};

const hslToHex = (h: number, s: number, l: number) => {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
};

const getComplementaryColors = (hex: string, count: number): string[] => {
    if (count < 2) return [];
    const { h, s, l } = hexToHsl(normalizeHex(hex));
    const step = 360 / count;
    const colors = [];
    for (let i = 1; i < count; i++) {
        colors.push(hslToHex((h + step * i) % 360, s, l));
    }
    return colors;
};

// --- Components ---

interface ColorPickerProps {
    color: string;
    onChange: (color: string) => void;
    label?: string;
    allowAlpha?: boolean; // Note: Current implementation is RGB-only for simplicity
}

type Palette = {
    id: string;
    name: string;
    colors: string[];
};

export function ColorPicker({ color, onChange, label = 'Color' }: ColorPickerProps) {
    const { t } = useI18n();
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'wheel' | 'palette'>('wheel');
    const [palettes, setPalettes] = useState<Palette[]>([]);
    const [selectedPaletteId, setSelectedPaletteId] = useState<string | null>(null);
    const [complementaryCount, setComplementaryCount] = useState(3);
    
    // Safety check for color
    const safeColor = normalizeHex(color || '#000000');

    // Load palettes on mount
    useEffect(() => {
        const saved = localStorage.getItem('userParams.palettes');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setPalettes(parsed);
                if (parsed.length > 0) setSelectedPaletteId(parsed[0].id);
            } catch (e) { console.error("Failed to load palettes", e); }
        } else {
            // Defaults
            const defaults: Palette[] = [
                { id: 'p1', name: 'Essentials', colors: ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'] },
                { id: 'p2', name: 'Pastels', colors: ['#fbf8cc', '#fde4cf', '#ffcfd2', '#f1c0e8', '#cfbaf0', '#a3c4f3', '#90dbf4', '#8eecf5'] }
            ];
            setPalettes(defaults);
            setSelectedPaletteId('p1');
        }
    }, []);

    // Save palettes on change
    useEffect(() => {
        if (palettes.length > 0) {
            localStorage.setItem('userParams.palettes', JSON.stringify(palettes));
        }
    }, [palettes]);

    const handleCreatePalette = () => {
        const newPalette: Palette = {
            id: `p-${Date.now()}`,
            name: 'New Palette',
            colors: [safeColor]
        };
        setPalettes([...palettes, newPalette]);
        setSelectedPaletteId(newPalette.id);
    };

    const handleDeletePalette = (id: string) => {
        const next = palettes.filter(p => p.id !== id);
        setPalettes(next);
        if (selectedPaletteId === id) {
            setSelectedPaletteId(next.length > 0 ? next[0].id : null);
        }
    };

    const handleAddToPalette = () => {
        if (!selectedPaletteId) {
            if (palettes.length === 0) {
                handleCreatePalette();
            }
            return;
        }
        setPalettes(prev => prev.map(p => {
            if (p.id === selectedPaletteId) {
                if (p.colors.includes(safeColor)) return p;
                return { ...p, colors: [...p.colors, safeColor] };
            }
            return p;
        }));
    };

    const handleRemoveFromPalette = (c: string) => {
        if (!selectedPaletteId) return;
        setPalettes(prev => prev.map(p => {
            if (p.id === selectedPaletteId) {
                return { ...p, colors: p.colors.filter(col => col !== c) };
            }
            return p;
        }));
    };

    const complementaryColors = useMemo(() => {
        return getComplementaryColors(safeColor, complementaryCount);
    }, [safeColor, complementaryCount]);

    return (
        <div className="space-y-1">
            {label && (
                <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase text-muted-foreground font-medium">{label}</label>
                </div>
            )}
            
            <div className="relative">
                <button 
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 w-full p-1 border border-border rounded hover:bg-secondary/30 transition-colors"
                >
                    <div 
                        className="w-8 h-8 rounded border border-border/50 shadow-sm"
                        style={{ backgroundColor: safeColor }}
                    />
                    <span className="text-xs font-mono flex-1 text-left">{safeColor.toUpperCase()}</span>
                </button>

                {isOpen && (
                    <div className="absolute top-full left-0 mt-2 z-50 w-64 bg-card border border-border rounded-lg shadow-xl p-3 animate-in fade-in zoom-in-95 origin-top-left">
                        {/* Tabs */}
                        <div className="flex border-b border-border/50 mb-3">
                            <button 
                                onClick={() => setActiveTab('wheel')}
                                className={cn(
                                    "flex-1 text-xs py-1.5 font-medium border-b-2 transition-colors",
                                    activeTab === 'wheel' ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {t('picker.wheel')}
                            </button>
                            <button 
                                onClick={() => setActiveTab('palette')}
                                className={cn(
                                    "flex-1 text-xs py-1.5 font-medium border-b-2 transition-colors",
                                    activeTab === 'palette' ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {t('picker.palettes')}
                            </button>
                        </div>

                        {activeTab === 'wheel' && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                     <input 
                                        type="color" 
                                        value={safeColor} 
                                        onChange={(e) => onChange(e.target.value)}
                                        className="w-full h-32 rounded cursor-pointer"
                                    />
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            value={safeColor}
                                            onChange={(e) => onChange(e.target.value)}
                                            className="flex-1 h-8 rounded border border-input bg-transparent px-2 text-xs"
                                        />
                                        <button 
                                            onClick={handleAddToPalette}
                                            className="p-1.5 hover:bg-secondary rounded border border-border"
                                            title={t('picker.addToPalette')}
                                        >
                                            <Plus size={16} />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2 pt-2 border-t border-border/50">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-muted-foreground uppercase">{t('picker.harmony')}</span>
                                        <select 
                                            value={complementaryCount}
                                            onChange={(e) => setComplementaryCount(parseInt(e.target.value))}
                                            className="h-6 text-[10px] bg-secondary border-none rounded px-1"
                                        >
                                            <option value={2}>{t('picker.complementary')}</option>
                                            <option value={3}>{t('picker.triadic')}</option>
                                            <option value={4}>{t('picker.tetradic')}</option>
                                            <option value={5}>{t('picker.pentadic')}</option>
                                            <option value={6}>{t('picker.hexadic')}</option>
                                        </select>
                                    </div>
                                    <div className="flex gap-1 h-8">
                                        <div 
                                            className="h-full flex-1 rounded-l border border-border" 
                                            style={{ backgroundColor: safeColor }} 
                                            title={t('picker.primary')}
                                        />
                                        {complementaryColors.map((c, i) => (
                                            <button
                                                key={i} 
                                                className={cn(
                                                    "h-full flex-1 border border-border hover:scale-110 active:scale-95 transition-transform",
                                                    i === complementaryColors.length - 1 ? "rounded-r" : ""
                                                )}
                                                style={{ backgroundColor: c }}
                                                onClick={() => onChange(c)}
                                                title={c}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'palette' && (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <select 
                                        value={selectedPaletteId || ''} 
                                        onChange={(e) => setSelectedPaletteId(e.target.value)}
                                        className="flex-1 h-7 text-xs bg-secondary rounded border-none px-2"
                                    >
                                        {palettes.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                    <button 
                                        onClick={handleCreatePalette}
                                        className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"
                                        title={t('picker.newPalette')}
                                    >
                                        <Plus size={14} />
                                    </button>
                                    {selectedPaletteId && (
                                        <button 
                                            onClick={() => handleDeletePalette(selectedPaletteId)}
                                            className="p-1 hover:bg-destructive/10 hover:text-destructive rounded text-muted-foreground"
                                            title={t('picker.deletePalette')}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>

                                {selectedPaletteId && (
                                    <div className="grid grid-cols-5 gap-1.5 max-h-48 overflow-y-auto p-1">
                                        {palettes.find(p => p.id === selectedPaletteId)?.colors.map((c, i) => (
                                            <div key={`${c}-${i}`} className="group relative w-8 h-8">
                                                <button
                                                    onClick={() => onChange(c)}
                                                    className="w-full h-full rounded border border-border shadow-sm hover:scale-110 transition-transform"
                                                    style={{ backgroundColor: c }}
                                                />
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleRemoveFromPalette(c); }}
                                                    className="absolute -top-1 -right-1 w-3 h-3 bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 items-center justify-center flex transition-opacity"
                                                >
                                                    <span className="text-[8px] leading-none">×</span>
                                                </button>
                                            </div>
                                        ))}
                                        <button 
                                            onClick={handleAddToPalette}
                                            className="w-8 h-8 rounded border border-dashed border-border flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                                            title={t('picker.addCurrentColor')}
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
