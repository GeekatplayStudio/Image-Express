'use client';
// In-app folder picker for the browser build.
//
// A web page cannot open the OS folder dialog, and the File System Access API
// only ever yields an opaque handle — never a path, which is what the indexer
// needs. On a local install the server runs on the user's own machine, so it
// walks the filesystem on their behalf and returns real paths. That makes
// "Browse drive / folder" work at localhost without the desktop build.

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, CornerLeftUp, Folder, HardDrive, Loader2 } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import {
    browseVaultDirectory,
    listIndexableDrives,
    type VaultDirectoryEntry,
    type VaultDrive,
} from '@/features/asset-vault/application/client/watchRootClient';

type VaultFolderBrowserProps = {
    isOpen: boolean;
    onClose: () => void;
    onPick: (path: string) => void;
};

export default function VaultFolderBrowser({ isOpen, onClose, onPick }: VaultFolderBrowserProps) {
    const { t } = useI18n();
    const [drives, setDrives] = useState<VaultDrive[]>([]);
    const [current, setCurrent] = useState<string | null>(null);
    const [parent, setParent] = useState<string | null>(null);
    const [entries, setEntries] = useState<VaultDirectoryEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const openFolder = useCallback(async (target: string) => {
        setLoading(true);
        setError(null);
        try {
            const listing = await browseVaultDirectory(target);
            setCurrent(listing.path);
            setParent(listing.parent);
            setEntries(listing.entries);
        } catch (cause) {
            // Show the server's reason: "not authorised" and "unreadable" need
            // different responses from the user, so a generic message would
            // leave them guessing.
            setError(cause instanceof Error ? cause.message : t('vault.browseFailed'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    // Start at the drive list every time it opens, rather than wherever the
    // last visit ended — the previous folder is rarely the next one.
    useEffect(() => {
        if (!isOpen) return;
        setCurrent(null);
        setParent(null);
        setEntries([]);
        setError(null);
        void listIndexableDrives()
            .then((result) => {
                setDrives(result.drives);
                // A single allowlisted root is not a choice — open it.
                if (result.drives.length === 1) void openFolder(result.drives[0].path);
            })
            .catch(() => setDrives([]));
    }, [isOpen, openFolder]);

    if (!isOpen) return null;

    return (
                <div
            className="fixed inset-0 z-[150] flex items-center justify-center bg-background/70 backdrop-blur-sm"
            data-testid="vault-folder-browser"
        >
            <div className="w-[min(560px,92%)] max-h-[70%] flex flex-col rounded-lg border border-border bg-card shadow-2xl">
                <div className="flex items-center gap-2 px-3 h-10 border-b border-border shrink-0">
                    <Folder size={14} className="text-primary shrink-0" />
                    <span className="text-xs font-semibold shrink-0">{t('vault.browseDriveFolder')}</span>
                    <span className="text-[10px] text-muted-foreground font-mono truncate ml-1" title={current ?? ''}>
                        {current ?? t('vault.browsePickDrive')}
                    </span>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-2">
                    {error && (
                        <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5 mb-2">
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="text-[11px] text-muted-foreground inline-flex items-center gap-2 px-1 py-2">
                            <Loader2 size={13} className="animate-spin" /> {t('common.loading')}
                        </div>
                    ) : current === null ? (
                        drives.length === 0 ? (
                            <div className="text-[11px] text-muted-foreground px-1 py-2">
                                {t('vault.browseNoDrives')}
                            </div>
                        ) : (
                            drives.map((drive) => (
                                <button
                                    key={drive.path}
                                    type="button"
                                    onClick={() => void openFolder(drive.path)}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-secondary text-xs"
                                >
                                    <HardDrive size={13} className="text-muted-foreground shrink-0" />
                                    <span className="font-mono truncate">{drive.label}</span>
                                    <ChevronRight size={12} className="ml-auto opacity-50 shrink-0" />
                                </button>
                            ))
                        )
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => (parent ? void openFolder(parent) : setCurrent(null))}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-secondary text-xs text-muted-foreground"
                                data-testid="vault-folder-browser-up"
                            >
                                <CornerLeftUp size={13} className="shrink-0" />
                                {t('vault.browseUp')}
                            </button>
                            {entries.length === 0 && !error && (
                                <div className="text-[11px] text-muted-foreground px-2 py-2">
                                    {t('vault.browseEmptyFolder')}
                                </div>
                            )}
                            {entries.map((entry) => (
                                <button
                                    key={entry.path}
                                    type="button"
                                    onClick={() => void openFolder(entry.path)}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-secondary text-xs"
                                >
                                    <Folder size={13} className="text-muted-foreground shrink-0" />
                                    <span className="truncate">{entry.name}</span>
                                    <ChevronRight size={12} className="ml-auto opacity-50 shrink-0" />
                                </button>
                            ))}
                        </>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 px-3 h-12 border-t border-border shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-secondary rounded-md"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={() => { if (current) { onPick(current); onClose(); } }}
                        disabled={!current}
                        className="px-3 py-1.5 text-[11px] font-semibold bg-primary text-primary-foreground rounded-md disabled:opacity-40"
                        data-testid="vault-folder-browser-choose"
                    >
                        {t('vault.browseUseThisFolder')}
                    </button>
                </div>
            </div>
        </div>
    );
}
