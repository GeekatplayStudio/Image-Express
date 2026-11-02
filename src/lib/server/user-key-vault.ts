import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { getDataDir } from '@/lib/server/appPaths';
import { appendVaultAudit, readVaultAudit, resolveAuditFilePath, type VaultAuditEntry } from '@/lib/server/user-key-vault-audit';

type UserApiKeys = Record<string, string>;

interface UserKeyVaultRecord {
    encryptedKeys: string;
    iv: string;
    authTag: string;
    keyCount: number;
    lastReadAt?: string;
    lastWriteAt: string;
    readCount: number;
    writeCount: number;
    /**
     * When each key was last set, by name. Names are not secret; values stay
     * inside `encryptedKeys`. Records written before this existed have no
     * entry, and report `lastWriteAt` for every key.
     */
    keyUpdatedAt?: Record<string, string>;
}

interface UserKeyVaultStore {
    version: 1;
    users: Record<string, UserKeyVaultRecord>;
    updatedAt: string;
}

interface UserKeyVaultWriteResult {
    ownerId: string;
    keyCount: number;
    writeCount: number;
    updatedAt: string;
}

/** Who is asking, for the audit trail. */
export interface VaultAccessOptions {
    source?: string;
}

export interface UserApiKeyStatus {
    name: string;
    updatedAt: string;
    ageDays: number;
    /** Older than the rotation policy allows. */
    stale: boolean;
}

export interface UserApiKeysDescription {
    ownerId: string;
    maxAgeDays: number;
    keys: UserApiKeyStatus[];
    lastReadAt?: string;
    readCount: number;
    writeCount: number;
}

export interface VaultSecretRotationResult {
    rotatedAt: string;
    ownerCount: number;
    /** Only when the caller supplied the next secret (env-managed vaults). */
    nextSecret?: string;
}

const VAULT_ALGORITHM = 'aes-256-gcm';
const KEY_BYTE_LENGTH = 32;
const IV_BYTE_LENGTH = 12;
/** Rotation policy: a key older than this is reported stale. */
const DEFAULT_MAX_KEY_AGE_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

// turbopackIgnore: runtime data directory, not a bundle dependency.
const STORE_DIR = getDataDir();
const DEFAULT_VAULT_FILE = path.join(STORE_DIR, 'user-key-vault.json');
const DEFAULT_SECRET_FILE = path.join(STORE_DIR, 'user-key-vault.secret');

let writeQueue: Promise<void> = Promise.resolve();

function nowIso() {
    return new Date().toISOString();
}

function resolveVaultFilePath() {
    const override = process.env.IMAGE_EXPRESS_KEY_VAULT_FILE?.trim();
    // turbopackIgnore: the override is an operator-supplied runtime path, never a bundle asset.
    return override ? path.resolve(/* turbopackIgnore: true */ override) : DEFAULT_VAULT_FILE;
}

function resolveSecretFilePath() {
    const override = process.env.IMAGE_EXPRESS_KEY_VAULT_SECRET_FILE?.trim();
    return override ? path.resolve(/* turbopackIgnore: true */ override) : DEFAULT_SECRET_FILE;
}

