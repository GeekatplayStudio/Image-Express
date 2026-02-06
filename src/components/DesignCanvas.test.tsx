import React from 'react';
import { render } from '@testing-library/react';
import DesignCanvas from './DesignCanvas';
import * as fabric from 'fabric';

// Mock the providers
jest.mock('@/providers/DialogProvider', () => ({
  useDialog: () => ({
    alert: jest.fn(),
    confirm: jest.fn(),
    prompt: jest.fn(),
  }),
}));

jest.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({
    toast: jest.fn(),
    dismiss: jest.fn(),
  }),
}));

// Mock fabric
jest.mock('fabric', () => {
    return {
      Canvas: jest.fn().mockImplementation(() => {
        const lowerCanvas = document.createElement('canvas');
        const wrapper = document.createElement('div');
        wrapper.appendChild(lowerCanvas);
        
        return {
        on: jest.fn(),
        off: jest.fn(),
        renderAll: jest.fn(),
        dispose: jest.fn(),
        setDimensions: jest.fn(),
        setWidth: jest.fn(),
        setHeight: jest.fn(),
        add: jest.fn(),
        remove: jest.fn(),
        getObjects: jest.fn().mockReturnValue([]),
        clear: jest.fn(),
        getElement: jest.fn().mockReturnValue(document.createElement('canvas')),
        requestRenderAll: jest.fn(),
        setActiveObject: jest.fn(),
        getActiveObject: jest.fn(),
        toDataURL: jest.fn(),
        setZoom: jest.fn(),
        setViewportTransform: jest.fn(),
        findTarget: jest.fn(),
        getPointer: jest.fn().mockReturnValue({ x: 0, y: 0 }),
        sendObjectToBack: jest.fn(),
        getActiveObjects: jest.fn().mockReturnValue([]),
        discardActiveObject: jest.fn(),
        lowerCanvasEl: lowerCanvas,
      }}),
      Image: class {
        static fromURL = jest.fn().mockResolvedValue({});
        on = jest.fn();
        set = jest.fn();
      },
      Rect: class {
        set = jest.fn();
        on = jest.fn();
      },
      Object: class {
        set = jest.fn();
      },
      Group: class {
         addWithUpdate = jest.fn();
      },
      Shadow: class {},
      Control: class {},
      Point: class {
          x: number;
          y: number;
          constructor(x: number, y: number) {
              this.x = x;
              this.y = y;
          }
      }
    };
});

describe('DesignCanvas', () => {
  it('renders without crashing', () => {
    const onCanvasReady = jest.fn();
    render(<DesignCanvas onCanvasReady={onCanvasReady} />);
  });

  it('initializes fabric canvas on mount', () => {
     const onCanvasReady = jest.fn();
     render(<DesignCanvas onCanvasReady={onCanvasReady} />);
     expect(fabric.Canvas).toHaveBeenCalled();
     expect(onCanvasReady).toHaveBeenCalled();
  });
});
