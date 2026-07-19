/**
 * Guards the i18n layer against the two silent-failure modes that a large
 * conversion effort introduces:
 *
 *   1. A typo'd key — t('ctrl.opacty') — renders the raw key string in the UI
 *      instead of throwing. Nothing else in the test suite notices.
 *   2. A key added to a locale but not to en, which can never be reached
 *      because en defines the canonical key set.
 *
 * Both are checked statically against the source, so they fail in CI rather
 * than in front of a user.
 */

import fs from 'node:fs';
import path from 'node:path';
import en from '../locales/en';

const SRC = path.join(process.cwd(), 'src');
const LOCALE_DIR = path.join(SRC, 'lib/i18n/locales');

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!/^(node_modules|\.next)$/.test(entry.name)) walk(full, out);
        } else if (/\.tsx?$/.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

/**
 * Drop comments before scanning. Documentation that mentions t('key') as an
 * example would otherwise be collected as a real usage.
 */
function stripComments(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Collect every statically-analysable t('…') / translate(lang, '…') key. */
function collectUsedKeys() {
    const used = new Map<string, string[]>();
    for (const file of walk(SRC)) {
        if (file.includes(`${path.sep}i18n${path.sep}`)) continue;
        const source = stripComments(fs.readFileSync(file, 'utf8'));
        for (const m of source.matchAll(/\bt\(\s*'([a-zA-Z0-9_.-]+)'/g)) {
            const list = used.get(m[1]) ?? [];
            list.push(path.relative(process.cwd(), file));
            used.set(m[1], list);
        }
    }
    return used;
}

describe('i18n key integrity', () => {
    it('every t() key used in the app exists in the English dictionary', () => {
        const used = collectUsedKeys();
        const missing: string[] = [];
        for (const [key, files] of used) {
            if (!(key in en)) {
                missing.push(`${key}  (used in ${[...new Set(files)].join(', ')})`);
            }
        }
        expect(missing).toEqual([]);
    });

    it('no dictionary defines the same key twice', () => {
        // A repeated key is not a syntax error: the later definition silently
        // wins, so an unrelated string quietly takes over an existing one. This
        // happened for real — a short 'Connect {provider}' button label
        // displaced the explanatory sentence that shared its key.
        const duplicates: string[] = [];
        for (const entry of fs.readdirSync(LOCALE_DIR)) {
            if (!entry.endsWith('.ts')) continue;
            const source = fs.readFileSync(path.join(LOCALE_DIR, entry), 'utf8');
            const seen = new Set<string>();
            for (const m of source.matchAll(/^\s*'([a-zA-Z0-9_.-]+)'\s*:/gm)) {
                if (seen.has(m[1])) duplicates.push(`${entry}: ${m[1]}`);
                seen.add(m[1]);
            }
        }
        expect(duplicates).toEqual([]);
    });

    it('no locale defines a key that English does not', () => {
        // Plural categories are language-specific: Russian and Ukrainian need
        // `.few` / `.many` forms that English legitimately lacks. A variant is
        // valid as long as its base key exists in English.
        const PLURAL_CATEGORIES = /\.(zero|one|two|few|many|other)$/;
        const orphans: string[] = [];
        for (const entry of fs.readdirSync(LOCALE_DIR)) {
            if (!entry.endsWith('.ts') || entry === 'en.ts') continue;
            const source = fs.readFileSync(path.join(LOCALE_DIR, entry), 'utf8');
            for (const m of source.matchAll(/^\s*'([a-zA-Z0-9_.-]+)'\s*:/gm)) {
                const key = m[1];
                if (key in en) continue;
                const base = key.replace(PLURAL_CATEGORIES, '');
                if (PLURAL_CATEGORIES.test(key) && base in en) continue;
                orphans.push(`${entry}: ${key}`);
            }
        }
        expect(orphans).toEqual([]);
    });

    it('keys containing {placeholders} are always called with vars', () => {
        // A '{name}' left unfilled renders literally in the UI, e.g. the user
        // sees "{count} more pages". Every templated key must therefore be
        // invoked as t('key', { ... }) — a bare t('key') is a defect.
        const templated = Object.entries(en)
            .filter(([, value]) => /\{\w+\}/.test(value))
            .map(([key]) => key);

        const sources = walk(SRC)
            .filter((f) => !f.includes(`${path.sep}i18n${path.sep}`))
            .map((f) => fs.readFileSync(f, 'utf8'))
            .join('\n');

        const bare = templated.filter((key) => {
            const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // t('key') closed immediately — no second argument.
            const bareCall = new RegExp(`\\bt\\(\\s*'${escaped}'\\s*\\)`);
            if (!bareCall.test(sources)) return false;
            // `template={t('key')}` is legitimate: RichText performs the
            // substitution itself so the placeholders are still filled, just
            // with React nodes instead of strings.
            const richTextUse = new RegExp(`template=\\{\\s*t\\(\\s*'${escaped}'\\s*\\)\\s*\\}`);
            if (richTextUse.test(sources)) return false;
            return true;
        });
        expect(bare).toEqual([]);
    });
});
