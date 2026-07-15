'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { User, Lock, ArrowRight, Loader2, Mail, UserPlus, KeyRound, CheckCircle2, Chrome, Facebook, Laptop, LogIn } from 'lucide-react';
import { AuthUser } from '@/types';
import { loadDriveConfig } from '@/lib/googleDrive';
import { requestOpenSetupWizard } from '@/lib/setupWizard';
import ModalShell from '@/components/ui/ModalShell';
import { useI18n } from '@/providers/I18nProvider';

type GoogleCredentialResponse = {
    credential?: string;
};

type GoogleAuthResponse = {
    success?: boolean;
    message?: string;
    code?: string;
    email?: string;
    user?: AuthUser;
};

type ParsedGoogleAuthResponse = {
    data: GoogleAuthResponse | null;
    responseText: string;
};

type GooglePromptMomentNotification = {
    isNotDisplayed?: () => boolean;
    getNotDisplayedReason?: () => string;
};

type GoogleAccountsApi = {
    id: {
        initialize: (params: { client_id: string; callback: (response: GoogleCredentialResponse) => void; auto_select?: boolean }) => void;
        prompt: (listener?: (notification: GooglePromptMomentNotification) => void) => void;
    };
};

type WindowWithGoogleAccounts = Window & {
    google?: {
        accounts: GoogleAccountsApi;
    };
};

interface LoginModalProps {
    isOpen: boolean;
    onLogin: (user: AuthUser) => void;
    onClose?: () => void;
    /** Skip sign-in entirely for local, single-machine use. */
    onLocalUse?: () => void;
}

type AuthMode = 'login' | 'register' | 'reset-request' | 'reset-confirm';

const TAB_LABELS: Record<AuthMode, string> = {
    login: 'Sign In',
    register: 'Register',
    'reset-request': 'Recover',
    'reset-confirm': 'Recover'
};

