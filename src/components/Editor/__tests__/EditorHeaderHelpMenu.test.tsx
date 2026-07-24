import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EditorHeaderHelpMenu from '../EditorHeaderHelpMenu';

describe('EditorHeaderHelpMenu desktop support actions', () => {
    const originalDesktop = window.desktop;

    afterEach(() => {
        window.desktop = originalDesktop;
    });

    it('copies privacy-safe diagnostics through the desktop bridge', async () => {
        const copyDiagnostics = jest.fn().mockResolvedValue({ success: true });
        window.desktop = {
            isDesktop: true,
            copyDiagnostics,
        } as Window['desktop'];
        const setShowHelpMenu = jest.fn();

        render(
            <EditorHeaderHelpMenu
                showHelpMenu
                toggleEditorMenu={jest.fn()}
                setShowHelpMenu={setShowHelpMenu}
                handleShowShortcutsFromMenu={jest.fn()}
                handleShowAboutFromMenu={jest.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Diagnostics' }));

        await waitFor(() => expect(copyDiagnostics).toHaveBeenCalledTimes(1));
        expect(setShowHelpMenu).toHaveBeenCalledWith(false);
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
            'Privacy-safe diagnostics copied.',
        ));
    });

    it('does not expose desktop-only actions in a browser runtime', () => {
        window.desktop = undefined;
        render(
            <EditorHeaderHelpMenu
                showHelpMenu
                toggleEditorMenu={jest.fn()}
                setShowHelpMenu={jest.fn()}
                handleShowShortcutsFromMenu={jest.fn()}
                handleShowAboutFromMenu={jest.fn()}
            />,
        );

        expect(screen.queryByRole('menuitem', { name: 'Copy Diagnostics' })).toBeNull();
    });
});
