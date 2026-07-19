import path from 'path';
import { promises as fs } from 'fs';
import crypto from 'crypto';
import JSZip from 'jszip';
import {
    AMBIENCE_ALLOWED_EXTENSIONS,
    DEFAULT_AMBIENCE,
    validateAmbienceManifest,
    type AmbienceManifest,
    type InstalledAmbience,
} from '@/lib/ambience-shared';
import { validateUiThemeSvg } from '@/lib/ui-themes-shared';

/**
 * Server-side store for Dashboard Ambience packs. Mirrors the theme-pack store:
 * packs are never bundled, users install a downloaded zip, files unpack to
 * data/ambience/<id>/ (gitignored) and are served via /api/ambience/files/<id>/.
 */

export const AMBIENCE_DIR = path.join(process.cwd(), 'data', 'ambience');

export const MAX_AMBIENCE_ZIP_BYTES = 25 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 80 * 1024 * 1024;
const MAX_ENTRIES = 60;

const ambienceBaseUrl = (id: string) => `/api/ambience/files/${id}/`;

export class AmbienceInstallError extends Error {}

const readManifestFromDir = async (dir: string): Promise<AmbienceManifest | null> => {
    try {
        const raw = await fs.readFile(path.join(dir, 'ambience.json'), 'utf8');
        const validation = validateAmbienceManifest(JSON.parse(raw));
        return validation.ok ? validation.manifest : null;
    } catch {
        return null;
    }
};

export const listInstalledAmbience = async (): Promise<InstalledAmbience[]> => {
    const packs: InstalledAmbience[] = [DEFAULT_AMBIENCE];
    let entries: string[] = [];
    try {
        entries = await fs.readdir(AMBIENCE_DIR);
    } catch {
        return packs;
    }
    for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        const dir = path.join(AMBIENCE_DIR, entry);
        try {
            if (!(await fs.stat(dir)).isDirectory()) continue;
        } catch {
            continue;
        }
        const manifest = await readManifestFromDir(dir);
        if (manifest && manifest.id === entry) {
            packs.push({ ...manifest, source: 'installed', baseUrl: ambienceBaseUrl(manifest.id) });
        }
    }
    return packs;
};

