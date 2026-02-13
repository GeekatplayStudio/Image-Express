import { NextRequest, NextResponse } from 'next/server';
import { isExpiredTokenResponse, resolveHitem3dAuth } from '@/lib/hitem3dAuth';
import {
  hitemsRequiresMeshUrl,
  normalizeHitemsFace,
  normalizeHitemsFormat,
  normalizeHitemsModel,
  normalizeHitemsRequestType,
  normalizeHitemsResolution,
} from '@/lib/hitemsOptions';

const BASE_URL = 'https://api.hitem3d.ai/open-api/v1';

const getString = (value: FormDataEntryValue | null) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getBodyString = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
};

const blobToFile = (blob: Blob, filename: string) =>
  new File([blob], filename, { type: blob.type || 'application/octet-stream' });

const imageExtFromType = (mimeType: string) => {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
};

export async function POST(req: NextRequest) {
  try {
    const rawAuthHeader = req.headers.get('authorization');
    if (!rawAuthHeader) {
      return NextResponse.json({ message: 'Missing Authorization header' }, { status: 401 });
    }
    const appIdHeader = req.headers.get('appid') || req.headers.get('x-hitems-appid');
    const debugEnabled = req.headers.get('x-hitem-debug') === '1';

    const contentType = req.headers.get('content-type') ?? '';
    const images: File[] = [];
    const fields: Record<string, string> = {};

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const incomingImages = [
        ...form.getAll('images'),
        ...form.getAll('image'),
      ];

      let hasImage = false;
      for (const entry of incomingImages) {
        if (entry instanceof File) {
          images.push(entry);
          hasImage = true;
        }
      }

      const imageUrl = getString(form.get('imageUrl')) || getString(form.get('image_url'));
      if (!hasImage && imageUrl) {
        const imageRes = await fetch(imageUrl);
        if (!imageRes.ok) {
          return NextResponse.json({ message: 'Failed to fetch image URL.' }, { status: 400 });
        }
        const blob = await imageRes.blob();
        const fileExt = imageExtFromType(blob.type || 'image/png');
        images.push(blobToFile(blob, `image.${fileExt}`));
        hasImage = true;
      }

      if (!hasImage) {
        return NextResponse.json({ message: 'Missing image payload' }, { status: 400 });
      }

      const model = normalizeHitemsModel(getString(form.get('model')));
      const requestType = normalizeHitemsRequestType(model, getString(form.get('request_type')));
      fields.request_type = requestType;
      fields.model = model;
      fields.resolution = normalizeHitemsResolution(model, getString(form.get('resolution')));
      fields.format = normalizeHitemsFormat(getString(form.get('format')));
      const face = normalizeHitemsFace(getString(form.get('face')));
      const meshUrl = getString(form.get('mesh_url'));
      const callbackUrl = getString(form.get('callback_url'));
      if (face) fields.face = face;
      if (meshUrl) fields.mesh_url = meshUrl;
      if (callbackUrl) fields.callback_url = callbackUrl;
      if (hitemsRequiresMeshUrl(requestType) && !meshUrl) {
        return NextResponse.json({ message: 'mesh_url is required when request_type=2.' }, { status: 400 });
      }
    } else {
      const body = await req.json().catch(() => null);
      const imageUrl = body?.imageUrl || body?.image_url;
      if (!imageUrl) {
        return NextResponse.json({ message: 'Missing image payload' }, { status: 400 });
      }
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) {
        return NextResponse.json({ message: 'Failed to fetch image URL.' }, { status: 400 });
      }
      const blob = await imageRes.blob();
      const fileExt = imageExtFromType(blob.type || 'image/png');
      images.push(blobToFile(blob, `image.${fileExt}`));
      const model = normalizeHitemsModel(getBodyString(body?.model));
      const requestType = normalizeHitemsRequestType(model, getBodyString(body?.request_type));
      const meshUrl = getBodyString(body?.mesh_url);
      fields.request_type = requestType;
      fields.model = model;
      fields.resolution = normalizeHitemsResolution(model, getBodyString(body?.resolution));
      fields.format = normalizeHitemsFormat(getBodyString(body?.format));
      const face = normalizeHitemsFace(getBodyString(body?.face));
      if (face) fields.face = face;
      if (meshUrl) fields.mesh_url = meshUrl;
      const callbackUrl = getBodyString(body?.callback_url);
      if (callbackUrl) fields.callback_url = callbackUrl;
      if (hitemsRequiresMeshUrl(requestType) && !meshUrl) {
        return NextResponse.json({ message: 'mesh_url is required when request_type=2.' }, { status: 400 });
      }
    }

    const buildForm = () => {
      const formData = new FormData();
      images.forEach((file) => formData.append('images', file));
      Object.entries(fields).forEach(([key, value]) => formData.append(key, value));
      return formData;
    };

    const sendRequest = async (authorization: string) =>
      fetch(`${BASE_URL}/submit-task`, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          Accept: 'application/json',
          ...(appIdHeader ? { Appid: appIdHeader } : {}),
        },
        body: buildForm(),
      });

    let auth = await resolveHitem3dAuth(rawAuthHeader);
    let res = await sendRequest(auth.authorization);
    let responseText = await res.text();
    
    console.log('[Hitem3D Debug] Raw Response:', {
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
        bodyLength: responseText.length,
        bodyPreview: responseText.substring(0, 500)
    });

    let jsonPayload: unknown = null;
    try {
      jsonPayload = responseText ? JSON.parse(responseText) : null;
    } catch {
      jsonPayload = null;
    }

    if (auth.source === 'basic' && isExpiredTokenResponse(res.status, jsonPayload, responseText)) {
      auth = await resolveHitem3dAuth(rawAuthHeader, true);
      res = await sendRequest(auth.authorization);
      responseText = await res.text();
      try {
        jsonPayload = responseText ? JSON.parse(responseText) : null;
      } catch {
        jsonPayload = null;
      }
    }

    const debugInfo = debugEnabled
      ? {
          endpoint: `${BASE_URL}/submit-task`,
          authType: auth.source,
          appId: Boolean(appIdHeader),
          imageCount: images.length,
          fields,
          status: res.status,
        }
      : null;
    if (debugInfo) {
      console.info('[Hitem3D] submit-task', debugInfo);
      if (!res.ok) {
        console.info('[Hitem3D] submit-task response', responseText);
      }
    }

    const spreadPayload = (jsonPayload && typeof jsonPayload === 'object') ? (jsonPayload as Record<string, unknown>) : {};

    if (!res.ok) {
      console.error(`Hitem3D API failed [${res.status}]:`, responseText);
      const basePayload =
        (jsonPayload && typeof jsonPayload === 'object')
          ? jsonPayload
          : { message: `Hitem3D API Error: ${res.statusText}`, detail: responseText };
      return NextResponse.json(
        debugInfo ? { ...basePayload, _debug: debugInfo } : basePayload,
        { status: res.status }
      );
    }

    return NextResponse.json(debugInfo ? { ...spreadPayload, _debug: debugInfo } : spreadPayload);
  } catch (error) {
    console.error('Hitem3D Proxy Error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
