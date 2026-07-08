import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as WebBrowser from 'expo-web-browser';

import {
  listRecentUploads,
  loginWithGoogle,
  loginWithPassword,
  normalizeBaseUrl,
  type MobileAuthApiError,
  uploadCapturedMedia,
} from './src/lib/api';
import {
  clearStoredSession,
  loadStoredBaseUrl,
  loadStoredUploadQueue,
  loadStoredSession,
  saveStoredBaseUrl,
  saveStoredSession,
  saveStoredUploadQueue,
} from './src/lib/storage';
import type {
  AssetUploadType,
  AuthSession,
  CapturedMediaItem,
  CaptureKind,
  RemoteAssetItem,
  UploadItem,
} from './src/types';

WebBrowser.maybeCompleteAuthSession();

const palette = {
  background: '#f5efe5',
  panel: '#fffaf2',
  ink: '#163229',
  muted: '#6a6a62',
  border: '#d8c9b8',
  accent: '#d15d3f',
  accentSoft: '#f6ddd3',
  secondary: '#2f6d5b',
  secondarySoft: '#d9ebe4',
  success: '#2b7a57',
  successSoft: '#d9efe5',
  danger: '#9c402a',
  dangerSoft: '#f7ded6',
};

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.round(Math.random() * 1e6).toString(36)}`;
}

function inferAssetType(mimeType?: string | null, fileName?: string | null): AssetUploadType | null {
  const mime = (mimeType || '').toLowerCase();
  const lowerName = (fileName || '').toLowerCase();

  if (mime.startsWith('image/')) return 'images';
  if (mime.startsWith('video/')) return 'videos';
  if (mime.startsWith('audio/')) return 'audio';

  if (/\.(png|jpe?g|gif|webp|heic|bmp|tiff?)$/i.test(lowerName)) return 'images';
  if (/\.(mp4|mov|webm|mkv|avi|m4v|ogv)$/i.test(lowerName)) return 'videos';
  if (/\.(mp3|wav|ogg|m4a|aac|flac|oga)$/i.test(lowerName)) return 'audio';

  return null;
}

function inferMimeType(assetType: AssetUploadType, fileName: string) {
  const lowerName = fileName.toLowerCase();
  if (assetType === 'images') {
    if (lowerName.endsWith('.png')) return 'image/png';
    if (lowerName.endsWith('.webp')) return 'image/webp';
    if (lowerName.endsWith('.heic')) return 'image/heic';
    return 'image/jpeg';
  }

  if (assetType === 'videos') {
    if (lowerName.endsWith('.webm')) return 'video/webm';
    if (lowerName.endsWith('.mov')) return 'video/quicktime';
    return 'video/mp4';
  }

  if (lowerName.endsWith('.wav')) return 'audio/wav';
  if (lowerName.endsWith('.mp3')) return 'audio/mpeg';
  return 'audio/m4a';
}

function createCapturedMedia(params: {
  captureKind: CaptureKind;
  assetType: AssetUploadType;
  name: string;
  localUri: string;
  mimeType: string;
  previewUri?: string;
}): CapturedMediaItem {
  return {
    id: createId('media'),
    captureKind: params.captureKind,
    assetType: params.assetType,
    name: params.name,
    localUri: params.localUri,
    mimeType: params.mimeType,
    previewUri: params.previewUri,
    createdAt: new Date().toISOString(),
  };
}

function formatCaptureLabel(item: UploadItem) {
  if (item.media.captureKind === 'photo') return 'Photo';
  if (item.media.captureKind === 'video') return 'Video';
  if (item.media.captureKind === 'audio') return 'Audio';
  return 'Imported File';
}

function formatStatusLabel(status: UploadItem['status']) {
  if (status === 'queued') return 'Queued';
  if (status === 'uploading') return 'Uploading';
  if (status === 'uploaded') return 'Uploaded';
  return 'Failed';
}

function formatAssetTypeLabel(assetType: AssetUploadType) {
  if (assetType === 'images') return 'Image';
  if (assetType === 'videos') return 'Video';
  return 'Audio';
}

function formatTimestamp(value?: string) {
  if (!value) return 'Unknown time';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function buildRemoteAssetUrl(baseUrl: string, assetPath: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return assetPath;
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  return `${normalized}${assetPath.startsWith('/') ? assetPath : `/${assetPath}`}`;
}

function readConfiguredValue(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() || '';
}

function readGoogleClientIds() {
  const genericClientId = readConfiguredValue(
    process.env.EXPO_PUBLIC_GOOGLE_AUTH_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_DRIVE_CLIENT_ID,
  );

  return {
    clientId: genericClientId,
    iosClientId: readConfiguredValue(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
    androidClientId: readConfiguredValue(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID),
    webClientId: readConfiguredValue(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, genericClientId),
  };
}

function resolveGoogleServerClientId(clientIds: ReturnType<typeof readGoogleClientIds>) {
  return Platform.select({
    ios: clientIds.iosClientId || clientIds.clientId,
    android: clientIds.androidClientId || clientIds.clientId,
    default: clientIds.webClientId || clientIds.clientId,
  }) || '';
}

export default function App() {
  const [isHydrating, setIsHydrating] = useState(true);
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loginError, setLoginError] = useState('');
  const [loginMessage, setLoginMessage] = useState('');
  const [captureError, setCaptureError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isUploadingAll, setIsUploadingAll] = useState(false);
  const [isRefreshingRecentUploads, setIsRefreshingRecentUploads] = useState(false);
  const [recentUploadsError, setRecentUploadsError] = useState('');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [recentUploads, setRecentUploads] = useState<RemoteAssetItem[]>([]);

  const googleClientIds = useMemo(() => readGoogleClientIds(), []);
  const googleServerClientId = useMemo(() => resolveGoogleServerClientId(googleClientIds), [googleClientIds]);
  const hasGoogleConfiguration = Boolean(
    googleClientIds.clientId
    || googleClientIds.iosClientId
    || googleClientIds.androidClientId
    || googleClientIds.webClientId,
  );
  const [googleRequest, , promptGoogleSignIn] = Google.useIdTokenAuthRequest(
    {
      clientId: googleClientIds.clientId || '',
      iosClientId: googleClientIds.iosClientId || undefined,
      androidClientId: googleClientIds.androidClientId || undefined,
      webClientId: googleClientIds.webClientId || undefined,
      selectAccount: true,
    },
    {
      native: 'imageexpressmobile:/oauthredirect',
    },
  );

  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      const [storedBaseUrl, storedSession, storedQueue] = await Promise.all([
        loadStoredBaseUrl(),
        loadStoredSession(),
        loadStoredUploadQueue(),
      ]);

      if (!mounted) return;
      setApiBaseUrl(storedBaseUrl);
      setSession(storedSession);
      setIdentifier(storedSession?.email || '');
      setItems(storedQueue);
      setIsHydrating(false);
    }

    void hydrate();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (recording) {
        void recording.stopAndUnloadAsync().catch(() => undefined);
      }
    };
  }, [recording]);

  useEffect(() => {
    if (isHydrating) return;
    void saveStoredUploadQueue(items);
  }, [isHydrating, items]);

  const normalizedBaseUrl = useMemo(() => normalizeBaseUrl(apiBaseUrl), [apiBaseUrl]);
  const canUpload = Boolean(session?.sessionToken && normalizedBaseUrl);

  const refreshRecentUploads = async (currentSession: AuthSession, currentBaseUrl: string) => {
    setIsRefreshingRecentUploads(true);
    setRecentUploadsError('');
    try {
      const nextUploads = await listRecentUploads({
        baseUrl: currentBaseUrl,
        session: currentSession,
        limit: 8,
      });
      setRecentUploads(nextUploads);
    } catch (error) {
      setRecentUploadsError(error instanceof Error ? error.message : 'Failed to load recent uploads.');
    } finally {
      setIsRefreshingRecentUploads(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    if (!session || !normalizedBaseUrl) {
      setRecentUploads([]);
      setRecentUploadsError('');
      setIsRefreshingRecentUploads(false);
      return () => {
        mounted = false;
      };
    }

    setIsRefreshingRecentUploads(true);
    setRecentUploadsError('');

    void listRecentUploads({
      baseUrl: normalizedBaseUrl,
      session,
      limit: 8,
    }).then((nextUploads) => {
      if (!mounted) return;
      setRecentUploads(nextUploads);
    }).catch((error) => {
      if (!mounted) return;
      setRecentUploadsError(error instanceof Error ? error.message : 'Failed to load recent uploads.');
    }).finally(() => {
      if (!mounted) return;
      setIsRefreshingRecentUploads(false);
    });

    return () => {
      mounted = false;
    };
  }, [normalizedBaseUrl, session]);

  const updateItem = (itemId: string, updater: (current: UploadItem) => UploadItem) => {
    setItems((current) => current.map((entry) => (entry.id === itemId ? updater(entry) : entry)));
  };

  const removeItem = (itemId: string) => {
    setItems((current) => current.filter((entry) => entry.id !== itemId));
  };

  const enqueueMedia = (media: CapturedMediaItem) => {
    setItems((current) => [
      {
        id: createId('upload'),
        media,
        status: 'queued',
      },
      ...current,
    ]);
  };

  const handlePersistBaseUrl = async () => {
    await saveStoredBaseUrl(apiBaseUrl);
  };

  const handleLogin = async () => {
    setLoginError('');
    setLoginMessage('');
    if (!normalizedBaseUrl || !identifier.trim() || !password) {
      setLoginError('Base URL, email, and password are required.');
      return;
    }

    setIsLoggingIn(true);
    try {
      const nextSession = await loginWithPassword({
        baseUrl: normalizedBaseUrl,
        identifier,
        password,
      });
      setSession(nextSession);
      setPassword('');
      await Promise.all([
        saveStoredBaseUrl(normalizedBaseUrl),
        saveStoredSession(nextSession),
      ]);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Login failed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoginError('');
    setLoginMessage('');

    if (!normalizedBaseUrl) {
      setLoginError('Base URL is required before Google sign-in.');
      return;
    }

    if (!hasGoogleConfiguration) {
      setLoginError('Google sign-in is not configured for the mobile app. Set EXPO_PUBLIC_GOOGLE_AUTH_CLIENT_ID or the platform-specific EXPO_PUBLIC_GOOGLE_*_CLIENT_ID values.');
      return;
    }

    if (!googleRequest) {
      setLoginError('Google sign-in is still loading. Please try again in a moment.');
      return;
    }

    setIsGoogleLoading(true);
    try {
      const result = await promptGoogleSignIn();
      if (result.type === 'cancel' || result.type === 'dismiss') {
        setLoginMessage('Google sign-in was cancelled.');
        return;
      }

      if (result.type !== 'success') {
        const authErrorMessage = 'error' in result && result.error?.message
          ? result.error.message
          : 'Google sign-in failed.';
        setLoginError(authErrorMessage);
        return;
      }

      const credential = (result.params.id_token || '').trim();
      if (!credential) {
        setLoginError('Google did not return an ID token.');
        return;
      }

      const nextSession = await loginWithGoogle({
        baseUrl: normalizedBaseUrl,
        credential,
        clientId: googleServerClientId || undefined,
      });

      setSession(nextSession);
      setIdentifier(nextSession.email);
      setPassword('');
      await Promise.all([
        saveStoredBaseUrl(normalizedBaseUrl),
        saveStoredSession(nextSession),
      ]);
    } catch (error) {
      const authError = error as MobileAuthApiError;
      if (typeof authError.email === 'string' && authError.email.trim()) {
        setIdentifier(authError.email.trim());
      }

      const message = error instanceof Error ? error.message : 'Google sign-in failed.';
      if (authError.code === 'PENDING_APPROVAL' || authError.code === 'REQUEST_SUBMITTED') {
        setLoginMessage(message);
      } else {
        setLoginError(message);
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleLogout = async () => {
    setSession(null);
    setItems([]);
    setRecentUploads([]);
    setRecentUploadsError('');
    setLoginError('');
    setLoginMessage('');
    await clearStoredSession();
  };

  const handleRefreshRecentUploads = async () => {
    if (!session || !normalizedBaseUrl) return;
    await refreshRecentUploads(session, normalizedBaseUrl);
  };

  const capturePhoto = async () => {
    setCaptureError('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setCaptureError('Camera permission is required to capture photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const fileName = asset.fileName || `photo-${Date.now()}.jpg`;
    enqueueMedia(createCapturedMedia({
      captureKind: 'photo',
      assetType: 'images',
      name: fileName,
      localUri: asset.uri,
      mimeType: asset.mimeType || inferMimeType('images', fileName),
      previewUri: asset.uri,
    }));
  };

  const captureVideo = async () => {
    setCaptureError('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setCaptureError('Camera permission is required to capture videos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 60,
      quality: ImagePicker.UIImagePickerControllerQualityType.High,
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const fileName = asset.fileName || `video-${Date.now()}.mp4`;
    enqueueMedia(createCapturedMedia({
      captureKind: 'video',
      assetType: 'videos',
      name: fileName,
      localUri: asset.uri,
      mimeType: asset.mimeType || inferMimeType('videos', fileName),
    }));
  };

  const toggleAudioRecording = async () => {
    setCaptureError('');

    if (recording) {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) {
        setCaptureError('Audio recording completed without a local file URI.');
        return;
      }

      const fileName = `audio-${Date.now()}.m4a`;
      enqueueMedia(createCapturedMedia({
        captureKind: 'audio',
        assetType: 'audio',
        name: fileName,
        localUri: uri,
        mimeType: inferMimeType('audio', fileName),
      }));
      return;
    }

    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      setCaptureError('Microphone permission is required to record audio.');
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const created = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    setRecording(created.recording);
  };

  const importExistingMedia = async () => {
    setCaptureError('');
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'video/*', 'audio/*'],
      multiple: false,
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const assetType = inferAssetType(asset.mimeType, asset.name);
    if (!assetType) {
      setCaptureError('That file type is not supported by the current upload contract.');
      return;
    }

    const previewUri = assetType === 'images' ? asset.uri : undefined;
    enqueueMedia(createCapturedMedia({
      captureKind: 'file',
      assetType,
      name: asset.name,
      localUri: asset.uri,
      mimeType: asset.mimeType || inferMimeType(assetType, asset.name),
      previewUri,
    }));
  };

  const uploadItem = async (itemId: string) => {
    if (!session || !normalizedBaseUrl) {
      setCaptureError('Sign in and set a reachable API base URL before uploading.');
      return;
    }

    const target = items.find((entry) => entry.id === itemId);
    if (!target) return;

    updateItem(itemId, (current) => ({ ...current, status: 'uploading', error: undefined }));
    try {
      const uploaded = await uploadCapturedMedia({
        baseUrl: normalizedBaseUrl,
        session,
        media: target.media,
      });
      updateItem(itemId, (current) => ({
        ...current,
        status: 'uploaded',
        remotePath: uploaded.path,
        uploadedAt: new Date().toISOString(),
      }));
      void handleRefreshRecentUploads();
    } catch (error) {
      updateItem(itemId, (current) => ({
        ...current,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Upload failed.',
      }));
    }
  };

  const uploadAll = async () => {
    setCaptureError('');
    setIsUploadingAll(true);
    try {
      const pendingIds = items
        .filter((entry) => entry.status === 'queued' || entry.status === 'failed')
        .map((entry) => entry.id);

      for (const itemId of pendingIds) {
        // eslint-disable-next-line no-await-in-loop
        await uploadItem(itemId);
      }
    } finally {
      setIsUploadingAll(false);
    }
  };

  if (isHydrating) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.loadingShell}>
          <ActivityIndicator size="large" color={palette.secondary} />
          <Text style={styles.loadingText}>Loading mobile companion…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Image Express Mobile Companion</Text>
          <Text style={styles.heroTitle}>Capture fast. Upload clean. Keep editing on desktop.</Text>
          <Text style={styles.heroBody}>
            This companion app is scoped to capture and import. Use a LAN URL for the running Image Express server.
          </Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Connection</Text>
          <Text style={styles.panelHint}>Use your computer&apos;s reachable LAN address, not localhost. Example: http://192.168.1.24:3000</Text>
          <TextInput
            style={styles.input}
            value={apiBaseUrl}
            onChangeText={setApiBaseUrl}
            onBlur={() => {
              void handlePersistBaseUrl();
            }}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="http://192.168.1.24:3000"
            placeholderTextColor="#8a8a80"
          />
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeaderRow}>
            <View>
              <Text style={styles.panelTitle}>Session</Text>
              <Text style={styles.panelHint}>Uses the existing `/api/user/auth/login` and `/api/user/auth/google` routes with the shared session token contract.</Text>
            </View>
            {session ? (
              <View style={styles.sessionBadge}>
                <Text style={styles.sessionBadgeText}>Signed In</Text>
              </View>
            ) : null}
          </View>

          {session ? (
            <View style={styles.sessionCard}>
              <Text style={styles.sessionTitle}>{session.displayName}</Text>
              <Text style={styles.sessionSubtitle}>{session.email}</Text>
              <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => { void handleLogout(); }}>
                <Text style={[styles.buttonText, styles.secondaryButtonText]}>Sign Out</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="artist@example.com"
                placeholderTextColor="#8a8a80"
              />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Password"
                placeholderTextColor="#8a8a80"
              />
              {loginError ? <Text style={styles.errorText}>{loginError}</Text> : null}
              {loginMessage ? <Text style={styles.messageText}>{loginMessage}</Text> : null}
              <Pressable
                style={[styles.button, styles.primaryButton, isLoggingIn && styles.buttonDisabled]}
                onPress={() => { void handleLogin(); }}
                disabled={isLoggingIn}
              >
                {isLoggingIn ? <ActivityIndicator color="#fffaf2" /> : <Text style={styles.buttonText}>Sign In And Persist Token</Text>}
              </Pressable>
              <View style={styles.authDividerRow}>
                <View style={styles.authDividerLine} />
                <Text style={styles.authDividerText}>or</Text>
                <View style={styles.authDividerLine} />
              </View>
              <Pressable
                style={[styles.button, styles.googleButton, (isGoogleLoading || !hasGoogleConfiguration) && styles.buttonDisabled]}
                onPress={() => { void handleGoogleLogin(); }}
                disabled={isGoogleLoading || !hasGoogleConfiguration}
              >
                {isGoogleLoading ? <ActivityIndicator color={palette.ink} /> : <Text style={styles.googleButtonText}>Continue With Google</Text>}
              </Pressable>
              {!hasGoogleConfiguration ? (
                <Text style={styles.panelHint}>
                  Configure EXPO_PUBLIC_GOOGLE_AUTH_CLIENT_ID or the platform-specific EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID and EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID values to enable Google sign-in.
                </Text>
              ) : null}
            </>
          )}
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeaderRow}>
            <View>
              <Text style={styles.panelTitle}>Capture</Text>
              <Text style={styles.panelHint}>Photo, video, audio, and existing file import all land in one upload queue.</Text>
            </View>
            {recording ? (
              <View style={styles.recordingBadge}>
                <Text style={styles.recordingBadgeText}>Recording Audio</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.actionGrid}>
            <Pressable style={[styles.tileButton, styles.photoTile]} onPress={() => { void capturePhoto(); }}>
              <Text style={styles.tileLabel}>Capture Photo</Text>
            </Pressable>
            <Pressable style={[styles.tileButton, styles.videoTile]} onPress={() => { void captureVideo(); }}>
              <Text style={styles.tileLabel}>Capture Video</Text>
            </Pressable>
            <Pressable style={[styles.tileButton, styles.audioTile]} onPress={() => { void toggleAudioRecording(); }}>
              <Text style={styles.tileLabel}>{recording ? 'Stop Audio Recording' : 'Record Audio'}</Text>
            </Pressable>
            <Pressable style={[styles.tileButton, styles.fileTile]} onPress={() => { void importExistingMedia(); }}>
              <Text style={styles.tileLabel}>Import Existing File</Text>
            </Pressable>
          </View>

          {captureError ? <Text style={styles.errorText}>{captureError}</Text> : null}

          <Pressable
            style={[styles.button, styles.primaryButton, (!canUpload || isUploadingAll || items.length === 0) && styles.buttonDisabled]}
            onPress={() => { void uploadAll(); }}
            disabled={!canUpload || isUploadingAll || items.length === 0}
          >
            {isUploadingAll ? <ActivityIndicator color="#fffaf2" /> : <Text style={styles.buttonText}>Upload All Queued Media</Text>}
          </Pressable>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Queue</Text>
          <Text style={styles.panelHint}>Each queued item uploads through the hardened `/api/assets/upload` route with the bearer session token. Queue state is persisted on-device between reloads.</Text>

          {items.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No captured media yet</Text>
              <Text style={styles.emptyBody}>Use one of the capture actions above to build a mobile import queue.</Text>
            </View>
          ) : (
            items.map((item) => (
              <View key={item.id} style={styles.queueCard}>
                <View style={styles.queueHeader}>
                  <View style={styles.queueMetaBlock}>
                    <Text style={styles.queueTitle}>{item.media.name}</Text>
                    <Text style={styles.queueSubtitle}>{formatCaptureLabel(item)} · {item.media.assetType}</Text>
                  </View>
                  <View style={[
                    styles.statusPill,
                    item.status === 'uploaded'
                      ? styles.statusUploaded
                      : item.status === 'failed'
                        ? styles.statusFailed
                        : item.status === 'uploading'
                          ? styles.statusUploading
                          : styles.statusQueued,
                  ]}>
                    <Text style={styles.statusPillText}>{formatStatusLabel(item.status)}</Text>
                  </View>
                </View>

                {item.media.previewUri ? (
                  <Image source={{ uri: item.media.previewUri }} style={styles.previewImage} />
                ) : (
                  <View style={styles.previewPlaceholder}>
                    <Text style={styles.previewPlaceholderText}>{item.media.assetType === 'videos' ? 'VIDEO' : 'AUDIO'}</Text>
                  </View>
                )}

                {item.error ? <Text style={styles.errorText}>{item.error}</Text> : null}
                {item.remotePath ? <Text style={styles.remotePathText}>{item.remotePath}</Text> : null}

                <View style={styles.queueActionRow}>
                  <Pressable
                    style={[styles.button, styles.secondaryButton, styles.queueActionButton, (!canUpload || item.status === 'uploading') && styles.buttonDisabled]}
                    onPress={() => { void uploadItem(item.id); }}
                    disabled={!canUpload || item.status === 'uploading'}
                  >
                    {item.status === 'uploading'
                      ? <ActivityIndicator color={palette.secondary} />
                      : <Text style={[styles.buttonText, styles.secondaryButtonText]}>{item.status === 'uploaded' ? 'Re-upload' : 'Upload Now'}</Text>}
                  </Pressable>
                  <Pressable
                    style={[styles.button, styles.removeButton, styles.queueActionButton]}
                    onPress={() => { removeItem(item.id); }}
                  >
                    <Text style={[styles.buttonText, styles.removeButtonText]}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeaderRow}>
            <View>
              <Text style={styles.panelTitle}>Recent Uploads</Text>
              <Text style={styles.panelHint}>This reads back your latest uploaded image, video, and audio assets from the existing `/api/assets/list` route.</Text>
            </View>
            <Pressable
              style={[styles.inlineButton, (!session || !normalizedBaseUrl || isRefreshingRecentUploads) && styles.buttonDisabled]}
              onPress={() => { void handleRefreshRecentUploads(); }}
              disabled={!session || !normalizedBaseUrl || isRefreshingRecentUploads}
            >
              {isRefreshingRecentUploads
                ? <ActivityIndicator color={palette.secondary} size="small" />
                : <Text style={styles.inlineButtonText}>Refresh</Text>}
            </Pressable>
          </View>

          {!session ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Sign in to load server uploads</Text>
              <Text style={styles.emptyBody}>Recent uploads are only available for authenticated user-owned assets.</Text>
            </View>
          ) : recentUploads.length === 0 && !isRefreshingRecentUploads ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No recent uploads yet</Text>
              <Text style={styles.emptyBody}>Upload a photo, video, or audio file from this companion app to populate this list.</Text>
            </View>
          ) : (
            recentUploads.map((asset) => {
              const assetUrl = buildRemoteAssetUrl(normalizedBaseUrl, asset.path);
              const showImagePreview = asset.type === 'images';

              return (
                <View key={asset.path} style={styles.queueCard}>
                  <View style={styles.queueHeader}>
                    <View style={styles.queueMetaBlock}>
                      <Text style={styles.queueTitle}>{asset.name}</Text>
                      <Text style={styles.queueSubtitle}>{formatAssetTypeLabel(asset.type)} · {asset.isPublic ? 'Public' : 'Private'}</Text>
                    </View>
                    <View style={[styles.statusPill, styles.statusUploaded]}>
                      <Text style={styles.statusPillText}>Server</Text>
                    </View>
                  </View>

                  {showImagePreview ? (
                    <Image source={{ uri: assetUrl }} style={styles.previewImage} />
                  ) : (
                    <View style={styles.previewPlaceholder}>
                      <Text style={styles.previewPlaceholderText}>{asset.type === 'videos' ? 'VIDEO' : 'AUDIO'}</Text>
                    </View>
                  )}

                  <Text style={styles.remotePathText}>{formatTimestamp(asset.updatedAt || asset.createdAt)}</Text>
                  <Text style={styles.remotePathText}>{asset.path}</Text>
                </View>
              );
            })
          )}

          {recentUploadsError ? <Text style={styles.errorText}>{recentUploadsError}</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingVertical: 20,
    gap: 16,
  },
  loadingShell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  heroCard: {
    borderRadius: 28,
    padding: 22,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 10,
    shadowColor: '#5a4334',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  eyebrow: {
    color: palette.accent,
    textTransform: 'uppercase',
    letterSpacing: 1.3,
    fontSize: 12,
    fontWeight: '700',
  },
  heroTitle: {
    color: palette.ink,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
  },
  heroBody: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  panel: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 14,
  },
  panelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  panelTitle: {
    color: palette.ink,
    fontSize: 20,
    fontWeight: '800',
  },
  panelHint: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fffefb',
    color: palette.ink,
    fontSize: 16,
  },
  button: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButton: {
    backgroundColor: palette.accent,
  },
  secondaryButton: {
    backgroundColor: palette.secondarySoft,
  },
  removeButton: {
    backgroundColor: palette.dangerSoft,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fffaf2',
  },
  secondaryButtonText: {
    color: palette.secondary,
  },
  removeButtonText: {
    color: palette.danger,
  },
  inlineButton: {
    minHeight: 38,
    borderRadius: 999,
    paddingHorizontal: 14,
    backgroundColor: palette.secondarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineButtonText: {
    color: palette.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
  googleButton: {
    backgroundColor: '#fffefb',
    borderWidth: 1,
    borderColor: palette.border,
  },
  googleButtonText: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  errorText: {
    color: palette.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  messageText: {
    color: palette.secondary,
    fontSize: 14,
    lineHeight: 20,
  },
  authDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  authDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: palette.border,
  },
  authDividerText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  sessionCard: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: palette.secondarySoft,
    gap: 10,
  },
  sessionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: palette.ink,
  },
  sessionSubtitle: {
    fontSize: 14,
    color: palette.secondary,
  },
  sessionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: palette.successSoft,
  },
  sessionBadgeText: {
    color: palette.success,
    fontSize: 12,
    fontWeight: '700',
  },
  recordingBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: palette.dangerSoft,
  },
  recordingBadgeText: {
    color: palette.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  actionGrid: {
    gap: 10,
  },
  tileButton: {
    minHeight: 72,
    borderRadius: 20,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderWidth: 1,
  },
  photoTile: {
    backgroundColor: '#f7ebe6',
    borderColor: '#ebc7b8',
  },
  videoTile: {
    backgroundColor: '#e6f0ee',
    borderColor: '#b8d2ca',
  },
  audioTile: {
    backgroundColor: '#f3e7f0',
    borderColor: '#dec7d7',
  },
  fileTile: {
    backgroundColor: '#f3f0e6',
    borderColor: '#ddd3b6',
  },
  tileLabel: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyState: {
    paddingVertical: 18,
    gap: 8,
  },
  emptyTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyBody: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  queueCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    gap: 12,
    backgroundColor: '#fffefb',
  },
  queueHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  queueMetaBlock: {
    flex: 1,
    gap: 4,
  },
  queueTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  queueSubtitle: {
    color: palette.muted,
    fontSize: 13,
  },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    backgroundColor: '#eaded0',
  },
  previewPlaceholder: {
    width: '100%',
    height: 120,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#efe6db',
  },
  previewPlaceholderText: {
    color: palette.secondary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  queueActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  queueActionButton: {
    flex: 1,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusQueued: {
    backgroundColor: '#eee4d8',
  },
  statusUploading: {
    backgroundColor: palette.accentSoft,
  },
  statusUploaded: {
    backgroundColor: palette.successSoft,
  },
  statusFailed: {
    backgroundColor: palette.dangerSoft,
  },
  statusPillText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  remotePathText: {
    color: palette.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
});