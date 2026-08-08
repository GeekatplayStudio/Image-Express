import { ApiRequestError } from '@/lib/server/apiContract';
import { requestHasLocalApiToken } from '@/lib/server/localApiToken';

/**
 * Who is allowed to invoke a route that changes or destroys something.
 *
 * The server listens on localhost, which means every page in the user's browser
 * can reach it. Three kinds of caller arrive:
 *
 * 1. **The app's own UI** — a same-origin browser request. Browsers label these
 *    `Sec-Fetch-Site: same-origin`, and the label cannot be forged by a page.
 * 2. **An authorised local tool** — the MCP bridge, carrying the local API
 *    token from the app's data directory.
 * 3. **Someone else's web page** — a cross-site request. It cannot read the
 *    reply, but the *side effect* still happens, which is enough to delete a
 *    design or install a pack from an address the attacker chose.
 *
 * Only the third is refused. Requests with no `Sec-Fetch-Site` header at all
 * (curl, scripts, older browsers) are allowed: a local process can already act
 * directly on the files, so refusing them would cost real usability and buy
 * nothing. That is a stated limit, not an oversight.
 */

export type CallerKind = 'ui' | 'local-tool' | 'unlabelled' | 'cross-site';

export function classifyCaller(request: Request): CallerKind {
    if (requestHasLocalApiToken(request)) return 'local-tool';

    const site = request.headers.get('sec-fetch-site');
    if (!site) return 'unlabelled';
    if (site === 'same-origin' || site === 'none') return 'ui';
    // 'cross-site' and 'same-site' both mean another origin drove this.
    return 'cross-site';
}

/**
 * Refuse a request driven by another origin.
 *
 * Throws `ApiRequestError` so routes already funnelling errors through
 * `parseJsonRequest` need no extra branch.
 */
export function assertTrustedCaller(request: Request): CallerKind {
    const kind = classifyCaller(request);
    if (kind === 'cross-site') {
        throw new ApiRequestError(
            'cross_site_request_blocked',
            'This action cannot be triggered from another site.',
            403,
        );
    }
    return kind;
}
