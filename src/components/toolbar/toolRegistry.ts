import {
    ArrowUpWideNarrow,
    Bandage,
    Blend,
    Bot,
    Box,
    Boxes,
    Brush,
    Cog,
    Copy,
    Crop,
    Droplets,
    Eraser,
    Flame,
    Hand,
    History,
    Image as ImageIcon,
    LassoSelect,
    Layers,
    LayoutTemplate,
    Library,
    MessageSquare,
    Move,
    PaintbrushVertical,
    PaintBucket,
    PenTool,
    Pipette,
    Pointer,
    Scan,
    Scissors,
    Search,
    SlidersHorizontal,
    Shapes,
    ShieldCheck,
    Sparkles,
    Square,
    SquareMousePointer,
    Sun,
    Type,
    Wand2,
    Workflow,
    type LucideIcon,
} from 'lucide-react';

export type ToolbarToolDefinition = {
    name: string;
    icon: LucideIcon;
    labelKey: string;
    shortLabelKey?: string;
};

export type ToolbarToolGroupId = 'selection' | 'retouch' | 'fill' | 'fabrication';

export type ToolbarToolGroupDefinition = {
    id: ToolbarToolGroupId;
    labelKey: string;
    tools: ToolbarToolDefinition[];
    defaultTool: string;
};

export const TOOL_ALIAS_MAP: Record<string, string> = { move: 'select', 'path-select': 'select' };

export const SELECTION_TOOL_GROUP: ToolbarToolGroupDefinition = {
    id: 'selection', labelKey: 'toolbar.group.selection', defaultTool: 'select',
    tools: [
        { name: 'select', icon: Move, labelKey: 'toolbar.move' },
        { name: 'marquee', icon: Square, labelKey: 'toolbar.marquee' },
        { name: 'lasso', icon: LassoSelect, labelKey: 'toolbar.lasso' },
        { name: 'wand', icon: Wand2, labelKey: 'toolbar.wand', shortLabelKey: 'toolbar.short.wand' },
        { name: 'quick-select', icon: SquareMousePointer, labelKey: 'toolbar.quickSelect', shortLabelKey: 'toolbar.short.quick' },
        { name: 'selection-brush', icon: PaintbrushVertical, labelKey: 'toolbar.selectionBrush', shortLabelKey: 'toolbar.short.selBrush' },
        { name: 'path-select', icon: Pointer, labelKey: 'toolbar.pathSelect', shortLabelKey: 'toolbar.short.path' },
    ],
};

export const RETOUCH_TOOL_GROUP: ToolbarToolGroupDefinition = {
    id: 'retouch', labelKey: 'toolbar.group.retouch', defaultTool: 'healing',
    tools: [
        { name: 'spot-healing', icon: Bandage, labelKey: 'toolbar.spotHealing', shortLabelKey: 'toolbar.short.spot' },
        { name: 'remove', icon: Eraser, labelKey: 'toolbar.removeTool', shortLabelKey: 'toolbar.short.remove' },
        { name: 'healing', icon: ShieldCheck, labelKey: 'toolbar.healingBrush', shortLabelKey: 'toolbar.short.healing' },
        { name: 'clone-stamp', icon: Copy, labelKey: 'toolbar.cloneStamp', shortLabelKey: 'toolbar.short.clone' },
        { name: 'history-brush', icon: History, labelKey: 'toolbar.historyBrush', shortLabelKey: 'toolbar.short.history' },
        { name: 'blur', icon: Blend, labelKey: 'toolbar.blurTool', shortLabelKey: 'toolbar.short.blur' },
        { name: 'sharpen', icon: Scan, labelKey: 'toolbar.sharpenTool', shortLabelKey: 'toolbar.short.sharpen' },
        { name: 'dodge', icon: Sun, labelKey: 'toolbar.dodgeTool', shortLabelKey: 'toolbar.short.dodge' },
        { name: 'burn', icon: Flame, labelKey: 'toolbar.burnTool', shortLabelKey: 'toolbar.short.burn' },
        { name: 'sponge', icon: Droplets, labelKey: 'toolbar.spongeTool', shortLabelKey: 'toolbar.short.sponge' },
    ],
};

