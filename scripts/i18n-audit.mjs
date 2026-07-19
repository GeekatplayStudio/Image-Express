#!/usr/bin/env node
/**
 * i18n audit.
 *
 * Two independent checks, both of which must pass for the app to be
 * considered fully internationalized:
 *
 *   1. PARITY  - every key defined in the base locale (en) exists in each
 *                other locale. Missing keys silently fall back to English,
 *                which reads as "the app is half translated".
 *   2. LITERALS - no user-visible string literals left hardcoded in JSX.
 *
 * NOTE: the `--literals` mode here is regex-based and is RETIRED — it cannot
 * see JSX structure and systematically under-reported (it missed text on its
 * own line, object-literal labels, and `.ts` files). Use the AST scanner
 * instead, which walks the TypeScript AST and catches all formatting variants:
 *
 *     node scripts/i18n-scan.mjs        (npm run audit:i18n:strings)
 *
 * `--literals` is kept only so older invocations do not break.
 *
 * Usage:
 *   node scripts/i18n-audit.mjs            # summary, exit 1 on any gap
 *   node scripts/i18n-audit.mjs --parity   # only the locale parity check
 *   node scripts/i18n-audit.mjs --literals # only the hardcoded-string check
 *   node scripts/i18n-audit.mjs --json     # machine-readable report
 */

import fs from 'node:fs';
import path from 'node:path';

const SRC = 'src';
const LOCALE_DIR = path.join(SRC, 'lib/i18n/locales');
const BASE_LOCALE = 'en';

/** Pull the dot-namespaced keys out of a locale module without importing TS. */
function readLocaleKeys(file) {
    const source = fs.readFileSync(file, 'utf8');
    const keys = new Set();
    for (const match of source.matchAll(/^\s*'([a-zA-Z0-9_.-]+)'\s*:/gm)) {
        keys.add(match[1]);
    }
    return keys;
}

function checkParity() {
    const base = readLocaleKeys(path.join(LOCALE_DIR, `${BASE_LOCALE}.ts`));
    const report = [];
    for (const entry of fs.readdirSync(LOCALE_DIR)) {
        const code = path.basename(entry, '.ts');
        if (!entry.endsWith('.ts') || code === BASE_LOCALE) continue;
        const keys = readLocaleKeys(path.join(LOCALE_DIR, entry));
        // Plural variants are language-specific: ru/uk/pl need `.few` and
        // `.many` forms that English has no category for. A variant counts as
        // legitimate when its base key exists in English, and it does not
        // count towards `missing` either — English cannot define it.
        const PLURAL = /\.(zero|one|two|few|many|other)$/;
        const missing = [...base].filter((key) => !keys.has(key));
        const orphaned = [...keys].filter((key) => {
            if (base.has(key)) return false;
            return !(PLURAL.test(key) && base.has(key.replace(PLURAL, '')));
        });
        report.push({ code, total: base.size, translated: base.size - missing.length, missing, orphaned });
    }
    return report;
}

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!/^(__tests__|node_modules|\.next)$/.test(entry.name)) walk(full, out);
        } else if (entry.name.endsWith('.tsx')) {
            out.push(full);
        } else if (entry.name.endsWith('.ts') && !full.includes('i18n')) {
            // Plain .ts modules hold UI text too — preset lists, tool
            // definitions, menu tables. Only the object-literal rule applies
            // to them (no JSX), but that is where such strings hide.
            out.push(full);
        }
    }
    return out;
}

