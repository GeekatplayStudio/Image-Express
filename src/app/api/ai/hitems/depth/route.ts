import { NextRequest, NextResponse } from 'next/server';
import { normalizeHitemsReliefFormat } from '@/lib/hitemsOptions';
import { HITEM3D_BASE_URL, buildHitem3dHeaders, proxyHitem3dRequest } from '@/lib/server/hitem3dProxy';

const getString = (value: FormDataEntryValue | null) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Image to 3D Relief (depth map) — proxies Hi3D `depth/create-task`.
 * Accepts multipart form data with `image` (file) or `image_url`, plus
 * optional `rmbg` (default 1) and `format` (1 exr / 2 png, default png).
 */
export async function POST(req: NextRequest) {
  try {
    const rawAuthHeader = req.headers.get('authorization');
    if (!rawAuthHeader) {
      return NextResponse.json({ message: 'Missing Authorization header' }, { status: 401 });
    }
    const appIdHeader = req.headers.get('appid') || req.headers.get('x-hitems-appid');

    const form = await req.formData();
    const imageEntry = form.get('image') || form.get('images');
    const imageUrl = getString(form.get('image_url')) || getString(form.get('imageUrl'));
    const imageFile = imageEntry instanceof File && imageEntry.size > 0 ? imageEntry : null;

    if (!imageFile && !imageUrl) {
      return NextResponse.json({ message: 'Provide an image file or image_url for relief generation.' }, { status: 400 });
    }

    const rmbg = getString(form.get('rmbg')) === '0' ? '0' : '1';
    const format = normalizeHitemsReliefFormat(getString(form.get('format')));
    const callbackUrl = getString(form.get('callback_url'));

    const buildForm = () => {
      const formData = new FormData();
      if (imageFile) {
        formData.append('image', imageFile);
      } else if (imageUrl) {
        formData.append('image_url', imageUrl);
      }
      formData.append('model_type', getString(form.get('model_type')) || 'pro');
      formData.append('rmbg', rmbg);
      formData.append('format', format);
      formData.append('response_format', 'url');
      if (callbackUrl) formData.append('callback_url', callbackUrl);
      return formData;
    };

    return await proxyHitem3dRequest(rawAuthHeader, (authorization) =>
      fetch(`${HITEM3D_BASE_URL}/depth/create-task`, {
        method: 'POST',
        headers: buildHitem3dHeaders(authorization, appIdHeader),
        body: buildForm(),
      })
    );
  } catch (error) {
    console.error('Hitem3D Relief Proxy Error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
