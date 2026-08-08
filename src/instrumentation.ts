/**
 * Next.js calls `register()` once when the server process starts.
 *
 * Used to establish the local API token before any request arrives. Creating it
 * lazily on first use would mean the MCP bridge — which reads the token at its
 * own startup — failed the first time it ran and only worked after a retry.
 */
export async function register() {
    // Only the Node.js server runtime has a filesystem; the edge runtime also
    // evaluates this module.
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;

    const { ensureLocalApiToken } = await import('@/lib/server/localApiToken');
    ensureLocalApiToken();
}
