#!/usr/bin/env node
/**
 * Terminology enforcement — see docs/terminology.md.
 *
 * The object hierarchy is Workspace > Canvas > Layers > Page > Album.
 * "Canvas" names ONLY the white artboard in the centre of the workspace; a
 * saveable document is a "Page", and a set of pages is an "Album".
 *
 * This scans user-visible English strings for banned terms so the naming
 * cannot drift back. Run: node scripts/terminology-audit.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const EN = path.join('src', 'lib', 'i18n', 'locales', 'en.ts');

/** Banned term → guidance. Matched case-insensitively on word boundaries. */
const BANNED = [
    { re: /\bfederations?\b/i, use: 'Album / Albums' },
    { re: /\bstacks?\b/i, use: 'Album (the 3D overview is the "Album view")' },
    { re: /\bprojects?\b/i, use: 'Album / Albums' },
    { re: /\bdesigns?\b/i, use: 'Page / Pages' },
];

/**
 * "Canvas" is legitimate when it means the artboard. It is a violation when
 * used as a document — i.e. alongside a verb that implies a saveable unit.
 */
const CANVAS_AS_DOCUMENT = /\b(new|open|save|rename|duplicate|delete|switch between|all)\s+(the\s+)?canvas(es)?\b/i;

/**
 * Strings that are about the software project rather than user content.
 * Documented as permitted exceptions in docs/terminology.md.
 */
const ALLOWED_KEYS = new Set([
    // npm dependencies of the app, not user content.
    'settings.workspace.projectDependencies',
    // Support for the open-source project, not an album.
    'docs.moreHelp.body',
    // "Google Cloud project" is an external product concept, not an album.
    'wizard.gcp1',
    // "undo/redo stacks" is the data structure, not the album view.
    'panel.history.hint',
    // "layered 2D design" is the discipline, not a saveable document.
    'docs.intro.p1',
]);

const source = fs.readFileSync(EN, 'utf8');
const ENTRY = /^\s*'([a-zA-Z0-9_.-]+)'\s*:\s*'(.*)',?\s*$/gm;

const violations = [];
for (const m of source.matchAll(ENTRY)) {
    const [, key, value] = m;
    if (ALLOWED_KEYS.has(key)) continue;

    for (const { re, use } of BANNED) {
        if (re.test(value)) {
            violations.push({ key, value, found: value.match(re)[0], use });
        }
    }
    if (CANVAS_AS_DOCUMENT.test(value)) {
        violations.push({
            key, value,
            found: value.match(CANVAS_AS_DOCUMENT)[0],
            use: 'Page — "Canvas" is reserved for the centre artboard',
        });
    }
    // Placeholder names are translator-facing and follow the glossary too.
    for (const p of value.matchAll(/\{(\w+)\}/g)) {
        if (/^(canvases|designs|projects)$/i.test(p[1])) {
            violations.push({
                key, value, found: `{${p[1]}}`,
                use: `{pages} or {albums}`,
            });
        }
    }
}

if (violations.length === 0) {
    console.log('Terminology: OK — no banned terms in en.ts');
    process.exit(0);
}

console.log(`Terminology: ${violations.length} violation(s) in ${EN}\n`);
for (const v of violations) {
    console.log(`  ${v.key}`);
    console.log(`    "${v.value.slice(0, 88)}"`);
    console.log(`    found "${v.found}" → use ${v.use}\n`);
}
process.exit(1);
