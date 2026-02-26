import * as fabric from 'fabric';
import {
  addToGroup,
  applyAlphaToColor,
  ensureObjectId,
  getAdjustmentLabel,
  getDefaultAdjustmentSettings,
  getGroupNames,
  getNextIndexedName,
  moveObjectToCanvas,
  moveObjectToGroup,
  normalizeColorValue,
  parseColorWithAlpha,
} from '@/lib/fabric-utils';

type MockObject = {
  id?: string;
  cacheKey?: string;
  group?: MockGroup;
  type?: string;
  name?: string;
  calcTransformMatrix: jest.Mock;
  setCoords: jest.Mock;
};

type MockGroup = {
  add?: jest.Mock;
  addWithUpdate?: jest.Mock;
  remove: jest.Mock;
  setCoords: jest.Mock;
  calcTransformMatrix: jest.Mock;
};

type MockCanvas = {
  add: jest.Mock;
  remove: jest.Mock;
  getObjects: jest.Mock;
};

jest.mock('fabric', () => {
  return {
    util: {
      invertTransform: jest.fn((matrix) => ({ matrix, op: 'invert' })),
      multiplyTransformMatrices: jest.fn((a, b) => ({ a, b, op: 'multiply' })),
      applyTransformToObject: jest.fn(),
    },
  };
});

