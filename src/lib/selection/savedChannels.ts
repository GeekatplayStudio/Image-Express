import type * as fabric from 'fabric';
import {
    createDocumentSelectionMask,
    isDocumentSelectionEmpty,
    type DocumentSelectionMask,
} from '@/lib/selection/documentSelectionMask';
import {
    commitDocumentSelection,
    ensureDocumentSelectionMask,
    getDocumentSelectionMask,
} from '@/lib/selection/documentSelectionStore';

/**
 * Saved channels: a selection kept under a name so it can be brought back.
 *
 * A channel is a greyscale mask, the same thing the content selection already
 * is. It can be saved from the current selection, or built from a layer — its
 * transparency (alpha) or its brightness (luma). Loading one writes it into the
 * document selection mask, so every tool that respects a selection works with
 * it unchanged.
 *
 * Channels live on the canvas for the editing session. They are not written
 * into the saved page yet; `encodeChannelData` / `decodeChannelData` exist so
 * that can be added without changing the format in memory.
 */

export type SavedChannelSource = 'selection' | 'alpha' | 'luma';

/** How a loaded channel combines with the selection already there. */
export type ChannelLoadMode = 'replace' | 'add' | 'subtract' | 'intersect';

export interface SavedChannel {
    id: string;
    name: string;
    source: SavedChannelSource;
    left: number;
    top: number;
    width: number;
    height: number;
    /** One byte per pixel, 0 (unselected) to 255 (fully selected). */
    data: Uint8ClampedArray;
}

type CanvasWithChannels = fabric.Canvas & {
    __ieSavedChannels?: SavedChannel[];
};

type Listener = () => void;
const listeners = new WeakMap<object, Set<Listener>>();

const notify = (canvas: fabric.Canvas) => listeners.get(canvas as object)?.forEach((listener) => listener());

export function subscribeSavedChannels(canvas: fabric.Canvas, listener: Listener): () => void {
    const key = canvas as object;
    const set = listeners.get(key) ?? new Set<Listener>();
    listeners.set(key, set);
    set.add(listener);
    return () => { set.delete(listener); };
}

/** The stack, top first. Returns the same array until something changes. */
export function getSavedChannels(canvas: fabric.Canvas | null): readonly SavedChannel[] {
    if (!canvas) return EMPTY;
    return (canvas as CanvasWithChannels).__ieSavedChannels ?? EMPTY;
}
const EMPTY: readonly SavedChannel[] = Object.freeze([]);

const setChannels = (canvas: fabric.Canvas, next: SavedChannel[]) => {
    (canvas as CanvasWithChannels).__ieSavedChannels = next;
    notify(canvas);
};

let sequence = 0;
const nextId = () => `channel-${Date.now().toString(36)}-${(sequence += 1).toString(36)}`;

/** `Name`, `Name 2`, `Name 3`… — never two channels a user cannot tell apart. */
export function uniqueChannelName(base: string, existing: readonly SavedChannel[]): string {
    const wanted = base.trim() || 'Channel';
    const taken = new Set(existing.map((channel) => channel.name.toLowerCase()));
    if (!taken.has(wanted.toLowerCase())) return wanted;
    for (let index = 2; ; index += 1) {
        const candidate = `${wanted} ${index}`;
        if (!taken.has(candidate.toLowerCase())) return candidate;
    }
}

/** A channel holding a copy of a selection mask. */
export function channelFromMask(mask: DocumentSelectionMask, name: string, source: SavedChannelSource = 'selection'): SavedChannel {
    return {
        id: nextId(),
        name,
        source,
        left: mask.left,
        top: mask.top,
        width: mask.width,
        height: mask.height,
        // A copy: the live mask is mutated in place by every selection tool.
        data: new Uint8ClampedArray(mask.data),
    };
}

/** Rec. 709 luma, weighted by alpha so transparent pixels are unselected. */
const lumaOf = (r: number, g: number, b: number, a: number) => Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) * (a / 255));

/**
 * A channel built from RGBA pixels: `alpha` selects what is opaque, `luma`
 * selects what is bright.
 */
export function channelFromPixels(
    pixels: { width: number; height: number; data: ArrayLike<number> },
    origin: { left: number; top: number },
    kind: 'alpha' | 'luma',
    name: string,
): SavedChannel {
    const data = new Uint8ClampedArray(pixels.width * pixels.height);
    for (let index = 0; index < data.length; index += 1) {
        const offset = index * 4;
        const alpha = pixels.data[offset + 3];
        data[index] = kind === 'alpha'
            ? alpha
            : lumaOf(pixels.data[offset], pixels.data[offset + 1], pixels.data[offset + 2], alpha);
    }
    return { id: nextId(), name, source: kind, left: origin.left, top: origin.top, width: pixels.width, height: pixels.height, data };
}

/**
 * Combine a channel into a selection mask, in scene coordinates.
 *
 * The two need not cover the same area — a channel saved before the page was
 * resized still lands where it was made. Pixels the channel does not cover are
 * treated as unselected.
 */
