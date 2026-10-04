/**
 * Versioned schema migrations for the vault's SQLite files.
 *
 * The stores used to run a block of `CREATE … IF NOT EXISTS` on every open.
 * That can create a table but can never change one: there was no way to add a
 * column to a catalog that already existed, and nothing stopped an older build
 * from opening a newer file and writing rows the newer build would misread.
 *
 * This follows ComfyUIAssetManager's `core/migrations`: the schema version lives
 * in `PRAGMA user_version`, each step runs once inside its own transaction, and
 * a file from a newer build is refused instead of being opened and damaged.
 */

export interface MigratableDatabase {
    exec: (sql: string) => void;
    prepare: (sql: string) => { get: (...params: unknown[]) => Record<string, unknown> | undefined };
}

export interface SqliteMigration {
    /** 1-based and contiguous: migration N takes the file from version N-1 to N. */
    version: number;
    name: string;
    up: (database: MigratableDatabase) => void;
}

/** The file was written by a newer build than this one. */
export class SchemaTooNewError extends Error {
    constructor(label: string, found: number, supported: number) {
        super(
            `${label} was created by a newer version of Image Express `
            + `(schema ${found}; this version understands up to ${supported}). Update the app to open it.`,
        );
        this.name = 'SchemaTooNewError';
    }
}

export function readSchemaVersion(database: MigratableDatabase): number {
    return Number(database.prepare('PRAGMA user_version').get()?.user_version ?? 0);
}

/**
 * Bring a database up to the latest migration. Returns the versions applied.
 *
 * Each step commits with its version bump, so a crash mid-upgrade leaves the
 * file at the last completed step and the next open carries on from there.
 */
export function applyMigrations(
    database: MigratableDatabase,
    migrations: readonly SqliteMigration[],
    label = 'This database',
): number[] {
    migrations.forEach((migration, index) => {
        if (migration.version !== index + 1) {
            throw new Error(`Migration "${migration.name}" is numbered ${migration.version}, expected ${index + 1}.`);
        }
    });

    const current = readSchemaVersion(database);
    if (current > migrations.length) throw new SchemaTooNewError(label, current, migrations.length);

    const applied: number[] = [];
    for (const migration of migrations.slice(current)) {
        database.exec('BEGIN IMMEDIATE');
        try {
            migration.up(database);
            // PRAGMA takes no bound parameters; the value is our own integer.
            database.exec(`PRAGMA user_version = ${migration.version}`);
            database.exec('COMMIT');
        } catch (error) {
            database.exec('ROLLBACK');
            throw error;
        }
        applied.push(migration.version);
    }
    return applied;
}
