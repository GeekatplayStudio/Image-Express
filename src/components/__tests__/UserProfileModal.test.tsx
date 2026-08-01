import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import UserProfileModal from '../UserProfileModal';
import type { UserProfileSettings } from '@/lib/profile-utils';

const mockUseEscapeKey = jest.fn();
const mockLoadProfileSettings = jest.fn();
const mockSaveProfileSettings = jest.fn();

jest.mock('next/image', () => ({
    __esModule: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    default: ({ src, alt, fill, unoptimized }: any) => (
        <div
            data-testid="mock-next-image"
            data-src={String(src)}
            data-alt={String(alt)}
            data-fill={String(fill)}
            data-unoptimized={String(unoptimized)}
        />
    ),
}));

jest.mock('@/hooks/useEscapeKey', () => ({
    __esModule: true,
    default: (...args: unknown[]) => mockUseEscapeKey(...args),
}));

jest.mock('@/lib/profile-utils', () => ({
    loadProfileSettings: (...args: unknown[]) => mockLoadProfileSettings(...args),
    saveProfileSettings: (...args: unknown[]) => mockSaveProfileSettings(...args),
}));

describe('UserProfileModal', () => {
    const OriginalFileReader = global.FileReader;
    const originalFetch = global.fetch;

    beforeAll(() => {
        // Lightweight FileReader mock for profile image upload test.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).FileReader = class {
            onload: ((event: { target: { result: string } }) => void) | null = null;
            readAsDataURL() {
                this.onload?.({ target: { result: 'data:image/png;base64,MOCK_IMAGE' } });
            }
        };
    });

    afterAll(() => {
        global.FileReader = OriginalFileReader;
        global.fetch = originalFetch;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockLoadProfileSettings.mockReturnValue(null);
        global.fetch = jest.fn();
    });

    it('returns null when closed', () => {
        const { container } = render(
            <UserProfileModal
                isOpen={false}
                onClose={jest.fn()}
                username="artist"
                onLogout={jest.fn()}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('loads saved profile settings when opened', () => {
        const savedProfile: UserProfileSettings = {
            displayName: 'Saved Name',
            username: 'saved-handle',
            email: 'saved@example.com',
            info: 'Saved profile info',
            image: 'data:image/png;base64,SAVED',
            imageScale: 1.35,
            embedInfo: true,
        };
        mockLoadProfileSettings.mockReturnValue(savedProfile);

        render(
            <UserProfileModal
                isOpen
                onClose={jest.fn()}
                username="artist"
                onLogout={jest.fn()}
            />
        );

        expect(mockLoadProfileSettings).toHaveBeenCalled();
        expect(screen.getByDisplayValue('Saved Name')).toBeInTheDocument();
        expect(screen.getByDisplayValue('saved-handle')).toBeInTheDocument();
        expect(screen.getByDisplayValue('saved@example.com')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Saved profile info')).toBeInTheDocument();
        expect(screen.getByRole('checkbox')).toBeChecked();
        expect(screen.getByDisplayValue('1.35')).toBeInTheDocument();
        expect(screen.getByTestId('mock-next-image')).toHaveAttribute('data-src', 'data:image/png;base64,SAVED');
    });

    it('saves updated profile and triggers callbacks', () => {
        const onClose = jest.fn();
        const onProfileUpdate = jest.fn();
        render(
            <UserProfileModal
                isOpen
                onClose={onClose}
                username="artist"
                onLogout={jest.fn()}
                onProfileUpdate={onProfileUpdate}
            />
        );

        fireEvent.change(screen.getAllByDisplayValue('artist')[0], { target: { value: 'Artist Name' } });
        fireEvent.change(screen.getByDisplayValue('user@example.com'), { target: { value: 'artist@example.com' } });
        fireEvent.change(screen.getByPlaceholderText('Artist name, website, credits, etc.'), {
            target: { value: 'Visual Designer' },
        });
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.change(screen.getByRole('slider'), { target: { value: '1.5' } });

        fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

        expect(mockSaveProfileSettings).toHaveBeenCalledWith({
            displayName: 'Artist Name',
            username: 'artist',
            email: 'artist@example.com',
            info: 'Visual Designer',
            image: null,
            imageScale: 1.5,
            embedInfo: true,
        });
        expect(onProfileUpdate).toHaveBeenCalledWith({
            displayName: 'Artist Name',
            username: 'artist',
            email: 'artist@example.com',
            info: 'Visual Designer',
            image: null,
            imageScale: 1.5,
            embedInfo: true,
        });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('uploads profile image and renders preview', () => {
        // ModalShell portals its content into <body>, so the RTL `container`
        // wrapper is empty -- query the base element like the other tests do.
        const { baseElement } = render(
            <UserProfileModal
                isOpen
                onClose={jest.fn()}
                username="artist"
                onLogout={jest.fn()}
            />
        );

        const fileInput = baseElement.querySelector('input[type="file"]');
        expect(fileInput).not.toBeNull();
        const file = new File(['img'], 'avatar.png', { type: 'image/png' });
        fireEvent.change(fileInput as HTMLInputElement, { target: { files: [file] } });

        expect(screen.getByTestId('mock-next-image')).toHaveAttribute('data-src', 'data:image/png;base64,MOCK_IMAGE');
    });

    it('calls logout and close actions', () => {
        const onClose = jest.fn();
        const onLogout = jest.fn();
        render(
            <UserProfileModal
                isOpen
                onClose={onClose}
                username="artist"
                onLogout={onLogout}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
        expect(onLogout).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on Escape key', () => {
        const onClose = jest.fn();
        render(
            <UserProfileModal
                isOpen
                onClose={onClose}
                username="artist"
                onLogout={jest.fn()}
            />
        );

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('changes the signed-in account password from the profile modal', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, message: 'Password changed successfully.' }),
        });

        render(
            <UserProfileModal
                isOpen
                onClose={jest.fn()}
                username="artist@example.com"
                onLogout={jest.fn()}
            />,
        );

        fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'old-secret' } });
        fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'new-secret' } });
        fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'new-secret' } });
        fireEvent.click(screen.getByRole('button', { name: /Update Password/i }));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith('/api/user/auth/change-password', expect.objectContaining({ method: 'POST' }));
        });

        const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
        expect(JSON.parse(requestInit.body as string)).toEqual({
            identifier: 'artist@example.com',
            currentPassword: 'old-secret',
            newPassword: 'new-secret',
        });
        await waitFor(() => {
            expect(screen.getByText('Password changed successfully.')).toBeInTheDocument();
        });
    });

    it('blocks mismatched new passwords before sending the request', async () => {
        render(
            <UserProfileModal
                isOpen
                onClose={jest.fn()}
                username="artist@example.com"
                onLogout={jest.fn()}
            />,
        );

        fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'old-secret' } });
        fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'new-secret' } });
        fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'other-secret' } });
        fireEvent.click(screen.getByRole('button', { name: /Update Password/i }));

        expect(screen.getByText('New passwords do not match.')).toBeInTheDocument();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('disables password changes for local desktop sessions', () => {
        render(
            <UserProfileModal
                isOpen
                onClose={jest.fn()}
                username="Local Desktop"
                onLogout={jest.fn()}
            />,
        );

        expect(screen.getByText(/Password changes are unavailable for guest or local desktop sessions/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Update Password/i })).toBeDisabled();
    });
});
