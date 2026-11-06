import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ToolsDropdownMenu from '../ToolsDropdownMenu';
import { ALL_TOOLBAR_TOOLS } from '@/components/toolbar/toolRegistry';

describe('ToolsDropdownMenu', () => {
    it('stays closed until toggled', () => {
        render(<ToolsDropdownMenu open={false} onToggle={jest.fn()} onTriggerTool={jest.fn()} />);
        expect(screen.queryByTestId('menu-tools')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Tools/ })).toHaveAttribute('aria-expanded', 'false');
    });

    it('offers every rail tool exactly once and routes the choice through the trigger', () => {
        const onToggle = jest.fn();
        const onTriggerTool = jest.fn();
        render(<ToolsDropdownMenu open onToggle={onToggle} onTriggerTool={onTriggerTool} />);

        const items = within(screen.getByTestId('menu-tools')).getAllByRole('menuitem');
        expect(items).toHaveLength(ALL_TOOLBAR_TOOLS.length);

        const move = screen.getByRole('menuitem', { name: 'Move' });
        expect(move).toHaveAttribute('aria-keyshortcuts', 'V');
        expect(screen.getByRole('menuitem', { name: 'Magic Wand' })).toHaveAttribute('aria-keyshortcuts', 'Shift+W');
        fireEvent.click(move);
        fireEvent.click(screen.getByRole('menuitem', { name: /^Campaign Manager$/ }));
        fireEvent.click(screen.getByRole('menuitem', { name: /^CNC Planner$/i }));

        expect(onTriggerTool.mock.calls.map(([tool]) => tool)).toEqual(['select', 'campaign-manager', 'cnc-planner']);
        expect(onToggle).toHaveBeenCalledTimes(3);
    });

    it('groups tools under the same families as the rail', () => {
        render(<ToolsDropdownMenu open onToggle={jest.fn()} onTriggerTool={jest.fn()} />);
        const retouch = screen.getByRole('group', { name: 'Retouch Tools' });
        expect(within(retouch).getByRole('menuitem', { name: /Clone Stamp/ })).toBeInTheDocument();
        const ai = screen.getByRole('group', { name: 'AI Tools' });
        expect(within(ai).getAllByRole('menuitem')).toHaveLength(7);
    });
});
