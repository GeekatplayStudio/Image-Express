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

/**
 * Properties whose value is a stored identifier rather than display text.
 * `{ value: 'Oil', labelKey: 'paint.brush.oil' }` — translating the value
 * would break the equality checks that drive behaviour.
 */
const IDENTIFIER_PROPS = new Set([
    'value', 'id', 'key', 'type', 'name', 'mode', 'scope',
    'labelKey', 'descriptionKey',
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

/**
 * Every key defined in the English dictionary. A literal that is itself a
 * key (`{ labelKey: 'ctrl.redCyan' }`, resolved through t() at render) is
 * already translated — flagging it would send us round in circles.
 */
const KNOWN_KEYS = new Set(
    [...fs.readFileSync('src/lib/i18n/locales/en.ts', 'utf8')
        .matchAll(/^\s*'([\w.-]+)':/gm)].map((m) => m[1])
);

function isExempt(text) {
    const t = text.trim();
    if (!t) return true;
    if (KNOWN_KEYS.has(t)) return true;
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

/** Files that could not be parsed; reported loudly rather than counted clean. */
const parseFailures = [];

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
    // A file that will not parse yields no nodes, and therefore no findings —
    // it reports as clean while actually being broken. Surface that instead.
    const syntaxErrors = sf.parseDiagnostics ?? [];
    if (syntaxErrors.length) {
        const { line } = sf.getLineAndCharacterOfPosition(syntaxErrors[0].start ?? 0);
        parseFailures.push({
            file,
            line: line + 1,
            message: ts.flattenDiagnosticMessageText(syntaxErrors[0].messageText, ' '),
        });
        return [];
    }

    const findings = [];

    const lineOf = (node) =>
        sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

    /** A node is exempt when its own line carries an `i18n-ignore` comment. */
    const lineHasOptOut = (node) => {
        const line = lineOf(node) - 1;
        const text = source.split('\n')[line] ?? '';
        return /i18n-ignore/.test(text);
    };

    /**
     * Collect string/template literals from an expression that lands in
     * rendered output. Skips the positions where a literal is data rather
     * than display text: comparison operands (`mode === 'local'`), property
     * keys, and translation keys already passed to t().
     */
    function renderedStrings(expr, sf, out = []) {
        const skip = (n) => {
            const p = n.parent;
            if (!p) return false;
            // `x === 'local'`, `'EyeDropper' in window` — the literal is a
            // discriminant or a property probe, never display text.
            if (ts.isBinaryExpression(p) && [
                ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
                ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken,
                ts.SyntaxKind.InKeyword, ts.SyntaxKind.InstanceOfKeyword,
            ].includes(p.operatorToken.kind)) return true;
            if (ts.isPropertyAssignment(p) && p.name === n) return true;
            // `{ value: 'Oil', labelKey: 'paint.brush.oil' }` — the value side
            // of these properties is a stored identifier, not a caption. The
            // sibling label is what gets translated.
            if (ts.isPropertyAssignment(p) && p.initializer === n
                && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
                && IDENTIFIER_PROPS.has(p.name.text)) return true;
            if (ts.isElementAccessExpression(p)) return true;
            // `const itemClass = 'flex w-full …'` — a style constant hoisted
            // out of the markup, not a caption.
            if (ts.isVariableDeclaration(p)) return true;
            // Already translated, including through a ternary the call wraps:
            // t(cond ? 'a.key' : 'b.key'). Climb the pass-through nodes.
            let c = n, q = p;
            while (q && (ts.isConditionalExpression(q) || ts.isParenthesizedExpression(q)
                || (ts.isBinaryExpression(q) && [
                    ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken,
                    ts.SyntaxKind.QuestionQuestionToken,
                ].includes(q.operatorToken.kind)))) { c = q; q = q.parent; }
            if (q && ts.isCallExpression(q) && q.arguments.includes(c)) return true;
            return false;
        };
        const walk = (n) => {
            // Nested JSX inside the expression (a .map() row, a conditional
            // subtree) is reached by the main visitor, which applies the
            // text/attribute rules properly. Descending here would re-report
            // every className on it.
            if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)
                || ts.isJsxFragment(n) || ts.isJsxAttribute(n)) return;
            if (ts.isStringLiteral(n) && !skip(n)) {
                if (n.text.trim()) out.push({ text: n.text.trim(), at: n });
                return;
            }
            if (ts.isNoSubstitutionTemplateLiteral(n) && !skip(n)) {
                if (n.text.trim()) out.push({ text: n.text.trim(), at: n });
                return;
            }
            // `${x} is planned.` — judge the literal chunks, report the whole.
            if (ts.isTemplateExpression(n) && !skip(n)) {
                const chunks = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)];
                if (chunks.join('').trim()) {
                    out.push({ text: chunks.join('{}').trim(), at: n });
                }
                return;
            }
            ts.forEachChild(n, walk);
        };
        walk(expr);
        return out;
    }

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

        // 2. JSX attributes carrying display text — a plain string, or an
        //    expression building one. title={`Public · ${owner}`} and
        //    aria-label={busy ? 'Saving…' : 'Save'} are just as visible as a
        //    literal, so the expression forms go through the same collector.
        if (ts.isJsxAttribute(node) && node.initializer) {
            const name = node.name.getText(sf);
            if (TRANSLATABLE_ATTRS.has(name)) {
                const init = node.initializer;
                if (ts.isStringLiteral(init)) {
                    if (!isExempt(init.text) && !lineHasOptOut(node)) {
                        findings.push({ file, line: lineOf(node), kind: `attr:${name}`, text: init.text });
                    }
                } else if (ts.isJsxExpression(init) && init.expression) {
                    for (const { text, at } of renderedStrings(init.expression, sf)) {
                        if (!isExempt(text) && !lineHasOptOut(at)) {
                            findings.push({ file, line: lineOf(at), kind: `attr:${name}`, text });
                        }
                    }
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

        // 4. Strings rendered from inside a JSX expression container —
        //    `{cond && 'text'}`, `{cond ? 'a' : 'b'}`, `{`${x} text`}`.
        //    Rules 1–3 never see these, which let real strings through.
        if (ts.isJsxExpression(node) && node.expression
            && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
            for (const { text, at } of renderedStrings(node.expression, sf)) {
                if (!isExempt(text) && !lineHasOptOut(at)) {
                    findings.push({ file, line: lineOf(at), kind: 'jsx-expr', text });
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
// Compare on forward slashes so a filter copied from a shell command matches
// the backslash paths Node reports on Windows. A silent no-match here reads as
// "0 findings" and quietly certifies a file nobody actually scanned.
const slash = (p) => p.replace(/\\/g, '/');
const filters = args.filter((a) => !a.startsWith('--')).map(slash);

let findings = [];
let scanned = 0;
for (const file of walkFiles(SRC)) {
    if (filters.length && !filters.some((f) => slash(file).includes(f))) continue;
    scanned += 1;
    findings = findings.concat(scanFile(file));
}

// A file that cannot be parsed was never really scanned. Fail on it so a
// syntax error can never masquerade as full i18n coverage.
if (parseFailures.length) {
    console.error(`Could not parse ${parseFailures.length} file(s) — these were NOT scanned:`);
    for (const f of parseFailures) console.error(`  ${f.file}:${f.line}  ${f.message}`);
    process.exit(3);
}

// A filter that matches nothing must not look like a clean file.
if (filters.length && scanned === 0) {
    console.error(`No files matched: ${filters.join(', ')}`);
    process.exit(2);
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
