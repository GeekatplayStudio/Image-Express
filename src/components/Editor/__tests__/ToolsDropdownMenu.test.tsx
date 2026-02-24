import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ToolsDropdownMenu from '../ToolsDropdownMenu';

describe('ToolsDropdownMenu', () => {
    it('routes tool selections through the trigger callback', () => {
        const onTriggerTool = jest.fn();
        render(<ToolsDropdownMenu onTriggerTool={onTriggerTool} />);

        fireEvent.click(screen.getByRole('button', { name: /^Move\s+V$/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Healing' }));
        fireEvent.click(screen.getByRole('button', { name: 'Clone Stamp' }));
        fireEvent.click(screen.getByRole('button', { name: 'AI Zone' }));

        expect(onTriggerTool).toHaveBeenNthCalledWith(1, 'select');
        expect(onTriggerTool).toHaveBeenNthCalledWith(2, 'healing');
        expect(onTriggerTool).toHaveBeenNthCalledWith(3, 'clone-stamp');
        expect(onTriggerTool).toHaveBeenNthCalledWith(4, 'ai-zone');
    });
});
