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
    const FONTS = ['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Impact', 'Comic Sans MS', 'Trebuchet MS', 'Arial Black'];
    const WEIGHTS = ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'];

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
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Curved Text</label>
                    
                    <div className="space-y-3">
                        <div className="space-y-2">
                             <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Curve (Arch)</span>
                                <span>{curveStrength}</span>
                            </div>
                            <input
                                type="range"
                                min="-100"
                                max="100"
                                value={curveStrength}
                                onChange={(e) => onCurveChange(parseInt(e.target.value))}
                                onDoubleClick={() => onCurveChange(0)}
                                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                            />
                        </div>

                        {curveStrength !== 0 && (
                            <div className="space-y-2">
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                    <span>Center Point</span>
                                    <span>{curveCenter}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="-100"
                                    max="100"
                                    value={curveCenter}
                                    onChange={(e) => onCurveChange(curveStrength, parseInt(e.target.value))}
                                    className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
