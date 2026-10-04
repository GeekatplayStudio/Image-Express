import type { MigratableDatabase, SqliteMigration } from '@/lib/server/sqliteMigrations';

/**
 * Schema history of the vault catalog (`catalog.db`).
 *
 * Never edit a migration that has shipped: add the next one. Version 1 is the
 * schema as it stood before migrations existed, written with `IF NOT EXISTS` so
 * a catalog created by an older build adopts it without being touched.
 */

const V1_INITIAL = `
CREATE TABLE IF NOT EXISTS assets (
    id           TEXT PRIMARY KEY,
    type         TEXT NOT NULL,
    category     TEXT,
    name         TEXT,
    uri          TEXT,
    folder_path  TEXT,
    watch_root   TEXT,
    modified_at  TEXT,
    size_bytes   INTEGER,
    record       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_type        ON assets(type);
CREATE INDEX IF NOT EXISTS idx_assets_watch_root  ON assets(watch_root);
CREATE INDEX IF NOT EXISTS idx_assets_folder      ON assets(folder_path);
CREATE INDEX IF NOT EXISTS idx_assets_modified    ON assets(modified_at);

-- Covers syncCatalogAssets' change-detection scan so it reads an index rather
-- than touching the row bodies. Measured at 200k assets: 486ms -> 313ms, for
-- about 5% more on disk.
CREATE INDEX IF NOT EXISTS idx_assets_fingerprint ON assets(id, modified_at, size_bytes);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
`;

/**
 * Version 2: everything listing and search need, as columns.
 *
 * - `missing_since` — a file a scan no longer finds is marked, not deleted, so
 *   its captions and tags survive an unplugged drive or a moved folder.
 * - `connector`, `owner`, `is_public`, `asset_date` — the bookcase filter and
 *   the default sort, which until now could only be evaluated in JavaScript
 *   after parsing every record.
 * - `search_text` — what keyword search reads besides the name.
 */
const V2_COLUMNS = `
ALTER TABLE assets ADD COLUMN missing_since TEXT;
ALTER TABLE assets ADD COLUMN connector TEXT;
ALTER TABLE assets ADD COLUMN owner TEXT;
ALTER TABLE assets ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assets ADD COLUMN asset_date TEXT;
ALTER TABLE assets ADD COLUMN search_text TEXT;

UPDATE assets SET
    connector   = json_extract(record, '$.origin.connector'),
    owner       = lower(coalesce(nullif(json_extract(record, '$.owner'), ''), 'guest')),
    is_public   = coalesce(json_extract(record, '$.isPublic'), 0),
    asset_date  = coalesce(
        nullif(json_extract(record, '$.capturedAt'), ''),
        nullif(json_extract(record, '$.modifiedAt'), ''),
        json_extract(record, '$.createdAt')
    ),
    search_text = trim(
        coalesce(json_extract(record, '$.owner'), '') || ' ' ||
        coalesce(json_extract(record, '$.description'), '') || ' ' ||
        coalesce(json_extract(record, '$.prompt'), '') || ' ' ||
        coalesce(json_extract(record, '$.origin.displayPath'), '') || ' ' ||
        coalesce(json_extract(record, '$.tags'), '')
    );

CREATE INDEX idx_assets_date       ON assets(asset_date DESC, id);
CREATE INDEX idx_assets_type_date  ON assets(type, asset_date DESC, id);
CREATE INDEX idx_assets_name       ON assets(name COLLATE NOCASE, id);
CREATE INDEX idx_assets_missing    ON assets(missing_since) WHERE missing_since IS NOT NULL;
`;

/**
 * Full-text index over `name` and `search_text`, kept in step by triggers so a
 * write and its index entry commit together and no caller can forget one.
 *
 * External-content: the text lives in `assets` only. The update trigger is
 * scoped to the two indexed columns, so marking a file missing or re-stamping
 * its size does not touch the index.
 */
const V2_FTS = `
CREATE VIRTUAL TABLE assets_fts USING fts5(
    name, search_text,
    content='assets', content_rowid='rowid',
    prefix='2 3', tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER assets_fts_insert AFTER INSERT ON assets BEGIN
    INSERT INTO assets_fts(rowid, name, search_text) VALUES (new.rowid, new.name, new.search_text);
END;
CREATE TRIGGER assets_fts_delete AFTER DELETE ON assets BEGIN
    INSERT INTO assets_fts(assets_fts, rowid, name, search_text) VALUES ('delete', old.rowid, old.name, old.search_text);
END;
CREATE TRIGGER assets_fts_update AFTER UPDATE OF name, search_text ON assets BEGIN
    INSERT INTO assets_fts(assets_fts, rowid, name, search_text) VALUES ('delete', old.rowid, old.name, old.search_text);
    INSERT INTO assets_fts(rowid, name, search_text) VALUES (new.rowid, new.name, new.search_text);
END;
INSERT INTO assets_fts(assets_fts) VALUES ('rebuild');
`;

/** FTS5 is a compile-time option of SQLite; a runtime without it searches with LIKE. */
export function sqliteHasFts5(database: MigratableDatabase): boolean {
    return Boolean(database.prepare(
        "SELECT 1 AS present FROM pragma_compile_options WHERE compile_options = 'ENABLE_FTS5'",
    ).get());
}

/** Whether this catalog was built with the full-text index. */
export function catalogHasFts(database: MigratableDatabase): boolean {
    return Boolean(database.prepare(
        "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'assets_fts'",
    ).get());
}

export const CATALOG_MIGRATIONS: readonly SqliteMigration[] = [
    { version: 1, name: 'initial catalog', up: (database) => database.exec(V1_INITIAL) },
    {
        version: 2,
        name: 'filter columns, soft delete, full-text search',
        up: (database) => {
            database.exec(V2_COLUMNS);
            if (sqliteHasFts5(database)) database.exec(V2_FTS);
        },
    },
];
