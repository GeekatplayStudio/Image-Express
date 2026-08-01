/**
 * Which vision models to offer for one-click install.
 *
 * Two sources, deliberately:
 *
 *  - A CURATED list, below. These are the ones the app actually offers to
 *    install, because a one-click button has to name a real tag and a size
 *    that fits an ordinary machine. Pulling a bare `:latest` can mean tens of
 *    gigabytes; the library's largest vision models run to 235b.
 *
 *  - A LIVE read of the Ollama library, which is what keeps the list from
 *    going stale. It confirms each curated entry still exists and surfaces
 *    vision models newer than this file, so a user can see there is something
 *    newer even before the curated list catches up.
 *
 * If the live read fails — offline, or Ollama changes their markup — the
 * curated list still works. That is the point of having both.
 */

const OLLAMA_VISION_SEARCH_URL = 'https://ollama.com/search?c=vision';
const LIVE_FETCH_TIMEOUT_MS = 6000;
/** The library changes on the order of weeks; re-reading per request is waste. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type VisionModelSuggestion = {
    /** Exact `name:tag` to pull — never a bare name, so the size is predictable. */
    model: string;
    /** Approximate download size, as the library reports it. */
    size: string;
    /** Why someone would pick this one over the others. */
    note: string;
    /** Still listed in the Ollama library on the last live check. */
    stillListed?: boolean;
};

/**
 * Sizes and tags verified against ollama.com in August 2026. Ordered smallest
 * first, because the most common reason a local vision model fails is that it
 * did not fit, not that it was not clever enough.
 */
export const CURATED_VISION_MODELS: VisionModelSuggestion[] = [
    {
        model: 'minicpm-v4.6:1b',
        size: '1.6 GB',
        note: 'Smallest useful option. Pick this on a laptop without a discrete GPU.',
    },
    {
        model: 'qwen3-vl:2b',
        size: '1.9 GB',
        note: 'Small and quick, and still reads layouts and text in an image well.',
    },
    {
        model: 'qwen3-vl:4b',
        size: '3.3 GB',
        note: 'The balanced default — good critique quality without a long download.',
    },
    {
        model: 'qwen3-vl:8b',
        size: '6.1 GB',
        note: 'Noticeably sharper on detailed layouts. Wants ~8 GB of VRAM.',
    },
    {
        model: 'gemma4:12b',
        size: '7.6 GB',
        note: 'Strongest general visual reasoning here. Best if you have the memory.',
    },
];

/** Offered when nothing is installed and the user has expressed no preference. */
export const DEFAULT_VISION_MODEL = 'qwen3-vl:4b';

type CacheEntry = { slugs: string[]; fetchedAt: number };
let liveCache: CacheEntry | null = null;

/** Test seam: drop the cached library read. */
export const resetVisionCatalogCache = (): void => {
    liveCache = null;
};

/**
 * Vision-model slugs currently listed in the Ollama library.
 *
 * Scraped, because there is no JSON index of the library by capability. That
 * makes it best-effort by nature: every caller must cope with null, and none
 * of them may fail because of it.
 */
export async function fetchLiveVisionSlugs(): Promise<string[] | null> {
    if (liveCache && Date.now() - liveCache.fetchedAt < CACHE_TTL_MS) {
        return liveCache.slugs;
    }

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), LIVE_FETCH_TIMEOUT_MS);
        let html: string;
        try {
            const response = await fetch(OLLAMA_VISION_SEARCH_URL, {
                signal: controller.signal,
                cache: 'no-store',
                headers: { Accept: 'text/html' },
            });
            if (!response.ok) return null;
            html = await response.text();
        } finally {
            clearTimeout(timer);
        }

        const slugs: string[] = [];
        const seen = new Set<string>();
        for (const match of html.matchAll(/href="\/library\/([a-zA-Z0-9._-]+)"/g)) {
            const slug = match[1];
            if (seen.has(slug)) continue;
            seen.add(slug);
            slugs.push(slug);
        }
        // An empty result means the markup changed, not that the library is
        // empty. Treat it as "no live data" so callers keep the curated list.
        if (slugs.length === 0) return null;

        liveCache = { slugs, fetchedAt: Date.now() };
        return slugs;
    } catch {
        return null;
    }
}

export type VisionCatalog = {
    /** Curated, installable suggestions, annotated with the live check. */
    suggestions: VisionModelSuggestion[];
    /** Vision models in the library that the curated list does not cover. */
    newerInLibrary: string[];
    /** Whether the live library read succeeded on this request. */
    libraryChecked: boolean;
};

const slugOf = (model: string): string => model.split(':')[0];

/** Merge the curated suggestions with a live read of the Ollama library. */
export async function buildVisionCatalog(): Promise<VisionCatalog> {
    const live = await fetchLiveVisionSlugs();

    if (!live) {
        return {
            suggestions: CURATED_VISION_MODELS.map((entry) => ({ ...entry })),
            newerInLibrary: [],
            libraryChecked: false,
        };
    }

    const listed = new Set(live);
    const covered = new Set(CURATED_VISION_MODELS.map((entry) => slugOf(entry.model)));

    return {
        suggestions: CURATED_VISION_MODELS.map((entry) => ({
            ...entry,
            stillListed: listed.has(slugOf(entry.model)),
        })),
        // Ordered as the library orders them, which puts newest first.
        newerInLibrary: live.filter((slug) => !covered.has(slug)),
        libraryChecked: true,
    };
}