export function resolveMaxKeyAgeDays() {
    const raw = Number.parseInt(process.env.IMAGE_EXPRESS_KEY_MAX_AGE_DAYS ?? '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_KEY_AGE_DAYS;
}

function createEmptyStore(): UserKeyVaultStore {
    return {
        version: 1,
        users: {},
        updatedAt: nowIso(),
    };
}

function normalizeStore(raw: unknown): UserKeyVaultStore {
    if (!raw || typeof raw !== 'object') {
        return createEmptyStore();
    }
    const candidate = raw as Partial<UserKeyVaultStore>;
    const users = candidate.users && typeof candidate.users === 'object'
        ? candidate.users as Record<string, UserKeyVaultRecord>
        : {};
    return {
        version: 1,
        users,
        updatedAt: candidate.updatedAt || nowIso(),
    };
}

function normalizeOwnerId(value: string) {
    return value.trim();
}

function normalizeApiKeys(payload: Record<string, unknown>): UserApiKeys {
    const normalized: UserApiKeys = {};
    for (const [key, value] of Object.entries(payload)) {
        if (!key || typeof key !== 'string') continue;
        if (typeof value !== 'string') continue;
        normalized[key] = value;
    }
    return normalized;
}

async function ensureParentDir(filePath: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readStore(filePath: string): Promise<UserKeyVaultStore> {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return normalizeStore(JSON.parse(raw));
    } catch (error) {
        const nodeErr = error as NodeJS.ErrnoException;
        if (nodeErr.code === 'ENOENT') {
            return createEmptyStore();
        }
        throw error;
    }
}

async function writeStore(filePath: string, store: UserKeyVaultStore) {
    await ensureParentDir(filePath);
    await fs.writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');
}

function deriveVaultKey(secret: string) {
    return crypto.createHash('sha256').update(secret).digest().subarray(0, KEY_BYTE_LENGTH);
}

function envSecret() {
    const value = process.env.IMAGE_EXPRESS_KEY_VAULT_SECRET;
    return value && value.trim() ? value.trim() : null;
}

async function getVaultKey() {
    const fromEnv = envSecret();
    if (fromEnv) {
        return deriveVaultKey(fromEnv);
    }

    const secretFile = resolveSecretFilePath();
    try {
        const secret = (await fs.readFile(secretFile, 'utf8')).trim();
        if (!secret) {
            throw new Error('Key vault secret file is empty.');
        }
        return deriveVaultKey(secret);
    } catch (error) {
        const nodeErr = error as NodeJS.ErrnoException;
        if (nodeErr.code !== 'ENOENT') {
            throw error;
        }

        const generated = crypto.randomBytes(KEY_BYTE_LENGTH).toString('hex');
        await ensureParentDir(secretFile);
        await fs.writeFile(secretFile, `${generated}\n`, { encoding: 'utf8', mode: 0o600 });
        return deriveVaultKey(generated);
    }
}

function encryptKeys(keys: UserApiKeys, key: Buffer) {
    const iv = crypto.randomBytes(IV_BYTE_LENGTH);
    const cipher = crypto.createCipheriv(VAULT_ALGORITHM, key, iv);
    const plaintext = JSON.stringify(keys);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
        encryptedKeys: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
    };
}

function decryptKeys(record: UserKeyVaultRecord, key: Buffer): UserApiKeys {
    const decipher = crypto.createDecipheriv(
        VAULT_ALGORITHM,
        key,
        Buffer.from(record.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(record.encryptedKeys, 'base64')),
        decipher.final(),
    ]);
    const parsed = JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>;
    return normalizeApiKeys(parsed);
}

function queueWrite<T>(work: () => Promise<T>): Promise<T> {
    const next = writeQueue.then(work, work);
    writeQueue = next.then(() => undefined, () => undefined);
    return next;
}

function assertOwnerId(ownerId: string) {
    const normalized = normalizeOwnerId(ownerId);
    if (!normalized) {
        throw new Error('Owner identifier is required.');
    }
    return normalized;
}

async function audit(entry: Omit<VaultAuditEntry, 'at'>) {
    await appendVaultAudit(resolveAuditFilePath(resolveVaultFilePath()), { at: nowIso(), ...entry });
}

/** `keyUpdatedAt` for every key the record holds, filling gaps from `lastWriteAt`. */
function keyTimestamps(record: UserKeyVaultRecord, names: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const name of names) {
        out[name] = record.keyUpdatedAt?.[name] ?? record.lastWriteAt;
    }
    return out;
}

export async function loadUserApiKeys(ownerId: string, options: VaultAccessOptions = {}): Promise<UserApiKeys> {
    return queueWrite(async () => {
        const normalizedOwner = assertOwnerId(ownerId);
        const filePath = resolveVaultFilePath();
        const key = await getVaultKey();
        const store = await readStore(filePath);
        const record = store.users[normalizedOwner];
        if (!record) {
            return {};
        }

        const keys = decryptKeys(record, key);
        const timestamp = nowIso();
        store.users[normalizedOwner] = {
            ...record,
            lastReadAt: timestamp,
            readCount: (record.readCount || 0) + 1,
        };
        store.updatedAt = timestamp;
        await writeStore(filePath, store);
        await audit({ event: 'read', owner: normalizedOwner, keyCount: record.keyCount, source: options.source ?? 'unknown' });
        return keys;
    });
}

