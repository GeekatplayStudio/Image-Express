'use client';

import { Key, Server } from 'lucide-react';

interface SettingsHeaderProps {
    syncStatus: 'local' | 'synced' | 'syncing';
    userId?: string;
    defaultGenerativeProvider: string;
    assetStorageMode: string;
    themeMode: string;
}

/** Top summary bar of the Settings window: title, sync status, quick stats. */
export default function SettingsHeader({ syncStatus, userId, defaultGenerativeProvider, assetStorageMode, themeMode }: SettingsHeaderProps) {
    return (
        <div className="shrink-0 border-b border-border/60 bg-card/95 px-5 py-5 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                        <Key size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">API Configurations</h2>
                        <div className="flex flex-col gap-1">
                            <p className="text-sm text-muted-foreground">Manage AI runtimes, cloud storage, and interface preferences in one workspace layout.</p>
                            {userId && userId !== 'Guest' && (
                                <span className={`text-[11px] flex items-center gap-1.5 ${syncStatus === 'synced' ? 'text-green-500' : 'text-amber-500'}`}>
                                    <Server size={11} />
                                    {syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'synced' ? 'Synced with Account' : 'Local Storage Only'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3 lg:max-w-xl lg:text-right">
                    <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Default AI</div>
                        <div className="text-sm font-semibold text-foreground capitalize">{defaultGenerativeProvider}</div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Storage</div>
                        <div className="text-sm font-semibold text-foreground capitalize">{assetStorageMode}</div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Theme</div>
                        <div className="text-sm font-semibold text-foreground capitalize">{themeMode}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
