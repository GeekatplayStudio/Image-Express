'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

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
    const [position, setPosition] = useState<PanelPosition>(initialPosition);
    const [size, setSize] = useState<PanelSize>(initialSize);
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

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            if (dragState.current.dragging) {
                const dx = event.clientX - dragState.current.startX;
                const dy = event.clientY - dragState.current.startY;
                setPosition({
                    x: dragState.current.originX + dx,
                    y: dragState.current.originY + dy
                });
            }
            if (resizeState.current.resizing) {
                const dx = event.clientX - resizeState.current.startX;
                const dy = event.clientY - resizeState.current.startY;
                setSize({
                    width: Math.max(minWidth, resizeState.current.originW + dx),
                    height: Math.max(minHeight, resizeState.current.originH + dy)
                });
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
    }, [minWidth, minHeight]);

    const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (!target.closest(handleSelector)) return;
        dragState.current.dragging = true;
        dragState.current.startX = event.clientX;
        dragState.current.startY = event.clientY;
        dragState.current.originX = position.x;
        dragState.current.originY = position.y;
    };

    const handleResizeMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        event.stopPropagation();
        resizeState.current.resizing = true;
        resizeState.current.startX = event.clientX;
        resizeState.current.startY = event.clientY;
        resizeState.current.originW = size.width;
        resizeState.current.originH = size.height;
    };

    return (
        <div
            ref={containerRef}
            className={cn('fixed z-[100] flex flex-col', className)}
            style={{ left: position.x, top: position.y, width: size.width, height: size.height }}
            onMouseDown={handleMouseDown}
        >
            {children}
            {resizeHandle && (
                <div
                    onMouseDown={handleResizeMouseDown}
                    className="absolute bottom-1 right-1 h-3 w-3 cursor-se-resize rounded-sm border border-border bg-background/70"
                />
            )}
        </div>
    );
}
