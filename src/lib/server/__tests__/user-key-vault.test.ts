/** @jest-environment node */

import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

const ENV_VAULT_FILE = 'IMAGE_EXPRESS_KEY_VAULT_FILE';
const ENV_SECRET_FILE = 'IMAGE_EXPRESS_KEY_VAULT_SECRET_FILE';
const ENV_VAULT_SECRET = 'IMAGE_EXPRESS_KEY_VAULT_SECRET';

describe('user-key-vault', () => {
    let tmpDir = '';
    let vaultFile = '';
    let secretFile = '';
    const previousVaultFile = process.env[ENV_VAULT_FILE];
    const previousSecretFile = process.env[ENV_SECRET_FILE];
    const previousVaultSecret = process.env[ENV_VAULT_SECRET];

    async function loadVaultModule() {
        return import('@/lib/server/user-key-vault');
    }

    beforeEach(async () => {
        jest.resetModules();
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-express-vault-'));
        vaultFile = path.join(tmpDir, 'user-key-vault.json');
        secretFile = path.join(tmpDir, 'user-key-vault.secret');
        process.env[ENV_VAULT_FILE] = vaultFile;
        process.env[ENV_SECRET_FILE] = secretFile;
        delete process.env[ENV_VAULT_SECRET];
    });

    afterEach(async () => {
        if (previousVaultFile === undefined) delete process.env[ENV_VAULT_FILE];
        else process.env[ENV_VAULT_FILE] = previousVaultFile;

        if (previousSecretFile === undefined) delete process.env[ENV_SECRET_FILE];
        else process.env[ENV_SECRET_FILE] = previousSecretFile;

        if (previousVaultSecret === undefined) delete process.env[ENV_VAULT_SECRET];
        else process.env[ENV_VAULT_SECRET] = previousVaultSecret;

        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('persists encrypted keys durably and reads them back', async () => {
        const { mergeUserApiKeys, loadUserApiKeys } = await loadVaultModule();

        await mergeUserApiKeys('alice', { openai: 'sk-openai-123', google: 'sk-google-abc' });

        const stored = await fs.readFile(vaultFile, 'utf8');
        expect(stored).toContain('"alice"');
        expect(stored).not.toContain('sk-openai-123');
        expect(stored).not.toContain('sk-google-abc');

        const keys = await loadUserApiKeys('alice');
        expect(keys).toEqual({
            openai: 'sk-openai-123',
            google: 'sk-google-abc',
        });
    });

    it('merges key patches and tracks audit metadata', async () => {
        const { mergeUserApiKeys, loadUserApiKeys } = await loadVaultModule();

        await mergeUserApiKeys('designer-01', { openai: 'sk-openai-1' });
        await mergeUserApiKeys('designer-01', { meshy: 'sk-meshy-2' });
        const loaded = await loadUserApiKeys('designer-01');

        expect(loaded).toEqual({
            openai: 'sk-openai-1',
            meshy: 'sk-meshy-2',
        });

        const parsed = JSON.parse(await fs.readFile(vaultFile, 'utf8')) as {
            users: Record<string, {
                keyCount: number;
                readCount: number;
                writeCount: number;
                lastReadAt?: string;
                lastWriteAt?: string;
            }>;
        };
        const record = parsed.users['designer-01'];
        expect(record.keyCount).toBe(2);
        expect(record.writeCount).toBe(2);
        expect(record.readCount).toBe(1);
        expect(record.lastWriteAt).toBeTruthy();
        expect(record.lastReadAt).toBeTruthy();
    });

    it('uses env-provided vault secret and does not require a secret file', async () => {
        process.env[ENV_VAULT_SECRET] = 'unit-test-vault-secret';
        const { mergeUserApiKeys, loadUserApiKeys } = await loadVaultModule();

        await mergeUserApiKeys('qa-user', { stability: 'sk-stability-9' });
        const loaded = await loadUserApiKeys('qa-user');

        expect(loaded).toEqual({ stability: 'sk-stability-9' });
        await expect(fs.access(secretFile)).rejects.toMatchObject({ code: 'ENOENT' });
    });
});
