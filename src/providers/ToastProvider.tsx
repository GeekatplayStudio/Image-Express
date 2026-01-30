'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastVariant = 'default' | 'success' | 'destructive' | 'warning';

export interface ToastOptions {
    title: string;
    description?: string;
    variant?: ToastVariant;
    duration?: number;
}

interface ToastRecord extends ToastOptions {
    id: string;
}

interface ToastContextType {
    toast: (options: ToastOptions) => void;
    dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

const createId = () => Math.random().toString(36).slice(2, 10);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastRecord[]>([]);
    const timers = useRef<Record<string, number>>({});

    const dismiss = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
        if (timers.current[id]) {
            window.clearTimeout(timers.current[id]);
            delete timers.current[id];
        }
    }, []);

    const toast = useCallback((options: ToastOptions) => {
        const id = createId();
        const record: ToastRecord = {
            id,
            variant: 'default',
            duration: 3200,
            ...options
        };
        setToasts((prev) => [record, ...prev]);

        if (record.duration && record.duration > 0) {
            timers.current[id] = window.setTimeout(() => dismiss(id), record.duration);
        }
    }, [dismiss]);

    const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2">
                {toasts.map((item) => {
                    const variant = item.variant || 'default';
                    const styles =
                        variant === 'success'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                            : variant === 'destructive'
                            ? 'border-destructive/30 bg-destructive/10 text-destructive'
                            : variant === 'warning'
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-600'
                            : 'border-border/60 bg-card text-foreground';

                    const icon =
                        variant === 'success' ? (
                            <CheckCircle size={16} />
                        ) : variant === 'destructive' ? (
                            <AlertTriangle size={16} />
                        ) : variant === 'warning' ? (
                            <AlertTriangle size={16} />
                        ) : (
                            <Info size={16} />
                        );

                    return (
                        <div
                            key={item.id}
                            className={`min-w-[260px] max-w-[360px] rounded-xl border px-4 py-3 shadow-xl backdrop-blur-md bg-background/80 ${styles} animate-in slide-in-from-right-2 fade-in duration-200`}
                        >
                            <div className="flex items-start gap-2">
                                <div className="mt-0.5">{icon}</div>
                                <div className="flex-1">
                                    <p className="text-sm font-semibold leading-tight">{item.title}</p>
                                    {item.description && (
                                        <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                                    )}
                                </div>
                                <button
                                    onClick={() => dismiss(item.id)}
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                    aria-label="Dismiss notification"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}
