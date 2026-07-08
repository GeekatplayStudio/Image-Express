import { expect, test, type Download } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';

function getPngDimensions(buffer: Buffer) {
    if (buffer.length < 24) {
        throw new Error('PNG buffer too small');
    }

    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
    };
}

async function readDownloadBuffer(download: Download) {
    const filePath = await download.path();
    expect(filePath).not.toBeNull();
    return readFile(filePath as string);
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        window.localStorage.clear();
    });
    await page.goto('/media-overlay-verification');
    await expect(page.getByTestId('media-overlay-harness-status')).toHaveText('Harness ready');
    await expect(page.getByTestId('media-overlay-frame-count')).toHaveText('Frames: 2');
    await expect(page.getByTestId('media-overlay-active-preset')).toContainText('Instagram 1:1');
  });

test('exports a media-overlay batch ZIP with both seeded frames', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Batch ZIP' }).click({ force: true });

    const download = await downloadPromise;
    const buffer = await readDownloadBuffer(download);
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.keys(zip.files).filter((name) => name.endsWith('.png')).sort();

    expect(download.suggestedFilename()).toMatch(/^media-overlay-.*-all-frames\.zip$/);
    expect(entries).toHaveLength(2);
    expect(entries.some((name) => /^harness-design-instagram-1-1-\d{8}-frame-01\.png$/.test(name))).toBe(true);
    expect(entries.some((name) => /^harness-design-facebook-post-1200x630-\d{8}-frame-02\.png$/.test(name))).toBe(true);

    const firstFrame = await zip.files[entries[0]].async('nodebuffer');
    const secondFrame = await zip.files[entries[1]].async('nodebuffer');
    expect(getPngDimensions(firstFrame).width).toBeGreaterThan(0);
    expect(getPngDimensions(firstFrame).height).toBeGreaterThan(0);
    expect(getPngDimensions(secondFrame).width).toBeGreaterThan(0);
    expect(getPngDimensions(secondFrame).height).toBeGreaterThan(0);
  });

test('converts, saves, exports, and cleans up a variant draft', async ({ page, request }) => {
    await page.getByRole('button', { name: 'Convert Active Frame' }).click({ force: true });

    await expect(page.getByTestId('media-overlay-design-id')).toHaveText('Design ID: unsaved');
    await expect(page.getByTestId('media-overlay-design-name')).toContainText('Harness Design - Instagram 1:1');
    await expect(page.getByTestId('media-overlay-variant-ready')).toHaveText('Variant Ready: yes');

    await page.getByRole('button', { name: 'Save Variant Draft' }).click({ force: true });

    const designIdText = page.getByTestId('media-overlay-design-id');
    await expect(designIdText).not.toHaveText('Design ID: unsaved');
    const savedId = (await designIdText.textContent())?.replace('Design ID: ', '').trim() || '';
    expect(savedId).not.toBe('');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Variant PNG' }).click({ force: true });

    const download = await downloadPromise;
    const buffer = await readDownloadBuffer(download);

    expect(download.suggestedFilename()).toBe('variant-draft.png');
    expect(getPngDimensions(buffer)).toEqual({ width: 1080, height: 1080 });

    const cleanupResponse = await request.post('/api/designs/delete', {
        data: { id: savedId },
    });
    expect(cleanupResponse.ok()).toBe(true);
  });