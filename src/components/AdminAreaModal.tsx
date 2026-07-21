'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Loader2, RefreshCcw, ShieldCheck, UserCog, Users } from 'lucide-react';
import ModalShell from '@/components/ui/ModalShell';
import { useI18n } from '@/providers/I18nProvider';
import type { AuthUser } from '@/types';

interface AdminAreaModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId?: string;
    userRoles?: string[];
}

type AdminAction = 'approve' | 'reject' | 'disable' | 'enable' | 'set-roles' | 'set-rights' | 'set-display-name';
type AdminTab = 'users' | 'roles-rights';

// `key`, `roles` and `rights` are stored identifiers compared against the
// account record, so only the label/description keys are translated.
const ROLE_PRESETS = [
    {
        key: 'admin',
        labelKey: 'admin.preset.admin',
        roles: ['admin'],
        rights: ['users:approve', 'users:manage', 'roles:manage', 'rights:manage', 'password:reset'],
        descriptionKey: 'admin.preset.admin.desc'
    },
    {
        key: 'creator',
        labelKey: 'admin.preset.creator',
        roles: ['creator'],
        rights: ['assets:own', 'designs:own'],
        descriptionKey: 'admin.preset.creator.desc'
    },
    {
        key: 'reviewer',
        labelKey: 'admin.preset.reviewer',
        roles: ['reviewer'],
        rights: ['designs:review', 'assets:view'],
        descriptionKey: 'admin.preset.reviewer.desc'
    }
] as const;

