import path from 'path';
import { promises as fs } from 'fs';
import crypto from 'crypto';
import JSZip from 'jszip';
import {
    DEFAULT_UI_THEME,
    UI_THEME_ALLOWED_EXTENSIONS,
    validateUiThemeCss,
    validateUiThemeManifest,
    validateUiThemeSvg,
    type InstalledUiTheme,
    type UiThemeManifest,
} from '@/lib/ui-themes-shared';

/**
 * Server-side store for installable UI theme packs.
 * Packs are never bundled with the app: users download a zip and install it here.
 * Installed packs live in data/themes/<id>/ (data/ is gitignored) and are served
 * through /api/themes/files/<id>/<path>.
 */

export const THEMES_DIR = path.join(process.cwd(), 'data', 'themes');
/** Built-in packs shipped with the app (committed in the repo, served statically). */
export const BUILTIN_THEMES_DIR = path.join(process.cwd(), 'public', 'themes');

export const MAX_THEME_ZIP_BYTES = 20 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024;
const MAX_ENTRIES = 200;

const themeBaseUrl = (id: string) => `/api/themes/files/${id}/`;

export class ThemeInstallError extends Error {}

const readManifestFromDir = async (dir: string): Promise<UiThemeManifest | null> => {
    try {
        const raw = await fs.readFile(path.join(dir, 'theme.json'), 'utf8');
        const validation = validateUiThemeManifest(JSON.parse(raw));
        return validation.ok ? validation.manifest : null;
    } catch {
        return null;
    }
};

const scanThemeDir = async (
    rootDir: string,
    source: 'builtin' | 'installed',
    makeBaseUrl: (id: string) => string
): Promise<InstalledUiTheme[]> => {
    const themes: InstalledUiTheme[] = [];
    let entries: string[] = [];
    try {
        entries = await fs.readdir(rootDir);
    } catch {
        return themes;
    }
    for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        const dir = path.join(rootDir, entry);
        try {
            if (!(await fs.stat(dir)).isDirectory()) continue;
        } catch {
            continue;
        }
        const manifest = await readManifestFromDir(dir);
        if (manifest && manifest.id === entry) {
            themes.push({ ...manifest, source, baseUrl: makeBaseUrl(manifest.id) });
        }
    }
    return themes;
};

export const isBuiltinThemeId = async (id: string): Promise<boolean> => {
    if (id === DEFAULT_UI_THEME.id) return true;
    try {
        return (await fs.stat(path.join(BUILTIN_THEMES_DIR, id))).isDirectory();
    } catch {
        return false;
    }
};

export const listInstalledThemes = async (): Promise<InstalledUiTheme[]> => {
    const builtin = await scanThemeDir(BUILTIN_THEMES_DIR, 'builtin', (id) => `/themes/${id}/`);
    const installed = await scanThemeDir(THEMES_DIR, 'installed', themeBaseUrl);
    // Installed packs may not shadow built-in ids.
    const builtinIds = new Set(builtin.map((theme) => theme.id));
    return [DEFAULT_UI_THEME, ...builtin, ...installed.filter((theme) => !builtinIds.has(theme.id))];
};

