/** @jest-environment node */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
    logServerEvent,
    redactStructuredLogValue,
} from '../structuredLogger';

describe('structuredLogger', () => {
    const originalLogging = process.env.IMAGE_EXPRESS_TEST_LOGGING;
    const originalLogsDir = process.env.IMAGE_EXPRESS_LOGS_DIR;
    let temporaryRoot = '';

    beforeEach(async () => {
        temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'image-express-logs-'));
        process.env.IMAGE_EXPRESS_TEST_LOGGING = '1';
        process.env.IMAGE_EXPRESS_LOGS_DIR = temporaryRoot;
    });

    afterEach(async () => {
        if (originalLogging === undefined) delete process.env.IMAGE_EXPRESS_TEST_LOGGING;
        else process.env.IMAGE_EXPRESS_TEST_LOGGING = originalLogging;
        if (originalLogsDir === undefined) delete process.env.IMAGE_EXPRESS_LOGS_DIR;
        else process.env.IMAGE_EXPRESS_LOGS_DIR = originalLogsDir;
        await fs.rm(temporaryRoot, { recursive: true, force: true });
    });

    it('redacts credentials, prompts, bearer values, and home paths', () => {
        const result = redactStructuredLogValue({
            apiKey: 'secret-key',
            prompt: 'private prompt',
            message: `Failure under ${os.homedir()} with Bearer abc.def`,
            nested: { accessToken: 'secret-token', status: 'failed' },
        });
        expect(result).toEqual({
            apiKey: '[redacted]',
            prompt: '[redacted]',
            message: 'Failure under <home> with Bearer [redacted]',
            nested: { accessToken: '[redacted]', status: 'failed' },
        });
    });

    it('writes one JSON record per line', async () => {
        await logServerEvent('warn', 'api.error', {
            requestId: 'request-123',
            token: 'must-not-persist',
        });
        const line = await fs.readFile(path.join(temporaryRoot, 'server.jsonl'), 'utf8');
        expect(JSON.parse(line)).toMatchObject({
            level: 'warn',
            event: 'api.error',
            details: {
                requestId: 'request-123',
                token: '[redacted]',
            },
        });
    });
});
