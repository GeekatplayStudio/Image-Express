/** @jest-environment node */
import { loadProfileSettings, saveProfileSettings } from '@/lib/profile-utils';

describe('profile-utils (node)', () => {
  it('returns null when window is unavailable', () => {
    expect(loadProfileSettings()).toBeNull();
  });

  it('does not throw when saving without window', () => {
    expect(() => saveProfileSettings({
      displayName: 'Test',
      username: 'test',
      email: 'test@example.com',
      info: 'info',
    })).not.toThrow();
  });
});
