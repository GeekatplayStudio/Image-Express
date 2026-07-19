#!/usr/bin/env node
/**
 * i18n progress report.
 *
 * Two halves of the job, reported separately because they behave differently:
 *
 *   CONVERSION  — replacing hardcoded English with t() calls. Measured by the
 *                 AST scanner. The denominator is the backlog recorded when
 *                 the AST scanner replaced the old regex one (the first
 *                 trustworthy measurement); work done before that point is not
 *                 in this denominator, so the figure understates real effort.
 *
 *   TRANSLATION — filling every locale for every English key. The denominator
 *                 grows as conversion adds keys, so this percentage can fall
 *                 even when translations are added. That is expected.
 *
 * Usage: node scripts/i18n-progress.mjs   (npm run audit:i18n:progress)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Untranslated strings at the start of the conversion effort.
 *
 * Revised upward from 1700 once the scanner learned to read string literals
 * inside JSX expression containers (`{cond && 'text'}`, `{cond ? 'a' : 'b'}`,
 * templates). That rule surfaced ~230 strings the earlier count could not see,
 * including some in files previously reported clean — so the old 1700 was an
 * undercount of the work, not a record of progress.
 */
const CONVERSION_BASELINE = 1932;

/**
 * Namespaces excluded from translation tracking.
 *
 * The user manual and in-app help are being rewritten separately, so their
 * copy is not worth translating until the new text lands. The keys still
 * exist in en.ts and still resolve at runtime — they are simply not counted
 * as translation debt.
 */
const DEFERRED_NAMESPACES = ['docs', 'help'];
const isDeferred = (key) => DEFERRED_NAMESPACES.includes(key.split('.')[0]);

const LOCALE_DIR = path.join('src', 'lib', 'i18n', 'locales');
const KEY_RE = /^\s*'([a-zA-Z0-9_.-]+)'\s*:/gm;
const PLURAL_SUFFIX = /\.(zero|one|two|few|many|other)$/;

function keysOf(file) {
    const source = fs.readFileSync(path.join(LOCALE_DIR, file), 'utf8');
    const out = new Set();
    let m;
    const re = new RegExp(KEY_RE.source, 'gm');
    while ((m = re.exec(source))) out.add(m[1]);
    return out;
}

function scanRemaining() {
    try {
        const out = execSync('node scripts/i18n-scan.mjs --json', { maxBuffer: 1 << 28 }).toString();
        return JSON.parse(out).findings.length;
    } catch (err) {
        // Non-zero exit is normal while findings remain.
        return JSON.parse(err.stdout.toString()).findings.length;
    }
}

const remaining = scanRemaining();
const converted = Math.max(0, CONVERSION_BASELINE - remaining);
const conversionPct = (converted / CONVERSION_BASELINE) * 100;

const en = keysOf('en.ts');
// Plural variants are language-specific; they are not owed by every locale.
// Manual/help copy is excluded while that content is being rewritten.
const owed = [...en].filter((k) => !PLURAL_SUFFIX.test(k) && !isDeferred(k));
const deferredCount = [...en].filter((k) => !PLURAL_SUFFIX.test(k) && isDeferred(k)).length;

const locales = fs.readdirSync(LOCALE_DIR)
    .filter((f) => f.endsWith('.ts') && f !== 'en.ts')
    .map((f) => {
        const have = keysOf(f);
        const done = owed.filter((k) => have.has(k)).length;
        return { code: path.basename(f, '.ts'), done, total: owed.length };
    });

const translationDone = locales.reduce((a, l) => a + l.done, 0);
const translationTotal = locales.reduce((a, l) => a + l.total, 0);
const translationPct = (translationDone / translationTotal) * 100;

// Overall weights each half by its string count.
const overallDone = converted + translationDone;
const overallTotal = CONVERSION_BASELINE + translationTotal;
const overallPct = (overallDone / overallTotal) * 100;

const bar = (pct) => {
    const filled = Math.round(pct / 5);
    return '█'.repeat(filled) + '░'.repeat(20 - filled);
};

console.log('\n  i18n progress\n');
console.log(`  CONVERSION   ${bar(conversionPct)} ${conversionPct.toFixed(1)}%`);
console.log(`               ${converted} of ${CONVERSION_BASELINE} converted · ${remaining} left\n`);
console.log(`  TRANSLATION  ${bar(translationPct)} ${translationPct.toFixed(1)}%`);
console.log(`               ${translationDone} of ${translationTotal} across ${locales.length} locales`);
console.log(`               (${deferredCount} manual/help keys excluded — content being rewritten)\n`);
for (const l of locales.sort((a, b) => b.done - a.done)) {
    const pct = (l.done / l.total) * 100;
    console.log(`                 ${l.code}  ${String(l.done).padStart(4)}/${l.total}  ${pct.toFixed(1)}%`);
}
console.log(`\n  OVERALL      ${bar(overallPct)} ${overallPct.toFixed(1)}%`);
console.log(`               ${overallDone} of ${overallTotal} strings\n`);
