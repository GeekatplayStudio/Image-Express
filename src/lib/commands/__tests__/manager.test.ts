import * as fabric from 'fabric';
import { CommandManager } from '../manager';
import { MoveObjectCommand, ResizeObjectCommand, ChangePropertyCommand } from '../canvasCommands';

describe('Command Pattern Engine & Manager', () => {
    let mockCanvas: fabric.Canvas;
    let mockObject: fabric.Object;
    let commandManager: CommandManager;

    beforeEach(() => {
        // Build mock fabric object
        const objStore = new Map<string, unknown>();
        objStore.set('id', 'layer-1');
        objStore.set('left', 10);
        objStore.set('top', 20);
        objStore.set('width', 100);
        objStore.set('height', 100);
        objStore.set('scaleX', 1);
        objStore.set('scaleY', 1);
        objStore.set('opacity', 1);
        objStore.set('fill', '#ffffff');

        mockObject = {
            get: jest.fn((prop: string) => objStore.get(prop)),
            set: jest.fn((propOrObj: string | Record<string, unknown>, val?: unknown) => {
                if (typeof propOrObj === 'object' && propOrObj !== null) {
                    for (const [k, v] of Object.entries(propOrObj)) {
                        objStore.set(k, v);
                    }
                } else if (typeof propOrObj === 'string') {
                    objStore.set(propOrObj, val);
                }
                return mockObject;
            }),
            setCoords: jest.fn(),
        } as unknown as fabric.Object;

        // Build mock fabric canvas
        mockCanvas = {
            getObjects: jest.fn(() => [mockObject]),
            requestRenderAll: jest.fn(),
        } as unknown as fabric.Canvas;

        commandManager = new CommandManager(mockCanvas);
    });

    test('MoveObjectCommand executes, undos, and redos correctly', () => {
        const moveCmd = new MoveObjectCommand('layer-1', 50, 60, 10, 20);

        commandManager.execute(moveCmd);
        expect(mockObject.get('left')).toBe(50);
        expect(mockObject.get('top')).toBe(60);
        expect(mockObject.setCoords).toHaveBeenCalled();
        expect(mockCanvas.requestRenderAll).toHaveBeenCalled();

        commandManager.undo();
        expect(mockObject.get('left')).toBe(10);
        expect(mockObject.get('top')).toBe(20);

        commandManager.redo();
        expect(mockObject.get('left')).toBe(50);
        expect(mockObject.get('top')).toBe(60);
    });

    test('ResizeObjectCommand executes, undos, and redos correctly', () => {
        const resizeCmd = new ResizeObjectCommand('layer-1', 200, 300, 1.5, 1.5, 100, 100, 1.0, 1.0);

        commandManager.execute(resizeCmd);
        expect(mockObject.get('width')).toBe(200);
        expect(mockObject.get('height')).toBe(300);
        expect(mockObject.get('scaleX')).toBe(1.5);
        expect(mockObject.get('scaleY')).toBe(1.5);

        commandManager.undo();
        expect(mockObject.get('width')).toBe(100);
        expect(mockObject.get('height')).toBe(100);
        expect(mockObject.get('scaleX')).toBe(1.0);
        expect(mockObject.get('scaleY')).toBe(1.0);
    });

    test('ChangePropertyCommand executes, undos, and redos correctly', () => {
        const propCmd = new ChangePropertyCommand('layer-1', 'fill', '#ff0000', '#ffffff');

        commandManager.execute(propCmd);
        expect(mockObject.get('fill')).toBe('#ff0000');

        commandManager.undo();
        expect(mockObject.get('fill')).toBe('#ffffff');
    });

    test('CommandManager serializes command execution and runs from JSON', () => {
        const propCmd = new ChangePropertyCommand('layer-1', 'opacity', 0.5, 1.0);
        commandManager.execute(propCmd);

        const auditTrail = commandManager.getAuditTrail();
        expect(auditTrail.length).toBe(1);
        expect(auditTrail[0].type).toBe('change-property');
        expect(auditTrail[0].objectId).toBe('layer-1');
        expect(auditTrail[0].params.property).toBe('opacity');
        expect(auditTrail[0].params.newValue).toBe(0.5);

        // Clear history and replay from JSON
        commandManager.clearHistory();
        expect(commandManager.getHistoryCounts().undo).toBe(0);

        commandManager.executeFromJSON(auditTrail[0]);
        expect(mockObject.get('opacity')).toBe(0.5);
        expect(commandManager.getHistoryCounts().undo).toBe(1);
    });

    test('CommandManager tracks history counts and clear works', () => {
        const moveCmd = new MoveObjectCommand('layer-1', 30, 40, 10, 20);
        
        expect(commandManager.getHistoryCounts()).toEqual({ undo: 0, redo: 0 });
        
        commandManager.execute(moveCmd);
        expect(commandManager.getHistoryCounts()).toEqual({ undo: 1, redo: 0 });
        
        commandManager.undo();
        expect(commandManager.getHistoryCounts()).toEqual({ undo: 0, redo: 1 });
        
        commandManager.redo();
        expect(commandManager.getHistoryCounts()).toEqual({ undo: 1, redo: 0 });

        commandManager.clearHistory();
        expect(commandManager.getHistoryCounts()).toEqual({ undo: 0, redo: 0 });
    });
});