describe('fabric-utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ensures object id', () => {
    const obj = { cacheKey: 'abc', calcTransformMatrix: jest.fn(), setCoords: jest.fn() } as unknown as MockObject;
    const id = ensureObjectId(obj as unknown as fabric.Object);
    expect(id).toBe('obj-abc');
  });

  it('generates next indexed name', () => {
    expect(getNextIndexedName('Layer', ['Layer', 'Layer 2', 'Other'])).toBe('Layer 3');
  });

  it('returns group names or default label', () => {
    const canvas = {
      getObjects: jest.fn().mockReturnValue([
        { type: 'group', name: 'Group A' },
        { type: 'rect', name: 'Not a group' },
        { type: 'group' },
      ]),
    } as unknown as MockCanvas;

    expect(getGroupNames(canvas as unknown as fabric.Canvas)).toEqual(['Group A', 'Folder']);
  });

  it('adds to group via addWithUpdate when available', () => {
    const group = {
      addWithUpdate: jest.fn(),
      remove: jest.fn(),
      setCoords: jest.fn(),
      calcTransformMatrix: jest.fn(),
    } as unknown as MockGroup;

    addToGroup(group as unknown as fabric.Group, {} as fabric.Object);
    expect(group.addWithUpdate).toHaveBeenCalled();
  });

  it('adds to group and updates coords when addWithUpdate is missing', () => {
    const group = {
      add: jest.fn(),
      remove: jest.fn(),
      setCoords: jest.fn(),
      calcTransformMatrix: jest.fn(),
    } as unknown as MockGroup;

    addToGroup(group as unknown as fabric.Group, {} as fabric.Object);
    expect(group.add).toHaveBeenCalled();
    expect(group.setCoords).toHaveBeenCalled();
  });

  it('moves object to group, removing from parent group', () => {
    const parentGroup = {
      remove: jest.fn(),
      setCoords: jest.fn(),
      calcTransformMatrix: jest.fn().mockReturnValue('parentMatrix'),
    } as unknown as MockGroup;

    const group = {
      add: jest.fn(),
      remove: jest.fn(),
      setCoords: jest.fn(),
      calcTransformMatrix: jest.fn().mockReturnValue('groupMatrix'),
    } as unknown as MockGroup;

    const obj = {
      group: parentGroup,
      calcTransformMatrix: jest.fn().mockReturnValue('objMatrix'),
      setCoords: jest.fn(),
    } as unknown as MockObject;

    const canvas = {
      remove: jest.fn(),
      add: jest.fn(),
      getObjects: jest.fn(),
    } as unknown as MockCanvas;

    moveObjectToGroup(obj as unknown as fabric.Object, group as unknown as fabric.Group, canvas as unknown as fabric.Canvas);

    expect(parentGroup.remove).toHaveBeenCalledWith(obj);
    expect((fabric.util.applyTransformToObject as jest.Mock)).toHaveBeenCalled();
    expect(group.add).toHaveBeenCalledWith(obj);
  });

  it('moves object from canvas to group', () => {
    const group = {
      add: jest.fn(),
      remove: jest.fn(),
      setCoords: jest.fn(),
      calcTransformMatrix: jest.fn().mockReturnValue('groupMatrix'),
    } as unknown as MockGroup;

    const obj = {
      calcTransformMatrix: jest.fn().mockReturnValue('objMatrix'),
      setCoords: jest.fn(),
    } as unknown as MockObject;

    const canvas = {
      remove: jest.fn(),
      add: jest.fn(),
      getObjects: jest.fn(),
    } as unknown as MockCanvas;

    moveObjectToGroup(obj as unknown as fabric.Object, group as unknown as fabric.Group, canvas as unknown as fabric.Canvas);

    expect(canvas.remove).toHaveBeenCalledWith(obj);
    expect(group.add).toHaveBeenCalledWith(obj);
  });

  it('moves object back to canvas', () => {
    const parentGroup = {
      remove: jest.fn(),
      setCoords: jest.fn(),
      calcTransformMatrix: jest.fn().mockReturnValue('groupMatrix'),
    } as unknown as MockGroup;

    const obj = {
      calcTransformMatrix: jest.fn().mockReturnValue('objMatrix'),
      setCoords: jest.fn(),
    } as unknown as MockObject;

    const canvas = {
      add: jest.fn(),
      remove: jest.fn(),
      getObjects: jest.fn(),
    } as unknown as MockCanvas;

    moveObjectToCanvas(obj as unknown as fabric.Object, parentGroup as unknown as fabric.Group, canvas as unknown as fabric.Canvas);

    expect(parentGroup.remove).toHaveBeenCalledWith(obj);
    expect(canvas.add).toHaveBeenCalledWith(obj);
  });

  it('normalizes colors and parses alpha', () => {
    expect(normalizeColorValue('#ABC')).toBe('#aabbcc');
    expect(normalizeColorValue('rgb(10, 20, 30)')).toBe('#0a141e');
    expect(normalizeColorValue('blue')).toBe('blue');
    expect(parseColorWithAlpha('transparent')).toEqual({ color: '#000000', alpha: 0 });
    expect(parseColorWithAlpha('rgba(10, 20, 30, 0.5)')).toEqual({ color: '#0a141e', alpha: 0.5 });
    expect(parseColorWithAlpha()).toEqual({ color: '#000000', alpha: 1 });
  });

  it('applies alpha to color', () => {
    expect(applyAlphaToColor('#ffffff', 0.25)).toBe('rgba(255, 255, 255, 0.25)');
    expect(applyAlphaToColor('rgb(0, 0, 0)', 0.2)).toBe('rgba(0, 0, 0, 0.2)');
  });

  it('returns adjustment labels and defaults', () => {
    expect(getAdjustmentLabel('curves')).toBe('Curves');
    expect(getAdjustmentLabel('solid-color')).toBe('Solid Color');
    expect(getAdjustmentLabel()).toBe('Adjustment');
    expect(getDefaultAdjustmentSettings('levels')).toEqual({ black: 0, mid: 1, white: 1 });
    expect(getDefaultAdjustmentSettings('brightness-contrast')).toEqual({ brightness: 0, contrast: 0 });
    expect(getDefaultAdjustmentSettings('color-balance')).toEqual({ red: 0, green: 0, blue: 0, preserveLuminosity: true });
    expect(getDefaultAdjustmentSettings('light-and-color')).toEqual({ temperature: 0, tint: 0, exposure: 0, saturation: 0, vibrance: 0 });
    expect(getDefaultAdjustmentSettings('solid-color')).toEqual({ color: '#ff8800', opacity: 0.5, mode: 'tint' });
  });
});
