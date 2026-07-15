'use client';

import type { SettingsTabId } from './settingsTypes';

export interface SettingsTabMeta {
    id: SettingsTabId;
    label: string;
    shortLabel: string;
    description: string;
    badge: string;
}

interface SettingsTabsNavProps {
    tabs: SettingsTabMeta[];
    activeTab: SettingsTabId;
    activeTabMeta: SettingsTabMeta;
    onSelect: (id: SettingsTabId) => void;
}

/** Sticky tab-selector strip plus the active tab's description banner. */
export default function SettingsTabsNav({ tabs, activeTab, activeTabMeta, onSelect }: SettingsTabsNavProps) {
    return (
        <div className="sticky top-0 z-20 -mx-3 border-b border-border/60 bg-card/95 px-3 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="flex gap-2 overflow-x-auto pb-1">
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            id={`settings-tab-${tab.id}`}
                            aria-controls={`settings-panel-${tab.id}`}
                            aria-selected={isActive}
                            onClick={() => onSelect(tab.id)}
                            className={`min-w-40 rounded-2xl border px-3 py-2 text-left transition-colors sm:min-w-44 ${isActive ? 'border-primary bg-primary/10 text-foreground shadow-sm' : 'border-border/60 bg-background/80 text-muted-foreground hover:bg-secondary'}`}
                        >
                            <div className="text-xs font-semibold">
                                <span className="sm:hidden">{tab.shortLabel}</span>
                                <span className="hidden sm:inline">{tab.label}</span>
                            </div>
                            <div className="mt-1 text-[10px] leading-4 opacity-80">{tab.badge}</div>
                        </button>
                    );
                })}
            </div>

            <div className="mt-3 rounded-2xl border border-border/60 bg-background/70 px-3 py-3 sm:flex sm:items-start sm:justify-between sm:gap-4">
                <div>
                    <div className="text-sm font-semibold text-foreground">{activeTabMeta.label}</div>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{activeTabMeta.description}</p>
                </div>
                <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:mt-0 sm:pt-1">
                    {activeTabMeta.badge}
                </div>
            </div>
        </div>
    );
}
