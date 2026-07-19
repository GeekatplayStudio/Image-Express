import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/I18nProvider';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

// Reusing style components consistent with ShadowStrokeProperties if possible, 
// or redefining for independence as per request (since ShadowStrokeProperties doesn't export them)

const CompactColorPicker = ({ color, onChange, opacity = 1 }: { color: string, onChange: (val: string) => void, opacity?: number }) => (
    <div className="relative w-8 h-8 rounded-md border border-border/60 shadow-sm overflow-hidden group shrink-0">
        <div className="absolute inset-0 z-0 bg-image-checkered opacity-20" />
        <div className="absolute inset-0 z-10" style={{ backgroundColor: color, opacity }} />
        <input 
            type="color" 
            value={color}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
        />
    </div>
);

const PropertySlider = ({ label, value, min, max, onChange, step = 1, unit = "" }: { label: string, value: number, min: number, max: number, onChange: (val: number) => void, step?: number, unit?: string }) => (
    <div 
        className="flex items-center gap-3 text-xs w-full"
        onClick={(e) => e.stopPropagation()} 
    >
        <span className="w-16 text-muted-foreground shrink-0 truncate" title={label}>{label}</span>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="flex-1 h-1.5 bg-secondary rounded-full appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="w-8 text-right tabular-nums shrink-0 text-[10px] text-muted-foreground">{Math.round(value)}{unit}</span>
    </div>
);

interface TextEffectsPropertiesProps {
    onToggleEffect: (preset: string, enabled: boolean) => void;
    activePresets: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    effectConfigs: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onConfigChange: (preset: string, config: any) => void;
}

const presets = [
    { id: 'drop-shadow', labelKey: 'fx.preset.dropShadow' },
    // Soft Shadow removed as duplicate
    // Outline removed as duplicate of Stroke
    { id: 'double-outline', labelKey: 'fx.preset.doubleOutline' },
    { id: 'glow', labelKey: 'fx.preset.glow' },
    { id: 'neon', labelKey: 'fx.preset.neon' },
    { id: 'highlight', labelKey: 'fx.preset.highlight' },
    { id: 'gradient-fill', labelKey: 'fx.preset.gradient' },
    { id: 'extrude', labelKey: 'fx.preset.extrude' },
    { id: 'bevel', labelKey: 'fx.preset.bevel' },
    { id: 'sticker', labelKey: 'fx.preset.sticker' },
    // { id: 'texture', labelKey: 'fx.preset.texture' },
    { id: 'readability', labelKey: 'fx.preset.readability' },
];

