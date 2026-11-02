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

    const auditFile = () => path.join(tmpDir, 'user-key-vault.audit.jsonl');

    it('writes an audit line for every read and write, naming keys but never values', async () => {
        const { mergeUserApiKeys, loadUserApiKeys, readUserVaultAudit } = await loadVaultModule();

        await mergeUserApiKeys('alice', { openai: 'sk-openai-123' }, { source: 'api:user/keys' });
        await loadUserApiKeys('alice', { source: 'queue:remote-poll' });

        const raw = await fs.readFile(auditFile(), 'utf8');
        expect(raw).not.toContain('sk-openai-123');
        expect(raw.trim().split('\n')).toHaveLength(2);

        const events = await readUserVaultAudit('alice');
        expect(events.map((e) => [e.event, e.source, e.keys])).toEqual([
            ['read', 'queue:remote-poll', undefined],
            ['write', 'api:user/keys', ['openai']],
        ]);
        // Another owner's trail is theirs alone.
        expect(await readUserVaultAudit('bob')).toEqual([]);
    });

    it('records only the keys whose value changed, so re-saving the form does not reset ages', async () => {
        const { mergeUserApiKeys, readUserVaultAudit } = await loadVaultModule();
        await mergeUserApiKeys('alice', { openai: 'a', meshy: 'b' });
        await mergeUserApiKeys('alice', { openai: 'a', meshy: 'c' });
        const [latest] = await readUserVaultAudit('alice');
        expect(latest.keys).toEqual(['meshy']);
    });

    it('removes keys by name and reports the removal', async () => {
        const { mergeUserApiKeys, removeUserApiKeys, loadUserApiKeys, readUserVaultAudit } = await loadVaultModule();
        await mergeUserApiKeys('alice', { openai: 'a', meshy: 'b' });
        const result = await removeUserApiKeys('alice', ['meshy', 'never-there']);
        expect(result.keyCount).toBe(1);
        const [latest] = await readUserVaultAudit('alice');
        expect([latest.event, latest.keys]).toEqual(['remove', ['meshy']]);
        expect(await loadUserApiKeys('alice')).toEqual({ openai: 'a' });
    });

    it('describes key ages against the rotation policy without exposing values', async () => {
        const { mergeUserApiKeys, describeUserApiKeys } = await loadVaultModule();
        await mergeUserApiKeys('alice', { openai: 'sk-fresh', meshy: 'sk-old' });

        // Age the meshy key by editing its timestamp, as a record written long ago would carry.
        const parsed = JSON.parse(await fs.readFile(vaultFile, 'utf8'));
        parsed.users.alice.keyUpdatedAt.meshy = '2020-01-01T00:00:00.000Z';
        await fs.writeFile(vaultFile, JSON.stringify(parsed));

        const described = await describeUserApiKeys('alice', Date.parse('2026-11-02T00:00:00.000Z'));
        expect(described.maxAgeDays).toBe(180);
        expect(described.keys.map((k) => [k.name, k.stale])).toEqual([['meshy', true], ['openai', false]]);
        expect(JSON.stringify(described)).not.toContain('sk-');
    });

    it('treats a record from before per-key timestamps as written at its last write', async () => {
        const { mergeUserApiKeys, describeUserApiKeys } = await loadVaultModule();
        await mergeUserApiKeys('alice', { openai: 'a' });
        const parsed = JSON.parse(await fs.readFile(vaultFile, 'utf8'));
        delete parsed.users.alice.keyUpdatedAt;
        parsed.users.alice.lastWriteAt = '2026-01-01T00:00:00.000Z';
        await fs.writeFile(vaultFile, JSON.stringify(parsed));

        const described = await describeUserApiKeys('alice', Date.parse('2026-01-11T00:00:00.000Z'));
        expect(described.keys).toEqual([{ name: 'openai', updatedAt: '2026-01-01T00:00:00.000Z', ageDays: 10, stale: false }]);
    });

    it('rotates the file-managed secret, keeps the previous files, and the keys still read', async () => {
        const { mergeUserApiKeys, loadUserApiKeys, rotateVaultSecret, readUserVaultAudit } = await loadVaultModule();
        await mergeUserApiKeys('alice', { openai: 'sk-1' });
        await mergeUserApiKeys('bob', { meshy: 'sk-2' });
        const secretBefore = await fs.readFile(secretFile, 'utf8');
        const storeBefore = JSON.parse(await fs.readFile(vaultFile, 'utf8'));

        const result = await rotateVaultSecret({ source: 'test' });
        expect(result.ownerCount).toBe(2);
        expect(result.nextSecret).toBeUndefined();

        const secretAfter = await fs.readFile(secretFile, 'utf8');
        expect(secretAfter).not.toBe(secretBefore);
        expect(await fs.readFile(`${secretFile}.previous`, 'utf8')).toBe(secretBefore);
        const storeAfter = JSON.parse(await fs.readFile(vaultFile, 'utf8'));
        expect(storeAfter.users.alice.encryptedKeys).not.toBe(storeBefore.users.alice.encryptedKeys);
        expect(storeAfter.users.alice.writeCount).toBe(storeBefore.users.alice.writeCount);

        expect(await loadUserApiKeys('alice')).toEqual({ openai: 'sk-1' });
        expect(await loadUserApiKeys('bob')).toEqual({ meshy: 'sk-2' });
        // The rotation is visible on every owner's trail.
        expect((await readUserVaultAudit('bob')).some((e) => e.event === 'rotate' && e.owner === '*')).toBe(true);
    });

    it('cannot rotate an env-managed secret on its own, and echoes a supplied one', async () => {
        process.env[ENV_VAULT_SECRET] = 'unit-test-vault-secret';
        const { mergeUserApiKeys, loadUserApiKeys, rotateVaultSecret } = await loadVaultModule();
        await mergeUserApiKeys('alice', { openai: 'sk-1' });

        await expect(rotateVaultSecret()).rejects.toThrow(/IMAGE_EXPRESS_KEY_VAULT_SECRET/);
        await expect(rotateVaultSecret({ nextSecret: 'short' })).rejects.toThrow(/at least 32/);

        const next = 'n'.repeat(40);
        const result = await rotateVaultSecret({ nextSecret: next });
        expect(result.nextSecret).toBe(next);
        await expect(fs.access(secretFile)).rejects.toMatchObject({ code: 'ENOENT' });

        // Until the operator updates the environment the old secret no longer decrypts.
        await expect(loadUserApiKeys('alice')).rejects.toThrow();
        process.env[ENV_VAULT_SECRET] = next;
        expect(await loadUserApiKeys('alice')).toEqual({ openai: 'sk-1' });
    });
});
