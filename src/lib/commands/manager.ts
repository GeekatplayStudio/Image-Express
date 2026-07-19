import * as fabric from 'fabric';
import { Command, SerializableCommandPayload } from './types';
import { MoveObjectCommand, ResizeObjectCommand, ChangePropertyCommand } from './canvasCommands';

export class CommandManager {
    private undoStack: Command[] = [];
    private redoStack: Command[] = [];
    private auditTrail: SerializableCommandPayload[] = [];

    constructor(private readonly canvas: fabric.Canvas) {}

    // Execute a command, add to undo history, and clear redo stack
    execute(command: Command): void {
        command.execute(this.canvas);
        this.undoStack.push(command);
        this.redoStack = [];
        this.auditTrail.push(command.toJSON());
    }

    // Revert the last executed command
    undo(): void {
        const command = this.undoStack.pop();
        if (command) {
            command.undo(this.canvas);
            this.redoStack.push(command);
        }
    }

    // Re-execute the last undone command
    redo(): void {
        const command = this.redoStack.pop();
        if (command) {
            command.execute(this.canvas);
            this.undoStack.push(command);
        }
    }

    // Get all command execution payloads (audit trail)
    getAuditTrail(): SerializableCommandPayload[] {
        return [...this.auditTrail];
    }

    // Get current undo/redo counts
    getHistoryCounts(): { undo: number; redo: number } {
        return {
            undo: this.undoStack.length,
            redo: this.redoStack.length,
        };
    }

    // Reset stacks
    clearHistory(): void {
        this.undoStack = [];
        this.redoStack = [];
        this.auditTrail = [];
    }

    // Reconstruct and execute a command from a serialized JSON payload
    executeFromJSON(payload: SerializableCommandPayload): void {
        let command: Command;

        switch (payload.type) {
            case 'move-object':
                command = new MoveObjectCommand(
                    payload.objectId,
                    payload.params.newLeft as number,
                    payload.params.newTop as number,
                    payload.params.oldLeft as number,
                    payload.params.oldTop as number
                );
                break;
            case 'resize-object':
                command = new ResizeObjectCommand(
                    payload.objectId,
                    payload.params.newWidth as number,
                    payload.params.newHeight as number,
                    payload.params.newScaleX as number,
                    payload.params.newScaleY as number,
                    payload.params.oldWidth as number,
                    payload.params.oldHeight as number,
                    payload.params.oldScaleX as number,
                    payload.params.oldScaleY as number
                );
                break;
            case 'change-property':
                command = new ChangePropertyCommand(
                    payload.objectId,
                    payload.params.property as string,
                    payload.params.newValue,
                    payload.params.oldValue
                );
                break;
            default:
                throw new Error(`Unknown command type: ${payload.type}`);
        }

        this.execute(command);
    }
}