function parseDraftList(value: string) {
    return value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

export default function AdminAreaModal({ isOpen, onClose, userId, userRoles }: AdminAreaModalProps) {
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState<AdminTab>('users');
    const [adminUsers, setAdminUsers] = useState<AuthUser[]>([]);
    const [isAdminUsersLoading, setIsAdminUsersLoading] = useState(false);
    const [adminError, setAdminError] = useState<string | null>(null);
    const [adminBusyUser, setAdminBusyUser] = useState<string | null>(null);
    const [adminDraftDisplayName, setAdminDraftDisplayName] = useState<Record<string, string>>({});
    const [adminDraftRoles, setAdminDraftRoles] = useState<Record<string, string>>({});
    const [adminDraftRights, setAdminDraftRights] = useState<Record<string, string>>({});

    const isAdmin = !!userRoles?.includes('admin') && !!userId && userId.includes('@');
    const hasAccess = !!isAdmin && !!userId && userId !== 'Guest';

    const loadAdminUsers = useCallback(async () => {
        if (!hasAccess || !userId) return;
        setIsAdminUsersLoading(true);
        setAdminError(null);
        try {
            const res = await fetch(`/api/user/admin/users?requesterEmail=${encodeURIComponent(userId)}`);
            const data = await res.json();
            if (!res.ok || !data.success) {
                setAdminError(data.message || t('admin.loadFailed'));
                setAdminUsers([]);
                return;
            }

            const users = (Array.isArray(data.users) ? data.users : []) as AuthUser[];
            setAdminUsers(users);
            setAdminDraftDisplayName(
                Object.fromEntries(users.map((user) => [user.email, user.displayName || user.email]))
            );
            setAdminDraftRoles(
                Object.fromEntries(users.map((user) => [user.email, (user.roles || []).join(', ')]))
            );
            setAdminDraftRights(
                Object.fromEntries(users.map((user) => [user.email, (user.rights || []).join(', ')]))
            );
        } catch (error) {
            console.error('Failed to load users', error);
            setAdminError(t('admin.loadFailed'));
            setAdminUsers([]);
        } finally {
            setIsAdminUsersLoading(false);
        }
    }, [hasAccess, userId, t]);

    const runAdminAction = useCallback(async (
        targetEmail: string,
        action: AdminAction,
        payload?: { roles?: string[]; rights?: string[]; displayName?: string },
        options?: { reload?: boolean }
    ) => {
        if (!hasAccess || !userId) return false;
        setAdminBusyUser(targetEmail);
        setAdminError(null);
        try {
            const res = await fetch('/api/user/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requesterEmail: userId,
                    targetEmail,
                    action,
                    ...(payload || {})
                })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setAdminError(data.message || t('admin.actionFailed'));
                return false;
            }
            if (options?.reload !== false) {
                await loadAdminUsers();
            }
            return true;
        } catch (error) {
            console.error('Admin action failed', error);
            setAdminError(t('admin.actionFailed'));
            return false;
        } finally {
            setAdminBusyUser(null);
        }
    }, [hasAccess, userId, loadAdminUsers, t]);

    useEffect(() => {
        if (!isOpen) return;
        if (!hasAccess) return;
        void loadAdminUsers();
    }, [isOpen, hasAccess, loadAdminUsers]);

    const allKnownRights = useMemo(() => {
        const rights = new Set<string>();
        adminUsers.forEach((user) => {
            (user.rights || []).forEach((right) => rights.add(right));
        });
        ROLE_PRESETS.forEach((preset) => {
            preset.rights.forEach((right) => rights.add(right));
        });
        return Array.from(rights).sort((a, b) => a.localeCompare(b));
    }, [adminUsers]);

    /**
     * Status comes from the account record, so the key is built at runtime.
     * translate() returns the key when it is unknown — fall back to the raw
     * status instead, so a status added server-side still reads as a word.
     */
    const statusLabel = (status: string) => {
        const key = `admin.status.${status}`;
        const label = t(key);
        return label === key ? status : label;
    };

    const applyPreset = async (email: string, presetKey: string) => {
        const preset = ROLE_PRESETS.find((item) => item.key === presetKey);
        if (!preset) return;
        setAdminDraftRoles((prev) => ({ ...prev, [email]: preset.roles.join(', ') }));
        setAdminDraftRights((prev) => ({ ...prev, [email]: preset.rights.join(', ') }));

        const rolesUpdated = await runAdminAction(email, 'set-roles', { roles: [...preset.roles] }, { reload: false });
        if (!rolesUpdated) return;
        await runAdminAction(email, 'set-rights', { rights: [...preset.rights] });
    };

    if (!isOpen) return null;

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={onClose}
            title={t('dashboard.adminArea')}
            icon={<ShieldCheck size={14} className="text-primary" />}
            initialWidth={1024}
            initialHeight={760}
            minWidth={520}
            minHeight={400}
            zIndex={95}
            bodyClassName="overflow-hidden flex flex-col"
        >
                {!hasAccess ? (
                    <div className="flex-1 flex items-center justify-center px-6">
                        <div className="max-w-md rounded-xl border border-destructive/40 bg-destructive/10 px-5 py-4 text-center">
                            <p className="font-semibold text-destructive">{t('admin.accessRequired')}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {t('admin.accessRequiredHint')}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 flex flex-col">
                        <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between">
                            <div className="flex items-center gap-2 rounded-lg bg-secondary/40 p-1 border border-border/60">
                                <button
                                    onClick={() => setActiveTab('users')}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                                        activeTab === 'users' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    <span className="inline-flex items-center gap-1.5">
                                        <Users size={13} />
                                        {t('admin.tab.users')}
                                    </span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('roles-rights')}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                                        activeTab === 'roles-rights' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    <span className="inline-flex items-center gap-1.5">
                                        <KeyRound size={13} />
                                        {t('admin.tab.rolesRights')}
                                    </span>
                                </button>
                            </div>
                            <button
                                onClick={() => void loadAdminUsers()}
                                className="h-8 px-3 text-xs font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5"
                                disabled={isAdminUsersLoading}
                            >
                                <RefreshCcw size={13} className={isAdminUsersLoading ? 'animate-spin' : ''} />
                                {t('common.refresh')}
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {adminError && (
                                <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                                    {adminError}
                                </div>
                            )}

                            {isAdminUsersLoading ? (
                                <div className="h-full min-h-56 flex items-center justify-center text-sm text-muted-foreground gap-2">
                                    <Loader2 size={16} className="animate-spin" />
                                    {t('admin.loadingUsers')}
                                </div>
                            ) : activeTab === 'users' ? (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                    {adminUsers.map((user) => {
                                        const busy = adminBusyUser === user.email;
                                        const isPending = user.status === 'pending';
                                        const isDisabled = user.status === 'disabled';
                                        const displayNameText = adminDraftDisplayName[user.email] ?? user.displayName;

                                        return (
                                            <div key={user.email} className="rounded-xl border border-border/70 bg-secondary/20 p-4 space-y-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold truncate">{user.displayName}</p>
                                                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                                    </div>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded ${
                                                        user.status === 'approved'
                                                            ? 'bg-emerald-500/15 text-emerald-600'
                                                            : user.status === 'pending'
                                                            ? 'bg-amber-500/15 text-amber-600'
                                                            : 'bg-red-500/15 text-red-600'
                                                    }`}>
                                                        {statusLabel(user.status)}
                                                    </span>
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('auth.displayName')}</label>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            value={displayNameText}
                                                            onChange={(event) => setAdminDraftDisplayName((prev) => ({ ...prev, [user.email]: event.target.value }))}
                                                            className="flex-1 h-8 px-2 rounded-md border border-border bg-background text-xs"
                                                            placeholder={t('admin.displayNamePlaceholder')}
                                                        />
                                                        <button
                                                            onClick={() => void runAdminAction(user.email, 'set-display-name', { displayName: displayNameText })}
                                                            disabled={busy}
                                                            className="h-8 px-2 rounded-md border border-border text-[11px] font-semibold hover:bg-secondary transition-colors"
                                                        >
                                                            {t('common.save')}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        onClick={() => void runAdminAction(user.email, isPending ? 'approve' : 'enable')}
                                                        disabled={busy}
                                                        className="h-8 text-[11px] font-semibold rounded border border-border hover:bg-secondary transition-colors"
                                                    >
                                                        {isPending ? t('admin.approve') : t('admin.enable')}
                                                    </button>
                                                    <button
                                                        onClick={() => void runAdminAction(user.email, isPending ? 'reject' : 'disable')}
                                                        disabled={busy}
                                                        className="h-8 text-[11px] font-semibold rounded border border-border hover:bg-secondary transition-colors"
                                                    >
                                                        {isPending ? t('admin.reject') : (isDisabled ? t('admin.disabled') : t('admin.disable'))}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    <div className="rounded-xl border border-border/70 bg-secondary/15 p-4">
                                        <h3 className="text-sm font-semibold flex items-center gap-2">
                                            <UserCog size={15} className="text-primary" />
                                            {t('admin.rolePresets')}
                                        </h3>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {t('admin.rolePresetsHint')}
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                            {ROLE_PRESETS.map((preset) => (
                                                <div key={preset.key} className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-2">
                                                    <p className="text-xs font-semibold">{t(preset.labelKey)}</p>
                                                    <p className="text-[11px] text-muted-foreground min-h-8">{t(preset.descriptionKey)}</p>
                                                    <p className="text-[10px] text-muted-foreground">
                                                        {t('admin.rolesLabel')} <span className="text-foreground">{preset.roles.join(', ')}</span>
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground">
                                                        {t('admin.rightsLabel')} <span className="text-foreground">{preset.rights.join(', ')}</span>
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-border/70 bg-secondary/15 p-4">
                                        <h3 className="text-sm font-semibold">{t('admin.rightsCatalog')}</h3>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {allKnownRights.length === 0 ? (
                                                <span className="text-xs text-muted-foreground">{t('admin.noRights')}</span>
                                            ) : (
                                                allKnownRights.map((right) => {
                                                    const assignedCount = adminUsers.filter((user) => (user.rights || []).includes(right)).length;
                                                    return (
                                                        <span
                                                            key={right}
                                                            className="text-[10px] px-2 py-1 rounded-full border border-border bg-background/70 text-muted-foreground"
                                                            title={t('admin.rightUserCount', { count: assignedCount })}
                                                        >
                                                            {right} ({assignedCount})
                                                        </span>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        {adminUsers.map((user) => {
                                            const busy = adminBusyUser === user.email;
                                            const rolesText = adminDraftRoles[user.email] ?? (user.roles || []).join(', ');
                                            const rightsText = adminDraftRights[user.email] ?? (user.rights || []).join(', ');

                                            return (
                                                <div key={`rr-${user.email}`} className="rounded-xl border border-border/70 bg-secondary/20 p-3 space-y-2">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-semibold truncate">{user.displayName}</p>
                                                            <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            {ROLE_PRESETS.map((preset) => (
                                                                <button
                                                                    key={`${user.email}-${preset.key}`}
                                                                    onClick={() => void applyPreset(user.email, preset.key)}
                                                                    disabled={busy}
                                                                    className="h-6 px-2 rounded border border-border text-[10px] hover:bg-secondary transition-colors"
                                                                    title={t('admin.applyPreset', { preset: t(preset.labelKey) })}
                                                                >
                                                                    {t(preset.labelKey)}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('admin.roles')}</label>
                                                            <input
                                                                value={rolesText}
                                                                onChange={(event) => setAdminDraftRoles((prev) => ({ ...prev, [user.email]: event.target.value }))}
                                                                className="w-full h-8 px-2 rounded-md border border-border bg-background text-[11px]"
                                                                placeholder="admin, creator" // i18n-ignore: role names are stored identifiers
                                                            />
                                                            <button
                                                                onClick={() => void runAdminAction(user.email, 'set-roles', { roles: parseDraftList(rolesText) })}
                                                                disabled={busy}
                                                                className="h-7 px-2 rounded border border-border text-[10px] font-semibold hover:bg-secondary transition-colors"
                                                            >
                                                                {t('admin.saveRoles')}
                                                            </button>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('admin.rights')}</label>
                                                            <input
                                                                value={rightsText}
                                                                onChange={(event) => setAdminDraftRights((prev) => ({ ...prev, [user.email]: event.target.value }))}
                                                                className="w-full h-8 px-2 rounded-md border border-border bg-background text-[11px]"
                                                                placeholder="users:manage, assets:own" // i18n-ignore: right names are stored identifiers
                                                            />
                                                            <button
                                                                onClick={() => void runAdminAction(user.email, 'set-rights', { rights: parseDraftList(rightsText) })}
                                                                disabled={busy}
                                                                className="h-7 px-2 rounded border border-border text-[10px] font-semibold hover:bg-secondary transition-colors"
                                                            >
                                                                {t('admin.saveRights')}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
        </ModalShell>
    );
}
