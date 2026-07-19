import * as fabric from 'fabric';

export interface SerializableCommandPayload {
    type: string;
    objectId: string;
    params: Record<string, unknown>;
}

export interface Command {
    type: string;
    execute(canvas: fabric.Canvas): void;
    undo(canvas: fabric.Canvas): void;
    toJSON(): SerializableCommandPayload;
}
