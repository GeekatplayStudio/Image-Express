import React, { useRef, useState, useMemo } from 'react';
import { Plus, Trash2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColorPalette } from '@/types';

interface ColorWheelToolProps {
    onColorSelect: (color: string) => void;
    currentPalette: ColorPalette | null;
    onPaletteSelect: (palette: ColorPalette | null) => void;
}

// Utils
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
    let h = 0, s = 0; const l = (max + min) / 2;
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

export const ColorWheelTool = ({ onColorSelect, currentPalette, onPaletteSelect }: ColorWheelToolProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [selectedColor, setSelectedColor] = useState('#ff0000');
    const [newPaletteName, setNewPaletteName] = useState('');
    const [palettes, setPalettes] = useState<ColorPalette[]>([]);

    const savePalettes = (newPalettes: ColorPalette[]) => {
        setPalettes(newPalettes);
        localStorage.setItem('saved-palettes', JSON.stringify(newPalettes));
    };

    // Load palettes on mount
    React.useEffect(() => {
        const saved = localStorage.getItem('saved-palettes');
        if (saved) {
            try {
                setPalettes(JSON.parse(saved));
            } catch (e) { console.error("Failed to load palettes", e); }
        }
    }, []);

    const complementaryColors = useMemo(() => {
        const { h, s, l } = hexToHsl(normalizeHex(selectedColor));
        const colors = [];
        // 5 colors total: Base, +4 others. Evenly spaced 72deg
        for (let i = 1; i <= 4; i++) {
            const newH = (h + (i * 72)) % 360;
            colors.push(hslToHex(newH, s, l));
        }
        return colors;
    }, [selectedColor]);

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
            const pixel = ctx.getImageData(x, y, 1, 1).data;
            const hex = `#${pixel[0].toString(16).padStart(2,'0')}${pixel[1].toString(16).padStart(2,'0')}${pixel[2].toString(16).padStart(2,'0')}`;
            setSelectedColor(hex);
            onColorSelect(hex);
        }
    };

    const handleAddPalette = () => {
        if (!newPaletteName) return;
        const newPalette: ColorPalette = {
            id: Date.now().toString(),
            name: newPaletteName,
            colors: [selectedColor, ...complementaryColors]
        };
        savePalettes([...palettes, newPalette]);
        setNewPaletteName('');
    };

    const handleDeletePalette = (id: string) => {
        const next = palettes.filter(p => p.id !== id);
        savePalettes(next);
        if (currentPalette?.id === id) onPaletteSelect(null);
    };

    return (
        <div className="fixed left-[70px] top-20 bg-card border border-border rounded-xl shadow-2xl p-4 w-[280px] z-30 animate-in slide-in-from-left-4 fade-in duration-200">
            <h3 className="font-semibold text-sm mb-3">Color Wheel</h3>
            
            <div className="flex flex-col items-center gap-4">
                <canvas 
                    ref={canvasRef} 
                    width={200} 
                    height={200} 
                    className="rounded-full cursor-crosshair shadow-md hover:scale-105 transition-transform duration-200"
                    onClick={handleCanvasClick}
                />
                
                {/* Current + Complementary */}
                <div className="w-full">
                    <p className="text-xs text-muted-foreground mb-2 font-medium">Harmony</p>
                    <div className="flex gap-1 h-8 rounded-lg overflow-hidden ring-1 ring-border shadow-sm">
                        <div 
                            className="flex-1 cursor-pointer hover:opacity-90 transition-opacity" 
                            style={{ backgroundColor: selectedColor }} 
                            onClick={() => onColorSelect(selectedColor)}
                            title="Selected"
                        />
                        {complementaryColors.map((c, i) => (
                            <div 
                                key={i} 
                                className="flex-1 cursor-pointer hover:opacity-90 transition-opacity" 
                                style={{ backgroundColor: c }}
                                onClick={() => onColorSelect(c)}
                                title={`Harmony ${i+1}`}
                            />
                        ))}
                    </div>
                </div>

                <div className="w-full h-px bg-border my-2"/>

                {/* Palettes */}
                <div className="w-full space-y-3">
                    <div className="flex items-center justify-between">
                         <h4 className="font-semibold text-xs">Saved Palettes</h4>
                         {currentPalette && <span className="text-[10px] text-primary font-medium">Active: {currentPalette.name}</span>}
                    </div>

                    <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                        {palettes.map(palette => (
                            <div key={palette.id} className={cn("group p-2 rounded-lg border transition-all cursor-pointer", currentPalette?.id === palette.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}>
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-xs font-medium truncate flex-1" onClick={() => onPaletteSelect(palette)}>{palette.name}</span>
                                    <div className="flex items-center gap-1 opacity-10 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={() => onPaletteSelect(palette)}
                                            className="p-1 hover:bg-background rounded text-primary"
                                            title="Use Palette"
                                        >
                                            <ExternalLink size={12}/>
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDeletePalette(palette.id); }}
                                            className="p-1 hover:bg-background rounded text-destructive"
                                            title="Delete"
                                        >
                                            <Trash2 size={12}/>
                                        </button>
                                    </div>
                                </div>
                                <div className="flex h-4 rounded overflow-hidden" onClick={() => onPaletteSelect(palette)}>
                                    {palette.colors.map((c, i) => (
                                        <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <div className="flex gap-2 pt-2 border-t border-border">
                        <input 
                            className="flex-1 text-xs bg-secondary px-2 py-1.5 rounded border border-transparent focus:border-primary outline-none"
                            placeholder="New Palette Name"
                            value={newPaletteName}
                            onChange={(e) => setNewPaletteName(e.target.value)}
                        />
                        <button 
                            onClick={handleAddPalette}
                            disabled={!newPaletteName}
                            className="p-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                        >
                            <Plus size={16}/>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
