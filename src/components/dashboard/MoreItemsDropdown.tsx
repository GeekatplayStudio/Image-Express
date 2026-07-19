'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';

type MoreItemsDropdownProps<T> = {
    /** Fully-resolved, already-translated label. Callers interpolate any
     *  counts via t('key', { count }) rather than passing a raw template. */
    label: string;
    items: T[];
    getId: (item: T) => string;
    getName: (item: T) => string;
    getThumbnail: (item: T) => string | undefined;
    getSubtitle?: (item: T) => string;
    onOpen: (item: T) => void;
    onDelete: (item: T, event: React.MouseEvent) => void;
    deleteTitle: string;
};

/**
 * A compact "N more" button that reveals the rest of a list in a scrollable
 * popover instead of growing the grid inline — keeps the dashboard readable
 * even with thousands of saved items, since only this trigger (not every
 * item) renders until the user opens it.
 */
export default function MoreItemsDropdown<T>({
    label,
    items,
    getId,
    getName,
    getThumbnail,
    getSubtitle,
    onOpen,
    onDelete,
    deleteTitle,
}: MoreItemsDropdownProps<T>) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    if (items.length === 0) return null;

    return (
        <div ref={containerRef} className="relative inline-block">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="bg-background border border-border rounded-full px-4 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex items-center gap-2 shadow-sm"
            >
                {label}
                <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>
            {open && (
                <div className="absolute z-20 mt-2 w-72 max-h-80 overflow-y-auto rounded-xl border border-border bg-card shadow-lg py-1">
                    {items.map((item) => {
                        const id = getId(item);
                        const thumb = getThumbnail(item);
                        return (
                            <div
                                key={id}
                                onClick={() => { setOpen(false); onOpen(item); }}
                                className="group flex items-center gap-2 px-3 py-2 hover:bg-secondary/60 cursor-pointer"
                            >
                                <div className="w-8 h-8 shrink-0 rounded-md bg-secondary/40 overflow-hidden flex items-center justify-center">
                                    {thumb ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={thumb} alt={getName(item)} className="w-full h-full object-cover" />
                                    ) : null}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium truncate">{getName(item)}</p>
                                    {getSubtitle && (
                                        <p className="text-[10px] text-muted-foreground truncate">{getSubtitle(item)}</p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onDelete(item, e); }}
                                    className="shrink-0 text-muted-foreground hover:text-destructive p-1 rounded-full hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                                    title={deleteTitle}
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
