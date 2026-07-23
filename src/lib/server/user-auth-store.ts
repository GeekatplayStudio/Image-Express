import path from 'path';
import { promises as fs } from 'fs';
import {
    createPasswordHash,
    normalizeEmail,
    createOneTimeToken,
    hashPassword
} from '@/lib/server/auth-utils';
import { getDataDir } from '@/lib/server/appPaths';
import { getRuntimeProfile } from '@/lib/server/runtimeProfile';

export type UserStatus = 'pending' | 'approved' | 'rejected' | 'disabled';

export interface ManagedUser {
    id: string;
    email: string;
    username?: string;
    displayName: string;
    passwordHash: string;
    passwordSalt: string;
    status: UserStatus;
    roles: string[];
    rights: string[];
    createdAt: string;
    updatedAt: string;
    approvedAt?: string;
    approvedBy?: string;
    resetTokenHash?: string;
    resetTokenExpiresAt?: string;
}

interface UserStore {
    version: 1;
    users: ManagedUser[];
    updatedAt: string;
}

const STORE_DIR = getDataDir();
const STORE_FILE = path.join(STORE_DIR, 'users.json');

const ADMIN_DEFAULT_EMAIL = normalizeEmail(process.env.IMAGE_EXPRESS_ADMIN_EMAIL || 'admin@local');
const ADMIN_DEFAULT_USERNAME = (process.env.IMAGE_EXPRESS_ADMIN_USERNAME || 'admin').trim();
const ADMIN_DEFAULT_PASSWORD = process.env.IMAGE_EXPRESS_ADMIN_PASSWORD || 'admin';
// Optional extra seed user: only created when explicitly configured via env.
const DEFAULT_MEMBER_EMAIL = normalizeEmail(process.env.IMAGE_EXPRESS_DEFAULT_USER_EMAIL || '');
const DEFAULT_MEMBER_USERNAME = (process.env.IMAGE_EXPRESS_DEFAULT_USER_USERNAME || '').trim();
const DEFAULT_MEMBER_PASSWORD = process.env.IMAGE_EXPRESS_DEFAULT_USER_PASSWORD || '';
const DEFAULT_MEMBER_DISPLAY_NAME = (process.env.IMAGE_EXPRESS_DEFAULT_USER_DISPLAY_NAME || '').trim();

const ADMIN_RIGHTS = ['users:approve', 'users:manage', 'roles:manage', 'rights:manage', 'password:reset'];
const DEFAULT_MEMBER_RIGHTS = ['assets:own', 'designs:own'];

function nowIso() {
    return new Date().toISOString();
}

function baseStore(): UserStore {
    return { version: 1, users: [], updatedAt: nowIso() };
}

function sanitizeForStore(store: UserStore): UserStore {
    return {
        version: 1,
        users: Array.isArray(store.users) ? store.users : [],
        updatedAt: store.updatedAt || nowIso()
    };
}

async function ensureStoreDir() {
    await fs.mkdir(STORE_DIR, { recursive: true });
}

async function readStore(): Promise<UserStore> {
    try {
        const raw = await fs.readFile(STORE_FILE, 'utf8');
        const parsed = JSON.parse(raw) as UserStore;
        return sanitizeForStore(parsed);
    } catch (error) {
        const nodeErr = error as NodeJS.ErrnoException;
        if (nodeErr.code === 'ENOENT') {
            return baseStore();
        }
        throw error;
    }
}

