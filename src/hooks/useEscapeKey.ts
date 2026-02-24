'use client';

import { useEffect } from 'react';

interface UseEscapeKeyOptions {
    enabled?: boolean;
    ignoreWhenInputFocused?: boolean;
}

export default function useEscapeKey(
    onEscape: () => void,
    options?: UseEscapeKeyOptions
) {
    const enabled = options?.enabled ?? true;
    const ignoreWhenInputFocused = options?.ignoreWhenInputFocused ?? false;

    useEffect(() => {
        if (!enabled) return;

        const handler = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (ignoreWhenInputFocused) {
                const target = event.target as HTMLElement | null;
                const isInputFocused = !!target && (
                    target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.tagName === 'SELECT' ||
                    target.isContentEditable
                );
                if (isInputFocused) return;
            }

            event.preventDefault();
            onEscape();
        };

        window.addEventListener('keydown', handler);
        return () => {
            window.removeEventListener('keydown', handler);
        };
    }, [enabled, ignoreWhenInputFocused, onEscape]);
}
