'use client';

import {
    Move,
    Square,
    LassoSelect,
    Wand2,
    PenTool,
    Type,
    Shapes,
    Brush,
    ShieldCheck,
    Copy,
    PaintBucket,
    Crop,
    Pipette,
    Hand,
    Image as ImageIcon,
    LayoutTemplate,
    Box,
} from 'lucide-react';

interface ToolsDropdownMenuProps {
    onTriggerTool: (tool: string) => void;
}

export default function ToolsDropdownMenu({ onTriggerTool }: ToolsDropdownMenuProps) {
    return (
        <div className="absolute left-0 top-full mt-2 w-64 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-2 animate-in fade-in slide-in-from-top-2 z-50">
            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Selection</div>
            <button onClick={() => onTriggerTool('select')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <Move size={16} className="text-muted-foreground group-hover:text-primary transition-colors"/>
                <span className="flex-1">Move</span>
                <span className="text-xs text-muted-foreground border border-border px-1.5 rounded">V</span>
            </button>
            <button onClick={() => onTriggerTool('marquee')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <Square size={16} className="text-muted-foreground group-hover:text-primary transition-colors"/>
                <span className="flex-1">Marquee</span>
                <span className="text-xs text-muted-foreground border border-border px-1.5 rounded">M</span>
            </button>
            <button onClick={() => onTriggerTool('lasso')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <LassoSelect size={16} className="text-muted-foreground group-hover:text-primary transition-colors"/>
                <span className="flex-1">Lasso</span>
                <span className="text-xs text-muted-foreground border border-border px-1.5 rounded">L</span>
            </button>
            <button onClick={() => onTriggerTool('wand')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <Wand2 size={16} className="text-muted-foreground group-hover:text-primary transition-colors"/>
                <span className="flex-1">Magic Wand</span>
                <span className="text-xs text-muted-foreground border border-border px-1.5 rounded">W</span>
            </button>
            <button onClick={() => onTriggerTool('path-select')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <PenTool size={16} className="text-muted-foreground group-hover:text-primary transition-colors"/>
                <span className="flex-1">Path Select</span>
                <span className="text-xs text-muted-foreground border border-border px-1.5 rounded">A</span>
            </button>
            <div className="px-4 py-1 text-[10px] text-muted-foreground/80">
                Layers, Adjustments, and Color panels are in the right properties rail.
            </div>

            <div className="my-1 border-t border-border/50" />
            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Creation</div>
            <div className="grid grid-cols-2 gap-1 px-2">
                <button onClick={() => onTriggerTool('text')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Type size={16} className="text-muted-foreground group-hover:text-primary"/> <span>Text</span>
                </button>
                <button onClick={() => onTriggerTool('shapes')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Shapes size={16} className="text-muted-foreground group-hover:text-primary"/> <span>Shapes</span>
                </button>
                <button onClick={() => onTriggerTool('paint')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Brush size={16} className="text-muted-foreground group-hover:text-primary"/> <span>Brush</span>
                </button>
                <button onClick={() => onTriggerTool('healing')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <ShieldCheck size={16} className="text-muted-foreground group-hover:text-primary"/> <span>Healing</span>
                </button>
                <button onClick={() => onTriggerTool('clone-stamp')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Copy size={16} className="text-muted-foreground group-hover:text-primary"/> <span>Clone Stamp</span>
                </button>
                <button onClick={() => onTriggerTool('pen')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <PenTool size={16} className="text-muted-foreground group-hover:text-primary"/> <span>Pen</span>
                </button>
                <button onClick={() => onTriggerTool('gradient')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group col-span-2">
                    <PaintBucket size={16} className="text-muted-foreground group-hover:text-primary"/> <span>Fill / Gradient</span>
                </button>
            </div>

            <div className="my-1 border-t border-border/50" />
            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Utilities</div>
            <div className="grid grid-cols-2 gap-1 px-2">
                <button onClick={() => onTriggerTool('crop')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Crop size={16} className="text-muted-foreground group-hover:text-primary"/> <span>Crop</span>
                </button>
                <button onClick={() => onTriggerTool('eyedropper')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Pipette size={16} className="text-muted-foreground group-hover:text-primary"/> <span>Eyedropper</span>
                </button>
                <button onClick={() => onTriggerTool('zoom')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Square size={16} className="text-muted-foreground group-hover:text-primary"/> <span>Zoom</span>
                </button>
                <button onClick={() => onTriggerTool('hand')} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                    <Hand size={16} className="text-muted-foreground group-hover:text-primary"/> <span>Hand</span>
                </button>
            </div>

            <div className="my-1 border-t border-border/50" />
            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Libraries</div>
            <button onClick={() => onTriggerTool('assets')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <ImageIcon size={16} className="text-muted-foreground group-hover:text-primary transition-colors"/> <span>Gallery</span>
            </button>
            <button onClick={() => onTriggerTool('templates')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <LayoutTemplate size={16} className="text-muted-foreground group-hover:text-primary transition-colors"/> <span>Library</span>
            </button>

            <div className="my-1 border-t border-border/50" />
            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">AI & 3D</div>
            <button onClick={() => onTriggerTool('ai-zone')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <Wand2 size={16} className="text-purple-500 group-hover:text-purple-600 transition-colors"/> <span>AI Zone</span>
            </button>
            <button onClick={() => onTriggerTool('3d-gen')} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                <Box size={16} className="text-indigo-500 group-hover:text-indigo-600 transition-colors"/> <span>AI 3D</span>
            </button>
        </div>
    );
}
