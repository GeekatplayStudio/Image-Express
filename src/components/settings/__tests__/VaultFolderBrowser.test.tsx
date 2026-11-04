import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import VaultFolderBrowser from '@/components/settings/VaultFolderBrowser';
import { browseVaultDirectory, listIndexableDrives } from '@/features/asset-vault/application/client/watchRootClient';

jest.mock('@/features/asset-vault/application/client/watchRootClient', () => ({
    browseVaultDirectory: jest.fn(),
    listIndexableDrives: jest.fn(),
}));

const mockedDrives = jest.mocked(listIndexableDrives);
const mockedBrowse = jest.mocked(browseVaultDirectory);

describe('VaultFolderBrowser', () => {
    beforeEach(() => {
        mockedDrives.mockReset();
        mockedBrowse.mockReset();
        mockedDrives.mockResolvedValue({ drives: [{ path: 'd:/', label: 'D:' }, { path: 'e:/', label: 'E:' }] } as never);
        mockedBrowse.mockImplementation(async (target: string) => ({
            path: target,
            parent: target === 'd:/' ? null : 'd:/',
            entries: target === 'd:/' ? [{ path: 'd:/photos', name: 'photos' }] : [],
        }) as never);
    });

    it('renders nothing while closed', () => {
        render(<VaultFolderBrowser isOpen={false} onClose={jest.fn()} onPick={jest.fn()} />);
        expect(screen.queryByTestId('vault-folder-browser')).toBeNull();
    });

    it('starts at the drive list, walks into a folder and back up, and picks the current folder', async () => {
        const onPick = jest.fn();
        const onClose = jest.fn();
        render(<VaultFolderBrowser isOpen onClose={onClose} onPick={onPick} />);
        expect(screen.getByText('Browse drive / folder')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('button', { name: /D:/ })).toBeInTheDocument());
        expect(screen.getByTestId('vault-folder-browser-choose')).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: /D:/ }));
        await waitFor(() => expect(screen.getByRole('button', { name: /photos/ })).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /photos/ }));
        await waitFor(() => expect(mockedBrowse).toHaveBeenLastCalledWith('d:/photos'));
        await waitFor(() => expect(screen.getByText('d:/photos')).toBeInTheDocument());

        fireEvent.click(screen.getByTestId('vault-folder-browser-up'));
        await waitFor(() => expect(mockedBrowse).toHaveBeenLastCalledWith('d:/'));

        fireEvent.click(screen.getByTestId('vault-folder-browser-choose'));
        expect(onPick).toHaveBeenCalledWith('d:/');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('opens straight into a single allowed root and shows the server’s refusal', async () => {
        mockedDrives.mockResolvedValue({ drives: [{ path: 'd:/', label: 'D:' }] } as never);
        mockedBrowse.mockRejectedValue(new Error('Folder is outside the allowed roots.'));
        render(<VaultFolderBrowser isOpen onClose={jest.fn()} onPick={jest.fn()} />);
        await waitFor(() => expect(mockedBrowse).toHaveBeenCalledWith('d:/'));
        await waitFor(() => expect(screen.getByText('Folder is outside the allowed roots.')).toBeInTheDocument());
    });

    it('closes from Cancel and from Escape', async () => {
        const onClose = jest.fn();
        render(<VaultFolderBrowser isOpen onClose={onClose} onPick={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(2);
    });
});
