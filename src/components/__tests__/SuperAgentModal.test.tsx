import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SuperAgentModal from '../SuperAgentModal';

// jsdom has no 2D canvas context, so fabric.Textbox (which measures text) cannot
// be constructed in tests — stub it with a minimal shape-compatible class.
jest.mock('fabric', () => {
    const actual = jest.requireActual('fabric');
    class MockTextbox {
        [key: string]: unknown;
        constructor(text: string, options: Record<string, unknown>) {
            Object.assign(this, { text, type: 'textbox' }, options);
        }
        getBoundingRect() {
            return { left: 0, top: 0, width: 100, height: 40 };
        }
    }
    return { ...actual, Textbox: MockTextbox };
});

const createCanvasStub = () => {
    const objects: unknown[] = [];
    return {
        getObjects: jest.fn(() => objects),
        getWidth: jest.fn(() => 1080),
        getHeight: jest.fn(() => 1080),
        setDimensions: jest.fn(),
        add: jest.fn((obj: unknown) => objects.push(obj)),
        remove: jest.fn(),
        requestRenderAll: jest.fn(),
        backgroundColor: '',
    };
};

describe('SuperAgentModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        global.fetch = jest.fn(async () => {
            throw new Error('network unavailable');
        }) as unknown as typeof fetch;
    });

    it('renders default agents in the selector', () => {
        const canvas = createCanvasStub();
        render(<SuperAgentModal isOpen canvas={canvas as unknown as never} onClose={jest.fn()} />);

        expect(screen.getByText('Super Agent & Sub-Agents')).toBeInTheDocument();
        expect(screen.getByText(/Super Agent Alpha/)).toBeInTheDocument();
        expect(screen.getByText(/Social Banner Agent/)).toBeInTheDocument();
    });

    it('requires a prompt before generating a plan', async () => {
        const canvas = createCanvasStub();
        render(<SuperAgentModal isOpen canvas={canvas as unknown as never} onClose={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /Generate Plan/ }));
        await waitFor(() => {
            expect(screen.getByText(/Enter a prompt describing/)).toBeInTheDocument();
        });
    });

    it('generates a multi-step plan (local fallback) and executes it on the canvas', async () => {
        const canvas = createCanvasStub();
        render(<SuperAgentModal isOpen canvas={canvas as unknown as never} onClose={jest.fn()} />);

        fireEvent.change(screen.getByPlaceholderText(/coffee shop discount promo/), {
            target: { value: 'Design a product launch banner' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Generate Plan/ }));

        await waitFor(() => {
            expect(screen.getByText(/Step Execution Plan \(6 steps\)/)).toBeInTheDocument();
        });
        expect(screen.getByText(/Set canvas artboard to 1080x1080px/)).toBeInTheDocument();
        expect(screen.getByText(/compliance audit/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Execute On Canvas/ }));

        await waitFor(
            () => {
                expect(screen.getByRole('button', { name: /Completed/ })).toBeInTheDocument();
            },
            { timeout: 10000 }
        );

        expect(canvas.setDimensions).toHaveBeenCalledWith({ width: 1080, height: 1080 });
        // Accent shape + two text layers were added
        expect(canvas.add).toHaveBeenCalledTimes(3);
        expect(canvas.backgroundColor).not.toBe('');
    }, 15000);

    it('creates and selects a custom sub-agent', async () => {
        const canvas = createCanvasStub();
        render(<SuperAgentModal isOpen canvas={canvas as unknown as never} onClose={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /Create Agent/ }));
        fireEvent.change(screen.getByPlaceholderText('e.g. Minimalist Poster Agent'), {
            target: { value: 'Poster Bot' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save Sub-Agent' }));

        await waitFor(() => {
            expect(screen.getByText(/Poster Bot/)).toBeInTheDocument();
        });

        const stored = JSON.parse(localStorage.getItem('image-express-custom-agents') || '[]') as Array<{ name: string }>;
        expect(stored.some((a) => a.name === 'Poster Bot')).toBe(true);
    });
});
