import type * as fabric from 'fabric';

type EditorCanvasToolOptions = {
    zoomMode?: 'in' | 'out';
};

type EditorCanvasToolConfig = {
    defaultCursor: string;
    hoverCursor: string;
    selection: boolean;
};

const CROSSHAIR_TOOLS = new Set([
    'marquee',
    'lasso',
    'wand',
    'quick-select',
    'selection-brush',
    'spot-healing',
    'remove',
    'healing',
    'clone-stamp',
    'history-brush',
    'blur',
    'sharpen',
    'dodge',
    'burn',
    'sponge',
    'paint',
    'gradient',
    'pen',
    'crop',
    'eyedropper',
]);

const normalizeTool = (tool: string) => (tool === 'path-select' ? 'select' : tool);

export function getEditorCanvasToolConfig(
    tool: string,
    options?: EditorCanvasToolOptions,
): EditorCanvasToolConfig | null {
    const normalizedTool = normalizeTool(tool);

    if (normalizedTool === 'select' || normalizedTool === 'ai-zone' || normalizedTool === 'ai-critique') {
        return {
            defaultCursor: 'default',
            hoverCursor: 'move',
            selection: true,
        };
    }

    if (normalizedTool === 'zoom') {
        const zoomCursor = options?.zoomMode === 'out' ? 'zoom-out' : 'zoom-in';
        return {
            defaultCursor: zoomCursor,
            hoverCursor: zoomCursor,
            selection: false,
        };
    }

    if (normalizedTool === 'hand') {
        return {
            defaultCursor: 'grab',
            hoverCursor: 'grab',
            selection: false,
        };
    }

    if (CROSSHAIR_TOOLS.has(normalizedTool)) {
        return {
            defaultCursor: 'crosshair',
            hoverCursor: 'crosshair',
            selection: false,
        };
    }

    return null;
}

export function applyEditorCanvasToolConfig(
    canvas: fabric.Canvas,
    tool: string,
    options?: EditorCanvasToolOptions,
) {
    const config = getEditorCanvasToolConfig(tool, options);
    if (!config) return;

    canvas.defaultCursor = config.defaultCursor;
    canvas.hoverCursor = config.hoverCursor;
    canvas.selection = config.selection;
    canvas.requestRenderAll();
}