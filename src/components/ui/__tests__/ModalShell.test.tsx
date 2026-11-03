import { act, fireEvent, render, screen } from '@testing-library/react';

import ModalShell from '@/components/ui/ModalShell';

jest.mock('@/providers/I18nProvider', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

const setViewport = (width: number, height: number) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
};

const dialog = () => screen.getByRole('dialog');
const windowEl = () => dialog().parentElement as HTMLElement;

describe('ModalShell', () => {
    beforeEach(() => {
        window.localStorage.clear();
        setViewport(1280, 800);
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 1; });
    });
    afterEach(() => jest.restoreAllMocks());

    it('is a labelled dialog that takes focus on open and gives it back on close', () => {
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();

        const { rerender } = render(<ModalShell isOpen onClose={jest.fn()} title="Settings">body</ModalShell>);
        expect(dialog()).toHaveAttribute('aria-modal', 'true');
        expect(dialog()).toHaveAccessibleName('Settings');
        expect(document.activeElement).toBe(dialog());

        rerender(<ModalShell isOpen={false} onClose={jest.fn()} title="Settings">body</ModalShell>);
        expect(document.activeElement).toBe(opener);
        opener.remove();
    });

    it('closes only the topmost window on Escape, and not at all when the caller owns the key', () => {
        const closeLower = jest.fn();
        const closeUpper = jest.fn();
        render(
            <>
                <ModalShell isOpen onClose={closeLower} title="Lower">a</ModalShell>
                <ModalShell isOpen onClose={closeUpper} title="Upper">b</ModalShell>
            </>,
        );
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(closeUpper).toHaveBeenCalledTimes(1);
        expect(closeLower).not.toHaveBeenCalled();

        const owned = jest.fn();
        render(<ModalShell isOpen onClose={owned} title="Owned" closeOnEscape={false}>c</ModalShell>);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(owned).not.toHaveBeenCalled();
    });

    it('opens centred at its preferred size, shrunk to the viewport', () => {
        render(<ModalShell isOpen onClose={jest.fn()} title="T" initialWidth={2000} initialHeight={400}>x</ModalShell>);
        // 1280 wide minus 16 px padding each side.
        expect(windowEl().style.width).toBe('1248px');
        expect(windowEl().style.height).toBe('400px');
        expect(windowEl().style.top).toBe('200px');
    });

    it('remembers where the user left a window under its persist key, clamped to the viewport', () => {
        window.localStorage.setItem('image-express-modal-frame:help', JSON.stringify({
            position: { x: 5000, y: 300 }, size: { width: 500, height: 300 },
        }));
        render(<ModalShell isOpen onClose={jest.fn()} title="T" persistKey="help">x</ModalShell>);
        expect(windowEl().style.width).toBe('500px');
        expect(windowEl().style.top).toBe('300px');
        // x was off-screen; it is pulled back inside the padding.
        expect(windowEl().style.left).toBe(`${1280 - 500 - 16}px`);

        // A drag that ends writes the new frame back.
        const handle = dialog().querySelector('.draggable-handle') as HTMLElement;
        fireEvent.mouseDown(handle, { clientX: 100, clientY: 100 });
        fireEvent.mouseMove(window, { clientX: 60, clientY: 80 });
        act(() => { fireEvent.mouseUp(window); });
        const stored = JSON.parse(window.localStorage.getItem('image-express-modal-frame:help')!);
        expect(stored.position).toEqual({ x: 1280 - 500 - 16 - 40, y: 280 });
        expect(stored.size).toEqual({ width: 500, height: 300 });
    });

    it('ignores a corrupt remembered frame and a missing one alike', () => {
        window.localStorage.setItem('image-express-modal-frame:k', '{"position":{"x":"no"}}');
        render(<ModalShell isOpen onClose={jest.fn()} title="T" persistKey="k" initialWidth={400} initialHeight={200}>x</ModalShell>);
        expect(windowEl().style.width).toBe('400px');
        expect(windowEl().style.left).toBe('440px');
    });

    it('becomes a full-screen sheet on a narrow viewport, with no drag or resize', () => {
        setViewport(390, 844);
        render(<ModalShell isOpen onClose={jest.fn()} title="T" persistKey="sheet">x</ModalShell>);
        expect(dialog()).toHaveAttribute('data-sheet', 'true');
        expect(windowEl().style.width).toBe('390px');
        expect(windowEl().style.height).toBe('844px');
        expect(windowEl().style.left).toBe('0px');
        expect(windowEl().querySelector('.cursor-se-resize')).toBeNull();

        const handle = dialog().querySelector('.draggable-handle') as HTMLElement;
        fireEvent.mouseDown(handle, { clientX: 10, clientY: 10 });
        fireEvent.mouseMove(window, { clientX: 200, clientY: 200 });
        act(() => { fireEvent.mouseUp(window); });
        expect(windowEl().style.left).toBe('0px');
        expect(window.localStorage.getItem('image-express-modal-frame:sheet')).toBeNull();
    });
});
