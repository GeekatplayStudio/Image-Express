'use client';

import { useMemo, useState } from 'react';
import { User, Lock, ArrowRight, Loader2, Mail, UserPlus, KeyRound, CheckCircle2 } from 'lucide-react';
import { AuthUser } from '@/types';
import useEscapeKey from '@/hooks/useEscapeKey';

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

    const resetNotice = useMemo(() => {
        if (!debugToken) return null;
        return `Dev reset code: ${debugToken}`;
    }, [debugToken]);

    useEscapeKey(() => {
        onClose?.();
    }, { enabled: isOpen && typeof onClose === 'function' });

    const resetFeedback = () => {
        setError('');
        setMessage('');
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

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-card w-full max-w-md p-8 rounded-2xl shadow-2xl border border-border/50 animate-in zoom-in-95 duration-300">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">Creative Flow</h1>
                    <p className="text-sm text-muted-foreground mt-2">Secure access by email with admin approvals</p>
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
