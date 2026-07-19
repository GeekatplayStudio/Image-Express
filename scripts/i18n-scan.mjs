#!/usr/bin/env node
/**
 * AST-based scan for user-visible strings that are not routed through t().
 *
 * This replaces the regex scanning in i18n-audit.mjs. A regex cannot see JSX
 * structure, so every formatting variant needed its own rule and each new
 * variant was only discovered by tripping over it — text on its own line,
 * object-literal labels, `.ts` files, `shortLabel`. Walking the TypeScript AST
 * catches all of them by construction:
 *
 *   - JsxText            → any literal text between tags, however formatted
 *   - JSX attributes     → title / placeholder / aria-label / alt / label …
 *   - Object properties  → { label: 'Glow' } in presets and config tables
 *
 * Usage:
 *   node scripts/i18n-scan.mjs               # summary by file
 *   node scripts/i18n-scan.mjs --json        # machine-readable
 *   node scripts/i18n-scan.mjs src/foo.tsx   # limit to matching paths
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const SRC = 'src';

/** JSX attributes whose string value is shown to a user. */
const TRANSLATABLE_ATTRS = new Set([
    'title', 'placeholder', 'aria-label', 'alt', 'label',
    'aria-description', 'aria-placeholder',
]);

/** Object-literal keys that carry display text rather than identifiers. */
const TRANSLATABLE_PROPS = new Set([
    'label', 'shortLabel', 'title', 'description', 'placeholder',
    'tooltip', 'heading', 'caption', 'hint', 'subtitle', 'message',
]);

/** Standard identifiers, brands and formats that must not be translated. */
const NOT_TRANSLATABLE = new Set([
    'sRGB', 'Adobe RGB', 'CMYK (Print)', 'CMYK', 'RGB', 'HSB', 'Lab',
    'PNG', 'JPG', 'JPEG', 'WebP', 'SVG', 'GIF', 'PDF', 'TIFF', 'RAW',
    'px', 'ComfyUI', 'Stable Diffusion', 'OpenAI', 'Ollama', 'SDXL', 'Flux',
    'Facebook', 'Instagram', 'YouTube', 'LinkedIn', 'TikTok', 'Pinterest',
    'JSON', 'HTML', 'CSS', 'ZIP', 'GLB', 'OBJ', 'FBX', 'STL', 'PLY', 'EXR',
    'Meshy', 'Tripo', 'Hitem3D', 'Google Drive', 'Dropbox', 'GitHub',
    'AI', '2D', '3D', 'ID', 'URL', 'API', 'GPU', 'OS',
]);

function isExempt(text) {
    const t = text.trim();
    if (!t) return true;
    if (NOT_TRANSLATABLE.has(t)) return true;
    if (!/[A-Za-z]{2,}/.test(t)) return true;                    // punctuation / numerals
    if (/^#[0-9a-fA-F]{3,8}$/.test(t)) return true;              // colour samples
    if (/^[\d\s.,:%×/+·—–-]+$/.test(t)) return true;             // pure numerics
    if (/^[a-z][a-z0-9-]*$/.test(t)) return true;                // identifier-ish
    if (/^[a-z]{2,4}[_-][a-zA-Z0-9_.]*(x{3,}|\.{3})?$/.test(t)) return true; // key format hints
    if (/^https?:\/\//.test(t)) return true;                     // URLs
    if (/^(npm|npx|yarn|pnpm|git|node|python|pip)\s/.test(t)) return true; // shell commands
    if (/^--?[a-z][a-z0-9-]*$/.test(t)) return true;             // CLI flags: --enable-cors-header
    if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+$/.test(t)) return true; // relative paths: ComfyUI/models/checkpoints
    // Filesystem path examples (D:\ComfyUI, /usr/local/share, ./models), including
    // newline-separated lists used as multi-path placeholders.
    if (t.split(/[\n;]/).every((part) =>
        !part.trim() || /^([A-Za-z]:[\\/]|\.{0,2}[\\/])[\w\\/.\s-]*$/.test(part.trim()))) return true;
    if (/^[A-Za-z]{2,6}[-_]?\.{3}$/.test(t)) return true;        // key format hints: AIza…, sk-…
    if (/^((Ctrl|Cmd|Alt|Shift|Meta)\+)*(Del|Esc|Tab|Enter|Space|[A-Z0-9]|F\d{1,2})$/.test(t)) return true;
    return false;
}

function walkFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!/^(__tests__|node_modules|\.next)$/.test(entry.name)) walkFiles(full, out);
        } else if (/\.tsx?$/.test(entry.name) && !full.includes(`${path.sep}i18n${path.sep}`)) {
            out.push(full);
        }
    }
    return out;
}

