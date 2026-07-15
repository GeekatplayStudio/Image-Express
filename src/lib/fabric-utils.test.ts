import { ensureObjectId, getNextIndexedName, normalizeColorValue, getGroupNames, applyImageFiltersPreservingGeometry } from './fabric-utils';
import * as fabric from 'fabric';

// Mock fabric
jest.mock('fabric', () => {
    return {
        Object: class {},
        // ... other mocks if needed
    };
});

describe('fabric-utils', () => {
    describe('ensureObjectId', () => {
        it('should return existing id if present', () => {
            const obj = { id: 'existing-id' } as unknown as fabric.Object;
            expect(ensureObjectId(obj)).toBe('existing-id');
        });

        it('should generate new id if missing', () => {
            const obj = {} as unknown as fabric.Object;
            const id = ensureObjectId(obj);
            expect(id).toMatch(/^obj-\d+-\d+$/);
            // @ts-expect-error - id is added by the function but not on the type definition for this test case easily without full mock
            expect(obj.id).toBe(id);
        });

        it('should use cacheKey if present', () => {
            const obj = { cacheKey: 'key123' } as unknown as fabric.Object;
            const id = ensureObjectId(obj);
            expect(id).toBe('obj-key123');
        });
    });

    describe('getNextIndexedName', () => {
        it('should return Base 1 if list is empty', () => {
            expect(getNextIndexedName('Layer', [])).toBe('Layer 1');
        });

        it('should increment max index', () => {
            expect(getNextIndexedName('Layer', ['Layer 1', 'Layer 2'])).toBe('Layer 3');
        });

        it('should handle gaps in numbering', () => {
            expect(getNextIndexedName('Layer', ['Layer 1', 'Layer 5'])).toBe('Layer 6');
        });

        it('should ignore unrelated names', () => {
            expect(getNextIndexedName('Layer', ['Layer 1', 'Other'])).toBe('Layer 2');
        });

        it('should handle extra whitespace', () => {
            expect(getNextIndexedName('Layer', ['Layer  1 '])).toBe('Layer 2');
        });
    });

    describe('normalizeColorValue', () => {
        it('should return undefined for empty', () => {
            expect(normalizeColorValue('')).toBeUndefined();
        });

        it('should normalize short hex', () => {
            expect(normalizeColorValue('#abc')).toBe('#aabbcc');
        });

        it('should normalize standard hex', () => {
            expect(normalizeColorValue('#AABBCC')).toBe('#aabbcc');
        });

        it('should convert rgb to hex', () => {
            expect(normalizeColorValue('rgb(255, 0, 0)')).toBe('#ff0000');
        });

         it('should convert rgba to hex (ignoring alpha)', () => {
            expect(normalizeColorValue('rgba(0, 255, 0, 0.5)')).toBe('#00ff00');
        });

        it('should return original if format not recognized', () => {
            expect(normalizeColorValue('blue')).toBe('blue');
        });
    });

    describe('getGroupNames', () => {
        it('should return names of groups', () => {
            const mockCanvas = {
                getObjects: jest.fn().mockReturnValue([
                    { type: 'group', name: 'Group 1' },
                    { type: 'rect', name: 'Rect 1' }, // Should be ignored
                    { type: 'group' } // Missing name, should default
                ])
            } as unknown as fabric.Canvas;

            const names = getGroupNames(mockCanvas);
            expect(names).toEqual(['Group 1', 'Folder']);
        });
    });

    describe('applyImageFiltersPreservingGeometry', () => {
        type MockImage = {
            width: number;
            height: number;
            scaleX: number;
            scaleY: number;
            left: number;
            top: number;
            cropX: number;
            cropY: number;
            setCoords: jest.Mock;
            set: jest.Mock;
            applyFilters: jest.Mock;
        };

        const createMockImage = (overrides: Partial<MockImage> = {}): MockImage => {
            const image: MockImage = {
                width: 1200,
                height: 750,
                scaleX: 0.72,
                scaleY: 0.72,
                left: 50,
                top: 50,
                cropX: 0,
                cropY: 0,
                setCoords: jest.fn(),
                set: jest.fn(),
                applyFilters: jest.fn(),
                ...overrides,
            };
            image.set.mockImplementation((patch: Record<string, unknown>) => {
                Object.assign(image, patch);
            });
            return image;
        };

        it('restores geometry if applyFilters mutates it', () => {
            const image = createMockImage();
            image.applyFilters.mockImplementation(() => {
                // Simulate a buggy backend clipping the image to a square.
                image.width = 750;
                image.height = 750;
                image.scaleX = 1;
                image.scaleY = 1;
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            applyImageFiltersPreservingGeometry(image as any);

            expect(image.applyFilters).toHaveBeenCalledTimes(1);
            expect(image.width).toBe(1200);
            expect(image.height).toBe(750);
            expect(image.scaleX).toBe(0.72);
            expect(image.scaleY).toBe(0.72);
            expect(image.setCoords).toHaveBeenCalledTimes(1);
        });

        it('leaves geometry untouched when applyFilters behaves correctly', () => {
            const image = createMockImage();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            applyImageFiltersPreservingGeometry(image as any);

            expect(image.width).toBe(1200);
            expect(image.height).toBe(750);
            expect(image.scaleX).toBe(0.72);
            expect(image.scaleY).toBe(0.72);
            expect(image.left).toBe(50);
            expect(image.top).toBe(50);
        });
    });
});
