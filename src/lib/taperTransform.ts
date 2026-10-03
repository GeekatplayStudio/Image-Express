/**
 * "Fake 3D depth" (taper): a skew plus a horizontal squeeze layered on top of
 * whatever transform the layer already has.
 *
 * The taper used to be applied against a *stored* copy of the layer's scale and
 * skew, captured the first time the slider moved. Anything that changed the
 * layer afterwards without going through the panel — resizing it by its
 * handles, most obviously — left that copy stale, and the next slider move
 * snapped the layer back to the old size.
 *
 * Nothing is stored here. The taper's contribution is a pure function of its
 * two settings, so the un-tapered transform can always be recovered from the
 * layer as it is now: take the old contribution off, put the new one on.
 */

export interface TaperSettings {
    /** Depth intensity, -100..100. 0 means no taper. */
    skewZ: number;
    /** Lean direction and amount, -100..100. 0 follows the sign of `skewZ`. */
    taperDirection: number;
}

export interface TaperableTransform {
    scaleX: number;
    scaleY: number;
    skewX: number;
    skewY: number;
}

export interface TaperContribution {
    skewX: number;
    skewY: number;
    /** Multiplier on scaleX; 1 means untouched. */
    scaleXFactor: number;
}

const MAX_TAPER_SKEW_X = 35;
const MAX_TAPER_SKEW_Y = 6;
const MAX_TAPER_SQUEEZE = 0.2;

const NO_TAPER: TaperContribution = { skewX: 0, skewY: 0, scaleXFactor: 1 };

export function taperContribution(settings: TaperSettings): TaperContribution {
    const skewZ = Number(settings.skewZ) || 0;
    const intensity = Math.min(Math.abs(skewZ), 100) / 100;
    if (intensity === 0) return NO_TAPER;

    const direction = Math.max(-100, Math.min(100, Number(settings.taperDirection) || 0)) / 100;
    const sign = direction === 0 ? (skewZ >= 0 ? 1 : -1) : Math.sign(direction);
    const magnitude = direction === 0 ? 1 : Math.abs(direction);

    return {
        skewX: sign * magnitude * intensity * MAX_TAPER_SKEW_X,
        skewY: sign * intensity * MAX_TAPER_SKEW_Y,
        scaleXFactor: 1 - intensity * MAX_TAPER_SQUEEZE,
    };
}

/** The transform the layer would have with no taper applied. */
export function removeTaper(current: TaperableTransform, applied: TaperSettings): TaperableTransform {
    const contribution = taperContribution(applied);
    return {
        scaleX: current.scaleX / contribution.scaleXFactor,
        scaleY: current.scaleY,
        skewX: current.skewX - contribution.skewX,
        skewY: current.skewY - contribution.skewY,
    };
}

export function addTaper(base: TaperableTransform, settings: TaperSettings): TaperableTransform {
    const contribution = taperContribution(settings);
    return {
        scaleX: base.scaleX * contribution.scaleXFactor,
        scaleY: base.scaleY,
        skewX: base.skewX + contribution.skewX,
        skewY: base.skewY + contribution.skewY,
    };
}

/** Swap one taper for another, preserving everything else about the transform. */
export function retaper(
    current: TaperableTransform,
    applied: TaperSettings,
    next: TaperSettings,
): TaperableTransform {
    return addTaper(removeTaper(current, applied), next);
}