export const FILL_TOOL_GROUP: ToolbarToolGroupDefinition = {
    id: 'fill', labelKey: 'toolbar.group.fill', defaultTool: 'gradient',
    tools: [
        { name: 'gradient', icon: PaintBucket, labelKey: 'toolbar.fillGradient', shortLabelKey: 'toolbar.short.fill' },
        { name: 'fill-layer', icon: Layers, labelKey: 'toolbar.fillLayer', shortLabelKey: 'toolbar.short.fillLayer' },
    ],
};

export const FABRICATION_TOOL_GROUP: ToolbarToolGroupDefinition = {
    id: 'fabrication', labelKey: 'toolbar.group.fabrication', defaultTool: 'fabrication-library',
    tools: [
        { name: 'fabrication-library', icon: Boxes, labelKey: 'toolbar.fabricationLibrary' },
        { name: '3d-gen', icon: Box, labelKey: 'fabrication.workflow.generate3d' },
        { name: '3d-library', icon: Library, labelKey: 'toolbar.modelLibrary' },
        { name: 'cricut-studio', icon: Scissors, labelKey: 'toolbar.cricutStudio' },
        { name: 'cnc-planner', icon: Cog, labelKey: 'toolbar.cncPlanner' },
    ],
};

export const TOOL_GROUPS = [SELECTION_TOOL_GROUP, RETOUCH_TOOL_GROUP, FILL_TOOL_GROUP, FABRICATION_TOOL_GROUP];
export const TOOL_GROUP_BY_ID = Object.fromEntries(TOOL_GROUPS.map((group) => [group.id, group])) as Record<ToolbarToolGroupId, ToolbarToolGroupDefinition>;

export const CREATION_PRIMARY_TOOLS: ToolbarToolDefinition[] = [
    { name: 'text', icon: Type, labelKey: 'toolbar.text' },
    { name: 'shapes', icon: Shapes, labelKey: 'toolbar.shapes' },
    { name: 'adjustments', icon: SlidersHorizontal, labelKey: 'toolbar.adjustmentLayers', shortLabelKey: 'toolbar.short.adjust' },
    { name: 'pen', icon: PenTool, labelKey: 'toolbar.pen' },
    { name: 'paint', icon: Brush, labelKey: 'toolbar.brushes', shortLabelKey: 'toolbar.short.brush' },
];

export const CREATION_LIBRARY_TOOLS: ToolbarToolDefinition[] = [
    { name: 'assets', icon: ImageIcon, labelKey: 'toolbar.gallery' },
    { name: 'templates', icon: LayoutTemplate, labelKey: 'toolbar.library', shortLabelKey: 'toolbar.short.templates' },
    { name: 'ai-zone', icon: Sparkles, labelKey: 'toolbar.aiZone' },
    { name: 'comfy-flows', icon: Workflow, labelKey: 'toolbar.comfyWorkflows', shortLabelKey: 'toolbar.short.comfy' },
    { name: 'ai-critique', icon: MessageSquare, labelKey: 'toolbar.aiCritique', shortLabelKey: 'toolbar.short.critique' },
    { name: 'ai-brand-manager', icon: ShieldCheck, labelKey: 'toolbar.aiBrandManager', shortLabelKey: 'toolbar.short.brand' },
    { name: 'super-agent', icon: Bot, labelKey: 'toolbar.superAgent', shortLabelKey: 'toolbar.short.agent' },
    { name: 'ai-upscale', icon: ArrowUpWideNarrow, labelKey: 'toolbar.aiUpscale', shortLabelKey: 'toolbar.short.upscale' },
];

export const WORKSPACE_UTILITY_TOOLS: ToolbarToolDefinition[] = [
    { name: 'crop', icon: Crop, labelKey: 'toolbar.crop' },
    { name: 'eyedropper', icon: Pipette, labelKey: 'toolbar.eyedropper', shortLabelKey: 'toolbar.short.picker' },
    { name: 'zoom', icon: Search, labelKey: 'toolbar.zoom' },
    { name: 'hand', icon: Hand, labelKey: 'toolbar.hand' },
];
