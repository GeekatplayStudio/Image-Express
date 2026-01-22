'use client';

import { useState } from 'react';
import { User, Lock, ArrowRight, Loader2 } from 'lucide-react';

interface LoginModalProps {
    isOpen: boolean;
    onLogin: (username: string) => void;
}

export default function LoginModal({ isOpen, onLogin }: LoginModalProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        // Mock delay
        await new Promise(resolve => setTimeout(resolve, 800));

        if (username === 'test' && password === 'test') {
            onLogin(username);
        } else {
            setError('Invalid credentials. Try test/test');
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-card w-full max-w-sm p-8 rounded-2xl shadow-2xl border border-border/50 animate-in zoom-in-95 duration-300">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">Creative Flow</h1>
                    <p className="text-sm text-muted-foreground mt-2">Sign in to your workspace</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Username</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                            <input 
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 bg-secondary/50 border border-border/50 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                placeholder="Enter username"
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

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-xs text-center font-medium">
                            {error}
                        </div>
                    )}

                    <button 
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-foreground text-background py-2.5 rounded-lg text-sm font-semibold hover:bg-foreground/90 transition-all flex items-center justify-center gap-2 group mt-6"
                    >
                        {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : 'Sign In'}
                        {!isLoading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                    </button>
                    
                    <div className="text-center mt-4">
                         <p className="text-xs text-muted-foreground">Demo credentials: <code className="bg-secondary px-1 py-0.5 rounded text-foreground">test</code> / <code className="bg-secondary px-1 py-0.5 rounded text-foreground">test</code></p>
                    </div>
                </form>
            </div>
        </div>
    );
}
