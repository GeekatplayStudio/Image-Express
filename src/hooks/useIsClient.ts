'use client';

import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

/**
 * Returns false during SSR and the first (hydration) render, true thereafter.
 *
 * Hydration-safe alternative to a `useState(false)` + `useEffect(setTrue)` mount
 * flag: it reports the same value the server rendered, then flips on the client
 * without a synchronous setState inside an effect (which cascades a re-render and
 * is flagged by react-hooks/set-state-in-effect). Use to guard client-only work
 * such as portalling into `document.body`.
 */
export default function useIsClient(): boolean {
    return useSyncExternalStore(
        emptySubscribe,
        () => true,
        () => false,
    );
}
