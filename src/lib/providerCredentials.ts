/**
 * Cleaning up API keys as users actually paste them: with a leading "Bearer ",
 * wrapped in quotes, or as the string form of a missing value.
 */

/** Strip a pasted `Bearer ` prefix and any quotes, leaving the bare credential. */
export const sanitizeHeaderValue = (value: string) => value.replace(/Bearer /gi, '').replace(/["']/g, '').trim();

/**
 * Whether a sanitised key is effectively absent. A key read from storage or
 * interpolated from an unset variable arrives as the literal text "undefined",
 * "null" or "NaN", which is non-empty and would otherwise be sent to the
 * provider as if it were a credential.
 */
export const isMissingSanitizedKey = (value: string) => {
    const normalized = value.trim().toLowerCase();
    return normalized.length === 0 || normalized === 'bearer' || normalized === 'undefined' || normalized === 'null' || normalized === 'nan';
};