export function TextEffectsProperties({ 
    onToggleEffect, 
    activePresets, 
    effectConfigs, 
    onConfigChange 
}: TextEffectsPropertiesProps) {
    const { t } = useI18n();

    // Track open state for each section locally
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

    const toggleSection = (id: string) => {
        setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateConfig = (presetId: string, key: string, value: any) => {
        if (!onConfigChange) return;
        const currentConfig = effectConfigs[presetId] || {};
        const newConfig = { ...currentConfig, [key]: value };
        onConfigChange(presetId, newConfig);
    };

    const handleToggle = (presetId: string, enabled: boolean) => {
        onToggleEffect(presetId, enabled);
        if (enabled) {
            // Auto open the section when enabled
            setOpenSections(prev => ({ ...prev, [presetId]: true }));
        }
    };

    const renderControls = (presetId: string) => {
         // Only render controls if this is active
         if (!activePresets.includes(presetId)) return null;
         
         const config = effectConfigs[presetId] || {};

         switch (presetId) {
             case 'drop-shadow':
                return (
                    <>
                        <div className="flex items-start gap-4">
                            <CompactColorPicker color={config.color} onChange={(c) => updateConfig(presetId, 'color', c)} opacity={config.opacity} />
                            <div className="flex-1 space-y-2 pt-1">
                                <PropertySlider label={t('fx.blur')} value={config.blur} min={0} max={50} onChange={(v) => updateConfig(presetId, 'blur', v)} />
                                <PropertySlider label={t('ctrl.opacity')} value={config.opacity * 100} min={0} max={100} onChange={(v) => updateConfig(presetId, 'opacity', v / 100)} unit="%" />
                            </div>
                        </div>
                        <div className="space-y-2 pt-3 border-t border-border/30 mt-3.5">
                            <PropertySlider label={t('fx.offsetX')} value={config.offsetX} min={-50} max={50} onChange={(v) => updateConfig(presetId, 'offsetX', v)} unit="px" />
                            <PropertySlider label={t('fx.offsetY')} value={config.offsetY} min={-50} max={50} onChange={(v) => updateConfig(presetId, 'offsetY', v)} unit="px" />
                        </div>
                    </>
                );
             // Outline case removed
             case 'double-outline':
                 return (
                    <div className="space-y-4">
                        <div className="flex items-start gap-4">
                             <CompactColorPicker color={config.strokeColor} onChange={(c) => updateConfig(presetId, 'strokeColor', c)} />
                             <div className="flex-1 pt-1">
                                 <PropertySlider label={t('fx.outlineWidth')} value={config.strokeWidth} min={1} max={50} onChange={(v) => updateConfig(presetId, 'strokeWidth', v)} unit="px" />
                             </div>
                        </div>
                        <div className="flex items-start gap-4">
                             <CompactColorPicker color={config.shadowColor} onChange={(c) => updateConfig(presetId, 'shadowColor', c)} opacity={config.shadowOpacity} />
                             <div className="flex-1 pt-1">
                                <PropertySlider label={t('fx.secondOutlineOpacity')} value={config.shadowOpacity * 100} min={0} max={100} onChange={(v) => updateConfig(presetId, 'shadowOpacity', v / 100)} unit="%" />
                             </div>
                        </div>
                         <div className="space-y-2 pt-1 border-t border-border/30 mt-2 pt-2">
                             <PropertySlider label={t('fx.offsetX')} value={config.shadowOffsetX ?? 4} min={-50} max={50} onChange={(v) => updateConfig(presetId, 'shadowOffsetX', v)} unit="px" />
                             <PropertySlider label={t('fx.offsetY')} value={config.shadowOffsetY ?? 4} min={-50} max={50} onChange={(v) => updateConfig(presetId, 'shadowOffsetY', v)} unit="px" />
                        </div>
                    </div>
                 );
             case 'glow':
                 return (
                    <div className="flex items-start gap-4">
                        <CompactColorPicker color={config.color} onChange={(c) => updateConfig(presetId, 'color', c)} opacity={config.opacity} />
                        <div className="flex-1 space-y-2 pt-1">
                            <PropertySlider label={t('fx.blurRadius')} value={config.blur} min={0} max={100} onChange={(v) => updateConfig(presetId, 'blur', v)} unit="px" />
                            <PropertySlider label={t('fx.intensity')} value={config.opacity * 100} min={0} max={100} onChange={(v) => updateConfig(presetId, 'opacity', v / 100)} unit="%" />
                        </div>
                    </div>
                 );
             case 'neon':
                 return (
                    <div className="flex items-start gap-4">
                        <CompactColorPicker color={config.color} onChange={(c) => updateConfig(presetId, 'color', c)} />
                        <div className="flex-1 space-y-2 pt-1">
                            <PropertySlider label={t('fx.glowIntensity')} value={config.intensity} min={0} max={100} onChange={(v) => updateConfig(presetId, 'intensity', v)} />
                            <PropertySlider label={t('fx.wireWidth')} value={config.width} min={0.5} max={10} step={0.5} onChange={(v) => updateConfig(presetId, 'width', v)} unit="px" />
                        </div>
                    </div>
                 );
             case 'highlight':
                 return (
                    <div className="space-y-3">
                        <div className="flex items-start gap-4">
                            <CompactColorPicker color={config.color} onChange={(c) => updateConfig(presetId, 'color', c)} opacity={config.opacity} />
                            <div className="flex-1 space-y-2 pt-1">
                                <PropertySlider label={t('ctrl.opacity')} value={config.opacity * 100} min={0} max={100} onChange={(v) => updateConfig(presetId, 'opacity', v / 100)} unit="%" />
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-muted-foreground shrink-0">{t('ctrl.blendMode')}</span>
                            <Select 
                                value={config.blendMode || 'normal'} 
                                onValueChange={(val) => updateConfig(presetId, 'blendMode', val)}
                            >
                                <SelectTrigger className="h-6 text-[10px] w-24">
                                    <SelectValue placeholder={t('blend.normal')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="source-over">{t('blend.normal')}</SelectItem>
                                    <SelectItem value="multiply">{t('blend.multiply')}</SelectItem>
                                    <SelectItem value="screen">{t('blend.screen')}</SelectItem>
                                    <SelectItem value="overlay">{t('blend.overlay')}</SelectItem>
                                    <SelectItem value="darken">{t('blend.darken')}</SelectItem>
                                    <SelectItem value="lighten">{t('blend.lighten')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                 );
             case 'readability':
                 return (
                    <div className="flex items-start gap-4">
                        <CompactColorPicker color={config.color} onChange={(c) => updateConfig(presetId, 'color', c)} opacity={config.opacity} />
                        <div className="flex-1 space-y-2 pt-1">
                            <PropertySlider label={t('ctrl.opacity')} value={config.opacity * 100} min={0} max={100} onChange={(v) => updateConfig(presetId, 'opacity', v / 100)} unit="%" />
                        </div>
                    </div>
                 );
             case 'gradient-fill':
                 return (
                    <div className="space-y-3">
                         <div className="flex gap-4">
                             <div className="space-y-1">
                                 <span className="text-[10px] text-muted-foreground">{t('fx.start')}</span>
                                 <CompactColorPicker color={config.start} onChange={(c) => updateConfig(presetId, 'start', c)} />
                             </div>
                             <div className="space-y-1">
                                 <span className="text-[10px] text-muted-foreground">{t('fx.end')}</span>
                                 <CompactColorPicker color={config.end} onChange={(c) => updateConfig(presetId, 'end', c)} />
                             </div>
                         </div>
                         <PropertySlider label={t('fx.angle')} value={config.angle} min={0} max={360} onChange={(v) => updateConfig(presetId, 'angle', v)} unit="°" />
                    </div>
                 );
             case 'extrude':
                 return (
                    <div className="flex items-start gap-4">
                        <CompactColorPicker color={config.color} onChange={(c) => updateConfig(presetId, 'color', c)} opacity={config.opacity} />
                        <div className="flex-1 space-y-2 pt-1">
                            <PropertySlider label={t('fx.depth')} value={config.depth} min={1} max={50} onChange={(v) => updateConfig(presetId, 'depth', v)} unit="px" />
                            <PropertySlider label={t('ctrl.opacity')} value={config.opacity * 100} min={0} max={100} onChange={(v) => updateConfig(presetId, 'opacity', v / 100)} unit="%" />
                        </div>
                    </div>
                 );
             case 'bevel':
                 return (
                    <div className="space-y-3">
                        <div className="flex gap-4">
                             <div className="space-y-1">
                                 <span className="text-[10px] text-muted-foreground">{t('fx.highlight')}</span>
                                 <CompactColorPicker color={config.highlightColor} onChange={(c) => updateConfig(presetId, 'highlightColor', c)} />
                             </div>
                             <div className="space-y-1">
                                 <span className="text-[10px] text-muted-foreground">{t('fx.shadow')}</span>
                                 <CompactColorPicker color={config.shadowColor} onChange={(c) => updateConfig(presetId, 'shadowColor', c)} />
                             </div>
                        </div>
                         <PropertySlider label={t('fx.bevelWidth')} value={config.width} min={0.5} max={20} onChange={(v) => updateConfig(presetId, 'width', v)} unit="px" />
                         <PropertySlider label={t('fx.softness')} value={config.blur} min={0} max={20} onChange={(v) => updateConfig(presetId, 'blur', v)} unit="px" />
                    </div>
                 );
             case 'sticker':
                 return (
                     <div className="flex items-start gap-4">
                        <CompactColorPicker color={config.borderColor} onChange={(c) => updateConfig(presetId, 'borderColor', c)} />
                        <div className="flex-1 space-y-2 pt-1">
                            <PropertySlider label={t('fx.borderWidth')} value={config.borderWidth} min={1} max={50} onChange={(v) => updateConfig(presetId, 'borderWidth', v)} unit="px" />
                            <PropertySlider label={t('fx.shadowBlur')} value={config.shadowBlur} min={0} max={50} onChange={(v) => updateConfig(presetId, 'shadowBlur', v)} unit="px" />
                        </div>
                    </div>
                 );
             case 'texture':
                 return (
                    <div className="p-2 text-xs text-muted-foreground text-center bg-secondary/30 rounded">
                        {t('fx.textureNotConfigurable')}
                    </div>
                 );
             default:
                 return null;
         }
    };

    return (
        <div className="flex flex-col gap-px bg-background text-foreground select-none divide-y divide-border/30 border-t border-border/30">
            {presets.map((preset) => {
                const isActive = activePresets.includes(preset.id);
                // If the preset is active, verify if we should force the panel open
                const isOpen = isActive && openSections[preset.id];
                
                return (
                    <div key={preset.id} className="bg-background">
                         <div className={cn(
                             "flex items-center justify-between w-full p-3 transition-colors group",
                             isActive ? "bg-secondary/10" : "hover:bg-secondary/30"
                         )}>
                             <button
                                 onClick={() => toggleSection(preset.id)}
                                 className="flex items-center gap-2 flex-1"
                             >
                                 {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                 <span className={cn(
                                     "text-xs font-semibold uppercase tracking-wider",
                                     isActive ? "text-primary" : "text-muted-foreground"
                                 )}>
                                     {t(preset.labelKey)}
                                 </span>
                             </button>
                             <div className="pl-4 pb-1">
                                 <Switch
                                     checked={isActive}
                                     onCheckedChange={(checked) => handleToggle(preset.id, checked)}
                                 />
                             </div>
                         </div>
                         
                         {/* Settings Panel */}
                         {isOpen && isActive && (
                             <div className="p-3 pt-4 animate-in slide-in-from-top-1 duration-150 border-t border-border/10 bg-secondary/5">
                                 {renderControls(preset.id)}
                             </div>
                         )}
                    </div>
                );
            })}
        </div>
    );
}

