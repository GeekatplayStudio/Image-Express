/** @jest-environment node */
import { normalizeGoogleAuthError } from '../errors';

describe('normalizeGoogleAuthError', () => {
  it('returns Error instances unchanged', () => {
    const original = new Error('boom');
    expect(normalizeGoogleAuthError(original, 'fallback')).toBe(original);
  });

  it('wraps non-empty strings', () => {
    expect(normalizeGoogleAuthError('nope', 'fallback').message).toBe('nope');
  });

  it('extracts a message from an error-like object', () => {
    expect(normalizeGoogleAuthError({ error_description: 'bad scope' }, 'fallback').message).toBe('bad scope');
  });

  it('expands the idpiframe initialization failure into guidance', () => {
    const result = normalizeGoogleAuthError({ error: 'idpiframe_initialization_failed' }, 'fallback');
    expect(result.message).toContain('third-party sign-in cookies');
    expect(result.message).toContain('Authorized JavaScript origins');
  });

  it('reads nested message objects', () => {
    expect(normalizeGoogleAuthError({ details: { message: 'nested detail' } }, 'fallback').message).toBe('nested detail');
  });

  it('serializes unknown objects that carry no recognizable message', () => {
    expect(normalizeGoogleAuthError({ code: 42 }, 'fallback').message).toBe('{"code":42}');
  });

  it('uses the fallback for empty input', () => {
    expect(normalizeGoogleAuthError(null, 'fallback').message).toBe('fallback');
    expect(normalizeGoogleAuthError({}, 'fallback').message).toBe('fallback');
  });
});
