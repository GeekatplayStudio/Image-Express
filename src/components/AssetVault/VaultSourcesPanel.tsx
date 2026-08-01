'use client';

import { useCallback, useEffect, useState } from 'react';
import { Cloud, FolderOpen, HardDrive, Loader2, Network, RefreshCw, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/I18nProvider';
import { useDialog } from '@/providers/DialogProvider';
import type { WatchRoot } from '@/features/asset-vault/contracts/watchRoot';
import {
    createWatchRootId,
    deleteWatchRoot,
    listWatchRoots,
    pickWatchFolderInteractive,
    saveWatchRoot,
    scanWatchRoot,
} from '@/features/asset-vault/application/client/watchRootClient';

type VaultSourcesPanelProps = {
    onIndexed?: () => void;
    onClose: () => void;
};

function inferConnector(path: string): WatchRoot['connector'] {
    const trimmed = path.trim();
    if (trimmed.startsWith('\\\\') || trimmed.startsWith('//')) return 'network';
    return 'local';
}

export default function VaultSourcesPanel({ onIndexed, onClose }: VaultSourcesPanelProps) {
    const { t } = useI18n();
    const dialog = useDialog();
    const [roots, setRoots] = useState<WatchRoot[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [manualPath, setManualPath] = useState('');
    const [showAdvancedPath, setShowAdvancedPath] = useState(false);
    const canNativeBrowse = typeof window !== 'undefined' && Boolean(window.desktop?.pickWatchRootFolder);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            setRoots(await listWatchRoots());
        } catch (error) {
            console.error(error);
            setRoots([]);
        } finally {
            setLoading(false);
        }
    }, []);

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
            connector: inferConnector(trimmed),
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
            await saveWatchRoot(root);
            const scanned = await scanWatchRoot(root.id, true);
            setRoots(await listWatchRoots());
            setManualPath('');
            onIndexed?.();
            await dialog.alert(
                t('vault.watchRootIndexedBody', { count: scanned.fileCount, name: root.label }),
                { title: t('vault.watchRootIndexed') },
            );
        } catch (error) {
            console.error(error);
            await dialog.alert(t('vault.watchRootFailed'), { title: t('vault.watchRootsTitle') });
        } finally {
            setBusyId(null);
        }
    };

    const handleBrowse = async () => {
        const result = await pickWatchFolderInteractive();
        if (result.path) {
            await addPath(result.path);
            return;
        }
        if (result.reason === 'unsupported') {
            setShowAdvancedPath(true);
            await dialog.alert(t('vault.browseDesktopRequired'), { title: t('vault.browseDriveFolder') });
        }
    };

    const handleScan = async (root: WatchRoot) => {
        setBusyId(root.id);
        try {
            const scanned = await scanWatchRoot(root.id, true);
            setRoots(await listWatchRoots());
            onIndexed?.();
            await dialog.alert(
                t('vault.watchRootIndexedBody', { count: scanned.fileCount, name: root.label }),
                { title: t('vault.watchRootIndexed') },
            );
        } catch (error) {
            console.error(error);
            await dialog.alert(t('vault.watchRootFailed'), { title: t('vault.watchRootsTitle') });
        } finally {
            setBusyId(null);
        }
    };

    const handleRemove = async (root: WatchRoot) => {
        const ok = await dialog.confirm(t('vault.removeSourceConfirm', { name: root.label }), {
            title: t('vault.removeSourceTitle'),
            confirmText: t('common.delete'),
            cancelText: t('common.cancel'),
        });
        if (!ok) return;
        setBusyId(root.id);
        try {
            setRoots(await deleteWatchRoot(root.id));
            onIndexed?.();
        } catch (error) {
            console.error(error);
            await dialog.alert(t('vault.watchRootFailed'), { title: t('vault.watchRootsTitle') });
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div
            className="border-b border-border bg-secondary/10 px-2 py-2 space-y-2 shrink-0"
            data-testid="vault-sources-panel"
        >
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold inline-flex items-center gap-1.5">
                        <HardDrive size={12} className="text-primary" />
                        {t('vault.sourcesTitle')}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-snug">
                        {t('vault.sourcesBrowseHint')}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="h-6 w-6 rounded inline-flex items-center justify-center text-muted-foreground hover:bg-secondary"
                    aria-label={t('common.close')}
                >
                    <X size={12} />
                </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
                <button
                    type="button"
                    onClick={() => void handleBrowse()}
                    disabled={Boolean(busyId)}
                    className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                    {busyId ? <Loader2 size={12} className="animate-spin" /> : <FolderOpen size={12} />}
                    {t('vault.browseDriveFolder')}
                </button>
                <span className="h-8 px-2 rounded-md border border-border text-[10px] inline-flex items-center gap-1 text-muted-foreground">
                    <Network size={11} />
                    {t('vault.sourceNetworkHint')}
                </span>
                <span className="h-8 px-2 rounded-md border border-border text-[10px] inline-flex items-center gap-1 text-muted-foreground">
                    <Cloud size={11} />
                    {t('vault.sourceCloudHint')}
                </span>
            </div>

            {!canNativeBrowse && (
                <p className="text-[10px] text-amber-700 dark:text-amber-300">{t('vault.browseDesktopRequired')}</p>
            )}

            <button
                type="button"
                onClick={() => setShowAdvancedPath((prev) => !prev)}
                className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
                {showAdvancedPath ? t('vault.hideAdvancedPath') : t('vault.showAdvancedPath')}
            </button>

            {showAdvancedPath && (
                <div className="flex gap-1.5">
                    <input
                        value={manualPath}
                        onChange={(event) => setManualPath(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') void addPath(manualPath);
                        }}
                        placeholder={t('vault.watchRootPathPlaceholder')}
                        className="flex-1 h-7 px-2 rounded-md bg-background border border-border text-[10px] font-mono"
                    />
                    <button
                        type="button"
                        onClick={() => void addPath(manualPath)}
                        disabled={!manualPath.trim() || Boolean(busyId)}
                        className="h-7 px-2 rounded-md border border-border text-[10px] font-semibold hover:bg-secondary disabled:opacity-50"
                    >
                        {t('vault.addPath')}
                    </button>
                </div>
            )}

            {loading ? (
                <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1.5">
                    <Loader2 size={11} className="animate-spin" /> {t('common.loading')}
                </div>
            ) : roots.length === 0 ? (
                <p className="text-[10px] text-muted-foreground px-1 py-1">{t('vault.watchRootsEmptyBrowse')}</p>
            ) : (
                <ul className="max-h-28 overflow-y-auto space-y-1">
                    {roots.map((root) => (
                        <li
                            key={root.id}
                            className={cn(
                                'flex items-center gap-1.5 rounded-md border border-border/50 bg-background/60 px-1.5 py-1',
                            )}
                        >
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-medium truncate">
                                    {root.connector === 'network'
                                        ? <Network size={10} className="inline mr-1 opacity-70" />
                                        : <HardDrive size={10} className="inline mr-1 opacity-70" />}
                                    {root.label}
                                </p>
                                <p className="text-[9px] text-muted-foreground font-mono truncate">{root.rootUri}</p>
                            </div>
                            <span className="text-[9px] text-muted-foreground shrink-0">
                                {typeof root.estimatedFileCount === 'number' ? root.estimatedFileCount : '—'}
                            </span>
                            <button
                                type="button"
                                onClick={() => void handleScan(root)}
                                disabled={busyId === root.id}
                                className="h-6 px-1.5 rounded border border-border text-[9px] hover:bg-secondary inline-flex items-center gap-1 disabled:opacity-50"
                                title={t('vault.reindex')}
                            >
                                {busyId === root.id ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                                {t('vault.reindex')}
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleRemove(root)}
                                disabled={busyId === root.id}
                                className="h-6 w-6 rounded border border-border text-destructive hover:bg-destructive/10 inline-flex items-center justify-center disabled:opacity-50"
                                aria-label={t('common.delete')}
                            >
                                <Trash2 size={10} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
