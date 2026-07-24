import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getAssetsDir, getDataDir, getLogsDir } from './appPaths';

export type StructuredLogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_MAX_BYTES = 2 * 1024 * 1024;
const LOG_ROTATION_COUNT = 3;
const SENSITIVE_KEY_PATTERN = /(api.?key|authorization|bearer|password|secret|token|prompt|image)/i;
let writeQueue = Promise.resolve();

export function redactStructuredLogValue(value: unknown, depth = 0): unknown {
    if (depth > 5) return '[truncated]';
    if (typeof value === 'string') {
        let redacted = value;
        const roots = [
            { value: os.homedir(), replacement: '<home>' },
            { value: getDataDir(), replacement: '<data>' },
            { value: getAssetsDir(), replacement: '<assets>' },
            { value: getLogsDir(), replacement: '<logs>' },
        ];
        for (const root of roots) {
            if (root.value) redacted = redacted.split(root.value).join(root.replacement);
        }
        return redacted
            .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
            .replace(/((?:api.?key|token|password|secret)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]')
            .slice(0, 1200);
    }
    if (Array.isArray(value)) {
        return value.slice(0, 50).map((entry) => redactStructuredLogValue(entry, depth + 1));
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => (
            [key, SENSITIVE_KEY_PATTERN.test(key)
                ? '[redacted]'
                : redactStructuredLogValue(entry, depth + 1)]
        )));
    }
    return value;
}

async function rotateLogs(logPath: string): Promise<void> {
    try {
        const stats = await fs.stat(logPath);
        if (stats.size < LOG_MAX_BYTES) return;
    } catch {
        return;
    }
    for (let index = LOG_ROTATION_COUNT; index >= 1; index -= 1) {
        const source = index === 1 ? logPath : `${logPath}.${index - 1}`;
        const destination = `${logPath}.${index}`;
        try {
            await fs.rm(destination, { force: true });
            await fs.rename(source, destination);
        } catch (error) {
            const nodeError = error as NodeJS.ErrnoException;
            if (nodeError.code !== 'ENOENT') throw error;
        }
    }
}

async function appendStructuredLog(
    level: StructuredLogLevel,
    event: string,
    details: Record<string, unknown>,
): Promise<void> {
    if (process.env.NODE_ENV === 'test' && process.env.IMAGE_EXPRESS_TEST_LOGGING !== '1') {
        return;
    }
    const logsDir = getLogsDir();
    const logPath = path.join(logsDir, 'server.jsonl');
    await fs.mkdir(logsDir, { recursive: true });
    await rotateLogs(logPath);
    const record = {
        timestamp: new Date().toISOString(),
        level,
        event,
        details: redactStructuredLogValue(details),
    };
    await fs.appendFile(logPath, `${JSON.stringify(record)}\n`, 'utf8');
}

export function logServerEvent(
    level: StructuredLogLevel,
    event: string,
    details: Record<string, unknown> = {},
): Promise<void> {
    writeQueue = writeQueue
        .then(() => appendStructuredLog(level, event, details))
        .catch(() => undefined);
    return writeQueue;
}
