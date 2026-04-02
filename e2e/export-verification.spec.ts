import { expect, test, type Download } from '@playwright/test';
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

function getJpegDimensions(buffer: Buffer) {
    let offset = 2;

    while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) {
            offset += 1;
            continue;
        }

        const marker = buffer[offset + 1];
        const size = buffer.readUInt16BE(offset + 2);
        const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

        if (isStartOfFrame) {
            return {
                height: buffer.readUInt16BE(offset + 5),
                width: buffer.readUInt16BE(offset + 7),
            };
        }

        offset += 2 + size;
    }

    throw new Error('JPEG dimensions not found');
}

function getPdfPageSize(buffer: Buffer) {
    const content = buffer.toString('latin1');
    const match = content.match(/\/MediaBox\s*\[\s*0\s*0\s*([\d.]+)\s*([\d.]+)\s*\]/);

    if (!match) {
        throw new Error('PDF MediaBox not found');
    }

    return {
        width: Number.parseFloat(match[1]),
        height: Number.parseFloat(match[2]),
    };
}

async function readDownloadBuffer(download: Download) {
    const filePath = await download.path();
    expect(filePath).not.toBeNull();
    return readFile(filePath as string);
}

test.beforeEach(async ({ page }) => {
    await page.goto('/export-verification');
    await expect(page.getByTestId('export-harness-status')).toHaveText('Harness ready');
    await expect(page.getByTestId('export-harness-expected-size')).toContainText('300x200');
});

test('exports full-artboard PNG download when overlay frame exists', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PNG' }).click();

    const download = await downloadPromise;
    const buffer = await readDownloadBuffer(download);

    expect(download.suggestedFilename()).toBe('export-verification.png');
    expect(getPngDimensions(buffer)).toEqual({ width: 300, height: 200 });
});

test('exports full-artboard JPG download when overlay frame exists', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JPG' }).click();

    const download = await downloadPromise;
    const buffer = await readDownloadBuffer(download);

    expect(download.suggestedFilename()).toBe('export-verification.jpg');
    expect(getJpegDimensions(buffer)).toEqual({ width: 300, height: 200 });
});

test('exports full-artboard PDF download when overlay frame exists', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PDF' }).click();

    const download = await downloadPromise;
    const buffer = await readDownloadBuffer(download);

    expect(download.suggestedFilename()).toBe('export-verification.pdf');
    const pageSize = getPdfPageSize(buffer);
    expect(pageSize.width).toBeGreaterThan(0);
    expect(pageSize.height).toBeGreaterThan(0);
    expect(pageSize.width / pageSize.height).toBeCloseTo(1.5, 3);
});