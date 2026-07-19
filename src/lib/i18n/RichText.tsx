'use client';

import React from 'react';

/**
 * Render a translated string whose {placeholders} resolve to React nodes.
 *
 * Plain `t('key', { name: 'value' })` can only substitute strings, so a
 * sentence that wraps an element — a <code> token, a link, a bold run — had to
 * either be split into fragments (unusable for translators, since word order
 * changes per language) or lose its markup.
 *
 * This keeps the sentence as one translatable key AND preserves the markup:
 *
 *   <RichText
 *       template={t('comfy.cloudAuthHint')}          // 'Cloud requests use the {header} header…'
 *       values={{ header: <code className="font-mono">X-API-Key</code> }}
 *   />
 *
 * An unmatched placeholder is left visible rather than dropped, matching the
 * behaviour of translate() — a missing value should be obvious, not silent.
 */
export function RichText({
    template,
    values,
}: {
    template: string;
    values: Record<string, React.ReactNode>;
}) {
    // Split on {name}, keeping the captured names so they can be swapped for nodes.
    const parts = template.split(/(\{\w+\})/g);
    return (
        <>
            {parts.map((part, index) => {
                const match = /^\{(\w+)\}$/.exec(part);
                if (!match) return <React.Fragment key={index}>{part}</React.Fragment>;
                const name = match[1];
                if (!(name in values)) {
                    // Leave the placeholder visible so the gap is noticeable.
                    return <React.Fragment key={index}>{part}</React.Fragment>;
                }
                return <React.Fragment key={index}>{values[name]}</React.Fragment>;
            })}
        </>
    );
}
