import { NextRequest, NextResponse } from 'next/server';
import { HITEM3D_BASE_URL, buildHitem3dHeaders, proxyHitem3dRequest } from '@/lib/server/hitem3dProxy';

/** Queries a Hi3D relief (depth map) task — proxies `depth/query-task`. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rawAuthHeader = req.headers.get('authorization');
    if (!rawAuthHeader) {
      return NextResponse.json({ message: 'Missing Authorization header' }, { status: 401 });
    }
    const appIdHeader = req.headers.get('appid') || req.headers.get('x-hitems-appid');

    return await proxyHitem3dRequest(rawAuthHeader, (authorization) =>
      fetch(`${HITEM3D_BASE_URL}/depth/query-task?task_id=${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: buildHitem3dHeaders(authorization, appIdHeader),
      })
    );
  } catch (error) {
    console.error('Hitem3D Relief Query Proxy Error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
