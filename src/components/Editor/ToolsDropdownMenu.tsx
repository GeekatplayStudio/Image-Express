'use client';

import { useI18n } from '@/providers/I18nProvider';

import {
    Move,
    Pointer,
    SquareMousePointer,
    Square,
    LassoSelect,
    Wand2,
    PenTool,
    Type,
    Shapes,
    Brush,
    ShieldCheck,
    Copy,
    History,
    Blend,
    Sun,
    Sparkles,
    Scan,
    PaintBucket,
    Crop,
    Pipette,
    Hand,
    Search,
    PaintbrushVertical,
    Bandage,
    Eraser,
    Flame,
    Droplets,
    Image as ImageIcon,
    LayoutTemplate,
    Box,
} from 'lucide-react';

interface ToolsDropdownMenuProps {
    onTriggerTool: (tool: string) => void;
}

export default function ToolsDropdownMenu({ onTriggerTool }: ToolsDropdownMenuProps) {
    const { t } = useI18n();
    return (
        <div className="absolute left-0 top-full mt-2 w-64 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-2 animate-in fade-in slide-in-from-top-2 z-50">
            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">{t('tools.section.selection')}</div>
            <button onClick={() => onTriggerTool('select')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <Move size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="flex-1">{t('toolbar.move')}</span>
                <span className="text-xs text-muted-foreground border border-border px-1.5 rounded">V</span>
            </button>
            <button onClick={() => onTriggerTool('marquee')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <Square size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="flex-1">{t('toolbar.marquee')}</span>
                <span className="text-xs text-muted-foreground border border-border px-1.5 rounded">M</span>
            </button>
            <button onClick={() => onTriggerTool('lasso')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <LassoSelect size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="flex-1">{t('toolbar.lasso')}</span>
                <span className="text-xs text-muted-foreground border border-border px-1.5 rounded">L</span>
            </button>
            <button onClick={() => onTriggerTool('wand')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <Wand2 size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="flex-1">{t('toolbar.wand')}</span>
                <span className="text-xs text-muted-foreground border border-border px-1.5 rounded">W</span>
            </button>
            <button onClick={() => onTriggerTool('quick-select')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <SquareMousePointer size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="flex-1">{t('toolbar.quickSelect')}</span>
                <span className="text-xs text-muted-foreground border border-border px-1.5 rounded">Q</span>
            </button>
            <button onClick={() => onTriggerTool('selection-brush')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <PaintbrushVertical size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="flex-1">{t('toolbar.selectionBrush')}</span>
                <span className="text-xs text-muted-foreground border border-border px-1.5 rounded">K</span>
            </button>
            <button onClick={() => onTriggerTool('path-select')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <Pointer size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="flex-1">{t('toolbar.pathSelect')}</span>
                <span className="text-xs text-muted-foreground border border-border px-1.5 rounded">A</span>
            </button>
            <div className="px-4 py-1 text-[10px] text-muted-foreground/80">
                {t('tools.panelsHint')}
            </div>

            <div className="my-1 border-t border-border/50" />
            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">{t('tools.section.creation')}</div>
            <div className="grid grid-cols-2 gap-1 px-2">
                <button onClick={() => onTriggerTool('text')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Type size={16} className="text-muted-foreground group-hover:text-primary" /> <span>{t('toolbar.text')}</span>
                </button>
                <button onClick={() => onTriggerTool('shapes')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Shapes size={16} className="text-muted-foreground group-hover:text-primary" /> <span>{t('toolbar.shapes')}</span>
                </button>
                <button onClick={() => onTriggerTool('paint')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Brush size={16} className="text-muted-foreground group-hover:text-primary" /> <span>{t('toolbar.brushes')}</span>
                </button>
                <button onClick={() => onTriggerTool('spot-healing')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Bandage size={16} className="text-muted-foreground group-hover:text-primary" /> <span>{t('toolbar.spotHealing')}</span>
                </button>
                <button onClick={() => onTriggerTool('remove')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Eraser size={16} className="text-muted-foreground group-hover:text-primary" /> <span>{t('toolbar.removeTool')}</span>
                </button>
                <button onClick={() => onTriggerTool('healing')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <ShieldCheck size={16} className="text-muted-foreground group-hover:text-primary" /> <span>{t('toolbar.short.healing')}</span>
                </button>
                <button onClick={() => onTriggerTool('clone-stamp')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Copy size={16} className="text-muted-foreground group-hover:text-primary" /> <span>{t('toolbar.cloneStamp')}</span>
                </button>
                <button onClick={() => onTriggerTool('history-brush')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <History size={16} className="text-muted-foreground group-hover:text-primary" /> <span>{t('toolbar.historyBrush')}</span>
                </button>
                <button onClick={() => onTriggerTool('blur')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Blend size={16} className="text-muted-foreground group-hover:text-primary" /> <span>{t('toolbar.blurTool')}</span>
                </button>
                <button onClick={() => onTriggerTool('sharpen')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Scan size={16} className="text-muted-foreground group-hover:text-primary" /> <span>{t('toolbar.sharpenTool')}</span>
                </button>
                <button onClick={() => onTriggerTool('dodge')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Sun size={16} className="text-muted-foreground group-hover:text-primary" /> <span>{t('toolbar.dodgeTool')}</span>
                </button>
                <button onClick={() => onTriggerTool('burn')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Flame size={16} className="text-muted-foreground group-hover:text-primary" /> <span>{t('toolbar.burnTool')}</span>
                </button>
                <button onClick={() => onTriggerTool('sponge')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Droplets size={16} className="text-muted-foreground group-hover:text-primary" /> <span>{t('toolbar.spongeTool')}</span>
                </button>
                <button onClick={() => onTriggerTool('pen')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <PenTool size={16} className="text-muted-foreground group-hover:text-primary" /> <span>{t('toolbar.pen')}</span>
                </button>
                <button onClick={() => onTriggerTool('gradient')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group col-span-2">
                    <PaintBucket size={16} className="text-muted-foreground group-hover:text-primary" /> <span>{t('toolbar.fillGradient')}</span>
                </button>
            </div>

            <div className="my-1 border-t border-border/50" />
            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">{t('tools.section.utilities')}</div>
            <div className="grid grid-cols-2 gap-1 px-2">
                <button onClick={() => onTriggerTool('crop')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Crop size={16} className="text-muted-foreground group-hover:text-primary" /> <span>{t('toolbar.crop')}</span>
                </button>
                <button onClick={() => onTriggerTool('eyedropper')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Pipette size={16} className="text-muted-foreground group-hover:text-primary" /> <span>{t('toolbar.eyedropper')}</span>
                </button>
                <button onClick={() => onTriggerTool('zoom')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Search size={16} className="text-muted-foreground group-hover:text-primary" /> <span>{t('toolbar.zoom')}</span>
                </button>
                <button onClick={() => onTriggerTool('hand')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Hand size={16} className="text-muted-foreground group-hover:text-primary" /> <span>{t('toolbar.hand')}</span>
                </button>
            </div>

            <div className="my-1 border-t border-border/50" />
            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">{t('tools.section.libraries')}</div>
            <button onClick={() => onTriggerTool('assets')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <ImageIcon size={16} className="text-muted-foreground group-hover:text-primary transition-colors" /> <span>{t('toolbar.gallery')}</span>
            </button>
            <button onClick={() => onTriggerTool('templates')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <LayoutTemplate size={16} className="text-muted-foreground group-hover:text-primary transition-colors" /> <span>{t('toolbar.library')}</span>
            </button>

            <div className="my-1 border-t border-border/50" />
            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">{t('tools.section.ai3d')}</div>
            <button onClick={() => onTriggerTool('ai-zone')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <Sparkles size={16} className="text-primary group-hover:text-primary/90 transition-colors" /> <span>{t('toolbar.aiZone')}</span>
            </button>
            <button onClick={() => onTriggerTool('3d-gen')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <Box size={16} className="text-primary group-hover:text-primary/90 transition-colors" /> <span>{t('toolbar.ai3d')}</span>
            </button>
        </div>
    );
}
