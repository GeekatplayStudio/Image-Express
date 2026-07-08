import { NextRequest, NextResponse } from 'next/server';
import { isExpiredTokenResponse, resolveHitem3dAuth } from '@/lib/hitem3dAuth';

const BASE_URL = 'https://api.hitem3d.ai/open-api/v1';
const PROBE_TASK_ID = 'codex_hitem3d_validation_probe';

const extractMessage = (payload: unknown, fallbackText: string) => {
  if (!payload || typeof payload !== 'object') return fallbackText;
  const record = payload as Record<string, unknown>;
  const message =
    (typeof record.message === 'string' ? record.message : null) ||
    (typeof record.msg === 'string' ? record.msg : null) ||
    (typeof record.detail === 'string' ? record.detail : null) ||
    (typeof record.error === 'string' ? record.error : null);
  if (message) return message;
  const data = record.data;
  if (data && typeof data === 'object') {
    const inner = data as Record<string, unknown>;
    const nested =
      (typeof inner.message === 'string' ? inner.message : null) ||
      (typeof inner.msg === 'string' ? inner.msg : null) ||
      (typeof inner.task_msg === 'string' ? inner.task_msg : null);
    if (nested) return nested;
  }
  return fallbackText;
};

export async function GET(req: NextRequest) {
  try {
    const rawAuthHeader = req.headers.get('authorization');
    if (!rawAuthHeader) {
      return NextResponse.json({ valid: false, message: 'Missing Authorization header.' }, { status: 401 });
    }

    const appIdHeader = req.headers.get('appid') || req.headers.get('x-hitems-appid');

    const sendProbe = async (authorization: string) =>
      fetch(`${BASE_URL}/query-task?task_id=${encodeURIComponent(PROBE_TASK_ID)}`, {
        method: 'GET',
        headers: {
          Authorization: authorization,
          Accept: 'application/json',
          ...(appIdHeader ? { Appid: appIdHeader } : {}),
        },
      });

    let auth = await resolveHitem3dAuth(rawAuthHeader);
    let res = await sendProbe(auth.authorization);
    let responseText = await res.text();
    let jsonPayload: unknown = null;
    try {
      jsonPayload = responseText ? JSON.parse(responseText) : null;
    } catch {
      jsonPayload = null;
    }

    if (auth.source === 'basic' && isExpiredTokenResponse(res.status, jsonPayload, responseText)) {
      auth = await resolveHitem3dAuth(rawAuthHeader, true);
      res = await sendProbe(auth.authorization);
      responseText = await res.text();
      try {
        jsonPayload = responseText ? JSON.parse(responseText) : null;
      } catch {
        jsonPayload = null;
      }
    }

    const message = extractMessage(
      jsonPayload,
      responseText || `Probe returned HTTP ${res.status}.`
    );

    if (res.status === 401 || res.status === 403 || isExpiredTokenResponse(res.status, jsonPayload, responseText)) {
      return NextResponse.json(
        {
          valid: false,
          message: message || 'Authorization failed. Verify Hitem key/token.',
          authType: auth.source,
          appIdConfigured: Boolean(appIdHeader),
          status: res.status,
        },
        { status: 401 }
      );
    }

    if (!appIdHeader && /appid|app id|app_id|missing appid|required appid/i.test(message)) {
      return NextResponse.json(
        {
          valid: false,
          message: 'Hitem App ID appears required for this account. Add it in Settings.',
          detail: message,
          authType: auth.source,
          appIdConfigured: false,
          status: res.status,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      message: 'Hitem credentials are accepted.',
      detail: message,
      authType: auth.source,
      appIdConfigured: Boolean(appIdHeader),
      status: res.status,
    });
  } catch (error) {
    console.error('Hitem3D Validate Error:', error);
    return NextResponse.json(
      {
        valid: false,
        message: error instanceof Error ? error.message : 'Validation request failed.',
      },
      { status: 500 }
    );
  }
}

