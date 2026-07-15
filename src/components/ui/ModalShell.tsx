'use client';

import { useEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import DraggableResizablePanel from '@/components/ui/DraggableResizablePanel';
import { useI18n } from '@/providers/I18nProvider';

// Stack of open modal shells so Escape only closes the topmost window,
// not every stacked window at once (e.g. Setup Wizard over Settings).
const openModalStack: Array<{ close: () => void }> = [];

interface ModalShellProps {
    isOpen: boolean;
    onClose: () => void;
    /** Header title (already translated). */
    title: React.ReactNode;
    /** Optional icon rendered before the title. */
    icon?: React.ReactNode;
    children: React.ReactNode;
    /** Preferred size; automatically shrunk to fit the workspace. */
    initialWidth?: number;
    initialHeight?: number;
    minWidth?: number;
    minHeight?: number;
    /** Overlay z-index (panel renders above it). */
    zIndex?: number;
    /** Extra classes for the scrollable body. */
    bodyClassName?: string;
    /** Optional fixed footer (rendered below the scroll area). */
    footer?: React.ReactNode;
    /** Close when the dimmed backdrop is clicked (default true). */
    closeOnBackdrop?: boolean;
    /** Extra header content rendered between title and close button. */
    headerExtras?: React.ReactNode;
}

/**
 * Uniform application window: draggable by its header, resizable from the
 * corner, double-click header to maximize, always clamped inside the
 * viewport, body scrolls, Esc and the X button close it.
 *
 * This is the standard shell for every modal window (Login, Profile,
 * Settings, Wizard, Admin, Documentation) so they all look and behave the
 * same as the Asset Library / 3D viewer panels.
 */
export default function ModalShell({
    isOpen,
    onClose,
    title,
    icon,
    children,
    initialWidth = 640,
    initialHeight = 560,
    minWidth = 360,
    minHeight = 280,
    zIndex = 100,
    bodyClassName,
    footer,
    closeOnBackdrop = true,
    headerExtras,
}: ModalShellProps) {
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!isOpen) return;
        const entry = { close: () => onCloseRef.current() };
        openModalStack.push(entry);
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (openModalStack[openModalStack.length - 1] !== entry) return;
            event.preventDefault();
            entry.close();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            const index = openModalStack.indexOf(entry);
            if (index >= 0) openModalStack.splice(index, 1);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    // Fit the requested size inside the workspace and center the window.
    const frame = useMemo(() => {
        const viewportPadding = 16;
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
        const width = Math.min(initialWidth, vw - viewportPadding * 2);
        const height = Math.min(initialHeight, vh - viewportPadding * 2);
        return {
            size: { width, height },
            position: {
                x: Math.max(viewportPadding, Math.round((vw - width) / 2)),
                y: Math.max(viewportPadding, Math.round((vh - height) / 2)),
            },
        };
        // Recompute the centered frame each time the window is (re)opened.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialWidth, initialHeight, isOpen]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            style={{ zIndex }}
            onMouseDown={(event) => {
                if (closeOnBackdrop && event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <DraggableResizablePanel
                key={`${frame.position.x}-${frame.position.y}-${frame.size.width}-${frame.size.height}`}
                className="rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                initialPosition={frame.position}
                initialSize={frame.size}
                minWidth={minWidth}
                minHeight={minHeight}
            >
                <div className="h-11 shrink-0 px-3 border-b border-border flex items-center justify-between bg-secondary/10 draggable-handle cursor-move select-none">
                    <h2 className="font-semibold text-sm flex items-center gap-2 min-w-0">
                        {icon}
                        <span className="truncate">{title}</span>
                    </h2>
                    <div className="flex items-center gap-1">
                        {headerExtras}
                        <ModalCloseButton onClose={onClose} />
                    </div>
                </div>
                <div className={cn('flex-1 min-h-0 overflow-y-auto', bodyClassName)}>
                    {children}
                </div>
                {footer && (
                    <div className="shrink-0 border-t border-border bg-secondary/5">
                        {footer}
                    </div>
                )}
            </DraggableResizablePanel>
        </div>
    );
}

function ModalCloseButton({ onClose }: { onClose: () => void }) {
    const { t } = useI18n();
    return (
        <button
            onClick={onClose}
            className="h-7 w-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            aria-label={t('common.close')}
            title={t('common.close')}
        >
            <X size={15} />
        </button>
    );
}
