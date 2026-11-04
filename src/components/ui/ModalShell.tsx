'use client';

import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MODAL_LAYER_BASE } from '@/lib/zLayers';
import DraggableResizablePanel from '@/components/ui/DraggableResizablePanel';
import { useI18n } from '@/providers/I18nProvider';

// Stack of open modal shells so Escape only closes the topmost window,
// not every stacked window at once (e.g. Setup Wizard over Settings).
const openModalStack: Array<{ close: () => void }> = [];

/** Below this viewport width a window is a full-screen sheet: no drag, no resize. */
export const MODAL_SHEET_BREAKPOINT = 640;
const FRAME_STORAGE_PREFIX = 'image-express-modal-frame:';

type Frame = { position: { x: number; y: number }; size: { width: number; height: number } };

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
    /** Order among popup windows; offset into the modal tier (see zLayers.ts). */
    zIndex?: number;
    /** Extra classes for the scrollable body. */
    bodyClassName?: string;
    /** Optional fixed footer (rendered below the scroll area). */
    footer?: React.ReactNode;
    /** Close when the dimmed backdrop is clicked (default true). */
    closeOnBackdrop?: boolean;
    /** Close on Escape (default true). Off when the caller owns the key, e.g. through `useEscapeKey`. */
    closeOnEscape?: boolean;
    /** Extra header content rendered between title and close button. */
    headerExtras?: React.ReactNode;
    /**
     * Remember size and position across opens under this key (localStorage).
     * A remembered frame is still clamped to the current viewport.
     */
    persistKey?: string;
    /** Test id on the window element. */
    'data-testid'?: string;
    /** Accessible name of the close button; defaults to the generic "Close". */
    closeLabel?: string;
}

const readStoredFrame = (key: string): Frame | null => {
    try {
        const raw = window.localStorage.getItem(`${FRAME_STORAGE_PREFIX}${key}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<Frame>;
        const nums = [parsed.position?.x, parsed.position?.y, parsed.size?.width, parsed.size?.height];
        if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
        return parsed as Frame;
    } catch {
        return null;
    }
};

const writeStoredFrame = (key: string, frame: Frame) => {
    try {
        window.localStorage.setItem(`${FRAME_STORAGE_PREFIX}${key}`, JSON.stringify(frame));
    } catch {
        // storage full or disabled: the window simply opens centred next time
    }
};

/**
 * Uniform application window: draggable by its header, resizable from the
 * corner, double-click header to maximize, always clamped inside the
 * viewport, body scrolls, Esc and the X button close it.
 *
 * This is the standard shell for every modal window (Login, Profile,
 * Settings, Wizard, Admin, Documentation) so they all look and behave the
 * same as the Asset Library / 3D viewer panels.
 *
 * Contract (R-15): one size/position story for every window — a preferred
 * size shrunk to fit, optional memory of where the user left it, a full-screen
 * sheet on narrow viewports — and one keyboard story: the window takes focus
 * when it opens, Escape closes only the topmost, and focus returns to whatever
 * opened it.
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
    closeOnEscape = true,
    headerExtras,
    persistKey,
    'data-testid': testId,
    closeLabel,
}: ModalShellProps) {
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const titleId = useId();
    const windowRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const entry = { close: () => onCloseRef.current() };
        openModalStack.push(entry);
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || !closeOnEscape) return;
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
    }, [closeOnEscape, isOpen]);

    // Focus: take it on open so Escape and Tab start inside the window; give
    // it back to the opener on close so a keyboard user is not dropped at the
    // top of the document.
    useEffect(() => {
        if (!isOpen) return;
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const raf = requestAnimationFrame(() => {
            const root = windowRef.current;
            if (!root || root.contains(document.activeElement)) return;
            const autofocus = root.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
            (autofocus ?? root).focus({ preventScroll: true });
        });
        return () => {
            cancelAnimationFrame(raf);
            if (opener && opener.isConnected) opener.focus({ preventScroll: true });
        };
    }, [isOpen]);

    const isSheet = typeof window !== 'undefined' && window.innerWidth < MODAL_SHEET_BREAKPOINT;

    // Fit the requested (or remembered) size inside the workspace; centre it
    // unless a remembered position fits.
    const frame = useMemo<Frame>(() => {
        const viewportPadding = isSheet ? 0 : 16;
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
        if (isSheet) {
            return { size: { width: vw, height: vh }, position: { x: 0, y: 0 } };
        }
        const remembered = persistKey && typeof window !== 'undefined' ? readStoredFrame(persistKey) : null;
        const width = Math.min(remembered?.size.width ?? initialWidth, vw - viewportPadding * 2);
        const height = Math.min(remembered?.size.height ?? initialHeight, vh - viewportPadding * 2);
        const centred = {
            x: Math.max(viewportPadding, Math.round((vw - width) / 2)),
            y: Math.max(viewportPadding, Math.round((vh - height) / 2)),
        };
        const position = remembered
            ? {
                x: Math.min(Math.max(remembered.position.x, viewportPadding), Math.max(viewportPadding, vw - width - viewportPadding)),
                y: Math.min(Math.max(remembered.position.y, viewportPadding), Math.max(viewportPadding, vh - height - viewportPadding)),
            }
            : centred;
        return { size: { width, height }, position };
        // Recompute the frame each time the window is (re)opened.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialWidth, initialHeight, isOpen, isSheet, persistKey]);

    const handleFrameChange = useCallback((next: Frame & { maximized: boolean }) => {
        if (!persistKey || next.maximized) return;
        writeStoredFrame(persistKey, { position: next.position, size: next.size });
    }, [persistKey]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            style={{ zIndex: MODAL_LAYER_BASE + zIndex }}
            onMouseDown={(event) => {
                if (closeOnBackdrop && event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <DraggableResizablePanel
                key={`${frame.position.x}-${frame.position.y}-${frame.size.width}-${frame.size.height}`}
                className={cn(
                    'border border-border bg-card shadow-2xl overflow-hidden animate-in duration-200',
                    isSheet ? 'rounded-none fade-in' : 'rounded-xl zoom-in-95',
                )}
                initialPosition={frame.position}
                zIndex={MODAL_LAYER_BASE + zIndex + 1}
                initialSize={frame.size}
                minWidth={isSheet ? 0 : minWidth}
                minHeight={isSheet ? 0 : minHeight}
                draggable={!isSheet}
                resizeHandle={!isSheet}
                onFrameChange={handleFrameChange}
            >
                <div
                    ref={windowRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                    tabIndex={-1}
                    data-testid={testId}
                    data-sheet={isSheet ? 'true' : undefined}
                    className="flex h-full min-h-0 flex-col outline-none"
                >
                    <div className="h-11 shrink-0 px-3 border-b border-border flex items-center justify-between bg-secondary/10 draggable-handle cursor-move select-none">
                        <h2 id={titleId} className="font-semibold text-sm flex items-center gap-2 min-w-0">
                            {icon}
                            <span className="truncate">{title}</span>
                        </h2>
                        <div className="flex items-center gap-1">
                            {headerExtras}
                            <ModalCloseButton onClose={onClose} label={closeLabel} />
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
                </div>
            </DraggableResizablePanel>
        </div>
    );
}

function ModalCloseButton({ onClose, label }: { onClose: () => void; label?: string }) {
    const { t } = useI18n();
    const name = label ?? t('common.close');
    return (
        <button
            onClick={onClose}
            className="h-7 w-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            aria-label={name}
            title={name}
        >
            <X size={15} />
        </button>
    );
}
