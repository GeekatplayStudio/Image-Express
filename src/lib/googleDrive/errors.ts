const IFRAME_INIT_MESSAGE = 'Google OAuth iframe initialization failed. This is usually caused by strict privacy/third-party cookie blocking or an origin mismatch. Allow third-party sign-in cookies for accounts.google.com, disable strict tracking prevention for this site, and verify the exact app origin is listed in Authorized JavaScript origins.';

export function normalizeGoogleAuthError(error: unknown, fallback: string): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return new Error(error);
  }

  if (error && typeof error === 'object') {
    const maybeRecord = error as Record<string, unknown>;
    const candidates = [
      maybeRecord.message,
      maybeRecord.error,
      maybeRecord.error_description,
      maybeRecord.details,
      maybeRecord.type,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        const normalized = candidate.trim();
        if (normalized.includes('idpiframe_initialization_failed')) {
          return new Error(IFRAME_INIT_MESSAGE);
        }
        return new Error(normalized);
      }
      if (candidate && typeof candidate === 'object') {
        const nested = candidate as Record<string, unknown>;
        const nestedMessage = nested.message ?? nested.error ?? nested.details;
        if (typeof nestedMessage === 'string' && nestedMessage.trim().length > 0) {
          const normalizedNested = nestedMessage.trim();
          if (normalizedNested.includes('idpiframe_initialization_failed')) {
            return new Error(IFRAME_INIT_MESSAGE);
          }
          return new Error(normalizedNested);
        }
      }
    }

    try {
      const json = JSON.stringify(error);
      if (json && json !== '{}') {
        return new Error(json);
      }
    } catch {
      // Ignore stringify failures and return fallback
    }
  }

  return new Error(fallback);
}
