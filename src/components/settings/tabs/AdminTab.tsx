'use client';

import { RefreshCcw, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import type { AdminUsersSettings } from '../hooks/useAdminUsersSettings';
import { modalSectionClass } from '../settingsTypes';

interface AdminTabProps {
    admin: AdminUsersSettings;
}

const parseDraftList = (value: string) =>
    value.split(',').map((item) => item.trim()).filter((item) => item.length > 0);

/** Admin tab: user approval queue, role assignment, and rights management. */
export default function AdminTab({ admin }: AdminTabProps) {
    const { t } = useI18n();
    const {
        adminUsers, isAdminUsersLoading, adminError, adminDraftRoles, setAdminDraftRoles,
        adminDraftRights, setAdminDraftRights, adminBusyUser, loadAdminUsers, executeAdminAction,
    } = admin;

    return (
        <section className={`${modalSectionClass} xl:col-span-12`}>
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                        <ShieldCheck size={16} className="text-primary" />
                        {t('settings.admin.userManagement')}
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                        {t('settings.admin.hint')}
                    </p>
                </div>
                <button
                    onClick={() => void loadAdminUsers()}
                    className="px-3 py-1.5 text-[11px] font-semibold border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-1"
                    disabled={isAdminUsersLoading}
                >
                    <RefreshCcw size={14} className={isAdminUsersLoading ? 'animate-spin' : ''} />
                    {t('common.refresh')}
                </button>
            </div>

            {adminError && (
                <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                    {adminError}
                </div>
            )}

            {isAdminUsersLoading ? (
                <div className="text-xs text-muted-foreground">{t('settings.admin.loadingUsers')}</div>
            ) : (
                <div className="grid gap-3 xl:grid-cols-2">
                    {adminUsers.map((user) => {
                        const busy = adminBusyUser === user.email;
                        const rolesText = adminDraftRoles[user.email] ?? (user.roles || []).join(', ');
                        const rightsText = adminDraftRights[user.email] ?? (user.rights || []).join(', ');
                        const isPending = user.status === 'pending';
                        const isDisabled = user.status === 'disabled';

                        return (
                            <div key={user.email} className="rounded-xl border border-border/60 bg-secondary/20 p-3 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-foreground truncate">{user.displayName}</p>
                                        <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                                    </div>
                                    <span className={`text-[10px] px-2 py-0.5 rounded ${user.status === 'approved'
                                            ? 'bg-emerald-500/15 text-emerald-600'
                                            : user.status === 'pending'
                                                ? 'bg-amber-500/15 text-amber-600'
                                                : 'bg-red-500/15 text-red-600'
                                        }`}>
                                        {(() => {
                                            const key = `admin.status.${user.status}`;
                                            const label = t(key);
                                            return label === key ? user.status : label;
                                        })()}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => void executeAdminAction(user.email, isPending ? 'approve' : 'enable')}
                                        disabled={busy}
                                        className="h-8 text-[11px] font-semibold rounded border border-border hover:bg-secondary transition-colors"
                                    >
                                        {isPending ? t('admin.approve') : t('admin.enable')}
                                    </button>
                                    <button
                                        onClick={() => void executeAdminAction(user.email, isPending ? 'reject' : 'disable')}
                                        disabled={busy}
                                        className="h-8 text-[11px] font-semibold rounded border border-border hover:bg-secondary transition-colors"
                                    >
                                        {isPending ? t('admin.reject') : (isDisabled ? t('admin.disabled') : t('admin.disable'))}
                                    </button>
                                </div>

                                <div className="grid gap-3 lg:grid-cols-2">
                                    <div className="space-y-1">
                                        <label className="text-[10px] uppercase text-muted-foreground">{t('admin.roles')}</label>
                                        <input
                                            value={rolesText}
                                            onChange={(e) => setAdminDraftRoles((prev) => ({ ...prev, [user.email]: e.target.value }))}
                                            className="w-full h-8 px-2 rounded-md bg-background border border-border text-[11px]"
                                            placeholder="admin, creator" // i18n-ignore: role names are stored identifiers
                                        />
                                        <button
                                            onClick={() => void executeAdminAction(user.email, 'set-roles', { roles: parseDraftList(rolesText) })}
                                            disabled={busy}
                                            className="h-7 px-2 text-[10px] font-semibold rounded border border-border hover:bg-secondary transition-colors"
                                        >
                                            {t('admin.saveRoles')}
                                        </button>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] uppercase text-muted-foreground">{t('admin.rights')}</label>
                                        <input
                                            value={rightsText}
                                            onChange={(e) => setAdminDraftRights((prev) => ({ ...prev, [user.email]: e.target.value }))}
                                            className="w-full h-8 px-2 rounded-md bg-background border border-border text-[11px]"
                                            placeholder="users:manage, assets:own" // i18n-ignore: right names are stored identifiers
                                        />
                                        <button
                                            onClick={() => void executeAdminAction(user.email, 'set-rights', { rights: parseDraftList(rightsText) })}
                                            disabled={busy}
                                            className="h-7 px-2 text-[10px] font-semibold rounded border border-border hover:bg-secondary transition-colors"
                                        >
                                            {t('admin.saveRights')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
