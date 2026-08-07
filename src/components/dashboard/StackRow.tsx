import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';

export type StackItem = {
    id: string;
    title: string;
    subtitle?: string;
    thumbnail?: string | null;
    /** Draws the card with the "you are here" ring. */
    active?: boolean;
    /** Tailwind gradient stops for the face shown when there is no thumbnail. */
    accent: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    onOpen: () => void;
    onDelete?: (e: React.MouseEvent) => void;
    deleteTitle?: string;
    testId?: string;
};

const CARD_WIDTH = 208;
const CARD_GAP = 16;

/**
 * A plain horizontal strip of cards: native scrolling, left-drag to pan,
 * arrows on the sides and a thin bar underneath. The scroll handler only
 * moves the bar's thumb through the DOM — it deliberately holds no React
 * state, so scrolling never triggers a render.
 */
export default function StackRow({ items, emptyLabel }: { items: StackItem[]; emptyLabel: string }) {
    const { t } = useI18n();
    const trackRef = useRef<HTMLDivElement | null>(null);
    const thumbRef = useRef<HTMLDivElement | null>(null);
    const [scrollable, setScrollable] = useState(false);
    // Set while a drag is in flight so the click it ends with does not also
    // open whichever card happened to be under the cursor.
    const dragRef = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null);
    const [dragging, setDragging] = useState(false);

    const syncThumb = useCallback(() => {
        const track = trackRef.current;
        const thumb = thumbRef.current;
        if (!track) return;
        const max = track.scrollWidth - track.clientWidth;
        const canScroll = max > 4;
        setScrollable((prev) => (prev === canScroll ? prev : canScroll));
        if (!thumb) return;
        const ratio = max > 0 ? Math.min(1, Math.max(0, track.scrollLeft / max)) : 0;
        // The thumb is a quarter of the bar, so a full scroll moves it 300%.
        thumb.style.transform = `translateX(${ratio * 300}%)`;
    }, []);

    useEffect(() => {
        const track = trackRef.current;
        if (!track) return;
        track.addEventListener('scroll', syncThumb, { passive: true });
        const observer = new ResizeObserver(syncThumb);
        observer.observe(track);
        syncThumb();
        return () => {
            track.removeEventListener('scroll', syncThumb);
            observer.disconnect();
        };
    }, [syncThumb, items.length]);

    const step = (direction: -1 | 1) => {
        trackRef.current?.scrollBy({ left: direction * (CARD_WIDTH + CARD_GAP) * 2, behavior: 'smooth' });
    };

    const onPointerDown = (e: React.PointerEvent) => {
        const track = trackRef.current;
        if (!track || e.button !== 0) return;
        dragRef.current = { startX: e.clientX, startScroll: track.scrollLeft, moved: false };
        setDragging(true);
        track.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent) => {
        const drag = dragRef.current;
        const track = trackRef.current;
        if (!drag || !track) return;
        const dx = e.clientX - drag.startX;
        if (Math.abs(dx) > 4) drag.moved = true;
        track.scrollLeft = drag.startScroll - dx;
    };

    const endDrag = (e: React.PointerEvent) => {
        const track = trackRef.current;
        if (track?.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId);
        setDragging(false);
        // Keep `moved` readable through the click that follows this pointerup.
        const drag = dragRef.current;
        if (drag?.moved) window.setTimeout(() => { dragRef.current = null; }, 0);
        else dragRef.current = null;
    };

    const scrubTo = (clientX: number, element: HTMLElement) => {
        const track = trackRef.current;
        if (!track) return;
        const rect = element.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        track.scrollLeft = ratio * (track.scrollWidth - track.clientWidth);
    };

    if (items.length === 0) {
        return (
            <div className="mx-4 mb-4 rounded-2xl border border-dashed border-border/70 bg-secondary/20 py-10 text-center text-sm text-muted-foreground">
                {emptyLabel}
            </div>
        );
    }

    return (
        <div className="relative pb-4">
            {scrollable && (
                <>
                    <button
                        type="button"
                        onClick={() => step(-1)}
                        aria-label={t('stackRow.previous')}
                        className="absolute left-1 top-[42%] z-20 -translate-y-1/2 rounded-full border border-border/60 bg-background/90 p-2 text-foreground shadow-md backdrop-blur hover:bg-background"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <button
                        type="button"
                        onClick={() => step(1)}
                        aria-label={t('stackRow.next')}
                        className="absolute right-1 top-[42%] z-20 -translate-y-1/2 rounded-full border border-border/60 bg-background/90 p-2 text-foreground shadow-md backdrop-blur hover:bg-background"
                    >
                        <ChevronRight size={18} />
                    </button>
                </>
            )}

            <div
                ref={trackRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className={`no-scrollbar flex gap-4 overflow-x-auto overscroll-x-contain px-12 py-4 ${dragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
            >
                {items.map((item) => (
                    <div
                        key={item.id}
                        data-testid={item.testId}
                        onClick={() => { if (!dragRef.current?.moved) item.onOpen(); }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.onOpen(); }
                        }}
                        role="button"
                        tabIndex={0}
                        title={item.title}
                        style={{ width: CARD_WIDTH }}
                        className={`group shrink-0 overflow-hidden rounded-xl border bg-card shadow-sm outline-none hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary ${
                            item.active ? 'border-primary/60 ring-1 ring-primary/40' : 'border-border/60'
                        }`}
                    >
                        <div className={`flex aspect-[4/3] items-center justify-center overflow-hidden bg-gradient-to-br ${item.accent}`}>
                            {item.thumbnail ? (
                                // Thumbnails are data: URLs rendered from the canvas, which the
                                // Next image optimizer cannot take.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.thumbnail} alt={item.title} draggable={false} className="h-full w-full object-cover" />
                            ) : (
                                <item.icon size={36} className="text-white/80" />
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-2 px-3 py-2">
                            <div className="min-w-0">
                                <h3 className="truncate text-sm font-semibold text-foreground">{item.title}</h3>
                                {item.subtitle && <p className="truncate text-[11px] text-muted-foreground">{item.subtitle}</p>}
                            </div>
                            {item.onDelete && (
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); item.onDelete?.(e); }}
                                    title={item.deleteTitle}
                                    className="shrink-0 rounded-full p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {scrollable && (
                /* A drag affordance layered on native scrolling; the arrows and
                   keyboard already cover this row for assistive tech. */
                <div
                    aria-hidden
                    onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        scrubTo(e.clientX, e.currentTarget);
                    }}
                    onPointerMove={(e) => {
                        if (e.currentTarget.hasPointerCapture(e.pointerId)) scrubTo(e.clientX, e.currentTarget);
                    }}
                    onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
                    className="mx-12 h-1.5 cursor-pointer rounded-full bg-secondary"
                >
                    <div ref={thumbRef} className="h-full w-1/4 rounded-full bg-muted-foreground/50" />
                </div>
            )}
        </div>
    );
}