export default function LoginModal({ isOpen, onLogin, onClose, onLocalUse }: LoginModalProps) {
    const { t } = useI18n();
    const modalRef = useRef<HTMLDivElement | null>(null);
    const googleInitializedClientIdRef = useRef<string>('');
    const [mode, setMode] = useState<AuthMode>('login');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');

    const [registerEmail, setRegisterEmail] = useState('');
    const [registerDisplayName, setRegisterDisplayName] = useState('');
    const [registerPassword, setRegisterPassword] = useState('');
    const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');

    const [resetEmail, setResetEmail] = useState('');
    const [resetToken, setResetToken] = useState('');
    const [resetNewPassword, setResetNewPassword] = useState('');
    const [debugToken, setDebugToken] = useState<string | null>(null);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const [storedGoogleClientId, setStoredGoogleClientId] = useState('');

    const googleClientId = useMemo(() => {
        return [
            process.env.NEXT_PUBLIC_GOOGLE_AUTH_CLIENT_ID,
            process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID,
            storedGoogleClientId,
        ].find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() || '';
    }, [storedGoogleClientId]);

    const getGoogleApi = () => {
        if (typeof window === 'undefined') return null;
        const typedWindow = window as WindowWithGoogleAccounts;
        return typedWindow.google?.accounts?.id || null;
    };

    const resetNotice = useMemo(() => {
        if (!debugToken) return null;
        return `Dev reset code: ${debugToken}`;
    }, [debugToken]);

    useEffect(() => {
        if (!isOpen) return;
        if (!modalRef.current) return;
        const firstInput = modalRef.current.querySelector<HTMLInputElement>('input, button, select, textarea, a[href]');
        firstInput?.focus();
    }, [isOpen, mode]);

    useEffect(() => {
        if (!isOpen) return;
        if (typeof window === 'undefined') return;
        setStoredGoogleClientId(loadDriveConfig().clientId || '');
        if (getGoogleApi()) return;

        const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-identity="true"]');
        if (existingScript) return;

        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.dataset.googleIdentity = 'true';
        document.head.appendChild(script);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const trapFocus = (event: KeyboardEvent) => {
            if (event.key !== 'Tab') return;
            if (!modalRef.current) return;

            const focusableElements = Array.from(
                modalRef.current.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                )
            );
            if (focusableElements.length === 0) {
                event.preventDefault();
                return;
            }

            const first = focusableElements[0];
            const last = focusableElements[focusableElements.length - 1];
            const active = document.activeElement as HTMLElement | null;
            const focusInside = active ? modalRef.current.contains(active) : false;

            if (!focusInside) {
                event.preventDefault();
                first.focus();
                return;
            }

            if (event.shiftKey && active === first) {
                event.preventDefault();
                last.focus();
                return;
            }

            if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', trapFocus, true);
        return () => document.removeEventListener('keydown', trapFocus, true);
    }, [isOpen]);

    const resetFeedback = () => {
        setError('');
        setMessage('');
    };

    const resolveGoogleClientId = () => {
        if (googleClientId) {
            return googleClientId;
        }
        const latestClientId = (loadDriveConfig().clientId || '').trim();
        if (latestClientId && latestClientId !== storedGoogleClientId) {
            setStoredGoogleClientId(latestClientId);
        }
        return latestClientId;
    };

    const handleOpenInitialSetup = () => {
        resetFeedback();
        setMessage('Complete Initial Setup, then try social sign-in again.');
        requestOpenSetupWizard();
    };

    const startAccessRequest = () => {
        resetFeedback();
        setMode('register');
        if (!registerEmail && identifier.includes('@')) {
            setRegisterEmail(identifier.trim());
        }
    };

    const parseGoogleAuthResponse = async (response: Response): Promise<ParsedGoogleAuthResponse> => {
        if (typeof response.text !== 'function' && typeof response.json === 'function') {
            try {
                return {
                    data: await response.json() as GoogleAuthResponse,
                    responseText: '',
                };
            } catch {
                return {
                    data: null,
                    responseText: '',
                };
            }
        }

        const responseText = typeof response.text === 'function' ? await response.text() : '';
        const trimmed = responseText.trim();
        if (!trimmed) {
            return { data: null, responseText: '' };
        }

        try {
            return {
                data: JSON.parse(trimmed) as GoogleAuthResponse,
                responseText,
            };
        } catch {
            return {
                data: null,
                responseText,
            };
        }
    };

    const getGoogleAuthInvalidResponseMessage = (response: Response, responseText: string) => {
        const trimmed = responseText.trim();
        const isHtml = trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<');
        const isNotFound = response.status === 404 || /404|This page could not be found/i.test(trimmed);

        if (isHtml && isNotFound) {
            return 'Google sign-in endpoint is unavailable right now. Restart the app or dev server and try again.';
        }

        if (isHtml) {
            return 'Google sign-in returned an HTML error page. Check the server output and try again.';
        }

        if (!trimmed) {
            return 'Google sign-in returned an empty response. Restart the app or dev server and try again.';
        }

        return `Google sign-in returned an unexpected response (${response.status || 'unknown status'}).`;
    };

    const handleGoogleCredential = async (credential: string, clientId?: string) => {
        resetFeedback();
        setIsGoogleLoading(true);
        try {
            const res = await fetch('/api/user/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential, clientId })
            });
            const { data, responseText } = await parseGoogleAuthResponse(res);
            if (!data) {
                setError(getGoogleAuthInvalidResponseMessage(res, responseText));
                return;
            }
            if (!res.ok || !data.success) {
                setError(data.message || 'Google sign-in failed.');
                if (data.email && typeof data.email === 'string') {
                    setRegisterEmail(data.email);
                }
                if (data.code === 'PENDING_APPROVAL' || data.code === 'REQUEST_SUBMITTED') {
                    setMode('register');
                }
                return;
            }

            onLogin(data.user as AuthUser);
        } catch {
            setError('Google sign-in failed. Please try again.');
        } finally {
            setIsGoogleLoading(false);
        }
    };

    const handleGoogleSignIn = () => {
        resetFeedback();
        const activeGoogleClientId = resolveGoogleClientId();
        if (!activeGoogleClientId) {
            setError('Google login is not configured. Open Initial Setup to add your Google client ID.');
            return;
        }
        const googleApi = getGoogleApi();
        if (!googleApi) {
            setError('Google sign-in is still loading. Please try again in a moment.');
            return;
        }

        if (googleInitializedClientIdRef.current !== activeGoogleClientId) {
            googleApi.initialize({
                client_id: activeGoogleClientId,
                callback: (response: GoogleCredentialResponse) => {
                    if (!response.credential) {
                        setError('Google did not return a credential.');
                        return;
                    }
                    void handleGoogleCredential(response.credential, activeGoogleClientId);
                },
                auto_select: false,
            });
            googleInitializedClientIdRef.current = activeGoogleClientId;
        }

        setIsGoogleLoading(true);
        googleApi.prompt((notification: GooglePromptMomentNotification) => {
            const blocked = notification.isNotDisplayed?.();
            if (blocked) {
                setIsGoogleLoading(false);
                setMessage('Google popup blocked or unavailable. Use Request Access with your Google email.');
            }
        });
    };

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        resetFeedback();
        setIsLoading(true);

        try {
            const res = await fetch('/api/user/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, password })
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                setError(data.message || 'Invalid email or password.');
                return;
            }

            onLogin(data.user as AuthUser);
        } catch {
            setError('Login failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        resetFeedback();

        if (registerPassword !== registerConfirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch('/api/user/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: registerEmail,
                    displayName: registerDisplayName,
                    password: registerPassword
                })
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                setError(data.message || 'Registration failed.');
                return;
            }

            setMessage('Registration submitted. Awaiting administrator approval.');
            setIdentifier(registerEmail);
            setPassword('');
            setMode('login');
        } catch {
            setError('Registration failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRequestReset = async (e: React.FormEvent) => {
        e.preventDefault();
        resetFeedback();
        setDebugToken(null);
        setIsLoading(true);

        try {
            const res = await fetch('/api/user/auth/request-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: resetEmail })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setError(data.message || 'Could not start reset flow.');
                return;
            }
            setDebugToken(data.debugToken || null);
            setMessage('Reset instructions sent. Enter the code and your new password.');
            setMode('reset-confirm');
        } catch {
            setError('Could not start reset flow.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        resetFeedback();
        setIsLoading(true);

        try {
            const res = await fetch('/api/user/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: resetEmail,
                    token: resetToken,
                    password: resetNewPassword
                })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setError(data.message || 'Could not reset password.');
                return;
            }
            setMessage('Password updated. You can sign in now.');
            setPassword('');
            setMode('login');
        } catch {
            setError('Could not reset password.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    const handleModalKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Tab') return;
        if (!modalRef.current) return;

        const focusableElements = Array.from(
            modalRef.current.querySelectorAll<HTMLElement>(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
        );

        if (focusableElements.length === 0) {
            event.preventDefault();
            return;
        }

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (event.shiftKey) {
            if (!active || active === first) {
                event.preventDefault();
                last.focus();
            }
            return;
        }

        if (!active || active === last) {
            event.preventDefault();
            first.focus();
        }
    };

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={onClose ?? (() => undefined)}
            title={t('auth.signIn')}
            icon={<LogIn size={14} className="text-primary" />}
            initialWidth={460}
            initialHeight={720}
            minWidth={380}
            minHeight={420}
            zIndex={100}
            closeOnBackdrop={Boolean(onClose)}
        >
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-label="Authentication"
                onKeyDown={handleModalKeyDown}
                className="p-6"
            >
                <div className="text-center mb-5">
                    <h1 className="text-2xl font-bold ui-brand-gradient-text">Creative Flow</h1>
                    <p className="text-sm text-muted-foreground mt-1.5">Sign in with Email/Google. Facebook is coming soon.</p>
                </div>

                {/* Group 1 — use without an account (single, unambiguous entry) */}
                {(onLocalUse || onClose) && (
                    <div className="mb-5">
                        <button
                            type="button"
                            onClick={onLocalUse ?? onClose}
                            className="w-full h-10 rounded-md text-sm font-semibold border border-primary/40 bg-primary/10 text-foreground hover:bg-primary/20 transition-colors flex items-center justify-center gap-2"
                            title="Skip sign-in and use this app locally on this device"
                        >
                            <Laptop className="w-4 h-4" />
                            {t('auth.continueLocal')}
                        </button>
                        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
                            Running on your own computer? Skip the account. Google sign-in is only
                            needed later if you connect Google Drive.
                        </p>
                    </div>
                )}

                {/* Group 2 — provider accounts */}
                <div className="flex items-center gap-3 mb-3">
                    <div className="h-px flex-1 bg-border/60" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Accounts</span>
                    <div className="h-px flex-1 bg-border/60" />
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                    <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={isGoogleLoading}
                        className="h-9 rounded-md text-xs font-semibold border border-border text-foreground hover:bg-secondary transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
                    >
                        {isGoogleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Chrome className="w-4 h-4" />}
                        Continue with Google
                    </button>
                    <button
                        type="button"
                        disabled
                        className="h-9 rounded-md text-xs font-semibold border border-border/60 text-muted-foreground/60 bg-secondary/40 cursor-not-allowed flex items-center justify-center gap-2"
                        title="Facebook login is not enabled yet"
                    >
                        <Facebook className="w-4 h-4" />
                        Facebook (Soon)
                    </button>
                </div>
                <div className="flex items-center justify-between mb-5 text-xs text-muted-foreground">
                    <span>Google/Facebook auth issue?</span>
                    <button
                        type="button"
                        onClick={handleOpenInitialSetup}
                        className="font-semibold text-primary hover:underline"
                    >
                        Initial Setup
                    </button>
                </div>

                {/* Group 3 — email account (sign in / register / recover) */}
                <div className="flex items-center gap-3 mb-3">
                    <div className="h-px flex-1 bg-border/60" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Email</span>
                    <div className="h-px flex-1 bg-border/60" />
                </div>
                <div className="grid grid-cols-3 gap-2 mb-5">
                    {(['login', 'register', 'reset-request'] as const).map((value) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => {
                                resetFeedback();
                                setMode(value);
                            }}
                            className={`h-9 rounded-md text-xs font-semibold border transition-colors ${
                                mode === value || (value === 'reset-request' && mode === 'reset-confirm')
                                    ? 'bg-primary/10 border-primary/40 text-primary'
                                    : 'border-border text-muted-foreground hover:bg-secondary'
                            }`}
                        >
                            {TAB_LABELS[value]}
                        </button>
                    ))}
                </div>

                {mode === 'login' && (
                    <form onSubmit={handleLoginSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <input
                                    type="email"
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 bg-secondary/50 border border-border/50 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                    placeholder="you@example.com"
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 bg-secondary/50 border border-border/50 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                    placeholder="Enter password"
                                    required
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-foreground text-background py-2.5 rounded-lg text-sm font-semibold hover:bg-foreground/90 transition-all flex items-center justify-center gap-2 group mt-2"
                        >
                            {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : 'Sign In'}
                            {!isLoading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                        </button>
                        <button
                            type="button"
                            disabled={isLoading}
                            onClick={startAccessRequest}
                            className="w-full border border-border py-2.5 rounded-lg text-sm font-semibold hover:bg-secondary transition-all flex items-center justify-center gap-2"
                        >
                            Request Access
                            <UserPlus className="w-4 h-4" />
                        </button>
                    </form>
                )}

                {mode === 'register' && (
                    <form onSubmit={handleRegisterSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Display Name</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <input
                                    type="text"
                                    value={registerDisplayName}
                                    onChange={(e) => setRegisterDisplayName(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 bg-secondary/50 border border-border/50 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                    placeholder="Your name"
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <input
                                    type="email"
                                    value={registerEmail}
                                    onChange={(e) => setRegisterEmail(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 bg-secondary/50 border border-border/50 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                    placeholder="you@example.com"
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <input
                                    type="password"
                                    value={registerPassword}
                                    onChange={(e) => setRegisterPassword(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 bg-secondary/50 border border-border/50 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                    placeholder="Min 6 characters"
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Confirm Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <input
                                    type="password"
                                    value={registerConfirmPassword}
                                    onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 bg-secondary/50 border border-border/50 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                    placeholder="Repeat password"
                                    required
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-foreground text-background py-2.5 rounded-lg text-sm font-semibold hover:bg-foreground/90 transition-all flex items-center justify-center gap-2 group mt-2"
                        >
                            {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : 'Request Access'}
                            {!isLoading && <UserPlus className="w-4 h-4" />}
                        </button>
                    </form>
                )}

                {mode === 'reset-request' && (
                    <form onSubmit={handleRequestReset} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Account Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <input
                                    type="email"
                                    value={resetEmail}
                                    onChange={(e) => setResetEmail(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 bg-secondary/50 border border-border/50 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                    placeholder="you@example.com"
                                    required
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-foreground text-background py-2.5 rounded-lg text-sm font-semibold hover:bg-foreground/90 transition-all flex items-center justify-center gap-2 group mt-2"
                        >
                            {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : 'Send Reset Code'}
                            {!isLoading && <KeyRound className="w-4 h-4" />}
                        </button>
                    </form>
                )}

                {mode === 'reset-confirm' && (
                    <form onSubmit={handleResetPassword} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <input
                                    type="email"
                                    value={resetEmail}
                                    onChange={(e) => setResetEmail(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 bg-secondary/50 border border-border/50 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                    placeholder="you@example.com"
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reset Code</label>
                            <div className="relative">
                                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <input
                                    type="text"
                                    value={resetToken}
                                    onChange={(e) => setResetToken(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 bg-secondary/50 border border-border/50 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                    placeholder="Paste code"
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">New Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <input
                                    type="password"
                                    value={resetNewPassword}
                                    onChange={(e) => setResetNewPassword(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 bg-secondary/50 border border-border/50 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                    placeholder="Min 6 characters"
                                    required
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-foreground text-background py-2.5 rounded-lg text-sm font-semibold hover:bg-foreground/90 transition-all flex items-center justify-center gap-2 group mt-2"
                        >
                            {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : 'Update Password'}
                            {!isLoading && <CheckCircle2 className="w-4 h-4" />}
                        </button>
                    </form>
                )}

                {error && (
                    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-xs text-center font-medium">
                        {error}
                    </div>
                )}
                {message && !error && (
                    <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-600 text-xs text-center font-medium">
                        {message}
                    </div>
                )}
                {resetNotice && (
                    <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-600 text-[11px] text-center font-medium">
                        {resetNotice}
                    </div>
                )}
            </div>
        </ModalShell>
    );
}
