type ApiRecord = Record<string, unknown>;

type ExtractApiErrorMessageArgs = {
    data: ApiRecord | null;
    responseText: string;
    status: number;
    statusText: string;
    fallback: string;
};

export async function parseApiResponse(response: Response): Promise<{ data: ApiRecord | null; responseText: string }> {
    const responseText = await response.text();
    if (!responseText) {
        return { data: null, responseText: '' };
    }

    try {
        const parsed = JSON.parse(responseText);
        if (parsed && typeof parsed === 'object') {
            return { data: parsed as ApiRecord, responseText };
        }
        return { data: null, responseText };
    } catch {
        return { data: null, responseText };
    }
}

export function extractApiErrorMessage({ data, responseText, status, statusText, fallback }: ExtractApiErrorMessageArgs): string {
    const messageFromData =
        (typeof data?.message === 'string' ? data.message : null)
        || (typeof data?.msg === 'string' ? data.msg : null)
        || (typeof data?.detail === 'string' ? data.detail : null)
        || (typeof data?.error === 'string' ? data.error : null);

    if (messageFromData && messageFromData.trim().length > 0) {
        return messageFromData.trim();
    }

    const nestedData = data?.data;
    if (nestedData && typeof nestedData === 'object') {
        const nested = nestedData as ApiRecord;
        const nestedMessage =
            (typeof nested.message === 'string' ? nested.message : null)
            || (typeof nested.msg === 'string' ? nested.msg : null)
            || (typeof nested.detail === 'string' ? nested.detail : null)
            || (typeof nested.error === 'string' ? nested.error : null);
        if (nestedMessage && nestedMessage.trim().length > 0) {
            return nestedMessage.trim();
        }
    }

    const dataCode = data?.code;
    if (dataCode !== null && dataCode !== undefined) {
        return `Code: ${String(dataCode)}`;
    }

    const textMessage = responseText.trim();
    if (textMessage.length > 0) {
        return textMessage.slice(0, 260);
    }

    const statusSuffix = statusText ? ` ${statusText}` : '';
    return `${fallback} (${status}${statusSuffix}).`;
}
