import type {
  AssetUploadType,
  AuthSession,
  CapturedMediaItem,
  RemoteAssetItem,
  UploadedAssetPayload,
} from '../types';

type JsonRecord = Record<string, unknown>;

type LoginResponse = {
  success?: boolean;
  message?: string;
  code?: string;
  email?: string;
  user?: {
    email?: string;
    displayName?: string;
    sessionToken?: string;
  };
};

export type MobileAuthApiError = Error & {
  code?: string;
  email?: string;
};

type NativeUploadFormFile = {
  uri: string;
  name: string;
  type: string;
};

type AssetListResponse = {
  success?: boolean;
  message?: string;
  files?: RemoteAssetItem[];
};

const RECENT_UPLOAD_TYPES: AssetUploadType[] = ['images', 'videos', 'audio'];

export function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

async function readJsonResponse(response: Response): Promise<JsonRecord | null> {
  try {
    return (await response.json()) as JsonRecord;
  } catch {
    return null;
  }
}

async function readErrorMessage(response: Response, fallback: string) {
  const payload = await readJsonResponse(response);
  const message = payload?.message;
  return typeof message === 'string' && message.trim().length > 0
    ? message
    : `${fallback} (${response.status})`;
}

function createMobileAuthApiError(message: string, details?: {
  code?: string;
  email?: string;
}): MobileAuthApiError {
  const error = new Error(message) as MobileAuthApiError;
  if (details?.code) {
    error.code = details.code;
  }
  if (details?.email) {
    error.email = details.email;
  }
  return error;
}

export async function loginWithPassword(params: {
  baseUrl: string;
  identifier: string;
  password: string;
}): Promise<AuthSession> {
  const response = await fetch(`${normalizeBaseUrl(params.baseUrl)}/api/user/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: params.identifier.trim(),
      password: params.password,
    }),
  });

  const payload = (await readJsonResponse(response)) as LoginResponse | null;
  if (!response.ok || !payload?.success || !payload.user?.email || !payload.user?.sessionToken) {
    throw new Error((payload?.message || `Login failed (${response.status})`).trim());
  }

  return {
    email: payload.user.email,
    displayName: payload.user.displayName || payload.user.email,
    sessionToken: payload.user.sessionToken,
  };
}

export async function loginWithGoogle(params: {
  baseUrl: string;
  credential: string;
  clientId?: string;
}): Promise<AuthSession> {
  const response = await fetch(`${normalizeBaseUrl(params.baseUrl)}/api/user/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credential: params.credential,
      clientId: params.clientId,
    }),
  });

  const payload = (await readJsonResponse(response)) as LoginResponse | null;
  if (!response.ok || !payload?.success || !payload.user?.email || !payload.user?.sessionToken) {
    throw createMobileAuthApiError(
      (payload?.message || `Google sign-in failed (${response.status})`).trim(),
      {
        code: payload?.code,
        email: payload?.email,
      },
    );
  }

  return {
    email: payload.user.email,
    displayName: payload.user.displayName || payload.user.email,
    sessionToken: payload.user.sessionToken,
  };
}

export async function uploadCapturedMedia(params: {
  baseUrl: string;
  session: AuthSession;
  media: CapturedMediaItem;
}): Promise<UploadedAssetPayload> {
  const formData = new FormData();
  const uploadFile: NativeUploadFormFile = {
    uri: params.media.localUri,
    name: params.media.name,
    type: params.media.mimeType,
  };

  formData.append('file', uploadFile as unknown as Blob);
  formData.append('category', 'uploads');
  formData.append('owner', params.session.email);
  formData.append('isPublic', 'false');

  const response = await fetch(`${normalizeBaseUrl(params.baseUrl)}/api/assets/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.session.sessionToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Upload failed'));
  }

  const payload = await readJsonResponse(response);
  if (!payload?.success || typeof payload.path !== 'string') {
    throw new Error('Upload completed without a valid asset response.');
  }

  return payload as unknown as UploadedAssetPayload;
}

async function listUploadsForType(params: {
  baseUrl: string;
  session: AuthSession;
  type: AssetUploadType;
}) {
  const query = new URLSearchParams({
    category: 'uploads',
    type: params.type,
    scope: 'personal',
    visibility: 'all',
  });

  const response = await fetch(`${normalizeBaseUrl(params.baseUrl)}/api/assets/list?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${params.session.sessionToken}`,
    },
  });

  const payload = (await readJsonResponse(response)) as AssetListResponse | null;
  if (!response.ok || !payload?.success || !Array.isArray(payload.files)) {
    throw new Error(await readErrorMessage(response, 'Failed to load recent uploads'));
  }

  return payload.files;
}

export async function listRecentUploads(params: {
  baseUrl: string;
  session: AuthSession;
  limit?: number;
}) {
  const uploadGroups = await Promise.all(
    RECENT_UPLOAD_TYPES.map((type) => listUploadsForType({
      baseUrl: params.baseUrl,
      session: params.session,
      type,
    })),
  );

  return uploadGroups
    .flat()
    .sort((left, right) => {
      const leftTimestamp = Date.parse(left.updatedAt || left.createdAt || '') || 0;
      const rightTimestamp = Date.parse(right.updatedAt || right.createdAt || '') || 0;
      if (leftTimestamp !== rightTimestamp) {
        return rightTimestamp - leftTimestamp;
      }
      return left.name.localeCompare(right.name);
    })
    .slice(0, params.limit ?? 8);
}