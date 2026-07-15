'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AuthUser } from '@/types';

/** Admin-only user approval/role/rights management. */
export function useAdminUsersSettings(isOpen: boolean, isAdmin: boolean, userId?: string) {
    const [adminUsers, setAdminUsers] = useState<AuthUser[]>([]);
    const [isAdminUsersLoading, setIsAdminUsersLoading] = useState(false);
    const [adminError, setAdminError] = useState<string | null>(null);
    const [adminDraftRoles, setAdminDraftRoles] = useState<Record<string, string>>({});
    const [adminDraftRights, setAdminDraftRights] = useState<Record<string, string>>({});
    const [adminBusyUser, setAdminBusyUser] = useState<string | null>(null);

    const loadAdminUsers = useCallback(async () => {
        if (!isAdmin || !userId || userId === 'Guest') return;
        setIsAdminUsersLoading(true);
        setAdminError(null);
        try {
            const res = await fetch(`/api/user/admin/users?requesterEmail=${encodeURIComponent(userId)}`);
            const data = await res.json();
            if (!res.ok || !data.success) {
                setAdminError(data.message || 'Failed to load users.');
                setAdminUsers([]);
                return;
            }
            const users = (Array.isArray(data.users) ? data.users : []) as AuthUser[];
            setAdminUsers(users);
            setAdminDraftRoles(Object.fromEntries(users.map((user) => [user.email, (user.roles || []).join(', ')])));
            setAdminDraftRights(Object.fromEntries(users.map((user) => [user.email, (user.rights || []).join(', ')])));
        } catch (error) {
            console.error('Failed to load admin users', error);
            setAdminError('Failed to load users.');
            setAdminUsers([]);
        } finally {
            setIsAdminUsersLoading(false);
        }
    }, [isAdmin, userId]);

    useEffect(() => {
        if (!isOpen) return;
        if (!isAdmin || !userId || userId === 'Guest') return;
        void loadAdminUsers();
    }, [isOpen, isAdmin, userId, loadAdminUsers]);

    const executeAdminAction = useCallback(async (
        targetEmail: string,
        action: 'approve' | 'reject' | 'disable' | 'enable' | 'set-roles' | 'set-rights',
        payload?: { roles?: string[]; rights?: string[] },
    ) => {
        if (!userId || userId === 'Guest') return;
        setAdminBusyUser(targetEmail);
        setAdminError(null);
        try {
            const res = await fetch('/api/user/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requesterEmail: userId, targetEmail, action, ...(payload || {}) }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setAdminError(data.message || 'Admin action failed.');
                return;
            }
            await loadAdminUsers();
        } catch (error) {
            console.error('Admin action failed', error);
            setAdminError('Admin action failed.');
        } finally {
            setAdminBusyUser(null);
        }
    }, [loadAdminUsers, userId]);

    return {
        adminUsers,
        isAdminUsersLoading,
        adminError,
        adminDraftRoles, setAdminDraftRoles,
        adminDraftRights, setAdminDraftRights,
        adminBusyUser,
        loadAdminUsers,
        executeAdminAction,
    };
}

export type AdminUsersSettings = ReturnType<typeof useAdminUsersSettings>;
