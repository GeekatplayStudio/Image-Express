'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { X, AlertTriangle, CheckCircle, Info, HelpCircle } from 'lucide-react';

type DialogType = 'alert' | 'confirm' | 'prompt';

interface DialogOptions {
    title?: string;
    description?: string; // Optional description/subtext
    confirmText?: string;
    cancelText?: string;
    defaultValue?: string;
    placeholder?: string;
    variant?: 'default' | 'destructive' | 'success'; 
}

interface DialogContextType {
    alert: (message: string, options?: DialogOptions) => Promise<void>;
    confirm: (message: string, options?: DialogOptions) => Promise<boolean>;
    prompt: (message: string, options?: DialogOptions) => Promise<string | null>;
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
    const resolveRef = useRef<(value: DialogResult) => void>(() => {});

    const openDialog = (type: DialogType, message: string, options: DialogOptions = {}) => {
        return new Promise<DialogResult>((resolve) => {
            setConfig({ type, message, options });
            setInputValue(options.defaultValue || '');
            setIsOpen(true);
            resolveRef.current = resolve;
        });
    };

    const alert = useCallback((message: string, options?: DialogOptions) => {
        return openDialog('alert', message, { title: 'Alert', confirmText: 'OK', ...options }).then(() => undefined);
    }, []);

    const confirm = useCallback((message: string, options?: DialogOptions) => {
        return openDialog('confirm', message, { title: 'Confirm', confirmText: 'Confirm', cancelText: 'Cancel', ...options }).then((result) => result === true);
    }, []);

    const prompt = useCallback((message: string, options?: DialogOptions) => {
        return openDialog('prompt', message, { title: 'Input', confirmText: 'OK', cancelText: 'Cancel', ...options }).then((result) => (typeof result === 'string' ? result : null));
    }, []);

    const handleConfirm = () => {
        setIsOpen(false);
        if (config.type === 'confirm') {
            resolveRef.current(true);
        } else if (config.type === 'prompt') {
            resolveRef.current(inputValue);
        } else {
            resolveRef.current(undefined);
        }
    };

    const handleCancel = () => {
        setIsOpen(false);
        if (config.type === 'confirm') {
            resolveRef.current(false);
        } else if (config.type === 'prompt') {
            resolveRef.current(null);
        } else {
            resolveRef.current(undefined); // Alert treated as closed/OK usually
        }
    };

    // Render the Dialog UI
    return (
        <DialogContext.Provider value={{ alert, confirm, prompt }}>
            {children}
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div 
                        className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-6 flex flex-col gap-4 mx-4 animate-in zoom-in-95 duration-200"
                        role="dialog"
                        aria-modal="true"
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
                                <h3 className="font-semibold text-lg leading-none">{config.options.title}</h3>
                                <p className="text-muted-foreground text-sm">{config.message}</p>
                                {config.options.description && (
                                    <p className="text-xs text-muted-foreground/80 mt-1">{config.options.description}</p>
                                )}
                            </div>
                        </div>

                        {/* Input for Prompt */}
                        {config.type === 'prompt' && (
                            <div className="mt-2 pl-12 pr-1">
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
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex justify-end gap-3 mt-4">
                            {(config.type === 'confirm' || config.type === 'prompt') && (
                                <button
                                    onClick={handleCancel}
                                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
                                >
                                    {config.options.cancelText || 'Cancel'}
                                </button>
                            )}
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
                        </div>
                    </div>
                </div>
            )}
        </DialogContext.Provider>
    );
}
