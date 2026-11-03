import JSZip from 'jszip';
import * as fabric from 'fabric';

import type { CampaignVariant } from '@/components/Editor/mediaOverlayTypes';
import { dataUrlToBlob } from '@/components/Editor/editorExportUtils';

/**
 * Deterministic export of campaign variants.
 *
 * A variant is a snapshot, not the live page, so it is rendered offscreen
 * from its own JSON and cropped to its own bounds: exporting the same variant
 * twice yields the same pixels whatever the user has done to the canvas since.
 * File names come from the page and variant names only — no timestamps — so a
 * re-export overwrites rather than accumulates.
 */

export type VariantRenderer = (variant: CampaignVariant) => Promise<string>;

const slug = (value: string) => value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';

/** `<page>-<variant>.<ext>`; a duplicate name within one export gets `-2`, `-3`, … */
export function variantFileName(designName: string, variant: CampaignVariant, taken = new Set<string>()): string {
    const ext = variant.exportProfile.format === 'jpg' ? 'jpg' : 'png';
    const base = `${slug(designName)}-${slug(variant.name)}`;
    let name = `${base}.${ext}`;
    for (let n = 2; taken.has(name); n += 1) name = `${base}-${n}.${ext}`;
    taken.add(name);
    return name;
}

export const zipFileName = (designName: string) => `${slug(designName)}-variants.zip`;

/** Render a snapshot to a data URL cropped to the variant's frame bounds. */
export const renderVariantOffscreen: VariantRenderer = async (variant) => {
    const width = Math.max(1, Math.round(variant.meta?.canvasWidth ?? variant.bounds.left + variant.bounds.width));
    const height = Math.max(1, Math.round(variant.meta?.canvasHeight ?? variant.bounds.top + variant.bounds.height));
    const canvas = new fabric.StaticCanvas(undefined, { width, height, renderOnAddRemove: false });
    try {
        await canvas.loadFromJSON(variant.snapshot as unknown as Record<string, unknown>);
        canvas.renderAll();
        const format = variant.exportProfile.format === 'jpg' ? 'jpeg' : 'png';
        return canvas.toDataURL({
            format,
            quality: 1,
            multiplier: 1,
            left: variant.bounds.left,
            top: variant.bounds.top,
            width: variant.bounds.width,
            height: variant.bounds.height,
        });
    } finally {
        canvas.dispose();
    }
};

export async function exportVariantBlob(variant: CampaignVariant, render: VariantRenderer = renderVariantOffscreen): Promise<Blob> {
    return dataUrlToBlob(await render(variant));
}

export async function exportVariantsZip(
    designName: string,
    variants: readonly CampaignVariant[],
    render: VariantRenderer = renderVariantOffscreen,
): Promise<{ blob: Blob; fileName: string; entries: string[] }> {
    const zip = new JSZip();
    const taken = new Set<string>();
    const entries: string[] = [];
    // Sequential on purpose: each render holds an offscreen canvas and a
    // decoded copy of every image in the snapshot.
    for (const variant of variants) {
        const name = variantFileName(designName, variant, taken);
        zip.file(name, await exportVariantBlob(variant, render));
        entries.push(name);
    }
    return { blob: await zip.generateAsync({ type: 'blob' }), fileName: zipFileName(designName), entries };
}