const TRANSLATABLE_ATTRS = /\b(title|placeholder|aria-label|alt|label)="([^"{}\n]{2,})"/g;
// Object-literal UI text, e.g. `{ id: 'glow', label: 'Glow' }` in a presets
// array. These render as visible text but are not JSX, so the attribute and
// text-node patterns both miss them.
// `name` is deliberately excluded: it is almost always an internal identifier
// (`name: 'select'`), not display text, and produces only false positives.
const OBJECT_LITERAL_TEXT = /\b(label|shortLabel|title|description|placeholder|tooltip|heading|caption|hint|subtitle)\s*:\s*'([^'\n]{2,})'/g;
// A JSX text node: between tags, starts with a letter, contains a space or is
// a capitalised word. Excludes single symbols, numbers, and template holes.
const TEXT_NODE = />\s*([A-Za-z][A-Za-z0-9 ,.'’!?&:%/()+-]{2,80}?)\s*</g;
// Same idea, but where the text occupies its own line(s) between the tags.
// Requires a newline on both sides so it cannot re-match the single-line case.
const MULTILINE_TEXT_NODE = />\s*\n\s*([A-Za-z][A-Za-z0-9 ,.'’!?&:%/()+-]{2,80}?)\s*\n\s*</g;
// Lines we should not flag: imports, keys already going through t(), console
// output, and non-UI plumbing.
// Skip imports, comments, console output, and type-level code — TypeScript
// generics like `Promise<{ sRGBHex: string }>` look like JSX to the text-node
// regex but contain no user-visible strings.
const IGNORE_LINE = /^\s*(import|export|\/\/|\*|console\.|type\s|interface\s|\w+\s*:\s*\(|.*=>\s*Promise<)/;

// Standard technical identifiers that are the same in every language.
// Translating these would be wrong, not incomplete.
const NOT_TRANSLATABLE = new Set([
    'sRGB', 'Adobe RGB', 'CMYK (Print)', 'CMYK', 'RGB', 'HSB', 'Lab',
    'PNG', 'JPG', 'JPEG', 'WebP', 'SVG', 'GIF', 'PDF', 'TIFF',
    'px', 'ComfyUI', 'Stable Diffusion', 'OpenAI', 'Ollama',
    // Brand names and data formats — never localised.
    'Facebook', 'Instagram', 'YouTube', 'X', 'LinkedIn', 'TikTok', 'Pinterest',
    'JSON', 'HTML', 'CSS', 'ZIP', 'GLB', 'OBJ', 'FBX', 'STL', 'PLY', 'EXR',
    'Meshy', 'Tripo', 'Hitem3D', 'Google Drive', 'Dropbox',
]);

// A literal is exempt if it is a pure technical token, a hex/number sample,
// or the line carries an explicit `i18n-ignore` opt-out.
function isExempt(text, line) {
    if (NOT_TRANSLATABLE.has(text.trim())) return true;
    if (/^#[0-9a-fA-F]{3,8}$/.test(text.trim())) return true;   // colour samples
    // Credential/token format hints (ak_xxxxxxxx, sk-..., pk_live_…). These show
    // the literal shape of a key and must not be translated.
    if (/^[a-z]{2,4}[_-][a-zA-Z0-9_.]*(x{3,}|\.{3})?$/.test(text.trim())) return true;
    if (/^[\d\s.,:%×/+-]+$/.test(text)) return true;            // pure numerics
    if (/i18n-ignore/.test(line)) return true;
    // Keyboard shortcut hints (Ctrl+J, Shift+Cmd+Z, Del, Esc) are conventionally
    // shown unlocalised so they match what is printed on the key.
    if (/^((Ctrl|Cmd|Alt|Shift|Meta)\+)*(Del|Esc|Tab|Enter|Space|[A-Z0-9]|F\d{1,2})$/.test(text.trim())) return true;
    return false;
}

function checkLiterals() {
    const findings = [];
    for (const file of walk(SRC)) {
        const source = fs.readFileSync(file, 'utf8');
        const lines = source.split('\n');
        lines.forEach((line, index) => {
            if (IGNORE_LINE.test(line)) return;
            const hits = [];
            for (const m of line.matchAll(TRANSLATABLE_ATTRS)) {
                if (isExempt(m[2], line)) continue;
                if (/[A-Za-z]{2,}/.test(m[2])) hits.push(`${m[1]}="${m[2]}"`);
            }
            for (const m of line.matchAll(OBJECT_LITERAL_TEXT)) {
                if (isExempt(m[2], line)) continue;
                if (/[A-Za-z]{2,}/.test(m[2])) hits.push(`${m[1]}: '${m[2]}'`);
            }
            for (const m of line.matchAll(TEXT_NODE)) {
                const text = m[1].trim();
                if (/^[a-z]+$/.test(text)) continue; // css-ish / prop-ish fragments
                if (isExempt(text, line)) continue;
                if (/[A-Za-z]{2,}/.test(text)) hits.push(`text: ${text}`);
            }
            if (hits.length) {
                findings.push({ file, line: index + 1, hits });
            }
        });

        // Multi-line JSX text nodes — the very common formatting where the
        // text sits on its own line between tags:
        //     >
        //         Fit to Screen
        //     </button>
        // The per-line scan above cannot see these, since `>` and `<` are on
        // different lines.
        for (const m of source.matchAll(MULTILINE_TEXT_NODE)) {
            const text = m[1].trim();
            if (/^[a-z]+$/.test(text)) continue;
            if (!/[A-Za-z]{2,}/.test(text)) continue;
            const lineNo = source.slice(0, m.index).split('\n').length + 1;
            const contextLine = lines[lineNo - 1] ?? '';
            if (isExempt(text, contextLine)) continue;
            findings.push({ file, line: lineNo, hits: [`text: ${text}`] });
        }
    }
    return findings;
}

const args = new Set(process.argv.slice(2));
const wantParity = args.has('--parity') || (!args.has('--literals'));
const wantLiterals = args.has('--literals') || (!args.has('--parity'));

const result = {};
if (wantParity) result.parity = checkParity();
if (wantLiterals) result.literals = checkLiterals();

if (args.has('--json')) {
    console.log(JSON.stringify(result, null, 2));
} else {
    if (result.parity) {
        console.log('\n=== Locale parity (vs en) ===');
        for (const row of result.parity) {
            const pct = ((row.translated / row.total) * 100).toFixed(1);
            const flag = row.missing.length ? 'GAP ' : ' OK ';
            console.log(`${flag} ${row.code}  ${row.translated}/${row.total}  (${pct}%)` +
                (row.orphaned.length ? `  [${row.orphaned.length} orphaned]` : ''));
        }
    }
    if (result.literals) {
        const byFile = new Map();
        for (const f of result.literals) {
            byFile.set(f.file, (byFile.get(f.file) ?? 0) + f.hits.length);
        }
        const total = [...byFile.values()].reduce((a, b) => a + b, 0);
        console.log(`\n=== Hardcoded UI strings: ${total} in ${byFile.size} files ===`);
        for (const [file, count] of [...byFile].sort((a, b) => b[1] - a[1])) {
            console.log(`${String(count).padStart(4)}  ${file}`);
        }
    }
}

const parityFailed = (result.parity ?? []).some((r) => r.missing.length > 0);
const literalsFailed = (result.literals ?? []).length > 0;
process.exit(parityFailed || literalsFailed ? 1 : 0);
