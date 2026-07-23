export async function getLocalRuntimeAuthorizationHeaders(): Promise<Record<string, string>> {
    if (typeof window === 'undefined' || !window.desktop?.getLocalCapabilityToken) {
        return {};
    }
    const token = await window.desktop.getLocalCapabilityToken();
    return token ? { 'x-image-express-capability': token } : {};
}
