'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { User, Lock, ArrowRight, Loader2, Mail, UserPlus, KeyRound, CheckCircle2, Chrome, Facebook } from 'lucide-react';
import { AuthUser } from '@/types';
import useEscapeKey from '@/hooks/useEscapeKey';
import { loadDriveConfig } from '@/lib/googleDrive';

type GoogleCredentialResponse = {
    credential?: string;
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
}

type AuthMode = 'login' | 'register' | 'reset-request' | 'reset-confirm';

const TAB_LABELS: Record<AuthMode, string> = {
    login: 'Sign In',
    register: 'Register',
    'reset-request': 'Recover',
    'reset-confirm': 'Recover'
};

export default function LoginModal({ isOpen, onLogin, onClose }: LoginModalProps) {
    const modalRef = useRef<HTMLDivElement | null>(null);
    const googleInitializedRef = useRef(false);
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

    useEscapeKey(() => {
        onClose?.();
    }, { enabled: isOpen && typeof onClose === 'function' });

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

    const startAccessRequest = (provider: 'email') => {
        resetFeedback();
        setMode('register');
        if (!registerEmail && identifier.includes('@')) {
            setRegisterEmail(identifier.trim());
        }
    };

    const handleGoogleCredential = async (credential: string) => {
        resetFeedback();
        setIsGoogleLoading(true);
        try {
            const res = await fetch('/api/user/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential })
            });
            const data = await res.json();
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
        if (!googleClientId) {
            setError('Google login is not configured. Set NEXT_PUBLIC_GOOGLE_AUTH_CLIENT_ID, NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID, or configure the Google client ID in Settings.');
            return;
        }
        const googleApi = getGoogleApi();
        if (!googleApi) {
            setError('Google sign-in is still loading. Please try again in a moment.');
            return;
        }

        if (!googleInitializedRef.current) {
            googleApi.initialize({
                client_id: googleClientId,
                callback: (response: GoogleCredentialResponse) => {
                    if (!response.credential) {
                        setError('Google did not return a credential.');
                        return;
                    }
                    void handleGoogleCredential(response.credential);
                },
                auto_select: false,
            });
            googleInitializedRef.current = true;
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

            setMessage('Registration submitted. Await admin approval at geekatplay@gmail.com.');
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
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-label="Authentication"
                onKeyDown={handleModalKeyDown}
                className="bg-card w-full max-w-md p-8 rounded-2xl shadow-2xl border border-border/50 animate-in zoom-in-95 duration-300"
            >
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold ui-brand-gradient-text">Creative Flow</h1>
                    <p className="text-sm text-muted-foreground mt-2">Sign in with Email/Google. Facebook is coming soon.</p>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
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
                            onClick={() => startAccessRequest('email')}
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
        </div>
    );
}