export const installAmbienceFromZip = async (
    buffer: Buffer,
    options: { overwrite?: boolean } = {}
): Promise<InstalledAmbience> => {
    if (buffer.byteLength > MAX_AMBIENCE_ZIP_BYTES) {
        throw new AmbienceInstallError(`Pack zip exceeds the ${Math.round(MAX_AMBIENCE_ZIP_BYTES / 1024 / 1024)} MB limit.`);
    }

    let zip: JSZip;
    try {
        zip = await JSZip.loadAsync(buffer);
    } catch {
        throw new AmbienceInstallError('The file is not a valid zip archive.');
    }

    const files = Object.values(zip.files).filter((entry) => !entry.dir);
    if (files.length === 0) throw new AmbienceInstallError('The zip archive is empty.');
    if (files.length > MAX_ENTRIES) throw new AmbienceInstallError('The zip archive contains too many files.');

    // Allow a single top-level folder wrapper.
    const names = files.map((entry) => entry.name.replace(/\\/g, '/'));
    let prefix = '';
    if (!names.some((name) => name === 'ambience.json')) {
        const first = names[0].split('/')[0];
        if (first && names.every((name) => name.startsWith(`${first}/`)) && names.includes(`${first}/ambience.json`)) {
            prefix = `${first}/`;
        }
    }

    const contents = new Map<string, Buffer>();
    let totalBytes = 0;
    for (const entry of files) {
        const rawName = entry.name.replace(/\\/g, '/');
        if (!rawName.startsWith(prefix)) {
            throw new AmbienceInstallError(`Unexpected file outside the pack folder: ${rawName}`);
        }
        const name = rawName.slice(prefix.length);
        if (!name) continue;
        if (name.includes('..') || name.startsWith('/') || /^[a-zA-Z]:/.test(name) || name.includes('\0')) {
            throw new AmbienceInstallError(`Unsafe path in zip: ${rawName}`);
        }
        const ext = path.posix.extname(name).toLowerCase();
        if (!AMBIENCE_ALLOWED_EXTENSIONS.has(ext)) {
            throw new AmbienceInstallError(`File type not allowed in ambience packs: ${name}`);
        }
        const data = await entry.async('nodebuffer');
        totalBytes += data.byteLength;
        if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
            throw new AmbienceInstallError('Pack is too large when unpacked.');
        }
        contents.set(name, data);
    }

    const manifestBuffer = contents.get('ambience.json');
    if (!manifestBuffer) throw new AmbienceInstallError('ambience.json is missing from the pack root.');

    let manifestJson: unknown;
    try {
        manifestJson = JSON.parse(manifestBuffer.toString('utf8'));
    } catch {
        throw new AmbienceInstallError('ambience.json is not valid JSON.');
    }
    const validation = validateAmbienceManifest(manifestJson);
    if (!validation.ok) throw new AmbienceInstallError(validation.reason);
    const manifest = validation.manifest;

    const referenced = [
        manifest.preview,
        ...(manifest.images || []),
        manifest.sprites?.background?.src,
        ...Object.values(manifest.sprites?.sheets || {}).map((sheet) => sheet.src),
    ].filter((value): value is string => Boolean(value));
    for (const ref of referenced) {
        if (!contents.has(ref)) throw new AmbienceInstallError(`ambience.json references a missing file: ${ref}`);
    }

    // SVG defense-in-depth (same scanner as theme packs).
    for (const [name, data] of contents) {
        if (path.posix.extname(name).toLowerCase() === '.svg' && !validateUiThemeSvg(data.toString('utf8'))) {
            throw new AmbienceInstallError(`${name}: SVG contains scripting and was rejected.`);
        }
    }

    const targetDir = path.join(AMBIENCE_DIR, manifest.id);
    let exists = false;
    try {
        await fs.stat(targetDir);
        exists = true;
    } catch { /* not installed yet */ }
    if (exists && !options.overwrite) {
        throw new AmbienceInstallError(`Ambience pack "${manifest.name}" is already installed. Remove it first or reinstall with overwrite.`);
    }

    const tempDir = path.join(process.cwd(), 'data', `.tmp-ambience-${crypto.randomBytes(6).toString('hex')}`);
    try {
        for (const [name, data] of contents) {
            const filePath = path.join(tempDir, ...name.split('/'));
            const resolved = path.resolve(filePath);
            if (!resolved.startsWith(path.resolve(tempDir) + path.sep)) {
                throw new AmbienceInstallError(`Unsafe path in zip: ${name}`);
            }
            await fs.mkdir(path.dirname(resolved), { recursive: true });
            await fs.writeFile(resolved, data);
        }
        await fs.mkdir(AMBIENCE_DIR, { recursive: true });
        if (exists) await fs.rm(targetDir, { recursive: true, force: true });
        await fs.rename(tempDir, targetDir);
    } catch (error) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        throw error;
    }

    return { ...manifest, source: 'installed', baseUrl: ambienceBaseUrl(manifest.id) };
};

export const uninstallAmbience = async (id: string): Promise<void> => {
    if (id === DEFAULT_AMBIENCE.id) {
        throw new AmbienceInstallError('"None" cannot be removed.');
    }
    if (!/^[a-z0-9][a-z0-9-]{1,49}$/.test(id)) {
        throw new AmbienceInstallError('Invalid pack id.');
    }
    const targetDir = path.join(AMBIENCE_DIR, id);
    try {
        await fs.stat(targetDir);
    } catch {
        throw new AmbienceInstallError('Pack is not installed.');
    }
    await fs.rm(targetDir, { recursive: true, force: true });
};

export const resolveAmbienceFile = async (id: string, relativeParts: string[]): Promise<string | null> => {
    if (!/^[a-z0-9][a-z0-9-]{1,49}$/.test(id)) return null;
    const relative = relativeParts.join('/');
    if (!relative || relative.includes('..') || relative.includes('\0')) return null;
    const ext = path.posix.extname(relative).toLowerCase();
    if (!AMBIENCE_ALLOWED_EXTENSIONS.has(ext)) return null;
    const packDir = path.resolve(AMBIENCE_DIR, id);
    const filePath = path.resolve(packDir, ...relative.split('/'));
    if (!filePath.startsWith(packDir + path.sep)) return null;
    try {
        if (!(await fs.stat(filePath)).isFile()) return null;
    } catch {
        return null;
    }
    return filePath;
};