async function writeStore(store: UserStore) {
    await ensureStoreDir();
    await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function createAdminSeedUser(): ManagedUser {
    const timestamp = nowIso();
    const { salt, hash } = createPasswordHash(ADMIN_DEFAULT_PASSWORD);
    return {
        id: `usr_${Date.now().toString(36)}_admin`,
        email: ADMIN_DEFAULT_EMAIL,
        username: ADMIN_DEFAULT_USERNAME,
        displayName: ADMIN_DEFAULT_USERNAME,
        passwordHash: hash,
        passwordSalt: salt,
        status: 'approved',
        roles: ['admin'],
        rights: [...ADMIN_RIGHTS],
        createdAt: timestamp,
        updatedAt: timestamp,
        approvedAt: timestamp,
        approvedBy: ADMIN_DEFAULT_EMAIL
    };
}

function createDefaultMemberSeedUser(): ManagedUser {
    const timestamp = nowIso();
    const { salt, hash } = createPasswordHash(DEFAULT_MEMBER_PASSWORD);
    return {
        id: `usr_${Date.now().toString(36)}_member`,
        email: DEFAULT_MEMBER_EMAIL,
        username: DEFAULT_MEMBER_USERNAME || DEFAULT_MEMBER_EMAIL,
        displayName: DEFAULT_MEMBER_DISPLAY_NAME || DEFAULT_MEMBER_EMAIL,
        passwordHash: hash,
        passwordSalt: salt,
        status: 'approved',
        roles: ['creator'],
        rights: [...DEFAULT_MEMBER_RIGHTS],
        createdAt: timestamp,
        updatedAt: timestamp,
        approvedAt: timestamp,
        approvedBy: ADMIN_DEFAULT_EMAIL
    };
}

async function ensureSeedUsers(store: UserStore) {
    if (
        getRuntimeProfile() === 'self-hosted'
        && (!process.env.IMAGE_EXPRESS_ADMIN_PASSWORD || ADMIN_DEFAULT_PASSWORD === 'admin')
    ) {
        throw new Error('IMAGE_EXPRESS_ADMIN_PASSWORD must be set to a non-default value in self-hosted mode.');
    }
    let changed = false;
    const users = [...store.users];

    const adminIndex = users.findIndex((user) => user.email === ADMIN_DEFAULT_EMAIL);
    if (adminIndex < 0) {
        users.push(createAdminSeedUser());
        changed = true;
    } else {
        const existingAdmin = users[adminIndex];
        const nextRoles = Array.from(new Set([...(existingAdmin.roles || []), 'admin']));
        const nextRights = Array.from(new Set([...(existingAdmin.rights || []), ...ADMIN_RIGHTS]));
        const needsAdminPatch = (
            existingAdmin.status !== 'approved' ||
            nextRoles.length !== (existingAdmin.roles || []).length ||
            nextRights.length !== (existingAdmin.rights || []).length
        );
        if (needsAdminPatch) {
            users[adminIndex] = {
                ...existingAdmin,
                status: 'approved',
                roles: nextRoles,
                rights: nextRights,
                approvedAt: existingAdmin.approvedAt || nowIso(),
                approvedBy: existingAdmin.approvedBy || ADMIN_DEFAULT_EMAIL
            };
            changed = true;
        }
    }

    const memberIndex = DEFAULT_MEMBER_EMAIL && DEFAULT_MEMBER_PASSWORD
        ? users.findIndex((user) => user.email === DEFAULT_MEMBER_EMAIL)
        : -2;
    if (memberIndex === -1) {
        users.push(createDefaultMemberSeedUser());
        changed = true;
    } else if (memberIndex >= 0) {
        const existingMember = users[memberIndex];
        const nextRoles = Array.from(new Set([...(existingMember.roles || []), 'creator']));
        const nextRights = Array.from(new Set([...(existingMember.rights || []), ...DEFAULT_MEMBER_RIGHTS]));
        const needsMemberPatch = (
            existingMember.status !== 'approved' ||
            nextRoles.length !== (existingMember.roles || []).length ||
            nextRights.length !== (existingMember.rights || []).length
        );
        if (needsMemberPatch) {
            users[memberIndex] = {
                ...existingMember,
                status: 'approved',
                roles: nextRoles,
                rights: nextRights,
                approvedAt: existingMember.approvedAt || nowIso(),
                approvedBy: existingMember.approvedBy || ADMIN_DEFAULT_EMAIL
            };
            changed = true;
        }
    }

    if (!changed) {
        return store;
    }

    const seeded = { ...store, users, updatedAt: nowIso() };
    await writeStore(seeded);
    return seeded;
}

export async function loadUsers() {
    const store = await readStore();
    return ensureSeedUsers(store);
}

export async function saveUsers(users: ManagedUser[]) {
    const store: UserStore = { version: 1, users, updatedAt: nowIso() };
    await writeStore(store);
}

export function toPublicUser(user: ManagedUser) {
    return {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        status: user.status,
        roles: user.roles,
        rights: user.rights,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        approvedAt: user.approvedAt,
        approvedBy: user.approvedBy
    };
}

export function isAdminUser(user: ManagedUser | undefined | null) {
    if (!user) return false;
    return user.roles.includes('admin') || user.rights.includes('users:manage');
}

export function findUserByIdentifier(users: ManagedUser[], identifier: string) {
    const key = identifier.trim().toLowerCase();
    return users.find((user) => user.email === key || user.username?.toLowerCase() === key);
}

export async function createPendingUser(params: {
    email: string;
    displayName: string;
    password: string;
}) {
    const { email, displayName, password } = params;
    const normalizedEmail = normalizeEmail(email);
    const trimmedDisplayName = displayName.trim();
    const store = await loadUsers();
    const existing = store.users.find((user) => user.email === normalizedEmail);
    if (existing) {
        return { ok: false as const, reason: 'exists', user: existing };
    }

    const { salt, hash } = createPasswordHash(password);
    const timestamp = nowIso();
    const localPart = normalizedEmail.split('@')[0] || 'user';
    const username = localPart.replace(/[^a-z0-9._-]/gi, '').slice(0, 40) || undefined;
    const user: ManagedUser = {
        id: `usr_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6).toString(36)}`,
        email: normalizedEmail,
        username,
        displayName: trimmedDisplayName || normalizedEmail,
        passwordHash: hash,
        passwordSalt: salt,
        status: 'pending',
        roles: ['creator'],
        rights: ['assets:own', 'designs:own'],
        createdAt: timestamp,
        updatedAt: timestamp
    };

    const nextUsers = [...store.users, user];
    await saveUsers(nextUsers);
    return { ok: true as const, user };
}

export async function updateUser(email: string, updater: (user: ManagedUser) => ManagedUser | null) {
    const normalized = normalizeEmail(email);
    const store = await loadUsers();
    const index = store.users.findIndex((user) => user.email === normalized);
    if (index < 0) return null;
    const current = store.users[index];
    const updated = updater(current);
    if (!updated) return null;
    const users = [...store.users];
    users[index] = { ...updated, email: normalizeEmail(updated.email), updatedAt: nowIso() };
    await saveUsers(users);
    return users[index];
}

export async function setResetToken(email: string, expiresInMinutes = 30) {
    const token = createOneTimeToken();
    const tokenHash = hashPassword(token, `reset:${normalizeEmail(email)}`);
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000).toISOString();

    const updated = await updateUser(email, (user) => ({
        ...user,
        resetTokenHash: tokenHash,
        resetTokenExpiresAt: expiresAt
    }));

    if (!updated) return null;
    return { token, expiresAt, user: updated };
}

export function verifyResetToken(user: ManagedUser, token: string) {
    if (!user.resetTokenHash || !user.resetTokenExpiresAt) return false;
    if (Date.parse(user.resetTokenExpiresAt) < Date.now()) return false;
    const computed = hashPassword(token, `reset:${user.email}`);
    return computed === user.resetTokenHash;
}

export async function clearResetToken(email: string) {
    return updateUser(email, (user) => ({
        ...user,
        resetTokenHash: undefined,
        resetTokenExpiresAt: undefined
    }));
}

export async function changePassword(email: string, newPassword: string) {
    const { salt, hash } = createPasswordHash(newPassword);
    return updateUser(email, (user) => ({
        ...user,
        passwordSalt: salt,
        passwordHash: hash,
        resetTokenHash: undefined,
        resetTokenExpiresAt: undefined
    }));
}
