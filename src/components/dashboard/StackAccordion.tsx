import React, { useMemo, useSyncExternalStore } from 'react';
import { ChevronDown } from 'lucide-react';
import StackRow, { type StackItem } from '@/components/dashboard/StackRow';

export type StackShelf = {
    id: string;
    title: string;
    /** Shown next to the title — "12 pages", "3 albums", ... */
    count: string;
    hint: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    /** Tailwind gradient stops for the header rail and glow. */
    accent: string;
    items: StackItem[];
    emptyLabel: string;
};

const STORAGE_KEY = 'dashboard.stackAccordion';
/** localStorage writes don't fire `storage` in the tab that made them. */
const OPEN_CHANGED_EVENT = 'dashboard:stack-accordion-changed';

/** Pages open, the rest collapsed — the shape the server always renders. */
const DEFAULT_OPEN: Record<string, boolean> = { pages: true };

// Read through useSyncExternalStore rather than a useState initializer: the
// initializer runs during the client's first render, so a stored preference
// that disagrees with the server markup fails hydration, and React then
// regenerates the whole tree on the client — which also re-creates the inline
// <head> scripts in the root layout and logs "Encountered a script tag while
// rendering React component". getServerSnapshot keeps hydration on the default
// and the stored value is applied in the render right after.
const subscribeToStoredOpen = (onChange: () => void) => {
    window.addEventListener('storage', onChange);
    window.addEventListener(OPEN_CHANGED_EVENT, onChange);
    return () => {
        window.removeEventListener('storage', onChange);
        window.removeEventListener(OPEN_CHANGED_EVENT, onChange);
    };
};

// The snapshot is the raw string, so it stays referentially stable between
// reads; parsing happens downstream in a memo.
const getStoredOpen = () => window.localStorage.getItem(STORAGE_KEY) ?? '';
const getServerStoredOpen = () => '';

const parseStoredOpen = (raw: string): Record<string, boolean> => {
    if (!raw) return DEFAULT_OPEN;
    try {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        return parsed && typeof parsed === 'object' ? parsed : DEFAULT_OPEN;
    } catch {
        // A corrupt preference is not worth surfacing; the default stands.
        return DEFAULT_OPEN;
    }
};

/**
 * The three levels of the stack — pages, albums, bookshelves — as bars that
 * collapse upward. Pages sit on top and open by default: returning users are
 * almost always continuing the page they left, not reorganising shelves.
 */
export default function StackAccordion({ shelves }: { shelves: StackShelf[] }) {
    const storedOpen = useSyncExternalStore(subscribeToStoredOpen, getStoredOpen, getServerStoredOpen);
    const open = useMemo(() => parseStoredOpen(storedOpen), [storedOpen]);

    const toggle = (id: string) => {
        const next = { ...open, [id]: !open[id] };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(OPEN_CHANGED_EVENT));
    };

    return (
        <section className="space-y-3">
            {shelves.map((shelf) => {
                const expanded = Boolean(open[shelf.id]);
                return (
                    <div
                        key={shelf.id}
                        className={`overflow-hidden rounded-2xl border bg-card/40 ${
                            expanded ? 'border-border/70' : 'border-border/40 hover:border-border/70'
                        }`}
                    >
                        <button
                            type="button"
                            onClick={() => toggle(shelf.id)}
                            aria-expanded={expanded}
                            data-testid={`stack-shelf-${shelf.id}`}
                            className="relative flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-secondary/30"
                        >
                            {/* Colour rail identifying the level at a glance. */}
                            <span className={`absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b ${shelf.accent}`} />
                            <span className={`relative rounded-xl bg-gradient-to-br ${shelf.accent} p-2.5 text-white`}>
                                <shelf.icon size={20} />
                            </span>
                            <span className="relative min-w-0 flex-1">
                                <span className="flex items-baseline gap-3">
                                    <span className="text-lg font-bold tracking-tight text-foreground">{shelf.title}</span>
                                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                                        {shelf.count}
                                    </span>
                                </span>
                                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{shelf.hint}</span>
                            </span>
                            <ChevronDown
                                size={20}
                                className={`relative shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {/* 0fr → 1fr keeps the collapse animated without hard-coding a height. */}
                        <div
                            className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                                expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                            }`}
                        >
                            <div className="min-h-0 overflow-hidden">
                                {expanded && <StackRow items={shelf.items} emptyLabel={shelf.emptyLabel} />}
                            </div>
                        </div>
                    </div>
                );
            })}
        </section>
    );
}
