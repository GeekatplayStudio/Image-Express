#!/usr/bin/env node
/**
 * Exports every English string missing from a target locale as a flat
 * { key: englishValue } JSON file — meant to be handed to any external
 * translation AI/service and pasted back through i18n-import-translated.mjs.
 *
 * This is the fast path for bulk locale work: instead of hand-translating
 * each key inline, dump the gap, translate it externally, re-import.
 *
 * Usage:
 *   node scripts/i18n-export-missing.mjs <locale> [outFile]
 *   npm run i18n:export -- es
 *
 * By default excludes the same deferred namespaces as i18n-progress.mjs
 * (docs, help) since that content is being rewritten separately and isn't
 * worth translating yet. Pass --include-deferred to include them anyway.
 */

import fs from 'node:fs';
import path from 'node:path';

const LOCALE_DIR = path.join('src', 'lib', 'i18n', 'locales');
const DEFERRED_NAMESPACES = ['docs', 'help'];

const args = process.argv.slice(2).filter((a) => a !== '--include-deferred');
const includeDeferred = process.argv.includes('--include-deferred');
const locale = args[0];

if (!locale) {
    console.error('Usage: node scripts/i18n-export-missing.mjs <locale> [outFile] [--include-deferred]');
    console.error('Example: node scripts/i18n-export-missing.mjs es');
    process.exit(1);
}

const localeFile = path.join(LOCALE_DIR, `${locale}.ts`);
if (!fs.existsSync(localeFile)) {
    console.error(`No such locale file: ${localeFile}`);
    process.exit(1);
}

/** Extracts key -> value pairs. Values may be single- or double-quoted. */
function extractPairs(file) {
    const content = fs.readFileSync(file, 'utf8');
    const map = new Map();
    // Key is always single-quoted (project convention). Value can be
    // single- or double-quoted; this alternation is what earlier ad-hoc
    // single-quote-only regexes missed (e.g. comfy.appPathVerificationHint).
    const re = /^\s*'([a-zA-Z0-9_.-]+)':\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/gm;
    let m;
    while ((m = re.exec(content))) {
        const key = m[1];
        const raw = m[2] !== undefined ? m[2] : m[3];
        // Un-escape the JS string literal so the exported JSON holds the
        // real display text, not the source-code escaping.
        const value = raw.replace(/\\(.)/g, '$1');
        map.set(key, value);
    }
    return map;
}

const en = extractPairs(path.join(LOCALE_DIR, 'en.ts'));
const target = extractPairs(localeFile);

const isDeferred = (key) => DEFERRED_NAMESPACES.includes(key.split('.')[0]);

const missing = {};
let skippedDeferred = 0;
for (const [key, value] of en) {
    if (target.has(key)) continue;
    if (!includeDeferred && isDeferred(key)) {
        skippedDeferred += 1;
        continue;
    }
    missing[key] = value;
}

const outFile = args[1] || `i18n-export-${locale}.json`;
fs.writeFileSync(outFile, JSON.stringify(missing, null, 2) + '\n', 'utf8');

const count = Object.keys(missing).length;
console.log(`Wrote ${count} missing key(s) for "${locale}" to ${outFile}`);
if (!includeDeferred && skippedDeferred > 0) {
    console.log(`(skipped ${skippedDeferred} deferred docs/help key(s) — pass --include-deferred to include them)`);
}
console.log('');
console.log('Next: send the file to a translation AI with instructions like:');
console.log('  "Translate every value in this JSON to <language>. Keep the keys');
console.log('   exactly as-is. Preserve every {placeholder} token unchanged and in');
console.log('   the same position where the grammar allows. Return JSON only."');
console.log('Then: node scripts/i18n-import-translated.mjs ' + locale + ' <translated-file>.json');
