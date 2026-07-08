import type { GridType } from '@/components/GridOverlay';

type ContextMenuState = {
    x: number;
    y: number;
    isOpen: boolean;
};

type PanelStateForLayout = {
    mode: 'docked-left' | 'docked-right' | 'floating' | 'collapsed-left' | 'collapsed-right';
    position: { x: number; y: number };
    width: number;
};

type ViewportSize = {
    width: number;
    height: number;
};

export function getGridStatusLabel(gridType: GridType): string {
    const labels: Record<GridType, string> = {
        none: 'Off',
        'rule-of-thirds': 'Thirds',
        'golden-ratio': 'Golden',
        cross: 'Cross',
        'grid-4x4': '4x4',
        'canvas-border': 'Border',
    };
    return labels[gridType];
}

export function getBottomRightUtilityStyle(
    backgroundJobCount: number,
    contextMenu: ContextMenuState,
    panelState: PanelStateForLayout,
    viewportSize: ViewportSize,
): { right: string; bottom: string } {
    const clusterWidth = 260;
    const clusterHeight = 68;
    let right = 16;
    let bottom = backgroundJobCount > 0 ? 176 : 16;

    const activeViewportWidth = viewportSize.width || 0;
    const activeViewportHeight = viewportSize.height || 0;
    const intersects = (
        a: { left: number; top: number; right: number; bottom: number },
        b: { left: number; top: number; right: number; bottom: number }
    ) => (
        a.left < b.right
        && a.right > b.left
        && a.top < b.bottom
        && a.bottom > b.top
    );

    if (activeViewportWidth > 0 && activeViewportHeight > 0) {
        const createClusterRect = (nextRight: number, nextBottom: number) => ({
            left: activeViewportWidth - nextRight - clusterWidth,
            top: activeViewportHeight - nextBottom - clusterHeight,
            right: activeViewportWidth - nextRight,
            bottom: activeViewportHeight - nextBottom,
        });

        if (contextMenu.isOpen) {
            const contextRect = {
                left: contextMenu.x - 90,
                top: contextMenu.y - 90,
                right: contextMenu.x + 90,
                bottom: contextMenu.y + 90,
            };
            if (intersects(createClusterRect(right, bottom), contextRect)) {
                bottom += 96;
            }
        }

        if (panelState.mode === 'floating') {
            const floatingHeight = Math.round(activeViewportHeight * 0.7);
            const floatingRect = {
                left: panelState.position.x,
                top: panelState.position.y,
                right: panelState.position.x + panelState.width,
                bottom: panelState.position.y + floatingHeight,
            };
            if (intersects(createClusterRect(right, bottom), floatingRect)) {
                right = Math.max(16, activeViewportWidth - floatingRect.left + 16);
            }
        }
    }

    return {
        right: `${right}px`,
        bottom: `${bottom}px`,
    };
}