export const installThemeFromZip = async (
    buffer: Buffer,
    options: { overwrite?: boolean } = {}
): Promise<InstalledUiTheme> => {
    if (buffer.byteLength > MAX_THEME_ZIP_BYTES) {
        throw new ThemeInstallError(`Theme zip exceeds the ${Math.round(MAX_THEME_ZIP_BYTES / 1024 / 1024)} MB limit.`);
    }

    let zip: JSZip;
    try {
        zip = await JSZip.loadAsync(buffer);
    } catch {
        throw new ThemeInstallError('The file is not a valid zip archive.');
    }

    // Collect and validate entries (skip directory entries).
    const files = Object.values(zip.files).filter((entry) => !entry.dir);
    if (files.length === 0) throw new ThemeInstallError('The zip archive is empty.');
    if (files.length > MAX_ENTRIES) throw new ThemeInstallError('The zip archive contains too many files.');

    // Theme packs may be zipped with a single top-level folder — detect and strip it.
    const names = files.map((entry) => entry.name.replace(/\\/g, '/'));
    let prefix = '';
    if (!names.some((name) => name === 'theme.json')) {
        const first = names[0].split('/')[0];
        if (first && names.every((name) => name.startsWith(`${first}/`)) && names.includes(`${first}/theme.json`)) {
            prefix = `${first}/`;
        }
    }

    const contents = new Map<string, Buffer>();
    let totalBytes = 0;
    for (const entry of files) {
        const rawName = entry.name.replace(/\\/g, '/');
        if (!rawName.startsWith(prefix)) {
            throw new ThemeInstallError(`Unexpected file outside the theme folder: ${rawName}`);
        }
        const name = rawName.slice(prefix.length);
        if (!name) continue;
        // Zip-slip / path safety.
        if (name.includes('..') || name.startsWith('/') || /^[a-zA-Z]:/.test(name) || name.includes('\0')) {
            throw new ThemeInstallError(`Unsafe path in zip: ${rawName}`);
        }
        const ext = path.posix.extname(name).toLowerCase();
        if (!UI_THEME_ALLOWED_EXTENSIONS.has(ext)) {
            throw new ThemeInstallError(`File type not allowed in theme packs: ${name}`);
        }
        const data = await entry.async('nodebuffer');
        totalBytes += data.byteLength;
        if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
            throw new ThemeInstallError('Theme pack is too large when unpacked.');
        }
        contents.set(name, data);
    }

    const manifestBuffer = contents.get('theme.json');
    if (!manifestBuffer) throw new ThemeInstallError('theme.json is missing from the pack root.');

    let manifestJson: unknown;
    try {
        manifestJson = JSON.parse(manifestBuffer.toString('utf8'));
    } catch {
        throw new ThemeInstallError('theme.json is not valid JSON.');
    }
    const validation = validateUiThemeManifest(manifestJson);
    if (!validation.ok) throw new ThemeInstallError(validation.reason);
    const manifest = validation.manifest;

    // Referenced files must exist in the pack.
    const referenced = [
        manifest.stylesheet,
        manifest.preview,
        ...(manifest.fonts || []).map((font) => font.src),
        ...Object.values(manifest.spriteTheater?.sheets || {}).map((sheet) => sheet.src),
    ].filter((value): value is string => Boolean(value));
    for (const ref of referenced) {
        if (!contents.has(ref)) throw new ThemeInstallError(`theme.json references a missing file: ${ref}`);
    }

    // CSS sanitation (all css files) and SVG defense-in-depth.
    for (const [name, data] of contents) {
        const ext = path.posix.extname(name).toLowerCase();
        if (ext === '.css') {
            const cssCheck = validateUiThemeCss(data.toString('utf8'));
            if (!cssCheck.ok) throw new ThemeInstallError(`${name}: ${cssCheck.reason}`);
        } else if (ext === '.svg') {
            if (!validateUiThemeSvg(data.toString('utf8'))) {
                throw new ThemeInstallError(`${name}: SVG contains scripting and was rejected.`);
            }
        }
    }

    const stylesheetCss = contents.get(manifest.stylesheet)!.toString('utf8');
    if (!stylesheetCss.includes(`[data-ui-theme='${manifest.id}']`) && !stylesheetCss.includes(`[data-ui-theme="${manifest.id}"]`)) {
        throw new ThemeInstallError(`The stylesheet must scope its rules under :root[data-ui-theme='${manifest.id}'].`);
    }

    if (await isBuiltinThemeId(manifest.id)) {
        throw new ThemeInstallError(`"${manifest.id}" is a built-in theme id and cannot be replaced.`);
    }

    const targetDir = path.join(THEMES_DIR, manifest.id);
    let exists = false;
    try {
        await fs.stat(targetDir);
        exists = true;
    } catch { /* not installed yet */ }
    if (exists && !options.overwrite) {
        throw new ThemeInstallError(`Theme "${manifest.name}" is already installed. Remove it first or reinstall with overwrite.`);
    }

    // Extract to a temp dir, then swap into place.
    const tempDir = path.join(process.cwd(), 'data', `.tmp-theme-${crypto.randomBytes(6).toString('hex')}`);
    try {
        for (const [name, data] of contents) {
            const filePath = path.join(tempDir, ...name.split('/'));
            const resolved = path.resolve(filePath);
            if (!resolved.startsWith(path.resolve(tempDir) + path.sep)) {
                throw new ThemeInstallError(`Unsafe path in zip: ${name}`);
            }
            await fs.mkdir(path.dirname(resolved), { recursive: true });
            await fs.writeFile(resolved, data);
        }
        await fs.mkdir(THEMES_DIR, { recursive: true });
        if (exists) await fs.rm(targetDir, { recursive: true, force: true });
        await fs.rename(tempDir, targetDir);
    } catch (error) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        throw error;
    }

    return { ...manifest, source: 'installed', baseUrl: themeBaseUrl(manifest.id) };
};

export const uninstallTheme = async (id: string): Promise<void> => {
    if (await isBuiltinThemeId(id)) {
        throw new ThemeInstallError('Built-in themes cannot be removed.');
    }
    if (!/^[a-z0-9][a-z0-9-]{1,49}$/.test(id)) {
        throw new ThemeInstallError('Invalid theme id.');
    }
    const targetDir = path.join(THEMES_DIR, id);
    try {
        await fs.stat(targetDir);
    } catch {
        throw new ThemeInstallError('Theme is not installed.');
    }
    await fs.rm(targetDir, { recursive: true, force: true });
};

/** Resolve a file inside an installed theme for serving; null if unsafe/missing. */
export const resolveThemeFile = async (id: string, relativeParts: string[]): Promise<string | null> => {
    if (!/^[a-z0-9][a-z0-9-]{1,49}$/.test(id)) return null;
    const relative = relativeParts.join('/');
    if (!relative || relative.includes('..') || relative.includes('\0')) return null;
    const ext = path.posix.extname(relative).toLowerCase();
    if (!UI_THEME_ALLOWED_EXTENSIONS.has(ext)) return null;
    const themeDir = path.resolve(THEMES_DIR, id);
    const filePath = path.resolve(themeDir, ...relative.split('/'));
    if (!filePath.startsWith(themeDir + path.sep)) return null;
    try {
        if (!(await fs.stat(filePath)).isFile()) return null;
    } catch {
        return null;
    }
    return filePath;
};
