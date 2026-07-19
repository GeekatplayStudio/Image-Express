'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useId } from 'react';
import { AlertTriangle, CheckCircle, Info, HelpCircle } from 'lucide-react';

type DialogType = 'alert' | 'confirm' | 'prompt' | 'choice';

export interface DialogChoice {
    value: string;
    label: string;
    description?: string;
}

interface DialogOptions {
    title?: string;
    description?: string; // Optional description/subtext
    confirmText?: string;
    cancelText?: string;
    defaultValue?: string;
    placeholder?: string;
    variant?: 'default' | 'destructive' | 'success';
    inputType?: 'text' | 'range';
    min?: number;
    max?: number;
    step?: number;
    choices?: DialogChoice[];
}

interface DialogContextType {
    alert: (message: string, options?: DialogOptions) => Promise<void>;
    confirm: (message: string, options?: DialogOptions) => Promise<boolean>;
    prompt: (message: string, options?: DialogOptions) => Promise<string | null>;
    /** Shows a message with a labeled button per choice (plus Cancel); resolves to the chosen value or null. */
    choice: (message: string, choices: DialogChoice[], options?: DialogOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextType | null>(null);

export function useDialog() {
    const context = useContext(DialogContext);
    if (!context) {
        throw new Error("useDialog must be used within a DialogProvider");
    }
    return context;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [config, setConfig] = useState<{
        type: DialogType;
        message: string;
        options: DialogOptions;
    }>({ type: 'alert', message: '', options: {} });
    
    const [inputValue, setInputValue] = useState('');
    
    // Resolvers to handle Promise-based flow
    type DialogResult = boolean | string | null | undefined;
    type DialogRequest = {
        type: DialogType;
        message: string;
        options: DialogOptions;
        resolve: (value: DialogResult) => void;
    };

    const queueRef = useRef<DialogRequest[]>([]);
    const activeRef = useRef<DialogRequest | null>(null);
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const lastActiveElementRef = useRef<HTMLElement | null>(null);
    const titleId = useId();
    const messageId = useId();
    const descriptionId = useId();

    const getInitialInputValue = (options: DialogOptions) => {
        if (options.defaultValue !== undefined) return options.defaultValue;
        if (options.inputType === 'range') return String(options.min ?? 1);
        return '';
    };

    const showNext = useCallback(() => {
        const next = queueRef.current.shift() ?? null;
        activeRef.current = next;
        if (!next) {
            setIsOpen(false);
            return;
        }
        setConfig({ type: next.type, message: next.message, options: next.options });
        setInputValue(getInitialInputValue(next.options));
        setIsOpen(true);
    }, []);

    const resolveActive = useCallback((value: DialogResult) => {
        const active = activeRef.current;
        if (active) {
            active.resolve(value);
        }
        activeRef.current = null;
        showNext();
    }, [showNext]);

    const openDialog = useCallback((type: DialogType, message: string, options: DialogOptions = {}) => {
        return new Promise<DialogResult>((resolve) => {
            if (!activeRef.current && queueRef.current.length === 0) {
                lastActiveElementRef.current = document.activeElement as HTMLElement | null;
            }
            queueRef.current.push({ type, message, options, resolve });
            if (!activeRef.current) {
                showNext();
            }
        });
    }, [showNext]);

    const alert = useCallback((message: string, options?: DialogOptions) => {
        return openDialog('alert', message, { title: 'Alert', confirmText: 'OK', ...options }).then(() => undefined);
    }, [openDialog]);

    const confirm = useCallback((message: string, options?: DialogOptions) => {
        return openDialog('confirm', message, { title: 'Confirm', confirmText: 'Confirm', cancelText: 'Cancel', ...options }).then((result) => result === true);
    }, [openDialog]);

    const prompt = useCallback((message: string, options?: DialogOptions) => {
        return openDialog('prompt', message, { title: 'Input', confirmText: 'OK', cancelText: 'Cancel', ...options }).then((result) => (typeof result === 'string' ? result : null));
    }, [openDialog]);

    const choice = useCallback((message: string, choices: DialogChoice[], options?: DialogOptions) => {
        return openDialog('choice', message, { title: 'Choose', cancelText: 'Cancel', ...options, choices }).then((result) => (typeof result === 'string' ? result : null));
    }, [openDialog]);

    const handleConfirm = useCallback(() => {
        if (config.type === 'confirm') {
            resolveActive(true);
        } else if (config.type === 'prompt') {
            resolveActive(inputValue);
        } else {
            resolveActive(undefined);
        }
    }, [config.type, inputValue, resolveActive]);

    const handleCancel = useCallback(() => {
        if (config.type === 'confirm') {
            resolveActive(false);
        } else if (config.type === 'prompt' || config.type === 'choice') {
            resolveActive(null);
        } else {
            resolveActive(undefined); // Alert treated as closed/OK usually
        }
    }, [config.type, resolveActive]);

    const handleChoice = useCallback((value: string) => {
        resolveActive(value);
    }, [resolveActive]);

    useEffect(() => {
        if (!isOpen) return;

        const dialog = dialogRef.current;
        if (dialog) {
            requestAnimationFrame(() => {
                const focusable = Array.from(
                    dialog.querySelectorAll<HTMLElement>(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                    )
                ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');

                (focusable[0] ?? dialog).focus();
            });
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (!dialogRef.current) return;

            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                handleCancel();
                return;
            }

            if (event.key !== 'Tab') return;

            const focusable = Array.from(
                dialogRef.current.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                )
            ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');

            if (focusable.length === 0) {
                event.preventDefault();
                dialogRef.current.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement as HTMLElement | null;

            if (event.shiftKey && active === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown);

        return () => {
            document.removeEventListener('keydown', onKeyDown);
            if (!activeRef.current) {
                lastActiveElementRef.current?.focus();
            }
        };
    }, [handleCancel, isOpen]);

    const handleBackdropMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) {
            handleCancel();
        }
    };

    // Render the Dialog UI
    return (
        <DialogContext.Provider value={{ alert, confirm, prompt, choice }}>
            {children}
            {isOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                    onMouseDown={handleBackdropMouseDown}
                    data-testid="dialog-backdrop"
                >
                    <div 
                        className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-6 flex flex-col gap-4 mx-4 animate-in zoom-in-95 duration-200"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        aria-describedby={config.options.description ? `${messageId} ${descriptionId}` : messageId}
                        tabIndex={-1}
                        ref={dialogRef}
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-start gap-4">
                            {/* Icon based on variant/type */}
                            <div className={`p-2 rounded-full shrink-0 ${
                                config.options.variant === 'destructive' ? 'bg-destructive/10 text-destructive' :
                                config.options.variant === 'success' ? 'bg-green-500/10 text-green-500' :
                                'bg-primary/10 text-primary'
                            }`}>
                                {config.options.variant === 'destructive' ? <AlertTriangle size={24} /> :
                                 config.options.variant === 'success' ? <CheckCircle size={24} /> :
                                 config.type === 'prompt' ? <HelpCircle size={24} /> :
                                 <Info size={24} />}
                            </div>
                            
                            <div className="flex-1 space-y-1">
                                <h3 id={titleId} className="font-semibold text-lg leading-none">{config.options.title}</h3>
                                <p id={messageId} className="text-muted-foreground text-sm whitespace-pre-line">{config.message}</p>
                                {config.options.description && (
                                    <p id={descriptionId} className="text-xs text-muted-foreground/80 mt-1">{config.options.description}</p>
                                )}
                            </div>
                        </div>

                        {/* Input for Prompt */}
                        {config.type === 'prompt' && (
                            <div className="mt-2 pl-12 pr-1">
                                {config.options.inputType === 'range' ? (
                                    <div className="space-y-2">
                                        <input
                                            autoFocus
                                            type="range"
                                            min={config.options.min ?? 1}
                                            max={config.options.max ?? 100}
                                            step={config.options.step ?? 1}
                                            value={inputValue}
                                            onChange={(e) => setInputValue(e.target.value)}
                                            className="w-full accent-primary"
                                        />
                                        <div className="text-sm text-muted-foreground">
                                            {inputValue || String(config.options.min ?? 1)}
                                        </div>
                                    </div>
                                ) : (
                                    <input
                                        autoFocus
                                        type="text"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleConfirm();
                                            if (e.key === 'Escape') handleCancel();
                                        }}
                                        placeholder={config.options.placeholder}
                                        className="w-full px-3 py-2 rounded-md bg-secondary/50 border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                    />
                                )}
                            </div>
                        )}

                        {/* Choice buttons (one per option) */}
                        {config.type === 'choice' && (
                            <div className="flex flex-col gap-2 pl-12 pr-1">
                                {(config.options.choices || []).map((c) => (
                                    <button
                                        key={c.value}
                                        onClick={() => handleChoice(c.value)}
                                        className="text-left px-4 py-2.5 rounded-lg border border-border hover:border-primary/50 hover:bg-secondary/60 transition-colors"
                                    >
                                        <div className="text-sm font-semibold">{c.label}</div>
                                        {c.description && (
                                            <div className="text-xs text-muted-foreground mt-0.5">{c.description}</div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex justify-end gap-3 mt-4">
                            {(config.type === 'confirm' || config.type === 'prompt' || config.type === 'choice') && (
                                <button
                                    onClick={handleCancel}
                                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
                                >
                                    {config.options.cancelText || 'Cancel'}
                                </button>
                            )}
                            {config.type !== 'choice' && (
                                <button
                                    onClick={handleConfirm}
                                    className={`px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all text-white ${
                                        config.options.variant === 'destructive'
                                        ? 'bg-destructive hover:bg-destructive/90'
                                        : 'bg-primary hover:bg-primary/90'
                                    }`}
                                >
                                    {config.options.confirmText || 'OK'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </DialogContext.Provider>
    );
}