export function applyChannelToMask(mask: DocumentSelectionMask, channel: SavedChannel, mode: ChannelLoadMode): void {
    const dx = Math.round(mask.left - channel.left);
    const dy = Math.round(mask.top - channel.top);
    for (let y = 0; y < mask.height; y += 1) {
        const cy = y + dy;
        const rowInside = cy >= 0 && cy < channel.height;
        for (let x = 0; x < mask.width; x += 1) {
            const cx = x + dx;
            const value = rowInside && cx >= 0 && cx < channel.width ? channel.data[cy * channel.width + cx] : 0;
            const index = y * mask.width + x;
            const current = mask.data[index];
            if (mode === 'replace') mask.data[index] = value;
            else if (mode === 'add') mask.data[index] = Math.max(current, value);
            else if (mode === 'subtract') mask.data[index] = Math.max(0, current - value);
            else mask.data[index] = Math.min(current, value);
        }
    }
}

/** Keep the current selection as a named channel. Null when nothing is selected. */
export function saveSelectionAsChannel(canvas: fabric.Canvas, name: string): SavedChannel | null {
    const mask = getDocumentSelectionMask(canvas);
    if (!mask || isDocumentSelectionEmpty(mask)) return null;
    return addSavedChannel(canvas, channelFromMask(mask, name));
}

/** Add a channel to the top of the stack, giving it a name nothing else has. */
export function addSavedChannel(canvas: fabric.Canvas, channel: SavedChannel): SavedChannel {
    const existing = getSavedChannels(canvas);
    const named = { ...channel, name: uniqueChannelName(channel.name, existing) };
    setChannels(canvas, [named, ...existing]);
    return named;
}

/** Make a saved channel the active selection. False when the id is unknown. */
export function loadChannelAsSelection(canvas: fabric.Canvas, channelId: string, mode: ChannelLoadMode = 'replace'): boolean {
    const channel = getSavedChannels(canvas).find((entry) => entry.id === channelId);
    if (!channel) return false;
    const mask = ensureDocumentSelectionMask(canvas);
    applyChannelToMask(mask, channel, mode);
    // No layer target: a loaded channel is a document selection, not tied to
    // whichever layer happened to be active when it was saved.
    commitDocumentSelection(canvas, mask, null);
    canvas.requestRenderAll();
    return true;
}

export function renameSavedChannel(canvas: fabric.Canvas, channelId: string, name: string): void {
    const existing = getSavedChannels(canvas);
    const others = existing.filter((channel) => channel.id !== channelId);
    const trimmed = name.trim();
    if (!trimmed || others.length === existing.length) return;
    setChannels(canvas, existing.map((channel) => (
        channel.id === channelId ? { ...channel, name: uniqueChannelName(trimmed, others) } : channel
    )));
}

export function deleteSavedChannel(canvas: fabric.Canvas, channelId: string): void {
    const existing = getSavedChannels(canvas);
    const next = existing.filter((channel) => channel.id !== channelId);
    if (next.length !== existing.length) setChannels(canvas, next);
}

/** Move a channel one place up (-1) or down (+1) in the stack. */
export function moveSavedChannel(canvas: fabric.Canvas, channelId: string, direction: -1 | 1): void {
    const existing = [...getSavedChannels(canvas)];
    const from = existing.findIndex((channel) => channel.id === channelId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= existing.length) return;
    [existing[from], existing[to]] = [existing[to], existing[from]];
    setChannels(canvas, existing);
}

/** How much of the area the channel selects, 0–100. For the list's summary. */
export function channelCoveragePercent(channel: SavedChannel): number {
    if (channel.data.length === 0) return 0;
    let total = 0;
    for (let index = 0; index < channel.data.length; index += 1) total += channel.data[index];
    return Math.round((total / (channel.data.length * 255)) * 100);
}

/**
 * Run-length encode mask bytes as `[value, runLength, value, runLength, …]`.
 * Masks are mostly long runs of 0 and 255, so this is what makes storing one
 * with a page practical: a 1920×1080 mask is 2 MB raw.
 */
export function encodeChannelData(data: Uint8ClampedArray): number[] {
    const runs: number[] = [];
    for (let index = 0; index < data.length;) {
        const value = data[index];
        let length = 1;
        while (index + length < data.length && data[index + length] === value) length += 1;
        runs.push(value, length);
        index += length;
    }
    return runs;
}

/** Inverse of `encodeChannelData`. Refuses input that does not fit `size`. */
export function decodeChannelData(runs: readonly number[], size: number): Uint8ClampedArray | null {
    if (runs.length % 2 !== 0 || !Number.isInteger(size) || size < 0) return null;
    const data = new Uint8ClampedArray(size);
    let offset = 0;
    for (let index = 0; index < runs.length; index += 2) {
        const value = runs[index];
        const length = runs[index + 1];
        if (!Number.isInteger(length) || length <= 0 || offset + length > size) return null;
        data.fill(value, offset, offset + length);
        offset += length;
    }
    return offset === size ? data : null;
}

/** An empty mask over the same area as a channel; used by callers and tests. */
export const blankMaskFor = (channel: SavedChannel): DocumentSelectionMask => (
    createDocumentSelectionMask({ left: channel.left, top: channel.top, width: channel.width, height: channel.height })
);
