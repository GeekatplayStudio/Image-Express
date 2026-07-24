import { STORAGE_KEY } from './constants';
import type { StoredConfig } from './types';

export function loadDriveConfig(): StoredConfig {
  if (typeof window === 'undefined') {
    return { enabled: false };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { enabled: false };
    }
    const parsed = JSON.parse(raw) as StoredConfig;
    return parsed;
  } catch (error) {
    console.error('Failed to parse Google Drive config', error);
    return { enabled: false };
  }
}

export function saveDriveConfig(config: StoredConfig) {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetDriveConfig() {
  const current = loadDriveConfig();
  saveDriveConfig({ enabled: false, clientId: current.clientId });
}

export function updateDriveConfig(patch: Partial<StoredConfig>) {
  const current = loadDriveConfig();
  const next = { ...current, ...patch } as StoredConfig;
  saveDriveConfig(next);
  return next;
}
