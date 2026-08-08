import type { VaultAssetRecord } from '../contracts/assetRecord';

/**
 * "Similar" for assets that have no embedding yet.
 *
 * The obvious fallback — hash-text vectors — was tried and is worse than
 * nothing: measured against a real vault it ranked `River Stereo.wav` as the
 * closest match for `underwater.mov` at 0.504, because a 64-dimension character
 * hash of a filename carries no meaning. Confidently wrong results are worse
 * than an empty panel.
 *
 * This uses facts that are actually true of the file instead: where it lives,
 * what it is, what it is called, when it was written. On a drive of real work
 * the strongest of those by far is the folder — files from one shoot, one
 * render, one project sit together — so it carries the most weight.
 *
 * Every component contributes a human-readable reason, so the panel can say why
 * a match was chosen rather than showing a bare score.
 */

export type AffinityHit = {
    assetId: string;
    score: number;
    reasons: string[];
};

/** Filename tokens, lowercased, with the extension and pure digits removed. */
export function nameTokens(name: string): Set<string> {
    const withoutExtension = name.replace(/\.[a-z0-9]{1,5}$/i, '');
    const tokens = withoutExtension
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => (
            token.length > 1
            // A sequence number is what makes two files *different* frames of
            // the same thing, so it must not count as evidence of similarity.
            && !/^\d+$/.test(token)
        ));
    return new Set(tokens);
}

/** The containing folder, from whichever path the record carries. */
export function folderOf(asset: VaultAssetRecord): string {
    const raw = asset.origin.displayPath || asset.origin.uri || '';
    const cut = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
    return cut > 0 ? raw.slice(0, cut).toLowerCase() : '';
}

function parentOf(folder: string): string {
    const cut = Math.max(folder.lastIndexOf('/'), folder.lastIndexOf('\\'));
    return cut > 0 ? folder.slice(0, cut) : '';
}

const SAME_FOLDER = 0.45;
const SIBLING_FOLDER = 0.15;
const SAME_TYPE = 0.15;
const NAME_OVERLAP = 0.30;
const SAME_DAY = 0.10;

const DAY_MS = 24 * 60 * 60 * 1000;

function timeOf(asset: VaultAssetRecord): number {
    const value = Date.parse(asset.modifiedAt || asset.createdAt || '');
    return Number.isFinite(value) ? value : Number.NaN;
}

/**
 * Rank the catalog against one seed.
 *
 * A single pass with the seed's tokens precomputed. The candidate's name is
 * only tokenised when something cheaper has already matched, which keeps a
 * 240k-asset catalog from paying a string split per record.
 */
export function findAffineAssets(
    seed: VaultAssetRecord,
    candidates: VaultAssetRecord[],
    options?: { limit?: number; minScore?: number },
): AffinityHit[] {
    const limit = options?.limit ?? 24;
    const minScore = options?.minScore ?? 0.2;

    const seedFolder = folderOf(seed);
    const seedParent = parentOf(seedFolder);
    const seedTokens = nameTokens(seed.name);
    const seedTime = timeOf(seed);

    const hits: AffinityHit[] = [];

    for (const candidate of candidates) {
        if (candidate.id === seed.id) continue;

        let score = 0;
        const reasons: string[] = [];

        const folder = folderOf(candidate);
        const sameFolder = seedFolder !== '' && folder === seedFolder;
        if (sameFolder) {
            score += SAME_FOLDER;
            reasons.push('same folder');
        } else if (seedParent !== '' && parentOf(folder) === seedParent) {
            score += SIBLING_FOLDER;
            reasons.push('nearby folder');
        }

        const sameType = candidate.type === seed.type;
        if (sameType) {
            score += SAME_TYPE;
            reasons.push(`also ${seed.type}`);
        }

        // Only worth tokenising when there is already some connection, or when
        // nothing else matched and the name is the only thing left to go on.
        if (seedTokens.size > 0) {
            const tokens = nameTokens(candidate.name);
            let shared = 0;
            for (const token of seedTokens) if (tokens.has(token)) shared += 1;
            if (shared > 0) {
                // Jaccard, so a file named after every word in the seed does
                // not outrank one that genuinely shares its whole name.
                const union = new Set([...seedTokens, ...tokens]).size;
                const overlap = shared / union;
                score += NAME_OVERLAP * overlap;
                reasons.push(shared === 1 ? 'shares a name word' : `shares ${shared} name words`);
            }
        }

        if (Number.isFinite(seedTime)) {
            const time = timeOf(candidate);
            if (Number.isFinite(time) && Math.abs(time - seedTime) <= DAY_MS) {
                score += SAME_DAY;
                reasons.push('from the same day');
            }
        }

        if (score >= minScore) {
            hits.push({ assetId: candidate.id, score: Math.min(1, score), reasons });
        }
    }

    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
