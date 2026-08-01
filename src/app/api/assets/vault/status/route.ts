import { jsonWithRequestId } from '@/lib/server/apiContract';
import { getVaultStatus } from '@/lib/server/vault-store';

export async function GET(request: Request) {
    const status = await getVaultStatus();
    return jsonWithRequestId(request, {
        success: true as const,
        ...status,
    });
}
