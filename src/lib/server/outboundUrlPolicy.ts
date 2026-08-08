import { getRuntimeProfile } from '@/lib/server/runtimeProfile';

/**
 * Decides which URLs the server is willing to fetch on a caller's behalf.
 *
 * Several routes take a URL from the request and fetch it server-side. Without
 * a policy that is a server-side request forgery primitive: the caller picks an
 * address the server can reach but they cannot, and gets the bytes back. The
 * previous check was `/^https?:\/\//`, which permits `169.254.169.254` — the
 * cloud metadata endpoint — and every address on the host's LAN.
 *
 * The rules are **profile-aware**, because the same address means different
 * things in different deployments:
 *
 * - On a local install, `127.0.0.1` is the user's own ComfyUI or Ollama, and
 *   saving a generated image legitimately fetches from it. Blocking loopback
 *   there would break a working feature to prevent an attack that requires
 *   already having code on the machine.
 * - On a self-hosted server, `127.0.0.1` is the *server*, and its private
 *   network is somebody else's infrastructure. There, internal addresses are
 *   refused.
 *
 * Link-local is refused everywhere. Nothing legitimate fetches from it, and it
 * is the single most valuable target — cloud instance credentials live there.
 */

export class OutboundUrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OutboundUrlError';
    }
}

/** 169.254.0.0/16 and the IPv6 equivalent. Cloud metadata lives here. */
function isLinkLocal(hostname: string): boolean {
    if (/^169\.254\./.test(hostname)) return true;
    const bare = hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return bare.startsWith('fe80:');
}

function isLoopback(hostname: string): boolean {
    const bare = hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return bare === 'localhost'
        || bare === '::1'
        || bare === '0.0.0.0'
        || /^127\./.test(bare);
}

/** RFC1918 plus carrier-grade NAT, which is also not routable from outside. */
function isPrivateNetwork(hostname: string): boolean {
    if (/^10\./.test(hostname)) return true;
    if (/^192\.168\./.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(hostname)) return true;
    const bare = hostname.replace(/^\[|\]$/g, '').toLowerCase();
    // Unique local IPv6.
    if (/^f[cd][0-9a-f]{2}:/.test(bare)) return true;
    return /\.(local|internal|localdomain)$/i.test(hostname);
}

/**
 * Validate a caller-supplied URL before the server fetches it.
 *
 * Throws `OutboundUrlError` with a reason safe to show the caller — it names
 * the category refused, never whether a specific internal host exists, which
 * would turn the error message into a port scanner.
 */
export function assertFetchableUrl(rawUrl: string): URL {
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new OutboundUrlError('A valid absolute URL is required.');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        // Blocks file:, data:, ftp: and anything else that would read local
        // resources rather than make a network request.
        throw new OutboundUrlError('Only http and https URLs can be fetched.');
    }

    if (parsed.username || parsed.password) {
        throw new OutboundUrlError('URLs with embedded credentials are not accepted.');
    }

    const hostname = parsed.hostname;
    if (!hostname) {
        throw new OutboundUrlError('A valid absolute URL is required.');
    }

    if (isLinkLocal(hostname)) {
        throw new OutboundUrlError('That address range cannot be fetched.');
    }

    if (getRuntimeProfile() === 'self-hosted' && (isLoopback(hostname) || isPrivateNetwork(hostname))) {
        throw new OutboundUrlError('Internal addresses cannot be fetched on this deployment.');
    }

    return parsed;
}

/** Non-throwing form, for callers that already have their own error shape. */
export function isFetchableUrl(rawUrl: string): boolean {
    try {
        assertFetchableUrl(rawUrl);
        return true;
    } catch {
        return false;
    }
}
