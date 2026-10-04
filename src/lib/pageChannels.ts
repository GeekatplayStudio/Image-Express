import type * as fabric from 'fabric';

import { loadCanvasJson } from '@/lib/fabric-utils';
import { restoreSavedChannels, serializeSavedChannels } from '@/lib/selection/savedChannels';

/**
 * Saved channels as part of a page.
 *
 * Channels belong to the page they were made on, so they are written into the
 * page when it is saved and replaced when a page is opened. Kept out of
 * `fabric-utils` because the selection modules import that file; pulling them
 * in from there closes an import cycle.
 */

/** A serialized page with its saved channels attached, when it has any. */
export const withSavedChannels = <T extends object>(canvas: fabric.Canvas, json: T): T => {
    const channels = serializeSavedChannels(canvas);
    return channels.length > 0 ? { ...json, savedChannels: channels } : json;
};

/**
 * Open a saved page: its objects, artboard and channels.
 *
 * Unlike an undo snapshot — which goes through `loadCanvasJson` directly, has
 * no channels, and must leave the ones in memory alone — opening a page always
 * replaces the channel stack, with nothing for a page saved before channels
 * were stored.
 */
export const loadPageJson = async (
    canvas: fabric.Canvas,
    json: string | Record<string, unknown>,
): Promise<void> => {
    const parsed = (typeof json === 'string' ? JSON.parse(json) : json) as Record<string, unknown>;
    restoreSavedChannels(canvas, parsed.savedChannels);
    await loadCanvasJson(canvas, parsed);
};
