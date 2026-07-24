export interface AppOperationError {
    code: string;
    message: string;
    retryable: boolean;
    requestId?: string;
}

export type OperationState<T> =
    | { status: 'idle' }
    | { status: 'validating' }
    | { status: 'running'; startedAt: number; message: string; progress?: number }
    | { status: 'succeeded'; result: T }
    | { status: 'failed'; error: AppOperationError }
    | { status: 'cancelled' };

export function toAppOperationError(
    error: unknown,
    fallbackCode = 'operation_failed',
): AppOperationError {
    if (error instanceof Error) {
        return {
            code: fallbackCode,
            message: error.message,
            retryable: false,
        };
    }
    return {
        code: fallbackCode,
        message: 'The operation failed unexpectedly.',
        retryable: false,
    };
}
