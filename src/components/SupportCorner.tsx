'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';

const SUPPORT_URL = 'https://geekatplay.gumroad.com/';

/**
 * Small slide-out support button pinned to the bottom-right corner.
 * Collapsed: just a heart icon. On hover/focus it slides out a short
 * "Support this project" label; clicking opens the Gumroad store.
 */
export default function SupportCorner() {
    const [expanded, setExpanded] = useState(false);

    return (
        <a
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Support this project on Gumroad"
            onMouseEnter={() => setExpanded(true)}
            onMouseLeave={() => setExpanded(false)}
            onFocus={() => setExpanded(true)}
            onBlur={() => setExpanded(false)}
            className="fixed bottom-3 right-3 z-[9997] flex items-center gap-2 rounded-full border border-border bg-card/90 text-muted-foreground shadow-lg backdrop-blur-sm transition-all duration-300 hover:text-foreground hover:border-primary/60 overflow-hidden"
            style={{ padding: '0.45rem', maxWidth: expanded ? '15rem' : '2.1rem' }}
        >
            <Heart size={16} className="shrink-0 text-rose-400" fill="currentColor" />
            <span
                className={`whitespace-nowrap text-[11px] font-medium pr-1 transition-opacity duration-200 ${expanded ? 'opacity-100' : 'opacity-0'}`}
            >
                Support this project
            </span>
        </a>
    );
}
