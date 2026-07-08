import { NextRequest, NextResponse } from 'next/server';
import {
  normalizeHitemsFormat,
  normalizeHitemsSplitJoint,
  normalizeHitemsSplitLevel,
  normalizeHitemsSplitModel,
  normalizeHitemsSplitPart,
} from '@/lib/hitemsOptions';
import { HITEM3D_BASE_URL, buildHitem3dHeaders, proxyHitem3dRequest } from '@/lib/server/hitem3dProxy';

const getString = (value: FormDataEntryValue | null) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Model Split — proxies Hi3D `split/create-task`.
 * Accepts multipart form data with `mesh` (GLB/STL/OBJ file) or `mesh_url`,
 * `model` (character|general), character `part`/`joint`, general `level`,
 * and output `format`.
 */
export async function POST(req: NextRequest) {
  try {
    const rawAuthHeader = req.headers.get('authorization');
    if (!rawAuthHeader) {
      return NextResponse.json({ message: 'Missing Authorization header' }, { status: 401 });
    }
    const appIdHeader = req.headers.get('appid') || req.headers.get('x-hitems-appid');

    const form = await req.formData();
    const meshEntry = form.get('mesh');
    const meshFile = meshEntry instanceof File && meshEntry.size > 0 ? meshEntry : null;
    const meshUrl = getString(form.get('mesh_url')) || getString(form.get('meshUrl'));

    if (!meshFile && !meshUrl) {
      return NextResponse.json({ message: 'Provide a mesh file or mesh_url for model split.' }, { status: 400 });
    }

    const model = normalizeHitemsSplitModel(getString(form.get('model')));
    const callbackUrl = getString(form.get('callback_url'));

    const buildForm = () => {
      const formData = new FormData();
      if (meshFile) {
        formData.append('mesh', meshFile);
      } else if (meshUrl) {
        formData.append('mesh_url', meshUrl);
      }
      formData.append('model', model);
      if (model === 'character') {
        formData.append('part', normalizeHitemsSplitPart(getString(form.get('part'))));
        formData.append('joint', normalizeHitemsSplitJoint(getString(form.get('joint'))));
        // Character split output is restricted to GLB by the service.
        formData.append('format', '2');
      } else {
        formData.append('level', normalizeHitemsSplitLevel(getString(form.get('level'))));
        formData.append('format', normalizeHitemsFormat(getString(form.get('format'))));
      }
      if (callbackUrl) formData.append('callback_url', callbackUrl);
      return formData;
    };

    return await proxyHitem3dRequest(rawAuthHeader, (authorization) =>
      fetch(`${HITEM3D_BASE_URL}/split/create-task`, {
        method: 'POST',
        headers: buildHitem3dHeaders(authorization, appIdHeader),
        body: buildForm(),
      })
    );
  } catch (error) {
    console.error('Hitem3D Split Proxy Error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
