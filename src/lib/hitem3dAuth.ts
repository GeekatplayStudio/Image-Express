type CachedToken = {
  token: string;
  tokenType: string;
  fetchedAt: number;
};

type ResolvedAuth = {
  authorization: string;
  source: 'bearer' | 'basic';
  cacheKey?: string;
};

const BASE_URL = 'https://api.hitem3d.ai/open-api/v1';
const TOKEN_TTL_MS = 50 * 60 * 1000;
const tokenCache = new Map<string, CachedToken>();

const toBasicHeader = (raw: string) => {
  const encoded = Buffer.from(raw, 'utf8').toString('base64');
  return `Basic ${encoded}`;
};

const normalizeAuthHeader = (rawHeader: string) => {
  const trimmed = rawHeader.trim();
  if (/^Bearer\s+/i.test(trimmed)) {
    return { kind: 'bearer' as const, header: trimmed };
  }
  if (/^Basic\s+/i.test(trimmed)) {
    return { kind: 'basic' as const, header: trimmed };
  }
  if (trimmed.includes(':')) {
    return { kind: 'basic' as const, header: toBasicHeader(trimmed) };
  }
  return { kind: 'bearer' as const, header: `Bearer ${trimmed}` };
};

const fetchToken = async (basicHeader: string) => {
  const res = await fetch(`${BASE_URL}/auth/token`, {
    method: 'POST',
    headers: {
      Authorization: basicHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const errorPayload = data as { msg?: string; message?: string } | null;
    const message = errorPayload?.msg || errorPayload?.message || text || `Token request failed (${res.status})`;
    throw new Error(message);
  }

  const payload = data as { data?: { accessToken?: string; tokenType?: string } } | null;
  const token = payload?.data?.accessToken;
  const tokenType = payload?.data?.tokenType || 'Bearer';
  if (!token) {
    throw new Error('Missing access token in response.');
  }

  return { token, tokenType };
};

export const resolveHitem3dAuth = async (rawHeader: string, forceRefresh = false): Promise<ResolvedAuth> => {
  const normalized = normalizeAuthHeader(rawHeader);
  if (normalized.kind === 'bearer') {
    return { authorization: normalized.header, source: 'bearer' };
  }

  const cacheKey = normalized.header;
  const cached = tokenCache.get(cacheKey);
  const now = Date.now();

  if (!forceRefresh && cached && now - cached.fetchedAt < TOKEN_TTL_MS) {
    return {
      authorization: `${cached.tokenType} ${cached.token}`,
      source: 'basic',
      cacheKey,
    };
  }

  const tokenData = await fetchToken(normalized.header);
  tokenCache.set(cacheKey, { token: tokenData.token, tokenType: tokenData.tokenType, fetchedAt: now });

  return {
    authorization: `${tokenData.tokenType} ${tokenData.token}`,
    source: 'basic',
    cacheKey,
  };
};

export const isExpiredTokenResponse = (status: number, payload: unknown, fallbackText: string) => {
  if (status === 401 || status === 403) return true;
  const message =
    (payload as { msg?: string; message?: string })?.msg ||
    (payload as { message?: string })?.message ||
    fallbackText;
  if (typeof message === 'string' && /login expired|token expired|invalid token|expired/i.test(message)) {
    return true;
  }
  const code = (payload as { code?: number | string })?.code;
  if (code === 401 || code === 403 || code === '401' || code === '403') return true;
  return false;
};

