import { useCallback, useRef, useState } from 'react';
import type { PanelMode as PanelRailMode } from '@/components/properties/PanelModeRail';
import type { PanelDockMode } from '@/components/Editor/editorView.types';

type PanelState = {
    mode: PanelDockMode;
    position: { x: number; y: number };
    width: number;
};

export function useEditorPanelState(initialPanelMode: PanelRailMode = 'properties') {
    const [panelState, setPanelState] = useState<PanelState>({
        mode: 'docked-right',
        position: { x: 100, y: 100 },
        width: 320,
    });
    const [propertiesPanelMode, setPropertiesPanelMode] = useState<PanelRailMode>(initialPanelMode);
    const [isDraggingPanel, setIsDraggingPanel] = useState(false);
    const dragPanelOffset = useRef({ x: 0, y: 0 });

    const handlePanelDragStart = useCallback((e: React.MouseEvent) => {
        setIsDraggingPanel(true);
        const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
        dragPanelOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };

        const moveHandler = (moveEvent: MouseEvent) => {
            setPanelState((prev) => ({
                ...prev,
                mode: 'floating',
                position: {
                    x: moveEvent.clientX - dragPanelOffset.current.x,
                    y: moveEvent.clientY - dragPanelOffset.current.y,
                },
            }));
        };

        const upHandler = (upEvent: MouseEvent) => {
            setIsDraggingPanel(false);
            window.removeEventListener('mousemove', moveHandler);
            window.removeEventListener('mouseup', upHandler);

            const screenWidth = window.innerWidth;
            const x = upEvent.clientX;

            if (x < 100) {
                setPanelState((prev) => ({ ...prev, mode: 'docked-left', position: { x: 0, y: 0 } }));
            } else if (x > screenWidth - 100) {
                setPanelState((prev) => ({ ...prev, mode: 'docked-right', position: { x: 0, y: 0 } }));
            }
        };

        window.addEventListener('mousemove', moveHandler);
        window.addEventListener('mouseup', upHandler);
    }, []);

    const startPanelResize = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const startWidth = panelState.width;

        const moveHandler = (moveEvent: MouseEvent) => {
            const dx = moveEvent.clientX - startX;
            setPanelState((prev) => {
                let newWidth = startWidth;

                if (prev.mode === 'docked-right') {
                    newWidth = startWidth - dx;
                } else {
                    newWidth = startWidth + dx;
                }

                if (newWidth < 280) newWidth = 280;
                if (newWidth > 600) newWidth = 600;

                return { ...prev, width: newWidth };
            });
        };

        const upHandler = () => {
            document.body.style.cursor = '';
            window.removeEventListener('mousemove', moveHandler);
            window.removeEventListener('mouseup', upHandler);
        };

        document.body.style.cursor = 'ew-resize';
        window.addEventListener('mousemove', moveHandler);
        window.addEventListener('mouseup', upHandler);
    }, [panelState.width]);

    const toggleCollapse = useCallback(() => {
        setPanelState((prev) => {
            if (prev.mode === 'docked-left') return { ...prev, mode: 'collapsed-left' };
            if (prev.mode === 'docked-right') return { ...prev, mode: 'collapsed-right' };
            if (prev.mode === 'collapsed-left') return { ...prev, mode: 'docked-left' };
            if (prev.mode === 'collapsed-right') return { ...prev, mode: 'docked-right' };
            return prev;
        });
    }, []);

    const toggleFloat = useCallback(() => {
        setPanelState((prev) => {
            if (prev.mode === 'floating') return { ...prev, mode: 'docked-right', position: { x: 0, y: 0 } };
            return {
                ...prev,
                mode: 'floating',
                position: { x: window.innerWidth - 400, y: 100 },
            };
        });
    }, []);

    const isPropertiesPanelVisible = panelState.mode !== 'collapsed-left' && panelState.mode !== 'collapsed-right';

    const handleWindowPanelToggle = useCallback((mode: PanelRailMode) => {
        const isChecked = isPropertiesPanelVisible && propertiesPanelMode === mode;
        if (isChecked) {
            setPanelState((prev) => {
                if (prev.mode === 'docked-left') return { ...prev, mode: 'collapsed-left' };
                if (prev.mode === 'docked-right') return { ...prev, mode: 'collapsed-right' };
                if (prev.mode === 'floating') return { ...prev, mode: 'collapsed-right', position: { x: 0, y: 0 } };
                return prev;
            });
            return;
        }

        setPropertiesPanelMode(mode);
        setPanelState((prev) => {
            if (prev.mode === 'collapsed-left') return { ...prev, mode: 'docked-left' };
            if (prev.mode === 'collapsed-right') return { ...prev, mode: 'docked-right' };
            return prev;
        });
    }, [isPropertiesPanelVisible, propertiesPanelMode]);

    const handleWindowDockMode = useCallback((mode: 'docked-left' | 'docked-right' | 'floating') => {
        setPanelState((prev) => {
            if (mode === 'floating') {
                const nextX = typeof window !== 'undefined' ? Math.max(24, window.innerWidth - 400) : prev.position.x;
                return { ...prev, mode: 'floating', position: { x: nextX, y: 100 } };
            }
            return { ...prev, mode, position: { x: 0, y: 0 } };
        });
    }, []);

    return {
        panelState,
        setPanelState,
        propertiesPanelMode,
        setPropertiesPanelMode,
        isDraggingPanel,
        handlePanelDragStart,
        startPanelResize,
        toggleCollapse,
        toggleFloat,
        isPropertiesPanelVisible,
        handleWindowPanelToggle,
        handleWindowDockMode,
    };
}
