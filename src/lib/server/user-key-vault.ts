import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';

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

const VAULT_ALGORITHM = 'aes-256-gcm';
const KEY_BYTE_LENGTH = 32;
const IV_BYTE_LENGTH = 12;

const STORE_DIR = path.join(process.cwd(), 'data');
const DEFAULT_VAULT_FILE = path.join(STORE_DIR, 'user-key-vault.json');
const DEFAULT_SECRET_FILE = path.join(STORE_DIR, 'user-key-vault.secret');

let writeQueue: Promise<void> = Promise.resolve();

function nowIso() {
    return new Date().toISOString();
}

function resolveVaultFilePath() {
    return process.env.IMAGE_EXPRESS_KEY_VAULT_FILE?.trim() || DEFAULT_VAULT_FILE;
}

function resolveSecretFilePath() {
    return process.env.IMAGE_EXPRESS_KEY_VAULT_SECRET_FILE?.trim() || DEFAULT_SECRET_FILE;
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

async function getVaultKey() {
    const envSecret = process.env.IMAGE_EXPRESS_KEY_VAULT_SECRET;
    if (envSecret && envSecret.trim()) {
        return deriveVaultKey(envSecret.trim());
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

export async function loadUserApiKeys(ownerId: string): Promise<UserApiKeys> {
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
        return keys;
    });
}

export async function mergeUserApiKeys(ownerId: string, keys: Record<string, unknown>): Promise<UserKeyVaultWriteResult> {
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

        store.users[normalizedOwner] = {
            ...encrypted,
            keyCount: Object.keys(merged).length,
            lastReadAt: existing?.lastReadAt,
            lastWriteAt: timestamp,
            readCount: existing?.readCount || 0,
            writeCount,
        };
        store.updatedAt = timestamp;
        await writeStore(filePath, store);

        return {
            ownerId: normalizedOwner,
            keyCount: Object.keys(merged).length,
            writeCount,
            updatedAt: timestamp,
        };
    });
}
