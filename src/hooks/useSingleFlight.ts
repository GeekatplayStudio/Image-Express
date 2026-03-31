'use client';

import { useCallback, useRef } from 'react';

export default function useSingleFlight() {
    const inFlightRef = useRef(false);

    const runSingleFlight = useCallback(async <T>(action: () => Promise<T> | T): Promise<T | undefined> => {
        if (inFlightRef.current) {
            return undefined;
        }

        inFlightRef.current = true;
        try {
            return await action();
        } finally {
            inFlightRef.current = false;
        }
    }, []);

    return runSingleFlight;
}