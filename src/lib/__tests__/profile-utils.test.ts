import type { UserProfileSettings } from '@/lib/profile-utils';
import { loadProfileSettings, saveProfileSettings } from '@/lib/profile-utils';

describe('profile-utils (browser)', () => {
  const sample: UserProfileSettings = {
    displayName: 'Test User',
    username: 'tester',
    email: 'test@example.com',
    info: 'Hello',
    image: 'data:image/png;base64,abc',
    imageScale: 1.1,
    embedInfo: true,
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when no stored profile', () => {
    expect(loadProfileSettings()).toBeNull();
  });

  it('saves and loads profile settings', () => {
    saveProfileSettings(sample);
    expect(loadProfileSettings()).toEqual(sample);
  });

  it('returns null on malformed stored data', () => {
    localStorage.setItem('image-express.profile', '{not-json');
    expect(loadProfileSettings()).toBeNull();
  });
});
