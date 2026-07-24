'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import useIsClient from '@/hooks/useIsClient';

interface PanelPosition {
    x: number;
    y: number;
}

interface PanelSize {
    width: number;
    height: number;
}

interface DraggableResizablePanelProps {
    children: React.ReactNode;
    className?: string;
    initialPosition?: PanelPosition;
    initialSize?: PanelSize;
    minWidth?: number;
    minHeight?: number;
    handleSelector?: string;
    resizeHandle?: boolean;
}

export default function DraggableResizablePanel({
    children,
    className,
    initialPosition = { x: 80, y: 140 },
    initialSize = { width: 320, height: 520 },
    minWidth = 260,
    minHeight = 320,
    handleSelector = '.draggable-handle',
    resizeHandle = true
}: DraggableResizablePanelProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewportPadding = 8;
    const [position, setPosition] = useState<PanelPosition>(initialPosition);
    const [size, setSize] = useState<PanelSize>(initialSize);
    const [isMaximized, setIsMaximized] = useState(false);
    const restoreFrameRef = useRef<{ position: PanelPosition; size: PanelSize } | null>(null);
    const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number; dragging: boolean }>({
        startX: 0,
        startY: 0,
        originX: 0,
        originY: 0,
        dragging: false
    });
    const resizeState = useRef<{ startX: number; startY: number; originW: number; originH: number; resizing: boolean }>({
        startX: 0,
        startY: 0,
        originW: 0,
        originH: 0,
        resizing: false
    });

    // Render through a portal to <body> so the panel escapes any ancestor
    // stacking context (e.g. the toolbar's z-20 aside). Without this, a fixed
    // z-[100] panel nested in a lower-z stacking context is trapped beneath the
    // editor header and rails no matter how high its own z-index is.
    const isClient = useIsClient();

    const clampFrameToViewport = useCallback((nextPosition: PanelPosition, nextSize: PanelSize) => {
        if (typeof window === 'undefined') {
            return { position: nextPosition, size: nextSize };
        }

        const maxWidth = Math.max(minWidth, window.innerWidth - (viewportPadding * 2));
        const maxHeight = Math.max(minHeight, window.innerHeight - (viewportPadding * 2));
        const clampedSize: PanelSize = {
            width: Math.min(nextSize.width, maxWidth),
            height: Math.min(nextSize.height, maxHeight),
        };

        const minX = viewportPadding;
        const minY = viewportPadding;
        const maxX = Math.max(minX, window.innerWidth - clampedSize.width - viewportPadding);
        const maxY = Math.max(minY, window.innerHeight - clampedSize.height - viewportPadding);

        return {
            position: {
                x: Math.min(Math.max(nextPosition.x, minX), maxX),
                y: Math.min(Math.max(nextPosition.y, minY), maxY),
            },
            size: clampedSize,
        };
    }, [minHeight, minWidth]);

    const maximizePanel = () => {
        if (typeof window === 'undefined') return;
        restoreFrameRef.current = { position, size };
        setIsMaximized(true);
        setPosition({ x: viewportPadding, y: viewportPadding });
        setSize({
            width: Math.max(minWidth, window.innerWidth - (viewportPadding * 2)),
            height: Math.max(minHeight, window.innerHeight - (viewportPadding * 2)),
        });
    };

    const restorePanel = () => {
        setIsMaximized(false);
        const fallback = { position: initialPosition, size: initialSize };
        const restoreFrame = restoreFrameRef.current || fallback;
        const clamped = clampFrameToViewport(restoreFrame.position, restoreFrame.size);
        setPosition(clamped.position);
        setSize(clamped.size);
    };

    const toggleMaximizePanel = () => {
        if (isMaximized) {
            restorePanel();
            return;
        }
        maximizePanel();
    };

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            if (dragState.current.dragging) {
                const dx = event.clientX - dragState.current.startX;
                const dy = event.clientY - dragState.current.startY;
                const clamped = clampFrameToViewport({
                    x: dragState.current.originX + dx,
                    y: dragState.current.originY + dy
                }, size);
                setPosition(clamped.position);
            }
            if (resizeState.current.resizing) {
                const dx = event.clientX - resizeState.current.startX;
                const dy = event.clientY - resizeState.current.startY;
                const clamped = clampFrameToViewport(position, {
                    width: Math.max(minWidth, resizeState.current.originW + dx),
                    height: Math.max(minHeight, resizeState.current.originH + dy)
                });
                setSize(clamped.size);
                setPosition(clamped.position);
            }
        };

        const handleMouseUp = () => {
            dragState.current.dragging = false;
            resizeState.current.resizing = false;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [clampFrameToViewport, minWidth, minHeight, position, size]);

    useEffect(() => {
        const handleWindowResize = () => {
            if (isMaximized) {
                setPosition({ x: viewportPadding, y: viewportPadding });
                setSize({
                    width: Math.max(minWidth, window.innerWidth - (viewportPadding * 2)),
                    height: Math.max(minHeight, window.innerHeight - (viewportPadding * 2)),
                });
                return;
            }
            const clamped = clampFrameToViewport(position, size);
            setPosition(clamped.position);
            setSize(clamped.size);
        };

        window.addEventListener('resize', handleWindowResize);
        return () => {
            window.removeEventListener('resize', handleWindowResize);
        };
    }, [clampFrameToViewport, isMaximized, minHeight, minWidth, position, size]);

    const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        if (isMaximized) return;
        const target = event.target as HTMLElement;
        if (!target.closest(handleSelector)) return;
        dragState.current.dragging = true;
        dragState.current.startX = event.clientX;
        dragState.current.startY = event.clientY;
        dragState.current.originX = position.x;
        dragState.current.originY = position.y;
    };

    const handleResizeMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        if (isMaximized) return;
        event.stopPropagation();
        resizeState.current.resizing = true;
        resizeState.current.startX = event.clientX;
        resizeState.current.startY = event.clientY;
        resizeState.current.originW = size.width;
        resizeState.current.originH = size.height;
    };

    const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (!target.closest(handleSelector)) return;
        event.preventDefault();
        toggleMaximizePanel();
    };

    if (!isClient) return null;

    return createPortal(
        <div
            ref={containerRef}
            className={cn('fixed z-[100] flex flex-col', className)}
            style={{ left: position.x, top: position.y, width: size.width, height: size.height }}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
        >
            {children}
            {resizeHandle && !isMaximized && (
                <div
                    onMouseDown={handleResizeMouseDown}
                    className="absolute bottom-1 right-1 h-3 w-3 cursor-se-resize rounded-sm border border-border bg-background/70"
                />
            )}
        </div>,
        document.body
    );
}
