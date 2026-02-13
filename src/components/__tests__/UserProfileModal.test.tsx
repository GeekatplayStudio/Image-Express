import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockLoadProfileSettings.mockReturnValue(null);
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
        const { container } = render(
            <UserProfileModal
                isOpen
                onClose={jest.fn()}
                username="artist"
                onLogout={jest.fn()}
            />
        );

        const fileInput = container.querySelector('input[type="file"]');
        expect(fileInput).not.toBeNull();
        const file = new File(['img'], 'avatar.png', { type: 'image/png' });
        fireEvent.change(fileInput as HTMLInputElement, { target: { files: [file] } });

        expect(screen.getByTestId('mock-next-image')).toHaveAttribute('data-src', 'data:image/png;base64,MOCK_IMAGE');
    });

    it('calls logout and close actions', () => {
        const onClose = jest.fn();
        const onLogout = jest.fn();
        const { container } = render(
            <UserProfileModal
                isOpen
                onClose={onClose}
                username="artist"
                onLogout={onLogout}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
        expect(onLogout).toHaveBeenCalledTimes(1);

        const closeButton = container.querySelector('button.absolute');
        expect(closeButton).not.toBeNull();
        fireEvent.click(closeButton as HTMLButtonElement);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('wires escape hook to close handler', () => {
        const onClose = jest.fn();
        render(
            <UserProfileModal
                isOpen
                onClose={onClose}
                username="artist"
                onLogout={jest.fn()}
            />
        );

        expect(mockUseEscapeKey).toHaveBeenCalled();
        const [handler, options] = mockUseEscapeKey.mock.calls[0];
        expect(options).toEqual({ enabled: true });
        (handler as () => void)();
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
