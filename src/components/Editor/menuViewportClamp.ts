/**
 * Callback ref for header dropdown panels. A panel opens under its button at
 * `left: 0`; when the button sits near the right edge of the window the panel
 * used to run off-screen and its last items were unreachable, and on a short
 * window a long menu ran past the bottom edge. On mount, shift the panel left
 * by however much it overflows, and cap its height so the rest scrolls.
 */
export const VIEWPORT_MENU_MARGIN = 8;

export function clampMenuToViewport(element: HTMLElement | null) {
    if (!element || typeof window === 'undefined') return;
    const rect = element.getBoundingClientRect();
    const overflowX = rect.right - (window.innerWidth - VIEWPORT_MENU_MARGIN);
    if (overflowX > 0) {
        element.style.left = `${-Math.min(overflowX, Math.max(0, rect.left - VIEWPORT_MENU_MARGIN))}px`;
    }
    const room = window.innerHeight - VIEWPORT_MENU_MARGIN - rect.top;
    if (rect.height > room && room > 80) {
        element.style.maxHeight = `${Math.floor(room)}px`;
        element.style.overflowY = 'auto';
    }
}
