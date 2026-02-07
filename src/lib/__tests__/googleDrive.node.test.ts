/** @jest-environment node */
import { connectGoogleDrive, loadDriveConfig } from '@/lib/googleDrive';

describe('googleDrive (node)', () => {
  it('returns disabled config when window missing', () => {
    expect(loadDriveConfig()).toEqual({ enabled: false });
  });

  it('throws when window is unavailable for connect', async () => {
    await expect(connectGoogleDrive('client-1')).rejects.toThrow('Window is not available.');
  });
});
