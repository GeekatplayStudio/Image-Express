import React from 'react';

interface TextPropertiesProps {
    fontFamily: string;
    fontWeight: string;
    curveStrength: number;
    curveCenter: number;
    onFontFamilyChange: (font: string) => void;
    onFontWeightChange: (weight: string) => void;
    onCurveChange: (strength: number, center?: number) => void;
}

export function TextProperties({
    fontFamily,
    fontWeight,
    curveStrength,
    curveCenter,
    onFontFamilyChange,
    onFontWeightChange,
    onCurveChange
}: TextPropertiesProps) {
    const FONTS = [
        'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 
        'Impact', 'Comic Sans MS', 'Trebuchet MS', 'Arial Black', 
        'Palatino Linotype', 'Lucida Console', 'Tahoma', 'Century Gothic'
    ];
    const WEIGHTS = ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'];

    // Helper to describe curve type for UI feedback
    const getCurveDescription = (): string => {
        if (curveStrength === 0) return 'Flat';
        if (curveStrength > 0) {
            if (curveStrength > 50) return 'Strong Arc Up';
            return 'Arc Up';
        }
        if (curveStrength < -50) return 'Strong Arc Down';
        return 'Arc Down';
    };

    return (
        <div className="p-4 space-y-4 border-b border-border/50">
            <h3 className="font-medium text-sm">Text Style</h3>
            
            <div className="space-y-3">
                <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Font Family</label>
                    <select
                        value={fontFamily}
                        onChange={(e) => onFontFamilyChange(e.target.value)}
                        className="w-full text-xs bg-transparent border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                    >
                        {FONTS.map(f => <option key={f} value={f} className="bg-card text-foreground">{f}</option>)}
                    </select>
                </div>
                
                <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Weight</label>
                    <select
                        value={fontWeight}
                        onChange={(e) => onFontWeightChange(e.target.value)}
                        className="w-full text-xs bg-transparent border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                    >
                        {WEIGHTS.map(w => <option key={w} value={w} className="bg-card text-foreground">{w}</option>)}
                    </select>
                </div>

                <div className="pt-2 border-t border-border/30">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Text Path / Curve</label>
                    
                    <div className="space-y-3">
                        <div className="space-y-2">
                             <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Curve Strength</span>
                                <span className="flex items-center gap-2">
                                    <span className="text-primary/70">{getCurveDescription()}</span>
                                    <span className="font-mono">{curveStrength}</span>
                                </span>
                            </div>
                            <input
                                type="range"
                                min="-100"
                                max="100"
                                value={curveStrength}
                                onChange={(e) => onCurveChange(parseInt(e.target.value))}
                                onDoubleClick={() => onCurveChange(0)}
                                className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                title="Double-click to reset"
                            />
                            <div className="flex justify-between text-[9px] text-muted-foreground/50">
                                <span>↓ Down</span>
                                <span>Flat</span>
                                <span>Up ↑</span>
                            </div>
                        </div>

                        {curveStrength !== 0 && (
                            <div className="space-y-2 animate-in fade-in-50 duration-200">
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                    <span>Curve Center</span>
                                    <span className="font-mono">{curveCenter}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="-100"
                                    max="100"
                                    value={curveCenter}
                                    onChange={(e) => onCurveChange(curveStrength, parseInt(e.target.value))}
                                    onDoubleClick={() => onCurveChange(curveStrength, 0)}
                                    className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                    title="Double-click to reset"
                                />
                                <div className="flex justify-between text-[9px] text-muted-foreground/50">
                                    <span>← Left</span>
                                    <span>Center</span>
                                    <span>Right →</span>
                                </div>
                            </div>
                        )}
                        
                        {/* Quick presets */}
                        <div className="flex gap-1 pt-1">
                            <button 
                                onClick={() => onCurveChange(0, 0)}
                                className={`flex-1 px-2 py-1 text-[10px] rounded border transition-colors ${curveStrength === 0 ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}
                            >
                                Flat
                            </button>
                            <button 
                                onClick={() => onCurveChange(50, 0)}
                                className={`flex-1 px-2 py-1 text-[10px] rounded border transition-colors ${curveStrength === 50 ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}
                            >
                                Arc ↑
                            </button>
                            <button 
                                onClick={() => onCurveChange(-50, 0)}
                                className={`flex-1 px-2 py-1 text-[10px] rounded border transition-colors ${curveStrength === -50 ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}
                            >
                                Arc ↓
                            </button>
                            <button 
                                onClick={() => onCurveChange(100, 0)}
                                className={`flex-1 px-2 py-1 text-[10px] rounded border transition-colors ${curveStrength === 100 ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}
                            >
                                Circle
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
