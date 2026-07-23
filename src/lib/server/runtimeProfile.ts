import { NextResponse } from 'next/server';

export type RuntimeProfile = 'desktop-local' | 'developer-local' | 'self-hosted';
export type LocalRuntimeCapability =
    | 'app:update'
    | 'dependencies:manage'
    | 'runtime:install';

const VALID_PROFILES = new Set<RuntimeProfile>([
    'desktop-local',
    'developer-local',
    'self-hosted',
]);

export function getRuntimeProfile(): RuntimeProfile {
    const configured = process.env.IMAGE_EXPRESS_RUNTIME?.trim() as RuntimeProfile | undefined;
    if (configured && VALID_PROFILES.has(configured)) {
        return configured;
    }
    if (process.env.NEXT_DESKTOP === '1') {
        return 'desktop-local';
    }
    return process.env.NODE_ENV === 'production' ? 'self-hosted' : 'developer-local';
}

function isLoopbackHostname(hostname: string) {
    const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return normalized === 'localhost'
        || normalized === '127.0.0.1'
        || normalized === '::1';
}

function isLoopbackRequest(request: Request) {
    try {
        return isLoopbackHostname(new URL(request.url).hostname);
    } catch {
        return false;
    }
}

function hasDesktopCapabilityToken(request: Request) {
    const expected = process.env.IMAGE_EXPRESS_LOCAL_CAPABILITY_TOKEN?.trim();
    const provided = request.headers.get('x-image-express-capability')?.trim();
    return Boolean(expected && provided && expected === provided);
}

export function authorizeLocalRuntimeCapability(
    request: Request,
    capability: LocalRuntimeCapability,
): NextResponse | null {
    const profile = getRuntimeProfile();

    if (profile === 'self-hosted') {
        return NextResponse.json({
            message: `${capability} is disabled in self-hosted mode.`,
        }, { status: 403 });
    }
    if (!isLoopbackRequest(request)) {
        return NextResponse.json({
            message: `${capability} is only available from the local machine.`,
        }, { status: 403 });
    }
    if (profile === 'desktop-local' && !hasDesktopCapabilityToken(request)) {
        return NextResponse.json({
            message: 'The desktop capability token is missing or invalid.',
        }, { status: 403 });
    }
    return null;
}
