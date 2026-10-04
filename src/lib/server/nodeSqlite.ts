/**
 * Loading `node:sqlite` so that it really loads.
 *
 * `require('node:sqlite')` works under plain Node and under Jest, but the app's
 * bundler rewrites it and fails at runtime with "Unsupported external type Url
 * for commonjs reference". The stores catch a failed load and fall back to
 * their JSON files, so that failure was silent: every test exercised SQLite
 * while the running app never opened it, and the vault stayed on a 150 MB JSON
 * catalog it had supposedly migrated away from.
 *
 * `process.getBuiltinModule` is resolved by Node itself at run time and is
 * invisible to a bundler, so it is asked first. The `require` stays as the path
 * for a runtime too old to have it.
 */

let cached: unknown | null | undefined;

export function loadNodeSqlite<T>(): T | null {
    if (cached !== undefined) return cached as T | null;

    const getBuiltinModule = (process as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
    try {
        const builtin = getBuiltinModule?.call(process, 'node:sqlite');
        if (builtin) {
            cached = builtin;
            return cached as T;
        }
    } catch {
        // Fall through to require.
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        cached = require('node:sqlite');
    } catch (error) {
        // Said once, and loudly: without SQLite the vault runs on its JSON
        // files, which is a different product at whole-drive scale.
        console.warn('node:sqlite is not available; the vault is using its JSON stores.', error);
        cached = null;
    }
    return cached as T | null;
}

/** Tests only: forget the cached module. */
export function resetNodeSqliteCache(): void {
    cached = undefined;
}
