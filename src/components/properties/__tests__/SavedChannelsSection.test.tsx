import { act, fireEvent, render, screen } from '@testing-library/react';
import type * as fabric from 'fabric';

import { SavedChannelsSection } from '@/components/properties/SavedChannelsSection';
import { createDocumentSelectionMask } from '@/lib/selection/documentSelectionMask';
import { commitDocumentSelection, getDocumentSelectionMask } from '@/lib/selection/documentSelectionStore';
import { getSavedChannels } from '@/lib/selection/savedChannels';

jest.mock('@/providers/I18nProvider', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

const toastMock = jest.fn();
jest.mock('@/providers/ToastProvider', () => ({
    useToast: () => ({ toast: toastMock, dismiss: jest.fn() }),
}));

// Rasterising a layer needs a real 2D canvas; the pixels are supplied instead.
const capture = jest.fn();
jest.mock('@/lib/selection/selectionLayerCapture', () => ({
    ...jest.requireActual('@/lib/selection/selectionLayerCapture'),
    captureLayerPixelsInArtboard: (...args: unknown[]) => capture(...args),
    getArtboardSelectionBounds: () => ({ left: 0, top: 0, width: 2, height: 1 }),
    isContentSelectableLayer: () => true,
}));

const makeCanvas = (active: unknown = null) => ({
    artboard: { left: 0, top: 0, width: 2, height: 1 },
    getWidth: () => 2,
    getHeight: () => 1,
    getActiveObject: () => active,
    requestRenderAll: jest.fn(),
}) as unknown as fabric.Canvas;

const select = (canvas: fabric.Canvas, values: number[]) => {
    const mask = createDocumentSelectionMask({ left: 0, top: 0, width: 2, height: 1 });
    mask.data.set(values);
    act(() => commitDocumentSelection(canvas, mask, null));
};

describe('SavedChannelsSection', () => {
    beforeEach(() => jest.clearAllMocks());

    it('renders nothing without a page', () => {
        const { container } = render(<SavedChannelsSection canvas={null} />);
        expect(container.firstChild).toBeNull();
    });

    it('only offers "save selection" when something is selected', () => {
        const canvas = makeCanvas();
        render(<SavedChannelsSection canvas={canvas} />);
        const button = screen.getByText('channels.saved.saveSelection') as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        expect(screen.getByText('channels.saved.empty')).toBeTruthy();

        select(canvas, [255, 0]);
        expect(button.disabled).toBe(false);
    });

    it('saves the selection and loads it back after the selection has changed', () => {
        const canvas = makeCanvas();
        render(<SavedChannelsSection canvas={canvas} />);
        select(canvas, [255, 0]);
        fireEvent.click(screen.getByText('channels.saved.saveSelection'));
        expect(getSavedChannels(canvas)).toHaveLength(1);

        select(canvas, [0, 255]);
        fireEvent.click(screen.getByText('channels.saved.load'));
        expect(Array.from(getDocumentSelectionMask(canvas)!.data)).toEqual([255, 0]);
    });

    it('adds to, subtracts from and intersects with the current selection', () => {
        const canvas = makeCanvas();
        render(<SavedChannelsSection canvas={canvas} />);
        select(canvas, [255, 0]);
        fireEvent.click(screen.getByText('channels.saved.saveSelection'));

        select(canvas, [0, 255]);
        fireEvent.click(screen.getByTitle('channels.saved.add'));
        expect(Array.from(getDocumentSelectionMask(canvas)!.data)).toEqual([255, 255]);

        fireEvent.click(screen.getByTitle('channels.saved.subtract'));
        expect(Array.from(getDocumentSelectionMask(canvas)!.data)).toEqual([0, 255]);

        fireEvent.click(screen.getByTitle('channels.saved.intersect'));
        expect(Array.from(getDocumentSelectionMask(canvas)!.data)).toEqual([0, 0]);
    });

    it('saves a layer’s alpha and its brightness as channels', () => {
        capture.mockReturnValue({ width: 2, height: 1, data: [255, 255, 255, 255, 0, 0, 0, 128] });
        const canvas = makeCanvas({ type: 'image' });
        render(<SavedChannelsSection canvas={canvas} />);

        fireEvent.click(screen.getByText('channels.saved.saveAlpha'));
        fireEvent.click(screen.getByText('channels.saved.saveLuma'));

        const [luma, alpha] = getSavedChannels(canvas);
        expect(Array.from(alpha.data)).toEqual([255, 128]);
        expect(Array.from(luma.data)).toEqual([255, 0]);
        expect(alpha.source).toBe('alpha');
    });

    it('asks for a layer instead of saving nothing', () => {
        const canvas = makeCanvas(null);
        render(<SavedChannelsSection canvas={canvas} />);
        fireEvent.click(screen.getByText('channels.saved.saveAlpha'));
        expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'channels.saved.needLayer' }));
        expect(getSavedChannels(canvas)).toHaveLength(0);
    });

    it('renames, reorders and deletes', () => {
        const canvas = makeCanvas();
        render(<SavedChannelsSection canvas={canvas} />);
        select(canvas, [255, 0]);
        fireEvent.click(screen.getByText('channels.saved.saveSelection'));
        fireEvent.click(screen.getByText('channels.saved.saveSelection'));
        const namesNow = () => getSavedChannels(canvas).map((channel) => channel.name);
        expect(namesNow()).toEqual(['channels.saved.selectionName 2', 'channels.saved.selectionName']);

        const input = screen.getAllByLabelText('channels.saved.rename')[0];
        fireEvent.change(input, { target: { value: 'Sky' } });
        fireEvent.blur(input);
        expect(namesNow()[0]).toBe('Sky');

        fireEvent.click(screen.getAllByTitle('channels.saved.moveDown')[0]);
        expect(namesNow()).toEqual(['channels.saved.selectionName', 'Sky']);

        fireEvent.click(screen.getAllByTitle('channels.saved.delete')[0]);
        expect(namesNow()).toEqual(['Sky']);
    });
});
