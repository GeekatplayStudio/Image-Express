import {
    ArrowUpWideNarrow,
    BadgeCheck,
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
    Megaphone,
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
    Stamp,
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
    /** Single-key shortcut (no modifiers). The keyboard hook, tooltips and the Tools menu all read it from here. */
    shortcut?: string;
};

export type ToolbarToolGroupId = 'selection' | 'retouch' | 'fill' | 'ai' | 'fabrication';

export type ToolbarToolGroupDefinition = {
    id: ToolbarToolGroupId;
    labelKey: string;
    tools: ToolbarToolDefinition[];
    defaultTool: string;
    /** Each tool opens its own window, so a click shows the choices instead of launching one blindly. */
    clickOpensMenu?: boolean;
};

export const TOOL_ALIAS_MAP: Record<string, string> = { move: 'select', 'path-select': 'select' };

export const SELECTION_TOOL_GROUP: ToolbarToolGroupDefinition = {
    id: 'selection', labelKey: 'toolbar.group.selection', defaultTool: 'select',
    tools: [
        { name: 'select', icon: Move, labelKey: 'toolbar.move', shortcut: 'V' },
        { name: 'marquee', icon: Square, labelKey: 'toolbar.marquee', shortcut: 'M' },
        { name: 'lasso', icon: LassoSelect, labelKey: 'toolbar.lasso', shortcut: 'L' },
        { name: 'wand', icon: Wand2, labelKey: 'toolbar.wand', shortLabelKey: 'toolbar.short.wand', shortcut: '⇧W' },
        { name: 'quick-select', icon: SquareMousePointer, labelKey: 'toolbar.quickSelect', shortLabelKey: 'toolbar.short.quick', shortcut: 'Q' },
        { name: 'selection-brush', icon: PaintbrushVertical, labelKey: 'toolbar.selectionBrush', shortLabelKey: 'toolbar.short.selBrush', shortcut: 'K' },
        { name: 'path-select', icon: Pointer, labelKey: 'toolbar.pathSelect', shortLabelKey: 'toolbar.short.path', shortcut: 'A' },
    ],
};

export const RETOUCH_TOOL_GROUP: ToolbarToolGroupDefinition = {
    id: 'retouch', labelKey: 'toolbar.group.retouch', defaultTool: 'healing',
    tools: [
        { name: 'spot-healing', icon: Bandage, labelKey: 'toolbar.spotHealing', shortLabelKey: 'toolbar.short.spot' },
        { name: 'remove', icon: Eraser, labelKey: 'toolbar.removeTool', shortLabelKey: 'toolbar.short.remove' },
        { name: 'healing', icon: ShieldCheck, labelKey: 'toolbar.healingBrush', shortLabelKey: 'toolbar.short.healing', shortcut: 'J' },
        { name: 'clone-stamp', icon: Copy, labelKey: 'toolbar.cloneStamp', shortLabelKey: 'toolbar.short.clone', shortcut: 'S' },
        { name: 'history-brush', icon: History, labelKey: 'toolbar.historyBrush', shortLabelKey: 'toolbar.short.history', shortcut: 'Y' },
        { name: 'blur', icon: Blend, labelKey: 'toolbar.blurTool', shortLabelKey: 'toolbar.short.blur', shortcut: 'R' },
        { name: 'sharpen', icon: Scan, labelKey: 'toolbar.sharpenTool', shortLabelKey: 'toolbar.short.sharpen' },
        { name: 'dodge', icon: Sun, labelKey: 'toolbar.dodgeTool', shortLabelKey: 'toolbar.short.dodge', shortcut: 'O' },
        { name: 'burn', icon: Flame, labelKey: 'toolbar.burnTool', shortLabelKey: 'toolbar.short.burn' },
        { name: 'sponge', icon: Droplets, labelKey: 'toolbar.spongeTool', shortLabelKey: 'toolbar.short.sponge' },
    ],
};

export const FILL_TOOL_GROUP: ToolbarToolGroupDefinition = {
    id: 'fill', labelKey: 'toolbar.group.fill', defaultTool: 'gradient',
    tools: [
        { name: 'gradient', icon: PaintBucket, labelKey: 'toolbar.fillGradient', shortLabelKey: 'toolbar.short.fill', shortcut: 'G' },
        { name: 'fill-layer', icon: Layers, labelKey: 'toolbar.fillLayer', shortLabelKey: 'toolbar.short.fillLayer' },
    ],
};

export const AI_TOOL_GROUP: ToolbarToolGroupDefinition = {
    id: 'ai', labelKey: 'toolbar.group.ai', defaultTool: 'ai-zone', clickOpensMenu: true,
    tools: [
        { name: 'ai-zone', icon: Sparkles, labelKey: 'toolbar.aiZone' },
        { name: 'comfy-flows', icon: Workflow, labelKey: 'toolbar.comfyWorkflows', shortLabelKey: 'toolbar.short.comfy' },
        { name: 'ai-upscale', icon: ArrowUpWideNarrow, labelKey: 'toolbar.aiUpscale', shortLabelKey: 'toolbar.short.upscale' },
        { name: 'ai-critique', icon: MessageSquare, labelKey: 'toolbar.aiCritique', shortLabelKey: 'toolbar.short.critique' },
        { name: 'ai-brand-manager', icon: BadgeCheck, labelKey: 'toolbar.aiBrandManager', shortLabelKey: 'toolbar.short.brand' },
        { name: 'campaign-manager', icon: Megaphone, labelKey: 'toolbar.campaignManager' },
        { name: 'super-agent', icon: Bot, labelKey: 'toolbar.superAgent', shortLabelKey: 'toolbar.short.agent' },
    ],
};

