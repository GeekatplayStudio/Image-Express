'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Cpu, Search, X } from 'lucide-react';
import useEscapeKey from '@/hooks/useEscapeKey';
import {
    TECHNOLOGY_GROUPS,
    matchesTechQuery,
    type TechEntry,
} from '@/features/about/technologyStack';

type TechnologyModalProps = {
    isOpen: boolean;
    onClose: () => void;
};

/**
 * Help → Technology: what the app is built on, how each piece is used, and why.
 *
 * Built to be *presented* — opened in front of someone and read aloud — so it
 * favours scannable structure over density: a contents rail that jumps to a
 * section, one card per technology with role and rationale separated, and a
 * filter that also searches the reasoning (typing "better-sqlite3" finds the
 * entry explaining why it was rejected).
 */
export default function TechnologyModal({ isOpen, onClose }: TechnologyModalProps) {
    const [query, setQuery] = useState('');
    useEscapeKey(onClose, { enabled: isOpen });

    const groups = useMemo(() => TECHNOLOGY_GROUPS
        .map((group) => ({
            ...group,
            entries: group.entries.filter((entry) => (
                matchesTechQuery({ ...entry, groupTitle: group.title }, query)
            )),
        }))
        // A section with nothing left would otherwise render as a heading over
        // empty space, which reads as a rendering fault rather than a filter.
        .filter((group) => group.entries.length > 0), [query]);

    const total = useMemo(
        () => TECHNOLOGY_GROUPS.reduce((sum, group) => sum + group.entries.length, 0),
        [],
    );
    const shown = groups.reduce((sum, group) => sum + group.entries.length, 0);

    /**
     * Portalled to <body> rather than rendered in place.
     *
     * This mounts inside the Help menu, and the app header uses backdrop-blur —
     * which makes it a containing block for `position: fixed`. Rendered in
     * place the dialog anchored to the header instead of the viewport and was
     * clipped off the top of the screen.
     *
     * No mount-effect guard is needed: `isOpen` starts false, so this never
     * renders during SSR or hydration — only after a click.
     */
    if (!isOpen || typeof document === 'undefined') return null;

    // z-2500 sits above the floating properties panel (80) and the tool
    // flyouts (2000), which otherwise paint straight through this dialog, and
    // below the ambient sprite bar at 9997 that is deliberately always on top.
    return createPortal((
        <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-card w-full max-w-5xl h-[86vh] rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <header className="px-5 py-3 border-b border-border bg-secondary/20 flex items-center gap-3 shrink-0">
                    <Cpu size={18} className="text-primary shrink-0" />
                    <div className="min-w-0">
                        <h2 className="font-semibold leading-tight">Technology</h2>
                        <p className="text-[11px] text-muted-foreground leading-tight">
                            What Image Express is built on, how each piece is used, and why it was chosen.
                        </p>
                    </div>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <div className="relative">
                            <Search
                                size={12}
                                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                            />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Filter…"
                                aria-label="Filter technologies"
                                className="h-7 w-40 rounded-md border border-border bg-background pl-6 pr-2 text-[11px]"
                            />
                        </div>
                        <button
                            onClick={onClose}
                            aria-label="Close"
                            className="p-1 hover:bg-secondary rounded-full transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </header>

                <div className="flex-1 min-h-0 flex">
                    <nav className="w-48 shrink-0 border-r border-border/60 overflow-y-auto py-3 hidden md:block">
                        {groups.map((group) => (
                            <a
                                key={group.id}
                                href={`#tech-${group.id}`}
                                className="block px-4 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                            >
                                {group.title}
                                <span className="ml-1 opacity-50">{group.entries.length}</span>
                            </a>
                        ))}
                    </nav>

                    <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4 space-y-7 scroll-smooth">
                        {groups.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Nothing matches “{query}”.
                            </p>
                        ) : groups.map((group) => (
                            <section key={group.id} id={`tech-${group.id}`} className="scroll-mt-4">
                                <h3 className="text-sm font-semibold">{group.title}</h3>
                                <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">{group.summary}</p>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {group.entries.map((entry) => (
                                        <TechCard key={`${group.id}:${entry.name}`} entry={entry} />
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                </div>

                <footer className="px-5 py-2 border-t border-border text-[10px] text-muted-foreground flex items-center justify-between shrink-0">
                    <span>
                        {shown === total
                            ? `${total} technologies`
                            : `${shown} of ${total} technologies`}
                    </span>
                    <span>Versions are checked against the app’s dependencies on every build.</span>
                </footer>
            </div>
        </div>
    ), document.body);
}

function TechCard({ entry }: { entry: TechEntry }) {
    return (
        <article className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="flex items-baseline gap-2 flex-wrap">
                <h4 className="text-[12px] font-semibold">{entry.name}</h4>
                {entry.version && (
                    <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-secondary text-muted-foreground">
                        v{entry.version}
                    </span>
                )}
            </div>
            <p className="text-[11px] text-foreground/80 mt-1.5 leading-relaxed">{entry.role}</p>
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                {/* Labelled, because the reasoning is the part worth reading and
                    it would otherwise blur into the description above it. */}
                <span className="font-semibold text-foreground/70">Why: </span>
                {entry.why}
            </p>
        </article>
    );
}
