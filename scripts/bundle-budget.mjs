#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

const chunksDirectory = path.resolve('.next/static/chunks');
const maximumTotalBytes = 12_500_000;
const maximumChunkBytes = 3_250_000;

async function collectJavaScriptFiles(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) return collectJavaScriptFiles(absolutePath);
        return entry.isFile() && entry.name.endsWith('.js') ? [absolutePath] : [];
    }));
    return files.flat();
}

let files;
try {
    files = await collectJavaScriptFiles(chunksDirectory);
} catch {
    console.error('Bundle budget: .next/static/chunks is missing. Run npm run build first.');
    process.exit(1);
}

const chunks = await Promise.all(files.map(async (file) => ({
    file: path.relative(process.cwd(), file),
    bytes: (await fs.stat(file)).size,
})));
chunks.sort((left, right) => right.bytes - left.bytes);

const totalBytes = chunks.reduce((total, chunk) => total + chunk.bytes, 0);
const largestChunk = chunks[0] ?? { file: '(none)', bytes: 0 };
const failures = [];
if (totalBytes > maximumTotalBytes) {
    failures.push(`total JavaScript ${totalBytes} exceeds ${maximumTotalBytes} bytes`);
}
if (largestChunk.bytes > maximumChunkBytes) {
    failures.push(`${largestChunk.file} is ${largestChunk.bytes} bytes (limit ${maximumChunkBytes})`);
}

console.log(JSON.stringify({
    status: failures.length === 0 ? 'passed' : 'failed',
    budgets: { maximumTotalBytes, maximumChunkBytes },
    measured: {
        chunkCount: chunks.length,
        totalBytes,
        largestChunk,
        fiveLargestChunks: chunks.slice(0, 5),
    },
}, null, 2));

if (failures.length > 0) {
    console.error(`Bundle budget failed: ${failures.join('; ')}`);
    process.exit(1);
}
