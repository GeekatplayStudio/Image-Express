#!/usr/bin/env node
/**
 * Repairs double-encoded (mojibake) text in the i18n locale files.
 *
 * Symptom: every non-English locale stored its translations as UTF-8 bytes that
 * had already been decoded once as Windows-1252 and re-encoded as UTF-8, so
 * `страница` was stored as `ÑÑ‚Ñ€Ð°Ð½Ð¸Ñ†Ð°` and shipped to users that way.
 *
 * Repair: for each string literal, map the characters back to the single bytes
 * a cp1252 decode would have produced, then decode those bytes as UTF-8. A
 * literal is only rewritten when that round-trip succeeds and actually changes
 * it, so genuinely-correct text (English, or a locale that was never corrupted)
 * is left untouched. The pass is idempotent — running it twice is a no-op.
 *
 *   node scripts/i18n-fix-mojibake.mjs --check   report only, exit 1 if dirty
 *   node scripts/i18n-fix-mojibake.mjs           rewrite the files in place
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.resolve(__dirname, '..', 'src', 'lib', 'i18n', 'locales');

/**
 * Windows-1252 -> Unicode for the 0x80-0x9F block. Every other byte in
 * 0x00-0xFF maps to the code point of the same value.
 */
const CP1252_HIGH = {
    0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
    0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
    0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
    0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
    0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
    0x9e: 0x017e, 0x9f: 0x0178,
};

/**
 * Unicode code point -> the cp1252 byte that decodes to it.
 *
 * cp1252 leaves 0x81, 0x8D, 0x8F, 0x90 and 0x9D undefined. Decoders that hit
 * those bytes pass them through as the matching C1 control character, and a
 * UTF-8 lead byte of 0x81 is extremely common in Cyrillic — so those five must
 * map back to themselves or every Russian and Ukrainian string fails to
 * round-trip.
 */
const TO_CP1252 = new Map();
for (let byte = 0; byte < 0x100; byte += 1) {
    const cp = byte >= 0x80 && byte <= 0x9f ? (CP1252_HIGH[byte] ?? byte) : byte;
    if (!TO_CP1252.has(cp)) TO_CP1252.set(cp, byte);
}

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const utf8Encoder = new TextEncoder();

/**
 * @returns the repaired string, or null when the text is not mojibake
 *          (nothing to undo, or the round-trip does not produce valid UTF-8).
 */
function undoMojibake(text) {
    let suspect = false;
    const bytes = [];
    for (const char of text) {
        const cp = char.codePointAt(0);
        if (cp < 0x80) {
            bytes.push(cp);
            continue;
        }
        const mapped = TO_CP1252.get(cp);
        if (mapped === undefined) {
            // A character cp1252 cannot represent -- it was never part of the
            // mis-decode, so keep its real UTF-8 bytes.
            for (const b of utf8Encoder.encode(char)) bytes.push(b);
            continue;
        }
        suspect = true;
        bytes.push(mapped);
    }
    if (!suspect) return null;
    try {
        const decoded = utf8Decoder.decode(Uint8Array.from(bytes));
        return decoded === text ? null : decoded;
    } catch {
        return null;
    }
}

/** Single-quoted TS string literal, escapes allowed, no raw newlines. */
const STRING_LITERAL = /'((?:[^'\\\n\r]|\\.)*)'/g;

/**
 * Mojibake looks like a UTF-8 lead byte followed by continuation bytes, read
 * as cp1252: a character in U+00C0-U+00FF (the lead) followed by whatever a
 * continuation byte 0x80-0xBF decodes to. Correct text never matches -- in
 * "Größe", "créé" or "Configurações" both characters sit above
 * U+00BF, so legitimate accents are not flagged.
 */
const CONTINUATION = ['-¿']
    .concat(Object.values(CP1252_HIGH).map((cp) => String.fromCodePoint(cp)))
    .join('');
const MOJIBAKE_SIGNATURE = new RegExp(`[À-ÿ][${CONTINUATION}]`);

function repairSource(source) {
    let repaired = 0;
    const residual = [];
    const out = source.replace(STRING_LITERAL, (match, body) => {
        const fixed = undoMojibake(body);
        if (fixed === null) {
            // Could not round-trip. Only worth reporting when it still *looks*
            // like mojibake -- a lone accented character is simply correct text.
            if (MOJIBAKE_SIGNATURE.test(body)) residual.push(body.slice(0, 48));
            return match;
        }
        repaired += 1;
        return `'${fixed}'`;
    });
    return { out, repaired, residual };
}

const checkOnly = process.argv.includes('--check');
const files = fs.readdirSync(localesDir).filter((name) => name.endsWith('.ts')).sort();

let totalRepaired = 0;
let totalResidual = 0;
const rows = [];

for (const name of files) {
    const full = path.join(localesDir, name);
    const source = fs.readFileSync(full, 'utf8');
    const { out, repaired, residual } = repairSource(source);
    totalRepaired += repaired;
    totalResidual += residual.length;
    rows.push({ file: name, repaired, residual });
    if (repaired > 0 && !checkOnly) {
        fs.writeFileSync(full, out, 'utf8');
    }
}

const width = Math.max(...rows.map((row) => row.file.length));
for (const row of rows) {
    const status = row.repaired === 0 ? 'clean' : `${checkOnly ? 'needs repair' : 'repaired'}: ${row.repaired}`;
    console.log(`${row.file.padEnd(width)}  ${status}${row.residual.length ? `  (still suspect: ${row.residual.length})` : ''}`);
    for (const sample of row.residual.slice(0, 3)) console.log(`${' '.repeat(width)}    ! ${sample}`);
}
console.log(`\n${checkOnly ? 'Would repair' : 'Repaired'} ${totalRepaired} string(s); ${totalResidual} still look double-encoded.`);

if (checkOnly && totalRepaired > 0) {
    console.error('\nLocale files contain double-encoded text. Run: node scripts/i18n-fix-mojibake.mjs');
    process.exit(1);
}