export const FABRICATION_TOOL_GROUP: ToolbarToolGroupDefinition = {
    id: 'fabrication', labelKey: 'toolbar.group.fabrication', defaultTool: 'fabrication-library',
    tools: [
        { name: 'fabrication-library', icon: Boxes, labelKey: 'toolbar.fabricationLibrary' },
        { name: '3d-gen', icon: Box, labelKey: 'fabrication.workflow.generate3d' },
        { name: '3d-stamp', icon: Stamp, labelKey: 'toolbar.3dStamp', shortLabelKey: 'toolbar.short.stamp' },
        { name: '3d-library', icon: Library, labelKey: 'toolbar.modelLibrary' },
        { name: 'cricut-studio', icon: Scissors, labelKey: 'toolbar.cricutStudio' },
        { name: 'cnc-planner', icon: Cog, labelKey: 'toolbar.cncPlanner' },
    ],
};

export const TOOL_GROUPS = [SELECTION_TOOL_GROUP, RETOUCH_TOOL_GROUP, FILL_TOOL_GROUP, AI_TOOL_GROUP, FABRICATION_TOOL_GROUP];
export const TOOL_GROUP_BY_ID = Object.fromEntries(TOOL_GROUPS.map((group) => [group.id, group])) as Record<ToolbarToolGroupId, ToolbarToolGroupDefinition>;

export const CREATION_PRIMARY_TOOLS: ToolbarToolDefinition[] = [
    { name: 'text', icon: Type, labelKey: 'toolbar.text', shortcut: 'T' },
    { name: 'shapes', icon: Shapes, labelKey: 'toolbar.shapes', shortcut: 'U' },
    { name: 'adjustments', icon: SlidersHorizontal, labelKey: 'toolbar.adjustmentLayers', shortLabelKey: 'toolbar.short.adjust' },
    { name: 'pen', icon: PenTool, labelKey: 'toolbar.pen', shortcut: 'P' },
    { name: 'paint', icon: Brush, labelKey: 'toolbar.brushes', shortLabelKey: 'toolbar.short.brush', shortcut: 'B' },
];

/** Libraries stay as direct buttons: they are opened constantly and have no variants. */
export const LIBRARY_TOOLS: ToolbarToolDefinition[] = [
    { name: 'assets', icon: ImageIcon, labelKey: 'toolbar.gallery' },
    { name: 'templates', icon: LayoutTemplate, labelKey: 'toolbar.library', shortLabelKey: 'toolbar.short.templates' },
];

export const WORKSPACE_UTILITY_TOOLS: ToolbarToolDefinition[] = [
    { name: 'crop', icon: Crop, labelKey: 'toolbar.crop', shortcut: 'C' },
    { name: 'eyedropper', icon: Pipette, labelKey: 'toolbar.eyedropper', shortLabelKey: 'toolbar.short.picker', shortcut: 'I' },
    { name: 'zoom', icon: Search, labelKey: 'toolbar.zoom', shortcut: 'Z' },
    { name: 'hand', icon: Hand, labelKey: 'toolbar.hand', shortcut: 'H' },
];

/** Every tool the rail can launch, in rail order. The Tools menu and the coverage test read this. */
export const ALL_TOOLBAR_TOOLS: ToolbarToolDefinition[] = [
    ...SELECTION_TOOL_GROUP.tools, ...RETOUCH_TOOL_GROUP.tools, ...FILL_TOOL_GROUP.tools,
    ...CREATION_PRIMARY_TOOLS, ...LIBRARY_TOOLS, ...AI_TOOL_GROUP.tools, ...FABRICATION_TOOL_GROUP.tools,
    ...WORKSPACE_UTILITY_TOOLS,
];

/** Lower-case key → tool name for the plain single-key shortcuts (Shift+W is handled separately). */
export const TOOL_SHORTCUT_KEYS: Record<string, string> = Object.fromEntries(
    ALL_TOOLBAR_TOOLS
        .filter((tool) => tool.shortcut && tool.shortcut.length === 1)
        .map((tool) => [tool.shortcut!.toLowerCase(), tool.name]),
);

export const withShortcut = (label: string, tool: ToolbarToolDefinition) => (
    tool.shortcut ? `${label} (${tool.shortcut})` : label
);

/** The shortcut in the form `aria-keyshortcuts` expects (`⇧W` → `Shift+W`). */
export const ariaShortcut = (tool: ToolbarToolDefinition) => tool.shortcut?.replace('⇧', 'Shift+');
