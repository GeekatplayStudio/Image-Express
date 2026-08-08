import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { logServerEvent } from './structuredLogger';

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._-]{8,128}$/;

export class ApiRequestError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly status: number,
        public readonly retryable = false,
    ) {
        super(message);
        this.name = 'ApiRequestError';
    }
}

export interface PublicApiError {
    error: {
        code: string;
        message: string;
        retryable: boolean;
        requestId: string;
    };
    message: string;
}

export function getRequestId(request: Request): string {
    const provided = request.headers.get('x-request-id')?.trim() || '';
    return REQUEST_ID_PATTERN.test(provided) ? provided : randomUUID();
}

export function jsonWithRequestId<T>(
    request: Request,
    body: T,
    init?: ResponseInit,
): NextResponse<T> {
    const response = NextResponse.json(body, init);
    response.headers.set('x-request-id', getRequestId(request));
    return response;
}

export function apiError(
    request: Request,
    options: {
        code: string;
        message: string;
        status: number;
        retryable?: boolean;
    },
): NextResponse<PublicApiError> {
    const requestId = getRequestId(request);
    const body: PublicApiError = {
        error: {
            code: options.code,
            message: options.message,
            retryable: options.retryable ?? false,
            requestId,
        },
        message: options.message,
    };
    void logServerEvent(options.status >= 500 ? 'error' : 'warn', 'api.error', {
        requestId,
        code: options.code,
        status: options.status,
        retryable: options.retryable ?? false,
    });
    const response = NextResponse.json(body, { status: options.status });
    response.headers.set('x-request-id', requestId);
    return response;
}

/**
 * Map a validation/size failure onto the `{ success, message }` shape the older
 * routes answer with, keeping their status code.
 *
 * Those routes wrap everything in one `catch` that returns 500, so a thrown
 * `ApiRequestError` would otherwise surface as "login failed" instead of the
 * 400 or 413 it actually is. Returns null when the error is not ours, so the
 * caller keeps its own handling for genuine faults.
 */
export function legacyValidationResponse(error: unknown): NextResponse | null {
    if (!(error instanceof ApiRequestError)) return null;
    return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status },
    );
}

export function toApiErrorResponse(
    request: Request,
    error: unknown,
    fallback: {
        code: string;
        message: string;
        status?: number;
        retryable?: boolean;
    },
): NextResponse<PublicApiError> {
    if (error instanceof ApiRequestError) {
        return apiError(request, {
            code: error.code,
            message: error.message,
            status: error.status,
            retryable: error.retryable,
        });
    }
    return apiError(request, {
        code: fallback.code,
        message: fallback.message,
        status: fallback.status ?? 500,
        retryable: fallback.retryable,
    });
}

export function assertRequestContentLength(request: Request, maximumBytes: number): void {
    const rawLength = request.headers.get('content-length');
    if (!rawLength) {
        return;
    }
    const contentLength = Number(rawLength);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
        throw new ApiRequestError('invalid_content_length', 'Invalid request size.', 400);
    }
    if (contentLength > maximumBytes) {
        throw new ApiRequestError(
            'request_too_large',
            `Request exceeds the ${Math.floor(maximumBytes / (1024 * 1024))} MB limit.`,
            413,
        );
    }
}

export async function parseJsonRequest<T>(
    request: Request,
    schema: z.ZodType<T>,
    maximumBytes = 1024 * 1024,
): Promise<T> {
    assertRequestContentLength(request, maximumBytes);
    const text = await request.text();
    if (Buffer.byteLength(text, 'utf8') > maximumBytes) {
        throw new ApiRequestError('request_too_large', 'Request body is too large.', 413);
    }

    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch {
        throw new ApiRequestError('invalid_json', 'Request body must be valid JSON.', 400);
    }

    const parsed = schema.safeParse(value);
    if (!parsed.success) {
        throw new ApiRequestError('validation_failed', 'Request body is invalid.', 400);
    }
    return parsed.data;
}
