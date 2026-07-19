import * as fabric from 'fabric';
import { Command, SerializableCommandPayload } from './types';

// Helper to find an object by its custom ID
const findObjectById = (canvas: fabric.Canvas, id: string): fabric.Object | undefined => {
    return canvas.getObjects().find(o => o.get('id') === id);
};

// 1. Move Object Command
export class MoveObjectCommand implements Command {
    readonly type = 'move-object';

    constructor(
        public readonly objectId: string,
        public readonly newLeft: number,
        public readonly newTop: number,
        public readonly oldLeft: number,
        public readonly oldTop: number
    ) {}

    execute(canvas: fabric.Canvas): void {
        const obj = findObjectById(canvas, this.objectId);
        if (obj) {
            obj.set({ left: this.newLeft, top: this.newTop });
            obj.setCoords();
            canvas.requestRenderAll();
        }
    }

    undo(canvas: fabric.Canvas): void {
        const obj = findObjectById(canvas, this.objectId);
        if (obj) {
            obj.set({ left: this.oldLeft, top: this.oldTop });
            obj.setCoords();
            canvas.requestRenderAll();
        }
    }

    toJSON(): SerializableCommandPayload {
        return {
            type: this.type,
            objectId: this.objectId,
            params: {
                newLeft: this.newLeft,
                newTop: this.newTop,
                oldLeft: this.oldLeft,
                oldTop: this.oldTop,
            },
        };
    }
}

// 2. Resize Object Command
export class ResizeObjectCommand implements Command {
    readonly type = 'resize-object';

    constructor(
        public readonly objectId: string,
        public readonly newWidth: number,
        public readonly newHeight: number,
        public readonly newScaleX: number,
        public readonly newScaleY: number,
        public readonly oldWidth: number,
        public readonly oldHeight: number,
        public readonly oldScaleX: number,
        public readonly oldScaleY: number
    ) {}

    execute(canvas: fabric.Canvas): void {
        const obj = findObjectById(canvas, this.objectId);
        if (obj) {
            obj.set({
                width: this.newWidth,
                height: this.newHeight,
                scaleX: this.newScaleX,
                scaleY: this.newScaleY,
            });
            obj.setCoords();
            canvas.requestRenderAll();
        }
    }

    undo(canvas: fabric.Canvas): void {
        const obj = findObjectById(canvas, this.objectId);
        if (obj) {
            obj.set({
                width: this.oldWidth,
                height: this.oldHeight,
                scaleX: this.oldScaleX,
                scaleY: this.oldScaleY,
            });
            obj.setCoords();
            canvas.requestRenderAll();
        }
    }

    toJSON(): SerializableCommandPayload {
        return {
            type: this.type,
            objectId: this.objectId,
            params: {
                newWidth: this.newWidth,
                newHeight: this.newHeight,
                newScaleX: this.newScaleX,
                newScaleY: this.newScaleY,
                oldWidth: this.oldWidth,
                oldHeight: this.oldHeight,
                oldScaleX: this.oldScaleX,
                oldScaleY: this.oldScaleY,
            },
        };
    }
}

// 3. Change Property Command (e.g. fill, opacity, text, angle)
export class ChangePropertyCommand implements Command {
    readonly type = 'change-property';

    constructor(
        public readonly objectId: string,
        public readonly property: string,
        public readonly newValue: unknown,
        public readonly oldValue: unknown
    ) {}

    execute(canvas: fabric.Canvas): void {
        const obj = findObjectById(canvas, this.objectId);
        if (obj) {
            obj.set({ [this.property]: this.newValue } as Partial<fabric.Object>);
            obj.setCoords();
            canvas.requestRenderAll();
        }
    }

    undo(canvas: fabric.Canvas): void {
        const obj = findObjectById(canvas, this.objectId);
        if (obj) {
            obj.set({ [this.property]: this.oldValue } as Partial<fabric.Object>);
            obj.setCoords();
            canvas.requestRenderAll();
        }
    }

    toJSON(): SerializableCommandPayload {
        return {
            type: this.type,
            objectId: this.objectId,
            params: {
                property: this.property,
                newValue: this.newValue,
                oldValue: this.oldValue,
            },
        };
    }
}
