import React, { useState } from 'react';
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

/**
 * The three levels of the stack — pages, albums, bookshelves — as bars that
 * collapse upward. Pages sit on top and open by default: returning users are
 * almost always continuing the page they left, not reorganising shelves.
 */
export default function StackAccordion({ shelves }: { shelves: StackShelf[] }) {
    const [open, setOpen] = useState<Record<string, boolean>>(() => {
        const fallback = { [shelves[0]?.id ?? 'pages']: true };
        if (typeof window === 'undefined') return fallback;
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (!saved) return fallback;
        try {
            const parsed = JSON.parse(saved) as Record<string, boolean>;
            return parsed && typeof parsed === 'object' ? parsed : fallback;
        } catch {
            // A corrupt preference is not worth surfacing; the default stands.
            return fallback;
        }
    });

    const toggle = (id: string) => {
        setOpen((prev) => {
            const next = { ...prev, [id]: !prev[id] };
            if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
        });
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
