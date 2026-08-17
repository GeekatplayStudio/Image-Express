import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ToolsDropdownMenu from '../ToolsDropdownMenu';

describe('ToolsDropdownMenu', () => {
    it('routes tool selections through the trigger callback', () => {
        const onTriggerTool = jest.fn();
        render(<ToolsDropdownMenu onTriggerTool={onTriggerTool} />);

        fireEvent.click(screen.getByRole('button', { name: /^Move\s+V$/ }));
        fireEvent.click(screen.getByRole('button', { name: /^Quick Selection\s+Q$/ }));
        fireEvent.click(screen.getByRole('button', { name: /^Selection Brush\s+K$/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Healing' }));
        fireEvent.click(screen.getByRole('button', { name: 'Clone Stamp' }));
        fireEvent.click(screen.getByRole('button', { name: 'History Brush' }));
        fireEvent.click(screen.getByRole('button', { name: 'Blur Tool' }));
        fireEvent.click(screen.getByRole('button', { name: 'Sharpen Tool' }));
        fireEvent.click(screen.getByRole('button', { name: 'Dodge Tool' }));
        fireEvent.click(screen.getByRole('button', { name: 'Burn Tool' }));
        fireEvent.click(screen.getByRole('button', { name: 'Sponge Tool' }));
        fireEvent.click(screen.getByRole('button', { name: 'Spot Healing' }));
        fireEvent.click(screen.getByRole('button', { name: 'Remove Tool' }));
        fireEvent.click(screen.getByRole('button', { name: 'AI Zone' }));
        fireEvent.click(screen.getByRole('button', { name: 'Fabrication Studio' }));

        expect(onTriggerTool).toHaveBeenNthCalledWith(1, 'select');
        expect(onTriggerTool).toHaveBeenNthCalledWith(2, 'quick-select');
        expect(onTriggerTool).toHaveBeenNthCalledWith(3, 'selection-brush');
        expect(onTriggerTool).toHaveBeenNthCalledWith(4, 'healing');
        expect(onTriggerTool).toHaveBeenNthCalledWith(5, 'clone-stamp');
        expect(onTriggerTool).toHaveBeenNthCalledWith(6, 'history-brush');
        expect(onTriggerTool).toHaveBeenNthCalledWith(7, 'blur');
        expect(onTriggerTool).toHaveBeenNthCalledWith(8, 'sharpen');
        expect(onTriggerTool).toHaveBeenNthCalledWith(9, 'dodge');
        expect(onTriggerTool).toHaveBeenNthCalledWith(10, 'burn');
        expect(onTriggerTool).toHaveBeenNthCalledWith(11, 'sponge');
        expect(onTriggerTool).toHaveBeenNthCalledWith(12, 'spot-healing');
        expect(onTriggerTool).toHaveBeenNthCalledWith(13, 'remove');
        expect(onTriggerTool).toHaveBeenNthCalledWith(14, 'ai-zone');
        expect(onTriggerTool).toHaveBeenNthCalledWith(15, 'fabrication-library');
    });
});
