#!/usr/bin/env node
/**
 * Merges a translated { key: value } JSON file (produced by hand or by an
 * external AI from i18n-export-missing.mjs's output) into a locale's
 * dictionary file.
 *
 * Safety rules:
 *   - Never overwrites a key that already has a translation, unless --force
 *     is passed. This protects hand-tuned translations from being clobbered
 *     by a re-import.
 *   - Warns (but does not block) when a translated value drops, adds, or
 *     renames a {placeholder} token compared to the English source — that
 *     almost always means the external AI mistranslated a variable name.
 *   - Skips any key that doesn't exist in en.ts at all (typo protection).
 *   - Appends new entries as a single commented block at the end of the
 *     file, so a diff cleanly shows exactly what this import added.
 *
 * Usage:
 *   node scripts/i18n-import-translated.mjs <locale> <translatedFile.json> [--force]
 *   npm run i18n:import -- es i18n-export-es.json
 */

import fs from 'node:fs';
import path from 'node:path';

const LOCALE_DIR = path.join('src', 'lib', 'i18n', 'locales');

const rawArgs = process.argv.slice(2);
const force = rawArgs.includes('--force');
const args = rawArgs.filter((a) => a !== '--force');
const [locale, translatedFile] = args;

if (!locale || !translatedFile) {
    console.error('Usage: node scripts/i18n-import-translated.mjs <locale> <translatedFile.json> [--force]');
    process.exit(1);
}

const localeFile = path.join(LOCALE_DIR, `${locale}.ts`);
if (!fs.existsSync(localeFile)) {
    console.error(`No such locale file: ${localeFile}`);
    process.exit(1);
}
if (!fs.existsSync(translatedFile)) {
    console.error(`No such translated file: ${translatedFile}`);
    process.exit(1);
}

function extractPairs(file) {
    const content = fs.readFileSync(file, 'utf8');
    const map = new Map();
    const re = /^\s*'([a-zA-Z0-9_.-]+)':\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/gm;
    let m;
    while ((m = re.exec(content))) {
        const key = m[1];
        const raw = m[2] !== undefined ? m[2] : m[3];
        map.set(key, raw.replace(/\\(.)/g, '$1'));
    }
    return map;
}

/** Extracts the set of {placeholder} tokens in a string, order-independent. */
function placeholders(value) {
    return new Set((value.match(/\{[a-zA-Z0-9_]+\}/g) || []));
}

function sameSet(a, b) {
    if (a.size !== b.size) return false;
    for (const item of a) if (!b.has(item)) return false;
    return true;
}

/** Escapes a translated string for embedding as a single-quoted JS literal. */
function toJsStringLiteral(value) {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n');
}

const en = extractPairs(path.join(LOCALE_DIR, 'en.ts'));
const existingKeys = new Set(extractPairs(localeFile).keys());

let translated;
try {
    translated = JSON.parse(fs.readFileSync(translatedFile, 'utf8'));
} catch (err) {
    console.error(`Could not parse ${translatedFile} as JSON: ${err.message}`);
    process.exit(1);
}

const toAdd = [];
let unknownKeys = 0;
let alreadyTranslated = 0;
let emptyValues = 0;
const placeholderWarnings = [];

for (const [key, value] of Object.entries(translated)) {
    if (!en.has(key)) {
        unknownKeys += 1;
        console.warn(`  skip (not an en.ts key): ${key}`);
        continue;
    }
    if (existingKeys.has(key) && !force) {
        alreadyTranslated += 1;
        continue;
    }
    if (typeof value !== 'string' || value.trim() === '') {
        emptyValues += 1;
        console.warn(`  skip (empty/non-string value): ${key}`);
        continue;
    }
    const enPlaceholders = placeholders(en.get(key));
    const gotPlaceholders = placeholders(value);
    if (!sameSet(enPlaceholders, gotPlaceholders)) {
        placeholderWarnings.push({ key, expected: [...enPlaceholders], got: [...gotPlaceholders] });
    }
    toAdd.push([key, value]);
}

if (toAdd.length === 0) {
    console.log('Nothing to add — no new, valid keys found in the translated file.');
    if (alreadyTranslated > 0) {
        console.log(`(${alreadyTranslated} key(s) already translated in ${locale}.ts; use --force to overwrite them)`);
    }
    process.exit(0);
}

const content = fs.readFileSync(localeFile, 'utf8');
const closingBraceIndex = content.lastIndexOf('};');
if (closingBraceIndex === -1) {
    console.error(`Could not find the closing "};" in ${localeFile} — aborting to avoid corrupting the file.`);
    process.exit(1);
}

const timestamp = new Date().toISOString().slice(0, 10);
const block = [
    '',
    `    // Imported via i18n-import-translated.mjs from ${path.basename(translatedFile)} on ${timestamp}`,
    ...toAdd.map(([key, value]) => `    '${key}': '${toJsStringLiteral(value)}',`),
    '',
].join('\n');

// If --force, remove pre-existing lines for the keys we're overwriting first.
let nextContent = content;
if (force) {
    for (const [key] of toAdd) {
        if (!existingKeys.has(key)) continue;
        const lineRe = new RegExp(`^\\s*'${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}':\\s*(?:'(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"),?\\r?\\n`, 'm');
        nextContent = nextContent.replace(lineRe, '');
    }
}

const insertAt = nextContent.lastIndexOf('};');
nextContent = nextContent.slice(0, insertAt) + block + nextContent.slice(insertAt);
fs.writeFileSync(localeFile, nextContent, 'utf8');

console.log(`Added ${toAdd.length} key(s) to ${localeFile}`);
if (alreadyTranslated > 0) console.log(`Skipped ${alreadyTranslated} already-translated key(s) (use --force to overwrite).`);
if (unknownKeys > 0) console.log(`Skipped ${unknownKeys} key(s) not found in en.ts.`);
if (emptyValues > 0) console.log(`Skipped ${emptyValues} key(s) with empty/invalid values.`);
if (placeholderWarnings.length > 0) {
    console.log('');
    console.log(`WARNING: ${placeholderWarnings.length} translated value(s) have mismatched {placeholders} — check these by hand:`);
    for (const w of placeholderWarnings) {
        console.log(`  ${w.key}: expected [${w.expected.join(', ')}], got [${w.got.join(', ')}]`);
    }
}
console.log('');
console.log('Run `npm run audit:i18n:parity` (or node scripts/i18n-progress.mjs) to confirm the new coverage.');
