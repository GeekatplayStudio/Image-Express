import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import EditorWorkspaceShell from '../EditorWorkspaceShell';

jest.mock('@/components/Toolbar', () => {
    const MockToolbar = React.forwardRef<HTMLDivElement, {
        enableHoverLabels?: boolean;
        onRailExpandedChange?: (expanded: boolean) => void;
    }>(({ enableHoverLabels, onRailExpandedChange }, ref) => (
        <div
            ref={ref}
            data-testid="mock-toolbar"
            onMouseEnter={() => {
                if (enableHoverLabels) {
                    onRailExpandedChange?.(true);
                }
            }}
            onMouseLeave={() => {
                if (enableHoverLabels) {
                    onRailExpandedChange?.(false);
                }
            }}
        >
            Toolbar
        </div>
    ));

    MockToolbar.displayName = 'MockToolbar';

    return {
        __esModule: true,
        default: MockToolbar,
    };
});

jest.mock('@/components/CircularContextMenu', () => ({
    __esModule: true,
    default: () => <div data-testid="mock-context-menu" />,
}));

jest.mock('@/components/JobStatusFooter', () => ({
    __esModule: true,
    default: () => <div data-testid="mock-job-footer" />,
}));

describe('EditorWorkspaceShell', () => {
    it('keeps the toolbar shell fixed width by default when the rail is hovered', () => {
        render(
            <EditorWorkspaceShell
                toolbarRef={{ current: null }}
                toolbarProps={{
                    canvas: null,
                    activeTool: 'select',
                    setActiveTool: jest.fn(),
                    enableHoverLabels: true,
                }}
                workspace={<div>Workspace</div>}
                jobFooterProps={{ jobs: [], onClear: jest.fn() }}
                contextMenuProps={{
                    x: 0,
                    y: 0,
                    isOpen: false,
                    activeTool: 'select',
                    onClose: jest.fn(),
                    onSelectTool: jest.fn(),
                }}
            />
        );

        const toolbarShell = screen.getByTestId('toolbar-shell');
        const toolbar = screen.getByTestId('mock-toolbar');

        expect(toolbarShell.className).toContain('w-[60px]');
        expect(toolbarShell.className).toContain('overflow-visible');

        fireEvent.mouseEnter(toolbar);
        expect(toolbarShell.className).toContain('w-[60px]');
    });
});