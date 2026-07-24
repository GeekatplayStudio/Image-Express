'use client';

import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import useIsClient from '@/hooks/useIsClient';

/**
 * Renders children into <body> so they escape any ancestor stacking context.
 *
 * Overlays mounted deep inside the editor (e.g. within the toolbar's z-20
 * aside) are otherwise trapped in that lower-z stacking context: a `fixed`
 * child with a high z-index still cannot rise above the editor header/rails,
 * because positioning does not escape stacking contexts. Portalling to <body>
 * lifts the overlay into the root stacking context where its z-index applies
 * against the rest of the app.
 */
export default function BodyPortal({ children }: { children: ReactNode }) {
    const isClient = useIsClient();
    if (!isClient) return null;
    return createPortal(children, document.body);
}
