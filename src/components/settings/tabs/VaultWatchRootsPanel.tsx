'use client';

import { useCallback, useEffect, useState } from 'react';
import { FolderPlus, HardDrive, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import { useToast } from '@/providers/ToastProvider';
import type { WatchRoot } from '@/features/asset-vault/contracts/watchRoot';
import {
    createWatchRootId,
    deleteWatchRoot,
    listWatchRoots,
    pickDesktopWatchFolder,
    saveWatchRoot,
    scanWatchRoot,
} from '@/features/asset-vault/application/client/watchRootClient';
import { modalSectionClass } from '../settingsTypes';

export default function VaultWatchRootsPanel() {
    const { t } = useI18n();
    const { toast } = useToast();
    const [roots, setRoots] = useState<WatchRoot[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [manualPath, setManualPath] = useState('');
    const isDesktop = typeof window !== 'undefined' && Boolean(window.desktop?.pickWatchRootFolder);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            setRoots(await listWatchRoots());
        } catch (error) {
            console.error(error);
            toast({ title: t('vault.watchRootsLoadFailed'), variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [t, toast]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const addPath = async (rootUri: string, label?: string) => {
        const trimmed = rootUri.trim();
        if (!trimmed) return;
        const now = new Date().toISOString();
        const root: WatchRoot = {
            id: createWatchRootId(),
            label: label || trimmed.split(/[/\\]/).filter(Boolean).pop() || trimmed,
            rootUri: trimmed,
            connector: trimmed.startsWith('\\\\') ? 'network' : 'local',
            enabled: true,
            recursive: true,
            includeGlobs: [],
            excludeGlobs: [],
            lastScanStatus: 'idle',
            createdAt: now,
            updatedAt: now,
        };
        setBusyId(root.id);
        try {
            const next = await saveWatchRoot(root);
            setRoots(next);
            const scanned = await scanWatchRoot(root.id, true);
            toast({
                title: t('vault.watchRootIndexed'),
                description: t('vault.watchRootIndexedBody', { count: scanned.fileCount, name: root.label }),
            });
            setRoots(await listWatchRoots());
            setManualPath('');
        } catch (error) {
            console.error(error);
            toast({ title: t('vault.watchRootFailed'), variant: 'destructive' });
        } finally {
            setBusyId(null);
        }
    };

    const handlePick = async () => {
        const picked = await pickDesktopWatchFolder();
        if (picked) {
            await addPath(picked);
            return;
        }
        if (!isDesktop) {
            toast({ title: t('vault.browseDesktopRequired'), variant: 'destructive' });
        }
    };

    const handleScan = async (root: WatchRoot) => {
        setBusyId(root.id);
        try {
            const scanned = await scanWatchRoot(root.id, true);
            toast({
                title: t('vault.watchRootIndexed'),
                description: t('vault.watchRootIndexedBody', { count: scanned.fileCount, name: root.label }),
            });
            setRoots(await listWatchRoots());
        } catch (error) {
            console.error(error);
            toast({ title: t('vault.watchRootFailed'), variant: 'destructive' });
        } finally {
            setBusyId(null);
        }
    };

    const handleRemove = async (root: WatchRoot) => {
        setBusyId(root.id);
        try {
            setRoots(await deleteWatchRoot(root.id));
        } catch (error) {
            console.error(error);
            toast({ title: t('vault.watchRootFailed'), variant: 'destructive' });
        } finally {
            setBusyId(null);
        }
    };

    return (
        <section className={`${modalSectionClass} xl:col-span-12`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                        <HardDrive size={16} className="text-primary" />
                        {t('vault.watchRootsTitle')}
                    </h4>
                    <p className="text-[11px] text-muted-foreground max-w-2xl">
                        {t('vault.watchRootsHint')}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => void handlePick()}
                        className="px-3 py-1.5 text-[11px] font-semibold bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
                    >
                        <FolderPlus size={14} />
                        {t('vault.browseDriveFolder')}
                    </button>
                    <button
                        type="button"
                        onClick={() => void refresh()}
                        className="px-2 py-1.5 text-[11px] border border-border rounded-md hover:bg-secondary"
                        title={t('common.refresh')}
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            <div className="flex gap-2">
                <input
                    value={manualPath}
                    onChange={(event) => setManualPath(event.target.value)}
                    placeholder={t('vault.watchRootPathPlaceholder')}
                    className="flex-1 h-9 px-3 rounded-md bg-background border border-border text-xs font-mono"
                />
                <button
                    type="button"
                    onClick={() => void addPath(manualPath)}
                    disabled={!manualPath.trim() || Boolean(busyId)}
                    className="px-3 h-9 text-[11px] font-semibold bg-primary text-primary-foreground rounded-md disabled:opacity-50"
                >
                    {t('vault.addPath')}
                </button>
            </div>

            {loading ? (
                <div className="text-[11px] text-muted-foreground inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> {t('common.loading')}
                </div>
            ) : roots.length === 0 ? (
                <div className="text-[11px] text-muted-foreground bg-secondary/20 border border-border/40 rounded-md px-3 py-2">
                    {t('vault.watchRootsEmpty')}
                </div>
            ) : (
                <div className="space-y-2">
                    {roots.map((root) => (
                        <div
                            key={root.id}
                            className="flex items-center gap-2 border border-border/60 rounded-md px-3 py-2 bg-secondary/10"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold truncate">{root.label}</p>
                                <p className="text-[10px] text-muted-foreground font-mono truncate">{root.rootUri}</p>
                                <p className="text-[10px] text-muted-foreground">
                                    {root.lastScanStatus || 'idle'}
                                    {typeof root.estimatedFileCount === 'number' ? ` · ${root.estimatedFileCount} files` : ''}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => void handleScan(root)}
                                disabled={busyId === root.id}
                                className="h-8 px-2 rounded-md border border-border text-[11px] hover:bg-secondary inline-flex items-center gap-1"
                            >
                                {busyId === root.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                {t('vault.reindex')}
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleRemove(root)}
                                disabled={busyId === root.id}
                                className="h-8 w-8 rounded-md border border-border text-destructive hover:bg-destructive/10 inline-flex items-center justify-center"
                                title={t('common.delete')}
                            >
                                <Trash2 size={13} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
