import type * as fabric from 'fabric';

type EditorCanvasToolOptions = {
    zoomMode?: 'in' | 'out';
};

export type EditorCanvasToolConfig = {
    defaultCursor: string;
    hoverCursor: string;
    selection: boolean;
    /** When true, Fabric will not hit-test / drag objects under the cursor. */
    skipTargetFind: boolean;
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

/** Drawing / region tools must not grab objects under the cursor. */
const SKIP_TARGET_TOOLS = new Set([
    ...CROSSHAIR_TOOLS,
]);

const normalizeTool = (tool: string) => (tool === 'path-select' ? 'select' : tool);

type CanvasWithToolMemory = fabric.Canvas & {
    __ieActiveTool?: string;
    __ieZoomMode?: 'in' | 'out';
    skipTargetFind?: boolean;
};

export function getEditorCanvasToolConfig(
    tool: string,
    options?: EditorCanvasToolOptions,
): EditorCanvasToolConfig | null {
    const normalizedTool = normalizeTool(tool);

    if (
        normalizedTool === 'select' ||
        normalizedTool === 'ai-zone' ||
        normalizedTool === 'ai-critique' ||
        normalizedTool === 'ai-brand-manager' ||
        normalizedTool === 'super-agent' ||
        normalizedTool === 'ai-upscale'
    ) {
        return {
            defaultCursor: 'default',
            hoverCursor: 'move',
            selection: true,
            skipTargetFind: false,
        };
    }

    if (normalizedTool === 'zoom') {
        const zoomCursor = options?.zoomMode === 'out' ? 'zoom-out' : 'zoom-in';
        return {
            defaultCursor: zoomCursor,
            hoverCursor: zoomCursor,
            selection: false,
            skipTargetFind: true,
        };
    }

    if (normalizedTool === 'hand') {
        return {
            defaultCursor: 'grab',
            hoverCursor: 'grab',
            selection: false,
            skipTargetFind: true,
        };
    }

    if (CROSSHAIR_TOOLS.has(normalizedTool)) {
        return {
            defaultCursor: 'crosshair',
            hoverCursor: 'crosshair',
            selection: false,
            skipTargetFind: SKIP_TARGET_TOOLS.has(normalizedTool),
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

    const typed = canvas as CanvasWithToolMemory;
    typed.__ieActiveTool = normalizeTool(tool);
    if (options?.zoomMode) typed.__ieZoomMode = options.zoomMode;

    canvas.defaultCursor = config.defaultCursor;
    canvas.hoverCursor = config.hoverCursor;
    canvas.selection = config.selection;
    typed.skipTargetFind = config.skipTargetFind;
    canvas.requestRenderAll();
}

/**
 * Re-apply the last tool config after pan/hand handlers clobber canvas.selection / cursors.
 * Defaults to Move (select) when no tool has been recorded yet.
 */
export function restoreEditorCanvasToolConfig(canvas: fabric.Canvas) {
    const typed = canvas as CanvasWithToolMemory;
    const tool = typed.__ieActiveTool || 'select';
    const zoomMode = typed.__ieZoomMode;
    applyEditorCanvasToolConfig(canvas, tool, zoomMode ? { zoomMode } : undefined);
}
