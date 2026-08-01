import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BrandManagerModal from '../BrandManagerModal';

type MockLayer = {
    type: string;
    fontFamily?: string;
    fontSize?: number;
    fill?: string;
    name?: string;
    id?: string;
    getBoundingRect: jest.Mock;
    get: jest.Mock;
};

const createLayerStub = (overrides?: Partial<MockLayer>): MockLayer => {
    const layer: MockLayer = {
        type: 'textbox',
        name: 'Headline',
        fontFamily: 'Comic Sans MS',
        fontSize: 32,
        fill: '#ff00ff',
        getBoundingRect: jest.fn(() => ({ left: 40, top: 40, width: 300, height: 60 })),
        get: jest.fn((key: string) => (layer as unknown as Record<string, unknown>)[key]),
        ...overrides,
    };
    return layer;
};

const createCanvasStub = (objects: MockLayer[]) => {
    const canvasObjects: unknown[] = [...objects];
    return {
        getObjects: jest.fn(() => canvasObjects),
        getWidth: jest.fn(() => 800),
        getHeight: jest.fn(() => 600),
        add: jest.fn((obj: unknown) => canvasObjects.push(obj)),
        remove: jest.fn((obj: unknown) => {
            const i = canvasObjects.indexOf(obj);
            if (i >= 0) canvasObjects.splice(i, 1);
        }),
        requestRenderAll: jest.fn(),
        toDataURL: jest.fn(() => 'data:image/png;base64,AAAA'),
    };
};

describe('BrandManagerModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        global.fetch = jest.fn(async () => {
            throw new Error('network unavailable');
        }) as unknown as typeof fetch;
    });

    it('renders both tabs and the default brand kit', () => {
        const canvas = createCanvasStub([]);
        render(<BrandManagerModal isOpen canvas={canvas as unknown as never} onClose={jest.fn()} />);

        expect(screen.getByText('AI Brand Manager')).toBeInTheDocument();
        expect(screen.getByText('Compliance Auditor')).toBeInTheDocument();
        expect(screen.getByText('Brand Kit Setup')).toBeInTheDocument();
        expect(screen.getAllByText(/Image Express Official/).length).toBeGreaterThan(0);
    });

    it('runs a compliance audit and falls back to the local heuristic engine when the API is unreachable', async () => {
        const canvas = createCanvasStub([createLayerStub()]);
        render(<BrandManagerModal isOpen canvas={canvas as unknown as never} onClose={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /Run Compliance Check/ }));

        await waitFor(() => {
            expect(screen.getByText('Compliance Rating')).toBeInTheDocument();
        });

        // Off-brand font + off-palette color should be flagged with violations
        expect(screen.getByText(/Detected Issues/)).toBeInTheDocument();
        expect(screen.getByText(/Comic Sans MS/)).toBeInTheDocument();
        expect(screen.getByText(/#ff00ff/)).toBeInTheDocument();
    });

    it('highlights a violation bounding box on the canvas as an overlay rect', async () => {
        const canvas = createCanvasStub([createLayerStub()]);
        render(<BrandManagerModal isOpen canvas={canvas as unknown as never} onClose={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /Run Compliance Check/ }));
        await waitFor(() => {
            expect(screen.getAllByRole('button', { name: /Highlight/ }).length).toBeGreaterThan(0);
        });

        fireEvent.click(screen.getAllByRole('button', { name: /Highlight/ })[0]);

        expect(canvas.add).toHaveBeenCalled();
        const addedOverlay = canvas.add.mock.calls[canvas.add.mock.calls.length - 1][0] as {
            get: (key: string) => unknown;
        };
        expect(String(addedOverlay.get('id'))).toMatch(/^__brand_audit_overlay__/);
        expect(canvas.requestRenderAll).toHaveBeenCalled();
    });

    it('saves brand kit setup form values into the active profile', async () => {
        const canvas = createCanvasStub([]);
        render(<BrandManagerModal isOpen canvas={canvas as unknown as never} onClose={jest.fn()} />);

        fireEvent.click(screen.getByText('Brand Kit Setup'));
        fireEvent.change(screen.getByPlaceholderText('e.g. Acme Corp Guidelines'), {
            target: { value: 'Acme Corp Guidelines' },
        });
        fireEvent.change(screen.getByPlaceholderText('e.g. Inter, Roboto'), {
            target: { value: 'Outfit' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save Brand Kit Profile' }));

        await waitFor(() => {
            expect(screen.getAllByText(/Acme Corp Guidelines/).length).toBeGreaterThan(0);
        });

        const stored = JSON.parse(localStorage.getItem('image-express-brand-profiles') || '[]') as Array<{
            name: string;
            typography: { primaryFont: string };
        }>;
        const saved = stored.find((p) => p.name === 'Acme Corp Guidelines');
        expect(saved).toBeDefined();
        expect(saved?.typography.primaryFont).toBe('Outfit');
    });

    it('uploads an approved asset and persists it with the brand kit', async () => {
        const canvas = createCanvasStub([]);
        render(<BrandManagerModal isOpen canvas={canvas as unknown as never} onClose={jest.fn()} />);

        fireEvent.click(screen.getByText('Brand Kit Setup'));

        const file = new File(['fake-png-bytes'], 'brand-star.png', { type: 'image/png' });
        fireEvent.change(screen.getByLabelText('Upload approved asset'), {
            target: { files: [file] },
        });

        await waitFor(() => {
            expect(screen.getByText('brand-star')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Save Brand Kit Profile' }));

        await waitFor(() => {
            const stored = JSON.parse(localStorage.getItem('image-express-brand-profiles') || '[]') as Array<{
                assets: Array<{ name: string; type: string }>;
            }>;
            expect(stored.some((p) => p.assets?.some((a) => a.name === 'brand-star' && a.type === 'shape'))).toBe(true);
        });
    });
});
