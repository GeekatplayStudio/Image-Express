import * as fabric from 'fabric';

/**
 * Bent ("curved") text: the arc a text layer is laid along, derived from its
 * bend settings and — critically — from how wide the text currently is.
 *
 * The arc used to be computed once, in the properties panel, at the moment the
 * bend slider moved. Nothing rebuilt it afterwards, so changing the wording,
 * font, weight or size left the glyphs on an arc sized for the old text: a
 * larger size piled the letters on top of each other. The geometry now lives
 * here and is re-derived inside fabric's own layout pass, so every route that
 * changes the text re-fits the arc without having to know bending exists.
 */

export interface TextCurveSettings {
    /** Bend, -100..100. Positive arcs upward, negative downward, 0 is flat. */
    strength: number;
    /** Slides the text along the arc, -100..100 (% of half the arc length). */
    center?: number;
    /** Arc sweep in degrees. Derived from the strength when not given. */
    span?: number;
}

export interface TextCurveGeometry {
    pathData: string;
    arcLength: number;
    radius: number;
    spanDegrees: number;
}

const clampSpan = (span: number) => Math.max(2, Math.min(359, Math.round(span)));

/** |strength| 25 ≈ 90°, 50 ≈ 180°, 100 ≈ 359°. */
export const spanForStrength = (strength: number): number =>
    clampSpan((Math.min(100, Math.abs(strength)) / 50) * 180);

/**
 * The arc for a run of text `textWidth` wide.
 *
 * The arc is made longer than the text by a margin that grows with both the
 * font size and the text width, so the first and last glyphs are not clipped
 * and a near-full circle does not wrap onto itself.
 */
export function buildTextCurveGeometry(
    textWidth: number,
    fontSize: number,
    settings: TextCurveSettings,
): TextCurveGeometry | null {
    const { strength } = settings;
    if (!strength) return null;

    const width = Math.max(textWidth || 0, 1);
    const spanDegrees = clampSpan(typeof settings.span === 'number' ? settings.span : spanForStrength(strength));
    const angle = (spanDegrees * Math.PI) / 180;
    const margin = Math.max(24, fontSize * 1.5, width * 0.25);
    const arcLength = width + margin;
    const radius = arcLength / angle;
    const halfAngle = angle / 2;

    // -1 bends upward (text rides the top of the circle), 1 downward.
    const direction = strength >= 0 ? -1 : 1;
    const largeArcFlag = spanDegrees > 180 ? 1 : 0;
    const sweepFlag = direction === -1 ? 1 : 0;

    const endX = radius * Math.sin(halfAngle);
    const endY = -direction * radius * (1 - Math.cos(halfAngle));

    return {
        pathData: `M ${-endX} ${endY} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}`,
        arcLength,
        radius,
        spanDegrees,
    };
}

/** Where along the arc the text starts, honouring alignment and the centre slider. */
export function curveStartOffset(
    arcLength: number,
    textWidth: number,
    textAlign: string | undefined,
    center = 0,
): number {
    const slack = Math.max(0, arcLength - textWidth);
    const align = (textAlign || 'left').toLowerCase();
    let base = 0;
    if (align.includes('left')) base = slack / 2;
    else if (align.includes('right')) base = -(slack / 2);
    return base + (center / 100) * (arcLength * 0.5);
}

type CurvedText = fabric.FabricText & {
    curveStrength?: number;
    curveCenter?: number;
    curveSpan?: number;
    textPathSourceId?: string;
    _splitText: () => unknown;
    _clearCache: () => void;
};

/** A layer whose arc this module owns: bent by the slider, not tied to a pen path. */
export const hasOwnedCurve = (text: fabric.FabricText): boolean => {
    const curved = text as CurvedText;
    return !!curved.curveStrength && !curved.textPathSourceId;
};

/**
 * Rebuild the layer's arc from its bend settings and current text metrics.
 * Sets `path` and `pathStartOffset` directly — going through `set()` would
 * re-enter layout — and leaves width/height to the caller's layout pass.
 */
export function refitTextCurve(text: fabric.FabricText): boolean {
    if (!hasOwnedCurve(text)) return false;
    const curved = text as CurvedText;

    // Measure against the text as it is now, not as it was last laid out.
    curved._splitText();
    curved._clearCache();
    const textWidth = Math.max(text.calcTextWidth() || 0, 1);
    const fontSize = typeof text.fontSize === 'number' ? text.fontSize : 16;

    const geometry = buildTextCurveGeometry(textWidth, fontSize, {
        strength: curved.curveStrength ?? 0,
        center: curved.curveCenter,
        span: curved.curveSpan,
    });
    if (!geometry) return false;

    const path = new fabric.Path(geometry.pathData);
    path.set({ visible: false });
    text.path = path;
    text.pathStartOffset = curveStartOffset(geometry.arcLength, textWidth, text.textAlign, curved.curveCenter ?? 0);
    text.setPathInfo();
    return true;
}

type LayoutPatchable = {
    prototype: { initDimensions: () => void; __curveLayoutPatched?: boolean };
};

/**
 * Make fabric's layout pass re-fit an owned arc before it measures the layer.
 *
 * `initDimensions` is the one place every text change funnels through — the
 * properties panel, the top options bar, the floating quick bar, typing in
 * place, undo, and loading a saved page — so hooking it covers them all.
 */
export function patchTextCurveLayout(Class: unknown): void {
    const target = Class as LayoutPatchable | undefined;
    if (!target?.prototype || target.prototype.__curveLayoutPatched) return;
    target.prototype.__curveLayoutPatched = true;
    const originalInitDimensions = target.prototype.initDimensions;
    target.prototype.initDimensions = function initDimensionsWithCurve(this: fabric.FabricText) {
        refitTextCurve(this);
        originalInitDimensions.call(this);
    };
}
