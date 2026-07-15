'use client';

import { AlertCircle } from 'lucide-react';

/** Privacy note shown under the Services and Comfy tabs. */
export default function SharedKeysNotice() {
    return (
        <div className="flex items-start gap-3 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 xl:col-span-12">
            <AlertCircle size={16} className="text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
                Keys are stored locally in your browser. We never transmit them to our servers, only directly to the AI providers.
            </p>
        </div>
    );
}
