import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import type { BookcaseFilter } from '@/features/asset-vault/contracts/bookcase';
import { openCatalogDb, PRESENT } from '@/lib/server/vaultCatalogDb';
import { catalogHasFts } from '@/lib/server/vaultCatalogSchema';

/**
 * Listing and keyword search answered by SQLite.
 *
 * The search route used to materialise every record and score it in
 * JavaScript, and "browse" was the first N rows in whatever order the table
 * returned them, with `total` equal to N. At whole-drive scale that meant the
 * vault could only ever show an arbitrary 200 of 200,000 files.
 *
 * Here the filter, the sort, the page and the count are all SQL over indexed
 * columns, and keyword search is an FTS5 query — the shape ComfyUIAssetManager
 * uses (`search/fts.py`, `services/queries`). Only the rows on the requested
 * page are parsed.
 */

export type CatalogSort = 'relevance' | 'newest' | 'oldest' | 'name';

export interface CatalogSearchQuery {
    query?: string;
    filter?: BookcaseFilter;
    limit: number;
    offset?: number;
    sort?: CatalogSort;
    /** Only assets in this folder or below it (a `folder_path` value). */
    folderPrefix?: string;
}

export interface CatalogSearchPage {
    hits: Array<{ asset: VaultAssetRecord; score: number }>;
    /** Everything that matches, not just this page. */
    total: number;
}

/**
 * Turn what a person typed into an FTS5 expression.
 *
 * User text is never passed to MATCH as written: FTS5 has its own syntax
 * (`AND`, `NEAR`, `-`, `:`, unbalanced quotes) and a stray character is a query
 * error. Each word becomes a quoted prefix term; words are OR'd and ranking
 * rewards rows that match more of them, which is what the old scorer did.
 */
