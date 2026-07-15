import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginModal from '../LoginModal';

const mockUseEscapeKey = jest.fn();
const mockRequestOpenSetupWizard = jest.fn();

jest.mock('@/hooks/useEscapeKey', () => ({
    __esModule: true,
    default: (...args: unknown[]) => mockUseEscapeKey(...args),
}));

jest.mock('@/lib/setupWizard', () => ({
    __esModule: true,
    requestOpenSetupWizard: (...args: unknown[]) => mockRequestOpenSetupWizard(...args),
}));

type MockFetchResponse = {
    ok: boolean;
    json: () => Promise<unknown>;
};

describe('LoginModal', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    const fillLoginForm = (email: string, password: string) => {
        fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: email } });
        fireEvent.change(screen.getByPlaceholderText('Enter password'), { target: { value: password } });
    };

    const submitCurrentFormByField = (placeholder: string) => {
        const form = screen.getByPlaceholderText(placeholder).closest('form');
        expect(form).not.toBeNull();
        fireEvent.submit(form as HTMLFormElement);
    };

    it('renders nothing when closed', () => {
        const { container } = render(<LoginModal isOpen={false} onLogin={jest.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('submits login and calls onLogin when credentials are valid', async () => {
        const onLogin = jest.fn();
        const user = { email: 'artist@example.com', displayName: 'Artist', role: 'user' };
        (global.fetch as unknown as jest.Mock<Promise<MockFetchResponse>>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, user }),
        });

        render(<LoginModal isOpen onLogin={onLogin} />);

        fillLoginForm('artist@example.com', 'secret123');
        submitCurrentFormByField('Enter password');

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/user/auth/login',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                })
            );
            expect(onLogin).toHaveBeenCalledWith(user);
        });

        const body = JSON.parse((global.fetch as unknown as jest.Mock).mock.calls[0][1].body as string);
        expect(body).toEqual({ identifier: 'artist@example.com', password: 'secret123' });
    });

    it('shows server error for failed login', async () => {
        (global.fetch as unknown as jest.Mock<Promise<MockFetchResponse>>).mockResolvedValueOnce({
            ok: false,
            json: async () => ({ success: false, message: 'Invalid credentials.' }),
        });

        render(<LoginModal isOpen onLogin={jest.fn()} />);

        fillLoginForm('artist@example.com', 'wrong');
        submitCurrentFormByField('Enter password');

        expect(await screen.findByText('Invalid credentials.')).toBeInTheDocument();
    });

    it('shows fallback error when login request throws', async () => {
        (global.fetch as unknown as jest.Mock).mockRejectedValueOnce(new Error('network'));

        render(<LoginModal isOpen onLogin={jest.fn()} />);

        fillLoginForm('artist@example.com', 'wrong');
        submitCurrentFormByField('Enter password');

        expect(await screen.findByText('Login failed. Please try again.')).toBeInTheDocument();
    });

    it('validates register password confirmation before making request', async () => {
        render(<LoginModal isOpen onLogin={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Register' }));
        fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'New User' } });
        fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'new@example.com' } });
        fireEvent.change(screen.getByPlaceholderText('Min 6 characters'), { target: { value: 'secret1' } });
        fireEvent.change(screen.getByPlaceholderText('Repeat password'), { target: { value: 'secret2' } });
        fireEvent.click(screen.getByRole('button', { name: /Request Access/i }));

        expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('submits registration and returns to login state with success message', async () => {
        (global.fetch as unknown as jest.Mock<Promise<MockFetchResponse>>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true }),
        });

        render(<LoginModal isOpen onLogin={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Register' }));
        fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'New User' } });
        fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'new@example.com' } });
        fireEvent.change(screen.getByPlaceholderText('Min 6 characters'), { target: { value: 'secret1' } });
        fireEvent.change(screen.getByPlaceholderText('Repeat password'), { target: { value: 'secret1' } });
        submitCurrentFormByField('Repeat password');

        expect(await screen.findByText(/Registration submitted/)).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('you@example.com')).toHaveValue('new@example.com');

        const body = JSON.parse((global.fetch as unknown as jest.Mock).mock.calls[0][1].body as string);
        expect(body).toEqual({
            email: 'new@example.com',
            displayName: 'New User',
            password: 'secret1',
        });
    });

    it('handles reset-request success and transitions to reset-confirm mode', async () => {
        (global.fetch as unknown as jest.Mock<Promise<MockFetchResponse>>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, debugToken: 'DEV-1234' }),
        });

        render(<LoginModal isOpen onLogin={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Recover' }));
        fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'reset@example.com' } });
        submitCurrentFormByField('you@example.com');

        expect(await screen.findByText('Reset instructions sent. Enter the code and your new password.')).toBeInTheDocument();
        expect(screen.getByText('Dev reset code: DEV-1234')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Paste code')).toBeInTheDocument();
    });

    it('submits password reset confirmation and returns to login mode', async () => {
        (global.fetch as unknown as jest.Mock<Promise<MockFetchResponse>>)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, debugToken: 'DEV-1234' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true }),
            });

        render(<LoginModal isOpen onLogin={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Recover' }));
        fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'reset@example.com' } });
        fireEvent.click(screen.getByRole('button', { name: /Send Reset Code/i }));

        await screen.findByPlaceholderText('Paste code');
        fireEvent.change(screen.getByPlaceholderText('Paste code'), { target: { value: 'DEV-1234' } });
        fireEvent.change(screen.getByPlaceholderText('Min 6 characters'), { target: { value: 'new-secret' } });
        submitCurrentFormByField('Min 6 characters');

        expect(await screen.findByText('Password updated. You can sign in now.')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();

        const body = JSON.parse((global.fetch as unknown as jest.Mock).mock.calls[1][1].body as string);
        expect(body).toEqual({
            email: 'reset@example.com',
            token: 'DEV-1234',
            password: 'new-secret',
        });
    });

    it('closes on Escape when onClose is provided', () => {
        const onClose = jest.fn();
        render(<LoginModal isOpen onLogin={jest.fn()} onClose={onClose} />);

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('opens initial setup from the login shortcut', () => {
        render(<LoginModal isOpen onLogin={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Initial Setup' }));

        expect(mockRequestOpenSetupWizard).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Complete Initial Setup, then try social sign-in again.')).toBeInTheDocument();
    });

    it('uses the persisted Drive client ID for Google sign-in when auth env vars are not set', async () => {
        localStorage.setItem('image-express-google-drive', JSON.stringify({
            enabled: true,
            clientId: 'stored-client-id.apps.googleusercontent.com'
        }));

        const onLogin = jest.fn();
        (global.fetch as unknown as jest.Mock<Promise<MockFetchResponse>>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                success: true,
                user: {
                    email: 'artist@example.com',
                    displayName: 'Artist',
                    sessionToken: 'session-token',
                },
            }),
        });

        const initialize = jest.fn();
        const prompt = jest.fn();
        Object.defineProperty(window, 'google', {
            value: {
                accounts: {
                    id: {
                        initialize,
                        prompt,
                    }
                }
            },
            configurable: true,
        });

        render(<LoginModal isOpen onLogin={onLogin} />);

        fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

        await waitFor(() => {
            expect(initialize).toHaveBeenCalledWith(expect.objectContaining({
                client_id: 'stored-client-id.apps.googleusercontent.com'
            }));
            expect(prompt).toHaveBeenCalled();
        });

        const googleInitializeConfig = initialize.mock.calls[0][0] as {
            callback: (response: { credential?: string }) => void;
        };

        await act(async () => {
            googleInitializeConfig.callback({ credential: 'google-credential-123' });
        });

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/user/auth/google',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                })
            );
            expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({
                email: 'artist@example.com',
                displayName: 'Artist',
                sessionToken: 'session-token',
            }));
        });

        const body = JSON.parse((global.fetch as unknown as jest.Mock).mock.calls[0][1].body as string);
        expect(body).toEqual({
            credential: 'google-credential-123',
            clientId: 'stored-client-id.apps.googleusercontent.com',
        });

        expect(screen.queryByText(/Google login is not configured/i)).not.toBeInTheDocument();
    });

    it('shows an endpoint restart hint when the Google auth route returns html 404 content', async () => {
        localStorage.setItem('image-express-google-drive', JSON.stringify({
            enabled: true,
            clientId: 'stored-client-id.apps.googleusercontent.com'
        }));

        (global.fetch as unknown as jest.Mock<Promise<MockFetchResponse>>).mockResolvedValueOnce({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            text: async () => '<!DOCTYPE html><html><body><h1>404</h1><p>This page could not be found.</p></body></html>',
        });

        const initialize = jest.fn();
        const prompt = jest.fn();
        Object.defineProperty(window, 'google', {
            value: {
                accounts: {
                    id: {
                        initialize,
                        prompt,
                    }
                }
            },
            configurable: true,
        });

        render(<LoginModal isOpen onLogin={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

        await waitFor(() => {
            expect(initialize).toHaveBeenCalled();
        });

        const googleInitializeConfig = initialize.mock.calls[0][0] as {
            callback: (response: { credential?: string }) => void;
        };
        await act(async () => {
            googleInitializeConfig.callback({ credential: 'google-credential-123' });
        });

        expect(await screen.findByText('Google sign-in endpoint is unavailable right now. Restart the app or dev server and try again.')).toBeInTheDocument();
    });
});