/** True when the file opts out via a leading `i18n-ignore-file` comment. */
function fileOptedOut(source) {
    return /^\s*(\/\/|\/\*)\s*i18n-ignore-file/m.test(source.slice(0, 500));
}

function scanFile(file) {
    const source = fs.readFileSync(file, 'utf8');
    if (fileOptedOut(source)) return [];

    // Parse .ts as TS and .tsx as TSX. Parsing a .ts file as TSX makes the
    // parser read a generic like `<T>` as an opening JSX tag, which turns the
    // rest of the function body into bogus "JSX text".
    const isTsx = file.endsWith('.tsx');
    const sf = ts.createSourceFile(
        file, source, ts.ScriptTarget.Latest, true,
        isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const findings = [];

    const lineOf = (node) =>
        sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

    /** A node is exempt when its own line carries an `i18n-ignore` comment. */
    const lineHasOptOut = (node) => {
        const line = lineOf(node) - 1;
        const text = source.split('\n')[line] ?? '';
        return /i18n-ignore/.test(text);
    };

    const visit = (node) => {
        // 1. Literal text between JSX tags — any formatting, any indentation.
        if (ts.isJsxText(node)) {
            const text = node.text.trim();
            // Content of a <code> element is a literal identifier (a header
            // name, env var, path fragment). Translating it would break it.
            const parent = node.parent;
            const inCode = parent && ts.isJsxElement(parent)
                && parent.openingElement.tagName.getText(sf) === 'code';
            if (text && !inCode && !isExempt(text) && !lineHasOptOut(node)) {
                findings.push({ file, line: lineOf(node), kind: 'jsx-text', text });
            }
        }

        // 2. JSX attributes with a plain string value.
        if (ts.isJsxAttribute(node) && node.initializer) {
            const name = node.name.getText(sf);
            if (TRANSLATABLE_ATTRS.has(name)) {
                const init = node.initializer;
                let value = null;
                if (ts.isStringLiteral(init)) value = init.text;
                else if (ts.isJsxExpression(init) && init.expression
                    && ts.isStringLiteral(init.expression)) value = init.expression.text;
                if (value !== null && !isExempt(value) && !lineHasOptOut(node)) {
                    findings.push({ file, line: lineOf(node), kind: `attr:${name}`, text: value });
                }
            }
        }

        // 3. Object-literal properties that hold display text.
        if (ts.isPropertyAssignment(node)) {
            const name = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)
                ? node.name.text : null;
            if (name && TRANSLATABLE_PROPS.has(name)
                && ts.isStringLiteral(node.initializer)) {
                const value = node.initializer.text;
                if (!isExempt(value) && !lineHasOptOut(node)) {
                    findings.push({ file, line: lineOf(node), kind: `prop:${name}`, text: value });
                }
            }
        }

        ts.forEachChild(node, visit);
    };

    visit(sf);
    return findings;
}

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const filters = args.filter((a) => !a.startsWith('--'));

let findings = [];
for (const file of walkFiles(SRC)) {
    if (filters.length && !filters.some((f) => file.includes(f))) continue;
    findings = findings.concat(scanFile(file));
}

if (asJson) {
    console.log(JSON.stringify({ findings }, null, 2));
} else {
    const byFile = new Map();
    for (const f of findings) byFile.set(f.file, (byFile.get(f.file) ?? 0) + 1);
    console.log(`Untranslated user-visible strings: ${findings.length} in ${byFile.size} files\n`);
    for (const [file, count] of [...byFile].sort((a, b) => b[1] - a[1])) {
        console.log(`${String(count).padStart(4)}  ${file}`);
    }
}

process.exit(findings.length ? 1 : 0);
