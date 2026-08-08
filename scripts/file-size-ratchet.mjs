#!/usr/bin/env node
/**
 * File-size ratchet — makes the 500-line rule binding without a big-bang refactor.
 *
 * The rule already existed in `repo-audit.mjs`, but that script only *reports*:
 * it never sets a non-zero exit code, so 32 files drifted past the limit with
 * nothing to stop them. A hard failure today would block every commit, so this
 * is a ratchet instead:
 *
 *   - A file NOT in the baseline may not exceed the limit.        (no new debt)
 *   - A file IN the baseline may not grow beyond its recorded size. (no worse)
 *   - When a file drops to or below the limit, its baseline entry must be
 *     removed — the check tells you to, so the list can only shrink.
 *
 * i18n locale dictionaries are excluded: they are translation data, and a line
 * budget on a key/value table measures nothing.
 *
 * Usage:  node scripts/file-size-ratchet.mjs [--update]
 *   --update  rewrite the baseline to current reality (only ever to shrink it)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, 'config', 'oversized-files-baseline.json');
const SCAN_ROOTS = ['src', 'scripts', 'electron'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '__snapshots__']);
/** Translation dictionaries are data, not logic. */
const EXEMPT = [/\/i18n\/locales\//];

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const LIMIT = baseline.limit ?? 500;

const toPosix = (p) => path.relative(ROOT, p).split(path.sep).join('/');

async function collect(dir, out = []) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            await collect(full, out);
            continue;
        }
        if (!EXTENSIONS.has(path.extname(entry.name))) continue;
        const rel = toPosix(full);
        if (EXEMPT.some((re) => re.test(`/${rel}`))) continue;
        const info = await stat(full);
        if (info.size > 8 * 1024 * 1024) continue;
        const lines = readFileSync(full, 'utf8').split('\n').length;
        out.push({ file: rel, lines });
    }
    return out;
}

const files = [];
for (const root of SCAN_ROOTS) await collect(path.join(ROOT, root), files);

const oversized = files.filter((f) => f.lines > LIMIT);
const bySize = new Map(oversized.map((f) => [f.file, f.lines]));

if (process.argv.includes('--update')) {
    const next = {};
    for (const [file, lines] of [...bySize].sort((a, b) => b[1] - a[1])) {
        // Never let --update raise a recorded ceiling.
        const prior = baseline.files[file];
        next[file] = prior === undefined ? lines : Math.min(prior, lines);
    }
    writeFileSync(BASELINE_PATH, `${JSON.stringify({ ...baseline, files: next }, null, 2)}\n`);
    console.log(`Baseline updated: ${Object.keys(next).length} files over ${LIMIT} lines.`);
    process.exit(0);
}

const problems = [];

for (const { file, lines } of oversized) {
    const allowed = baseline.files[file];
    if (allowed === undefined) {
        problems.push(`NEW    ${file} is ${lines} lines (limit ${LIMIT}). Split it, or it becomes permanent debt.`);
    } else if (lines > allowed) {
        problems.push(`GREW   ${file} is ${lines} lines, baseline ${allowed}. Oversized files may only shrink.`);
    }
}

const fixed = Object.keys(baseline.files).filter((file) => !bySize.has(file));
for (const file of fixed) {
    problems.push(`STALE  ${file} is now at or below ${LIMIT} lines — remove it from the baseline (\`--update\`).`);
}

if (problems.length > 0) {
    console.error(`File-size ratchet failed (limit ${LIMIT} lines):\n`);
    for (const problem of problems) console.error(`  ${problem}`);
    console.error(`\nBaseline: ${toPosix(BASELINE_PATH)}`);
    process.exit(1);
}

const remaining = Object.keys(baseline.files).length;
console.log(`File-size ratchet passed. ${remaining} file(s) still over ${LIMIT} lines — the list may only shrink.`);
