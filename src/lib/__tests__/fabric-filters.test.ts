jest.mock('fabric', () => {
  return {
    filters: {
      BaseFilter: class BaseFilter {
        constructor(options: Record<string, unknown>) {
          Object.assign(this, options);
        }
      },
    },
  };
});

let CurvesFilter: typeof import('@/lib/fabric-filters').CurvesFilter;

beforeAll(async () => {
  ({ CurvesFilter } = await import('@/lib/fabric-filters'));
  if (typeof ImageData === 'undefined') {
    class ImageDataPolyfill {
      data: Uint8ClampedArray;
      width: number;
      height: number;

      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    }
    (globalThis as unknown as { ImageData: typeof ImageDataPolyfill }).ImageData = ImageDataPolyfill;
  }
});

const createImageData = (rgba: number[]) => {
  return new ImageData(new Uint8ClampedArray(rgba), 1, 1);
};

describe('CurvesFilter', () => {
  it('adjusts red channel only', () => {
    const filter = new CurvesFilter({ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], channel: 'r' });
    const imageData = createImageData([100, 50, 25, 255]);

    filter.applyTo2d({ imageData });

    expect(Array.from(imageData.data)).toEqual([0, 50, 25, 255]);
  });

  it('adjusts green channel only', () => {
    const filter = new CurvesFilter({ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], channel: 'g' });
    const imageData = createImageData([100, 50, 25, 255]);

    filter.applyTo2d({ imageData });

    expect(Array.from(imageData.data)).toEqual([100, 0, 25, 255]);
  });

  it('adjusts blue channel only', () => {
    const filter = new CurvesFilter({ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], channel: 'b' });
    const imageData = createImageData([100, 50, 25, 255]);

    filter.applyTo2d({ imageData });

    expect(Array.from(imageData.data)).toEqual([100, 50, 0, 255]);
  });

  it('adjusts luminosity', () => {
    const filter = new CurvesFilter({ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], channel: 'luminosity' });
    const imageData = createImageData([100, 50, 25, 255]);

    filter.applyTo2d({ imageData });

    expect(Array.from(imageData.data)).toEqual([38, 0, 0, 255]);
  });

  it('adjusts all channels for master RGB', () => {
    const filter = new CurvesFilter({ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
    const imageData = createImageData([100, 50, 25, 255]);

    filter.applyTo2d({ imageData });

    expect(Array.from(imageData.data)).toEqual([0, 0, 0, 255]);
  });

  it('respects intensity', () => {
    const filter = new CurvesFilter({ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], channel: 'r', intensity: 0.5 });
    const imageData = createImageData([100, 50, 25, 255]);

    filter.applyTo2d({ imageData });

    expect(Array.from(imageData.data)).toEqual([50, 50, 25, 255]);
  });

  it('keeps data when points are empty', () => {
    const filter = new CurvesFilter({ points: [] });
    const imageData = createImageData([10, 20, 30, 255]);

    filter.applyTo2d({ imageData });

    expect(Array.from(imageData.data)).toEqual([10, 20, 30, 255]);
  });

  it('serializes to object with type', () => {
    const filter = new CurvesFilter({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], channel: 'rgb', intensity: 0.8 });
    expect(filter.type).toBe('Curves');
    expect(filter.toObject()).toEqual({
      type: 'Curves',
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      channel: 'rgb',
      intensity: 0.8,
    });
  });
});
