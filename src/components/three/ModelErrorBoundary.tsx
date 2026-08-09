'use client';

import { Component, type ReactNode } from 'react';

/**
 * Contains a 3D model load failure so it cannot take the app down.
 *
 * `useGLTF` loads under Suspense and **throws** when the fetch fails. With no
 * boundary above it that error propagates to the React root and unmounts the
 * whole tree — which is exactly what a user saw as the browser's "This page
 * couldn't load" after a Tripo result failed to fetch: one bad URL, entire
 * editor gone, unsaved work with it.
 *
 * A model that will not load is a normal outcome (an expired link, a mesh
 * format three.js cannot parse, a truncated download). It deserves a message,
 * not a crash.
 */
type Props = {
    children: ReactNode;
    /** Rendered in place of the children once a load has failed. */
    fallback?: ReactNode;
    onError?: (error: Error) => void;
};

export class ModelErrorBoundary extends Component<Props, { error: Error | null }> {
    state: { error: Error | null } = { error: null };

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    componentDidCatch(error: Error) {
        // Logged rather than swallowed: a load failure the user reports should
        // be findable in the console with its real cause.
        console.error('3D model failed to load:', error);
        this.props.onError?.(error);
    }

    render() {
        if (this.state.error) return this.props.fallback ?? null;
        return this.props.children;
    }
}

export default ModelErrorBoundary;
