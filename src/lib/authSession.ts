'use client';

import type { AuthUser } from '@/types';

const USER_STORAGE_KEY = 'image-express-user';

export function loadStoredAuthUser(): AuthUser | null {
    if (typeof window === 'undefined') return null;

    const raw = window.localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as Partial<AuthUser>;
        if (!parsed || typeof parsed !== 'object' || typeof parsed.email !== 'string') {
            return null;
        }
        return parsed as AuthUser;
    } catch {
        return null;
    }
}

export function loadSessionToken() {
    const user = loadStoredAuthUser();
    const token = user?.sessionToken;
    return typeof token === 'string' && token.trim().length > 0 ? token.trim() : null;
}

export function buildSessionAuthorizationHeader() {
    const token = loadSessionToken();
    return token ? `Bearer ${token}` : null;
}