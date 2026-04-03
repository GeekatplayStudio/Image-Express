import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import EditorWorkspaceShell from '../EditorWorkspaceShell';

jest.mock('@/components/Toolbar', () => {
    const React = require('react');

    return {
        __esModule: true,
        default: React.forwardRef(({
            onRailExpandedChange,
        }: {
            onRailExpandedChange?: (expanded: boolean) => void;
        }, _ref: React.ForwardedRef<unknown>) => (
            <div
                data-testid="mock-toolbar"
                onMouseEnter={() => onRailExpandedChange?.(true)}
                onMouseLeave={() => onRailExpandedChange?.(false)}
            >
                Toolbar
            </div>
        )),
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
    it('widens the toolbar shell when the rail expands', () => {
        render(
            <EditorWorkspaceShell
                toolbarRef={{ current: null }}
                toolbarProps={{
                    canvas: null,
                    activeTool: 'select',
                    setActiveTool: jest.fn(),
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

        fireEvent.mouseEnter(toolbar);
        expect(toolbarShell.className).toContain('w-[236px]');

        fireEvent.mouseLeave(toolbar);
        expect(toolbarShell.className).toContain('w-[60px]');
    });
});