export function buildFtsQuery(text: string): string | null {
    const terms = text
        .split(/\s+/)
        .map((term) => term.replace(/["']/g, '').trim())
        .filter((term) => /[\p{L}\p{N}]/u.test(term))
        .slice(0, 12);
    if (terms.length === 0) return null;
    return terms.map((term) => `"${term}"*`).join(' OR ');
}

function filterClauses(filter: BookcaseFilter | undefined, alias: string) {
    const where: string[] = [`${alias}.${PRESENT}`];
    const params: unknown[] = [];
    if (!filter) return { where, params };
    if (filter.type) { where.push(`${alias}.type = ?`); params.push(filter.type); }
    if (filter.category) { where.push(`${alias}.category = ?`); params.push(filter.category); }
    if (filter.connector) { where.push(`${alias}.connector = ?`); params.push(filter.connector); }
    if (filter.owner) { where.push(`${alias}.owner = ?`); params.push(filter.owner.toLowerCase()); }
    if (typeof filter.isPublic === 'boolean') { where.push(`${alias}.is_public = ?`); params.push(filter.isPublic ? 1 : 0); }
    if (filter.dateFrom) { where.push(`${alias}.asset_date >= ?`); params.push(filter.dateFrom); }
    if (filter.dateTo) { where.push(`${alias}.asset_date <= ?`); params.push(filter.dateTo); }
    return { where, params };
}

// Every order ends in the id so paging is stable when the sort key ties.
const ORDER_BY: Record<Exclude<CatalogSort, 'relevance'>, string> = {
    newest: 'a.asset_date DESC, a.id',
    oldest: 'a.asset_date ASC, a.id',
    name: 'a.name COLLATE NOCASE ASC, a.id',
};

const parse = (row: Record<string, unknown>): VaultAssetRecord | null => {
    try {
        return JSON.parse(String(row.record)) as VaultAssetRecord;
    } catch {
        return null;
    }
};

const escapeLike = (term: string) => term.replace(/[\\%_]/g, (char) => `\\${char}`);

/** Returns null when SQLite is not the active store, so the caller can take the old path. */
export async function searchCatalog(request: CatalogSearchQuery): Promise<CatalogSearchPage | null> {
    const database = await openCatalogDb();
    if (!database) return null;

    const limit = Math.max(1, Math.min(request.limit, 500));
    const offset = Math.max(0, request.offset ?? 0);
    const { where, params } = filterClauses(request.filter, 'a');
    if (request.folderPrefix) {
        where.push("(a.folder_path = ? OR a.folder_path LIKE ? ESCAPE '\\')");
        params.push(request.folderPrefix, `${escapeLike(request.folderPrefix)}/%`);
    }
    const text = (request.query ?? '').trim();
    const ftsQuery = text ? buildFtsQuery(text) : null;
    const sort = request.sort ?? (text ? 'relevance' : 'newest');

    let from = 'assets a';
    let scoreColumn = '1.0';
    let relevanceOrder = ORDER_BY.newest;
    const leading: unknown[] = [];

    if (text && !ftsQuery) return { hits: [], total: 0 };

    if (ftsQuery && catalogHasFts(database)) {
        from = 'assets_fts JOIN assets a ON a.rowid = assets_fts.rowid';
        where.unshift('assets_fts MATCH ?');
        leading.push(ftsQuery);
        // bm25 is lower-is-better; a name match counts three times a body match.
        scoreColumn = '-bm25(assets_fts, 3.0, 1.0)';
        relevanceOrder = `bm25(assets_fts, 3.0, 1.0), ${ORDER_BY.newest}`;
    } else if (text) {
        // No FTS5 in this SQLite build: substring match, any word.
        const terms = text.split(/\s+/).filter(Boolean).slice(0, 12);
        const likes = terms.map(() => "(a.name LIKE ? ESCAPE '\\' OR a.search_text LIKE ? ESCAPE '\\')");
        where.push(`(${likes.join(' OR ')})`);
        for (const term of terms) params.push(`%${escapeLike(term)}%`, `%${escapeLike(term)}%`);
    }

    const whereSql = where.join(' AND ');
    const orderSql = sort === 'relevance' ? relevanceOrder : ORDER_BY[sort];
    const bound = [...leading, ...params];

    const rows = database
        .prepare(`SELECT a.record AS record, ${scoreColumn} AS score FROM ${from} WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`)
        .all(...bound, limit, offset);
    // Counting "everything that is not missing" reads every row, which measured
    // ~200 ms at 240k assets and was most of the cost of opening the vault.
    // All rows minus the missing ones is two index-only counts instead.
    const unfiltered = bound.length === 0;
    const count = (sql: string, ...args: unknown[]) => Number(database.prepare(sql).get(...args)?.n ?? 0);
    const total = unfiltered
        ? count('SELECT COUNT(*) AS n FROM assets')
            - count('SELECT COUNT(*) AS n FROM assets WHERE missing_since IS NOT NULL')
        : count(`SELECT COUNT(*) AS n FROM ${from} WHERE ${whereSql}`, ...bound);

    const hits: CatalogSearchPage['hits'] = [];
    for (const row of rows) {
        const asset = parse(row);
        if (asset) hits.push({ asset, score: Number(row.score ?? 1) });
    }
    return { hits, total };
}

/**
 * Folders that hold assets, with how many each holds directly.
 *
 * The folder tree was built from whichever assets happened to be loaded, so it
 * showed the folders of the first page only. One grouped query over an indexed
 * column gives the whole tree without loading a single record.
 */
export async function listCatalogFolders(filter?: BookcaseFilter): Promise<Array<{ path: string; count: number }> | null> {
    const database = await openCatalogDb();
    if (!database) return null;
    const { where, params } = filterClauses(filter, 'a');
    return database
        .prepare(`SELECT a.folder_path AS path, COUNT(*) AS n FROM assets a WHERE ${where.join(' AND ')} GROUP BY a.folder_path ORDER BY a.folder_path`)
        .all(...params)
        .map((row) => ({ path: String(row.path ?? ''), count: Number(row.n ?? 0) }));
}
