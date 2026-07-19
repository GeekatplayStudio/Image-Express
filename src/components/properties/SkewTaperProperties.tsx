import React from 'react';
import { useI18n } from '@/providers/I18nProvider';

interface SkewTaperValues {
    skewX: number;
    skewY: number;
    skewZ: number; // Taper Intensity
    taperDirection: number; // -100 to 100
    pseudoBacksidePreset?: 'front' | 'back';
}

interface SkewTaperPropertiesProps {
    values: SkewTaperValues;
    onChange: (key: string, value: number) => void;
    onStartDirDrag?: () => void;
    onStopDirDrag?: () => void;
}

export function SkewTaperProperties({ values, onChange, onStartDirDrag, onStopDirDrag }: SkewTaperPropertiesProps) {
    const { t } = useI18n();
    return (
        <div className="p-4 space-y-4 border-b border-border/50">
             <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">{t('skew.title')}</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
                 <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{t('skew.skewX')}</span>
                        <span>{Math.round(values.skewX)}°</span>
                    </div>
                    <input
                        type="range"
                        min="-80"
                        max="80"
                        value={values.skewX}
                        onChange={(e) => onChange('skewX', parseInt(e.target.value))}
                        onDoubleClick={() => onChange('skewX', 0)}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </div>
                 <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{t('skew.skewY')}</span>
                        <span>{Math.round(values.skewY)}°</span>
                    </div>
                    <input
                        type="range"
                        min="-80"
                        max="80"
                        value={values.skewY}
                        onChange={(e) => onChange('skewY', parseInt(e.target.value))}
                        onDoubleClick={() => onChange('skewY', 0)}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            </div>

             <div className="space-y-3 pt-2">
                 <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{t('skew.fakeDepth')}</span>
                        <span>{values.skewZ}</span>
                    </div>
                    <input
                        type="range"
                        min="-100"
                        max="100"
                        value={values.skewZ}
                        onChange={(e) => onChange('skewZ', parseInt(e.target.value))}
                        onDoubleClick={() => onChange('skewZ', 0)}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                    <p className="text-[9px] text-muted-foreground">{t('skew.taperHint')}</p>
                </div>

                {values.skewZ !== 0 && (
                     <div className="space-y-2">
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{t('skew.taperDirection')}</span>
                            <span>{values.taperDirection}</span>
                        </div>
                        <input
                            type="range"
                            min="-100"
                            max="100"
                            value={values.taperDirection}
                            onPointerDown={onStartDirDrag}
                            onPointerUp={onStopDirDrag}
                            onChange={(e) => onChange('taperDirection', parseInt(e.target.value))}
                            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                )}
             </div>
        </div>
    );
}
