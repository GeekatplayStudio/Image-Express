const loadModule = async () => {
  jest.resetModules();
  return await import('@/lib/hitem3dAuth');
};

describe('hitem3dAuth', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('passes through bearer tokens without fetch', async () => {
    const { resolveHitem3dAuth } = await loadModule();
    const fetchSpy = jest.fn();
    (global as unknown as { fetch: typeof fetch }).fetch = fetchSpy;

    const result = await resolveHitem3dAuth('Bearer abc123');

    expect(result).toEqual({ authorization: 'Bearer abc123', source: 'bearer' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('normalizes bare tokens to bearer', async () => {
    const { resolveHitem3dAuth } = await loadModule();
    const fetchSpy = jest.fn();
    (global as unknown as { fetch: typeof fetch }).fetch = fetchSpy;

    const result = await resolveHitem3dAuth('token-only');

    expect(result).toEqual({ authorization: 'Bearer token-only', source: 'bearer' });
  });

  it('exchanges basic credentials and caches token', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const { resolveHitem3dAuth } = await loadModule();

    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { accessToken: 'abc', tokenType: 'Bearer' } }),
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchSpy;

    const first = await resolveHitem3dAuth('user:pass');
    const second = await resolveHitem3dAuth('user:pass');

    expect(first.authorization).toBe('Bearer abc');
    expect(second.authorization).toBe('Bearer abc');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    nowSpy.mockRestore();
  });

  it('forces refresh when requested', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(2000);
    const { resolveHitem3dAuth } = await loadModule();

    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { accessToken: 'abc', tokenType: 'Bearer' } }),
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchSpy;

    await resolveHitem3dAuth('Basic Zm9vOmJhcg==');
    await resolveHitem3dAuth('Basic Zm9vOmJhcg==', true);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it('throws with API error messages', async () => {
    const { resolveHitem3dAuth } = await loadModule();
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ msg: 'Invalid credentials' }),
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchSpy;

    await expect(resolveHitem3dAuth('user:pass')).rejects.toThrow('Invalid credentials');
  });

  it('throws when token response is malformed', async () => {
    const { resolveHitem3dAuth } = await loadModule();
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'not-json',
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchSpy;

    await expect(resolveHitem3dAuth('user:pass')).rejects.toThrow('Missing access token in response.');
  });

  it('detects expired token responses', async () => {
    const { isExpiredTokenResponse } = await loadModule();

    expect(isExpiredTokenResponse(401, {}, 'nope')).toBe(true);
    expect(isExpiredTokenResponse(200, { message: 'token expired' }, '')).toBe(true);
    expect(isExpiredTokenResponse(200, { code: '403' }, '')).toBe(true);
    expect(isExpiredTokenResponse(200, { message: 'ok' }, 'ok')).toBe(false);
  });
});
