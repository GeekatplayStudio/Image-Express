/**
 * Fading everything that sits outside the artboard.
 *
 * With the canvas border shown, the page edge is only a thin line — content
 * spilling past it still renders at full strength, so it is genuinely hard to
 * tell what will be in the exported design and what will be cropped away.
 *
 * The fix is a scrim: the area outside the page is washed toward the workspace
 * colour, so off-page content recedes instead of competing. Washing toward the
 * background rather than darkening is what makes it read as "outside the page"
 * on a light workspace as well as a dark one.
 *
 * Geometry and colour live here, apart from the render hook, because both are
 * easy to get subtly wrong and neither needs a canvas to verify.
 */

export type ArtboardBox = { left: number; top: number; width: number; height: number };

/** Fabric's viewport transform: [scaleX, skewY, skewX, scaleY, panX, panY]. */
export type ViewportTransform = number[];

export type ScreenRect = { x: number; y: number; width: number; height: number };

/**
 * Where the artboard sits on screen.
 *
 * Computed in screen space rather than drawing the scrim in world space,
 * because "everywhere except the page" in world coordinates has no natural
 * bounds — it would mean painting an arbitrarily huge rectangle and hoping it
 * covered the viewport at every zoom level.
 */
export function getArtboardScreenRect(
    artboard: ArtboardBox,
    vpt: ViewportTransform,
): ScreenRect {
    const scaleX = vpt[0] ?? 1;
    const scaleY = vpt[3] ?? 1;
    const panX = vpt[4] ?? 0;
    const panY = vpt[5] ?? 0;

    return {
        x: artboard.left * scaleX + panX,
        y: artboard.top * scaleY + panY,
        width: artboard.width * scaleX,
        height: artboard.height * scaleY,
    };
}

const HEX_SHORT = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_LONG = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const RGB_FUNC = /^rgba?\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)/i;

/**
 * The workspace colour at partial opacity, so off-page content blends toward
 * the background.
 *
 * Falls back to a neutral grey wash for a colour it cannot parse — a scrim that
 * silently vanishes would leave the user with no page boundary at all, which is
 * the problem this exists to solve.
 */
export function toWashColor(color: string | undefined, alpha: number): string {
    const safeAlpha = Math.min(1, Math.max(0, alpha));
    const value = (color || '').trim();

    const short = HEX_SHORT.exec(value);
    if (short) {
        const [r, g, b] = short.slice(1).map((part) => parseInt(part + part, 16));
        return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
    }

    const long = HEX_LONG.exec(value);
    if (long) {
        const [r, g, b] = long.slice(1).map((part) => parseInt(part, 16));
        return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
    }

    const rgb = RGB_FUNC.exec(value);
    if (rgb) {
        const [r, g, b] = rgb.slice(1).map((part) => Math.round(Number(part)));
        return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
    }

    return `rgba(24, 24, 24, ${safeAlpha})`;
}

/**
 * Paint everything except the artboard.
 *
 * Uses a single even-odd path — the viewport with the page punched out of it —
 * rather than four rectangles around the edges. Four rectangles have to be
 * clamped by hand once the page is partly or wholly off screen, and the seams
 * between them show as hairlines at fractional zoom levels.
 */
export function paintOutsideArtboard(
    ctx: CanvasRenderingContext2D,
    viewport: { width: number; height: number },
    page: ScreenRect,
    wash: string,
): void {
    ctx.save();
    ctx.fillStyle = wash;
    ctx.beginPath();
    ctx.rect(0, 0, viewport.width, viewport.height);
    ctx.rect(page.x, page.y, page.width, page.height);
    ctx.fill('evenodd');
    ctx.restore();
}
