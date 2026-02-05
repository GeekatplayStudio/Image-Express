import { NextRequest, NextResponse } from 'next/server';

const BASE_URL = 'https://api.hitem3d.ai/open-api/v1';

const DEFAULTS = {
  request_type: '3',
  model: 'hitem3dv1.5',
  resolution: '1024',
  face: 'no',
  format: 'glb',
};

const getString = (value: FormDataEntryValue | null) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
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
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ message: 'Missing Authorization header' }, { status: 401 });
    }

    const contentType = req.headers.get('content-type') ?? '';
    const incomingForm = new FormData();

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const images = [
        ...form.getAll('images'),
        ...form.getAll('image'),
      ];

      let hasImage = false;
      for (const entry of images) {
        if (entry instanceof File) {
          incomingForm.append('images', entry);
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
        incomingForm.append('images', blobToFile(blob, `image.${fileExt}`));
        hasImage = true;
      }

      if (!hasImage) {
        return NextResponse.json({ message: 'Missing image payload' }, { status: 400 });
      }

      const requestType = getString(form.get('request_type')) ?? DEFAULTS.request_type;
      const model = getString(form.get('model')) ?? DEFAULTS.model;
      const resolution = getString(form.get('resolution')) ?? DEFAULTS.resolution;
      const face = getString(form.get('face')) ?? DEFAULTS.face;
      const format = getString(form.get('format')) ?? DEFAULTS.format;
      const meshUrl = getString(form.get('mesh_url'));

      incomingForm.append('request_type', requestType);
      incomingForm.append('model', model);
      incomingForm.append('resolution', resolution);
      incomingForm.append('face', face);
      incomingForm.append('format', format);
      if (meshUrl) incomingForm.append('mesh_url', meshUrl);
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
      incomingForm.append('images', blobToFile(blob, `image.${fileExt}`));
      incomingForm.append('request_type', body?.request_type ?? DEFAULTS.request_type);
      incomingForm.append('model', body?.model ?? DEFAULTS.model);
      incomingForm.append('resolution', body?.resolution ?? DEFAULTS.resolution);
      incomingForm.append('face', body?.face ?? DEFAULTS.face);
      incomingForm.append('format', body?.format ?? DEFAULTS.format);
      if (body?.mesh_url) incomingForm.append('mesh_url', body.mesh_url);
    }

    const res = await fetch(`${BASE_URL}/submit-task`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
      },
      body: incomingForm,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Hitem3D API failed [${res.status}]:`, errorText);
      try {
        return NextResponse.json(JSON.parse(errorText), { status: res.status });
      } catch {
        return NextResponse.json({ message: `Hitem3D API Error: ${res.statusText}`, detail: errorText }, { status: res.status });
      }
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Hitem3D Proxy Error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
