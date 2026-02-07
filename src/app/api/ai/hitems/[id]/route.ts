import { NextRequest, NextResponse } from 'next/server';
import { isExpiredTokenResponse, resolveHitem3dAuth } from '@/lib/hitem3dAuth';

const BASE_URL = 'https://api.hitem3d.ai/open-api/v1';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rawAuthHeader = req.headers.get('authorization');
    const appIdHeader = req.headers.get('appid') || req.headers.get('x-hitems-appid');
    const debugEnabled = req.headers.get('x-hitem-debug') === '1';

    if (!rawAuthHeader) {
      return NextResponse.json({ message: 'Missing Authorization header' }, { status: 401 });
    }

    const sendRequest = async (authorization: string) =>
      fetch(`${BASE_URL}/query-task?task_id=${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: {
          Authorization: authorization,
          Accept: 'application/json',
          ...(appIdHeader ? { Appid: appIdHeader } : {}),
        },
      });

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

    const debugInfo = debugEnabled
      ? {
          endpoint: `${BASE_URL}/query-task`,
          authType: auth.source,
          appId: Boolean(appIdHeader),
          taskId: id,
          status: res.status,
        }
      : null;
    if (debugInfo) {
      console.info('[Hitem3D] query-task', debugInfo);
      if (!res.ok) {
        console.info('[Hitem3D] query-task response', responseText);
      }
    }

    const spreadPayload = (jsonPayload && typeof jsonPayload === 'object') ? (jsonPayload as Record<string, unknown>) : {};

    if (!res.ok) {
      console.error(`Hitem3D Query failed [${res.status}]:`, responseText);
      const basePayload =
        (jsonPayload && typeof jsonPayload === 'object')
          ? jsonPayload
          : { message: `Hitem3D API Error: ${res.statusText}`, detail: responseText };
      return NextResponse.json(
        debugInfo ? { ...basePayload, _debug: debugInfo } : basePayload,
        { status: res.status }
      );
    }

    return NextResponse.json(
      debugInfo ? { ...spreadPayload, _debug: debugInfo } : spreadPayload,
      { status: res.status }
    );
  } catch (error) {
    console.error('Hitem3D Poll Proxy Error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
