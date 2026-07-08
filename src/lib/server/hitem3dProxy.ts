import { NextResponse } from 'next/server';
import { isExpiredTokenResponse, resolveHitem3dAuth } from '@/lib/hitem3dAuth';

export const HITEM3D_BASE_URL = 'https://api.hitem3d.ai/open-api/v1';

type SendRequest = (authorization: string) => Promise<Response>;

/**
 * Sends a request to the Hi3D open API with the shared auth handling used by
 * every Hitem3D proxy route: resolve bearer/basic auth, retry once with a fresh
 * token when the cached one expired, and pass the upstream JSON through.
 */
export async function proxyHitem3dRequest(rawAuthHeader: string, sendRequest: SendRequest) {
  let auth = await resolveHitem3dAuth(rawAuthHeader);
  let res = await sendRequest(auth.authorization);
  let responseText = await res.text();

  let jsonPayload: unknown = null;
  try {
    jsonPayload = responseText ? JSON.parse(responseText) : null;
  } catch {
    jsonPayload = null;
  }

  if (auth.source === 'basic' && isExpiredTokenResponse(res.status, jsonPayload, responseText)) {
    auth = await resolveHitem3dAuth(rawAuthHeader, true);
    res = await sendRequest(auth.authorization);
    responseText = await res.text();
    try {
      jsonPayload = responseText ? JSON.parse(responseText) : null;
    } catch {
      jsonPayload = null;
    }
  }

  const payload = (jsonPayload && typeof jsonPayload === 'object')
    ? (jsonPayload as Record<string, unknown>)
    : null;

  if (!res.ok) {
    const basePayload = payload || {
      message: `Hitem3D API Error: ${res.statusText}`,
      detail: responseText ? responseText.slice(0, 400) : 'Empty upstream response body.',
    };
    return NextResponse.json(basePayload, { status: res.status });
  }

  return NextResponse.json(payload || {}, { status: res.status });
}

export function buildHitem3dHeaders(authorization: string, appIdHeader: string | null) {
  return {
    Authorization: authorization,
    Accept: 'application/json',
    ...(appIdHeader ? { Appid: appIdHeader } : {}),
  };
}
