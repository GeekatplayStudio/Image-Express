#!/usr/bin/env node
/**
 * i18n parity ratchet — makes locale coverage a gate that can actually pass.
 *
 * `audit:i18n:parity` fails if ANY locale is missing ANY key. With eight
 * partially-translated languages that is red by construction and can only go
 * green after a full translation pass, so it was permanently red — and a
 * permanently-red gate teaches people to ignore red gates.
 *
 * This records the current number of missing keys per locale and fails only on
 * a *regression*: adding an English string without translating it into a locale
 * that was already complete, or letting any locale slip further behind.
 *
 * Coverage still improves the same way — translate, then run with --update to
 * lower the recorded numbers. They may only go down.
 *
 * The detailed per-key report stays available via `npm run audit:i18n:parity`.
 *
 * Usage: node scripts/i18n-parity-ratchet.mjs [--update]
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BASELINE_PATH = path.join(process.cwd(), 'config', 'i18n-parity-baseline.json');

/**
 * Reuse the audit script rather than re-implementing its parsing — two
 * different key extractors would eventually disagree, and the audit's is the
 * one people read.
 */
function currentGaps() {
    let out;
    try {
        out = execFileSync(process.execPath, ['scripts/i18n-audit.mjs', '--parity'], {
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
        });
    } catch (error) {
        // The audit exits non-zero whenever any locale has a gap, which is its
        // normal state here. Its stdout is still the report we want.
        out = error.stdout ?? '';
        if (!out) throw error;
    }
    const gaps = {};
    // Lines look like: "GAP  de  648/2952  (22.0%)" or " OK  en  2952/2952 ..."
    for (const line of out.split('\n')) {
        const m = line.match(/^\s*(?:GAP|OK)\s+([a-z-]+)\s+(\d+)\/(\d+)/i);
        if (!m) continue;
        const [, locale, translated, total] = m;
        gaps[locale] = Number(total) - Number(translated);
    }
    return gaps;
}

const gaps = currentGaps();
if (Object.keys(gaps).length === 0) {
    console.error('i18n parity ratchet: could not read any locale rows from the audit output.');
    process.exit(1);
}

if (process.argv.includes('--update')) {
    let baseline = { note: '', locales: {} };
    try {
        baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    } catch {
        // First run.
    }
    const locales = {};
    for (const [locale, missing] of Object.entries(gaps).sort()) {
        const prior = baseline.locales?.[locale];
        // Never let --update raise a recorded ceiling.
        locales[locale] = prior === undefined ? missing : Math.min(prior, missing);
    }
    writeFileSync(BASELINE_PATH, `${JSON.stringify({
        note: 'Missing-key count per locale. These may only decrease. Raise coverage, then run `npm run audit:i18n:update`.',
        locales,
    }, null, 2)}\n`);
    console.log('i18n parity baseline updated:');
    for (const [locale, missing] of Object.entries(locales)) {
        console.log(`  ${locale.padEnd(4)} ${missing} missing`);
    }
    process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const problems = [];

for (const [locale, missing] of Object.entries(gaps)) {
    const allowed = baseline.locales[locale];
    if (allowed === undefined) {
        problems.push(`NEW LOCALE  ${locale} is not in the baseline (${missing} missing). Add it with --update.`);
    } else if (missing > allowed) {
        problems.push(
            `REGRESSED   ${locale} is missing ${missing} keys, baseline ${allowed}. `
            + 'Adding an English string means adding it to every locale that was already at this level.',
        );
    }
}

for (const locale of Object.keys(baseline.locales)) {
    if (!(locale in gaps)) {
        problems.push(`STALE       ${locale} is in the baseline but no longer reported — remove it with --update.`);
    }
    if (gaps[locale] !== undefined && gaps[locale] < baseline.locales[locale]) {
        problems.push(
            `IMPROVED    ${locale} is now missing only ${gaps[locale]} (baseline ${baseline.locales[locale]}). `
            + 'Lock the gain in with `npm run audit:i18n:update`.',
        );
    }
}

if (problems.length > 0) {
    console.error('i18n parity ratchet failed:\n');
    for (const problem of problems) console.error(`  ${problem}`);
    console.error(`\nBaseline: ${path.relative(process.cwd(), BASELINE_PATH)}`);
    console.error('Full per-key report: npm run audit:i18n:parity');
    process.exit(1);
}

const behind = Object.entries(gaps).filter(([, missing]) => missing > 0);
console.log(
    behind.length === 0
        ? 'i18n parity ratchet passed. Every locale is complete.'
        : `i18n parity ratchet passed. ${behind.length} locale(s) still behind — counts may only decrease.`,
);
