'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GeneratorSectionProps {
    title: string;
    /** Optional short helper line under the title. */
    hint?: string;
    /** Optional small element rendered on the right of the header row. */
    badge?: React.ReactNode;
    defaultOpen?: boolean;
    children: React.ReactNode;
    className?: string;
}

/**
 * Collapsible section used to organize the Generative AI window into
 * digestible groups (provider, prompt, engine, workflows, ...).
 */
export default function GeneratorSection({
    title,
    hint,
    badge,
    defaultOpen = true,
    children,
    className,
}: GeneratorSectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <section className={cn('rounded-lg border border-border/70 bg-secondary/10', className)}>
            <button
                type="button"
                onClick={() => setIsOpen((previous) => !previous)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                aria-expanded={isOpen}
            >
                <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground">{title}</div>
                    {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {badge}
                    <ChevronDown
                        size={14}
                        className={cn('text-muted-foreground transition-transform', isOpen ? 'rotate-180' : '')}
                    />
                </div>
            </button>
            {/* Children stay mounted while collapsed so canvases/inputs keep their state. */}
            <div className={cn('space-y-2 border-t border-border/60 px-3 py-3', !isOpen && 'hidden')}>{children}</div>
        </section>
    );
}
