import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import type { AuthSession, UploadItem } from '../types';

const BASE_URL_KEY = 'image-express.mobile.base-url';
const SESSION_KEY = 'image-express.mobile.session';
const UPLOAD_QUEUE_KEY = 'image-express.mobile.upload-queue';

async function loadJsonValue<T>(key: string): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function loadAsyncJsonValue<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function loadStoredBaseUrl() {
  return (await SecureStore.getItemAsync(BASE_URL_KEY)) || '';
}

export async function saveStoredBaseUrl(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    await SecureStore.deleteItemAsync(BASE_URL_KEY);
    return;
  }

  await SecureStore.setItemAsync(BASE_URL_KEY, normalized);
}

export async function loadStoredSession() {
  return loadJsonValue<AuthSession>(SESSION_KEY);
}

export async function saveStoredSession(session: AuthSession) {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearStoredSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export async function loadStoredUploadQueue(): Promise<UploadItem[]> {
  const items = (await loadAsyncJsonValue<UploadItem[]>(UPLOAD_QUEUE_KEY)) || [];
  return items.map<UploadItem>((item) => (
    item.status === 'uploading'
      ? { ...item, status: 'queued', error: undefined }
      : item
  ));
}

export async function saveStoredUploadQueue(items: UploadItem[]) {
  if (items.length === 0) {
    await AsyncStorage.removeItem(UPLOAD_QUEUE_KEY);
    return;
  }

  await AsyncStorage.setItem(UPLOAD_QUEUE_KEY, JSON.stringify(items));
}