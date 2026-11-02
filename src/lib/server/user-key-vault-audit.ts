import path from 'path';
import { promises as fs } from 'fs';

/**
 * Append-only trail of what happened to the key vault: who read keys, when,
 * and which key names were written, removed or re-encrypted. It records
 * names and counts only — a key value never reaches this file, so it can be
 * attached to a support ticket or shown to the owner in Settings.
 *
 * One JSON object per line. Kept beside the vault file; capped so a busy
 * queue cannot grow it without bound.
 */

export type VaultAuditEvent = 'read' | 'write' | 'remove' | 'rotate';

export interface VaultAuditEntry {
    at: string;
    event: VaultAuditEvent;
    /** Owner id, or `*` for the whole vault (secret rotation). */
    owner: string;
    /** Keys held after the event. */
    keyCount: number;
    /** Key names the event touched; absent for reads. */
    keys?: string[];
    /** Who asked: `api:user/keys`, `queue:remote-poll`, ... */
    source: string;
}

/** Trim to this many lines once the file passes MAX_LINES. */
const KEEP_LINES = 2500;
const MAX_LINES = 5000;

export function resolveAuditFilePath(vaultFilePath: string) {
    const override = process.env.IMAGE_EXPRESS_KEY_VAULT_AUDIT_FILE?.trim();
    if (override) return path.resolve(/* turbopackIgnore: true */ override);
    return path.join(path.dirname(vaultFilePath), 'user-key-vault.audit.jsonl');
}

function sanitizeKeyNames(keys: string[] | undefined): string[] | undefined {
    if (!keys) return undefined;
    return keys.filter((name) => typeof name === 'string' && name.length > 0).slice(0, 200);
}

export async function appendVaultAudit(filePath: string, entry: VaultAuditEntry): Promise<void> {
    const line = JSON.stringify({ ...entry, keys: sanitizeKeyNames(entry.keys) });
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, `${line}\n`, { encoding: 'utf8', mode: 0o600 });
    await trimIfOversized(filePath);
}

async function trimIfOversized(filePath: string) {
    // A line is ~150 bytes; only look at the content past the size that
    // MAX_LINES could occupy, so the common append costs one stat.
    const stat = await fs.stat(filePath);
    if (stat.size < MAX_LINES * 100) return;
    const lines = (await fs.readFile(filePath, 'utf8')).split('\n').filter(Boolean);
    if (lines.length <= MAX_LINES) return;
    await fs.writeFile(filePath, `${lines.slice(-KEEP_LINES).join('\n')}\n`, 'utf8');
}

export interface ReadVaultAuditOptions {
    /** Only this owner's entries (rotations, owner `*`, are included for everyone). */
    owner?: string;
    /** Newest first; default 100, at most 1000. */
    limit?: number;
}

export async function readVaultAudit(filePath: string, options: ReadVaultAuditOptions = {}): Promise<VaultAuditEntry[]> {
    const limit = Math.max(1, Math.min(1000, Math.floor(options.limit ?? 100)));
    let raw: string;
    try {
        raw = await fs.readFile(filePath, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }
    const entries: VaultAuditEntry[] = [];
    const lines = raw.split('\n');
    for (let index = lines.length - 1; index >= 0 && entries.length < limit; index -= 1) {
        const line = lines[index];
        if (!line) continue;
        let parsed: VaultAuditEntry;
        try {
            parsed = JSON.parse(line) as VaultAuditEntry;
        } catch {
            continue; // a torn last line after a crash; the rest is still good
        }
        if (options.owner && parsed.owner !== options.owner && parsed.owner !== '*') continue;
        entries.push(parsed);
    }
    return entries;
}
