import type * as fabric from 'fabric';
import type { CritiqueJump } from '@/lib/critique/critiqueReport';

/**
 * "Apply in editor": take the user from a critique action to the place in the
 * editor where that kind of edit is made. It navigates and selects; it never
 * changes the page — the critique is advice, and the edit stays the user's.
 */

export interface CritiqueJumpTargets {
    canvas: fabric.Canvas | null | undefined;
    setActiveTool: (tool: string) => void;
    openPanel?: (mode?: 'properties' | 'layers') => void;
}

const TEXT_TYPES = new Set(['i-text', 'textbox', 'text']);

const isText = (object: fabric.Object | null | undefined) => (
    !!object && TEXT_TYPES.has(String(object.type).toLowerCase())
);

export function runCritiqueJump(jump: Exclude<CritiqueJump, 'none'>, targets: CritiqueJumpTargets): void {
    const { canvas, setActiveTool, openPanel } = targets;

    if (jump === 'crop') {
        setActiveTool('crop');
        return;
    }

    // Everything else is edited with the Move tool and a panel.
    setActiveTool('select');

    if (jump === 'text' && canvas && !isText(canvas.getActiveObject())) {
        // Land on a text layer, so the type controls are there to use. The
        // topmost one, since that is usually the headline.
        const text = [...canvas.getObjects()].reverse().find((object) => isText(object) && object.visible !== false);
        if (text) {
            canvas.setActiveObject(text);
            canvas.requestRenderAll();
        }
    }

    openPanel?.(jump === 'layout' ? 'layers' : 'properties');
}