export async function mergeUserApiKeys(
    ownerId: string,
    keys: Record<string, unknown>,
    options: VaultAccessOptions = {},
): Promise<UserKeyVaultWriteResult> {
    return queueWrite(async () => {
        const normalizedOwner = assertOwnerId(ownerId);
        const keyPatch = normalizeApiKeys(keys);
        const filePath = resolveVaultFilePath();
        const key = await getVaultKey();
        const store = await readStore(filePath);
        const existing = store.users[normalizedOwner];
        const currentKeys = existing ? decryptKeys(existing, key) : {};
        const merged = {
            ...currentKeys,
            ...keyPatch,
        };
        const encrypted = encryptKeys(merged, key);
        const timestamp = nowIso();
        const writeCount = (existing?.writeCount || 0) + 1;
        // A key counts as rotated only when its value changed; re-saving the
        // Settings form must not reset every key's age.
        const changed = Object.keys(keyPatch).filter((name) => currentKeys[name] !== keyPatch[name]);
        const keyUpdatedAt = existing ? keyTimestamps(existing, Object.keys(currentKeys)) : {};
        for (const name of changed) keyUpdatedAt[name] = timestamp;

        store.users[normalizedOwner] = {
            ...encrypted,
            keyCount: Object.keys(merged).length,
            lastReadAt: existing?.lastReadAt,
            lastWriteAt: timestamp,
            readCount: existing?.readCount || 0,
            writeCount,
            keyUpdatedAt,
        };
        store.updatedAt = timestamp;
        await writeStore(filePath, store);
        await audit({ event: 'write', owner: normalizedOwner, keyCount: Object.keys(merged).length, keys: changed, source: options.source ?? 'unknown' });

        return {
            ownerId: normalizedOwner,
            keyCount: Object.keys(merged).length,
            writeCount,
            updatedAt: timestamp,
        };
    });
}

/**
 * Remove keys by name. `mergeUserApiKeys` can only add or replace, so until
 * this existed revoking a provider key meant saving an empty string, which
 * still counted as a key and still went to the provider.
 */
export async function removeUserApiKeys(
    ownerId: string,
    names: string[],
    options: VaultAccessOptions = {},
): Promise<UserKeyVaultWriteResult> {
    return queueWrite(async () => {
        const normalizedOwner = assertOwnerId(ownerId);
        const filePath = resolveVaultFilePath();
        const key = await getVaultKey();
        const store = await readStore(filePath);
        const existing = store.users[normalizedOwner];
        const timestamp = nowIso();
        if (!existing) {
            return { ownerId: normalizedOwner, keyCount: 0, writeCount: 0, updatedAt: timestamp };
        }
        const currentKeys = decryptKeys(existing, key);
        const removed = names.filter((name) => Object.prototype.hasOwnProperty.call(currentKeys, name));
        const remaining: UserApiKeys = {};
        for (const [name, value] of Object.entries(currentKeys)) {
            if (!removed.includes(name)) remaining[name] = value;
        }
        const writeCount = (existing.writeCount || 0) + 1;
        store.users[normalizedOwner] = {
            ...existing,
            ...encryptKeys(remaining, key),
            keyCount: Object.keys(remaining).length,
            lastWriteAt: timestamp,
            writeCount,
            keyUpdatedAt: keyTimestamps(existing, Object.keys(remaining)),
        };
        store.updatedAt = timestamp;
        await writeStore(filePath, store);
        await audit({ event: 'remove', owner: normalizedOwner, keyCount: Object.keys(remaining).length, keys: removed, source: options.source ?? 'unknown' });
        return { ownerId: normalizedOwner, keyCount: Object.keys(remaining).length, writeCount, updatedAt: timestamp };
    });
}

