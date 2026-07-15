'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@/lib/i18n';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Compact language dropdown for the top bar. Shows the active language
 * code next to a globe icon; the menu lists every supported language by
 * its native name. Closes on outside click and Escape.
 */
export default function LanguageSelector({ className }: { className?: string }) {
    const { language, setLanguage, t } = useI18n();
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const handlePointerDown = (event: PointerEvent) => {
            if (rootRef.current && event.target instanceof Node && rootRef.current.contains(event.target)) {
                return;
            }
            setOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        window.addEventListener('pointerdown', handlePointerDown, true);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('pointerdown', handlePointerDown, true);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    return (
        <div className={cn('relative', className)} ref={rootRef}>
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className={cn(
                    'h-9 px-2.5 rounded-full border inline-flex items-center gap-1.5 text-xs font-semibold transition-colors',
                    open
                        ? 'bg-primary/10 border-primary/40 text-primary'
                        : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
                title={t('common.language')}
                aria-label={t('common.language')}
                aria-expanded={open}
                aria-haspopup="listbox"
            >
                <Globe size={15} />
                <span className="uppercase">{language}</span>
            </button>
            {open && (
                <div
                    className="absolute right-0 top-11 z-[140] w-52 max-h-[min(420px,70vh)] overflow-y-auto rounded-lg border border-border bg-popover shadow-xl p-1 animate-in fade-in zoom-in-95 duration-100"
                    role="listbox"
                    aria-label={t('common.language')}
                >
                    {SUPPORTED_LANGUAGES.map((entry) => (
                        <button
                            key={entry.code}
                            type="button"
                            role="option"
                            aria-selected={entry.code === language}
                            onClick={() => {
                                setLanguage(entry.code as LanguageCode);
                                setOpen(false);
                            }}
                            className={cn(
                                'w-full h-8 px-2 rounded-md text-xs text-left inline-flex items-center gap-2 hover:bg-secondary',
                                entry.code === language && 'bg-primary/10 text-primary font-semibold'
                            )}
                        >
                            <span className="w-4 shrink-0">
                                {entry.code === language && <Check size={13} />}
                            </span>
                            <span className="flex-1 truncate">{entry.nativeLabel}</span>
                            <span className="text-[10px] uppercase text-muted-foreground">{entry.code}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
