import { clampMenuToViewport, VIEWPORT_MENU_MARGIN } from '@/components/Editor/menuViewportClamp';

function panel(rect: { left: number; top: number; width: number; height: number }) {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({
        ...rect,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        x: rect.left,
        y: rect.top,
        toJSON: () => ({}),
    }) as DOMRect;
    return el;
}

describe('clampMenuToViewport', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
        Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true });
    });

    it('leaves a menu that fits alone', () => {
        const el = panel({ left: 100, top: 60, width: 220, height: 300 });
        clampMenuToViewport(el);
        expect(el.style.left).toBe('');
        expect(el.style.maxHeight).toBe('');
    });

    it('shifts a menu left when it runs past the right edge', () => {
        const el = panel({ left: 900, top: 60, width: 220, height: 300 });
        clampMenuToViewport(el);
        // right edge 1120 → needs 1120 - (1024 - 8) = 104px
        expect(el.style.left).toBe('-104px');
    });

    it('caps the height and scrolls when the menu runs past the bottom', () => {
        const el = panel({ left: 20, top: 60, width: 220, height: 680 });
        clampMenuToViewport(el);
        expect(el.style.maxHeight).toBe(`${700 - VIEWPORT_MENU_MARGIN - 60}px`);
        expect(el.style.overflowY).toBe('auto');
    });

    it('ignores a null ref', () => {
        expect(() => clampMenuToViewport(null)).not.toThrow();
    });
});