/**
 * Which keys an owner holds and how old each is, without the values. This
 * is what the rotation policy is checked against; it is not a read of the
 * keys and is not audited as one.
 */
export async function describeUserApiKeys(ownerId: string, now = Date.now()): Promise<UserApiKeysDescription> {
    return queueWrite(async () => {
        const normalizedOwner = assertOwnerId(ownerId);
        const maxAgeDays = resolveMaxKeyAgeDays();
        const store = await readStore(resolveVaultFilePath());
        const record = store.users[normalizedOwner];
        if (!record) {
            return { ownerId: normalizedOwner, maxAgeDays, keys: [], readCount: 0, writeCount: 0 };
        }
        const names = Object.keys(decryptKeys(record, await getVaultKey())).sort();
        const timestamps = keyTimestamps(record, names);
        const keys = names.map((name) => {
            const updatedAt = timestamps[name];
            const ageDays = Math.max(0, Math.floor((now - Date.parse(updatedAt)) / DAY_MS));
            return { name, updatedAt, ageDays, stale: ageDays > maxAgeDays };
        });
        return {
            ownerId: normalizedOwner,
            maxAgeDays,
            keys,
            lastReadAt: record.lastReadAt,
            readCount: record.readCount || 0,
            writeCount: record.writeCount || 0,
        };
    });
}

export async function readUserVaultAudit(ownerId: string, limit = 100): Promise<VaultAuditEntry[]> {
    const normalizedOwner = assertOwnerId(ownerId);
    return readVaultAudit(resolveAuditFilePath(resolveVaultFilePath()), { owner: normalizedOwner, limit });
}

/**
 * Re-encrypt every record under a new vault secret.
 *
 * With a file-managed secret a new one is generated and written in place;
 * the old secret and the old store are kept as `*.previous` so a crash between
 * the two writes can be recovered by hand. With an env-managed secret the vault
 * cannot change what the operator set, so the caller must pass `nextSecret`,
 * and must then set `IMAGE_EXPRESS_KEY_VAULT_SECRET` to it before the next
 * read — the result echoes it back for that purpose.
 */
export async function rotateVaultSecret(
    options: VaultAccessOptions & { nextSecret?: string } = {},
): Promise<VaultSecretRotationResult> {
    return queueWrite(async () => {
        const filePath = resolveVaultFilePath();
        const secretFile = resolveSecretFilePath();
        const managedByEnv = envSecret() !== null;
        const nextSecret = options.nextSecret?.trim();
        if (managedByEnv && !nextSecret) {
            throw new Error('The vault secret is set by IMAGE_EXPRESS_KEY_VAULT_SECRET; pass the next secret to rotate it.');
        }
        if (nextSecret !== undefined && nextSecret.length < 32) {
            throw new Error('The next vault secret must be at least 32 characters.');
        }
        const currentKey = await getVaultKey();
        const store = await readStore(filePath);
        const secret = nextSecret ?? crypto.randomBytes(KEY_BYTE_LENGTH).toString('hex');
        const nextKey = deriveVaultKey(secret);
        const rotatedAt = nowIso();

        for (const [owner, record] of Object.entries(store.users)) {
            store.users[owner] = { ...record, ...encryptKeys(decryptKeys(record, currentKey), nextKey) };
        }
        store.updatedAt = rotatedAt;

        await fs.copyFile(filePath, `${filePath}.previous`).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error;
        });
        if (!managedByEnv) {
            await fs.copyFile(secretFile, `${secretFile}.previous`).catch((error: NodeJS.ErrnoException) => {
                if (error.code !== 'ENOENT') throw error;
            });
            await fs.writeFile(secretFile, `${secret}\n`, { encoding: 'utf8', mode: 0o600 });
        }
        await writeStore(filePath, store);
        const ownerCount = Object.keys(store.users).length;
        await audit({ event: 'rotate', owner: '*', keyCount: ownerCount, source: options.source ?? 'unknown' });
        return managedByEnv ? { rotatedAt, ownerCount, nextSecret: secret } : { rotatedAt, ownerCount };
    });
}
