/**
 * Shared (client + server) types and validation for installable UI theme packs.
 * See docs/THEME_PACKS_SPEC.md. Theme packs are self-contained packages (CSS,
 * sprite assets, and scene behavior modules) — they are never bundled with the
 * app and are installed by the user as zips.
 */

export const UI_THEME_SCHEMA_VERSION = 1;
export const DEFAULT_UI_THEME_ID = 'default';
export const UI_THEME_STORAGE_KEY = 'image-express-ui-theme';
export const UI_THEME_CHANGED_EVENT = 'image-express:ui-theme-changed';
export const UI_THEME_STYLESHEET_ELEMENT_ID = 'ui-theme-stylesheet';

export type UiThemeFontFace = {
    family: string;
    src: string; // relative path inside the pack
    weight?: string;
    style?: string;
};

/** Sprite-theater (extended themes): declarative overlay characters. Packs ship
 *  sprite sheets (png), scene configs, AND the scene behavior modules
 *  (scenes/<type>.mjs) — the app only provides the loader/runtime. */
export type SpriteAnimation = {
    frames: number[];
    fps: number;
};

export type SpriteSheet = {
    src: string; // relative path inside the pack
    frameWidth: number;
    frameHeight: number;
    animations: Record<string, SpriteAnimation>;
};

export type SpriteActorRef = {
    sheet: string;
    anim: string;
    /** Pixels the actor trails behind the scene leader (chase legs). */
    offset?: number;
};

export type SpriteScene =
    | { type: 'flyAcross'; weight?: number; actor: SpriteActorRef; altAnim?: string; yBand?: [number, number]; speed?: number }
    | { type: 'chase'; weight?: number; legs: Array<{ dir: 'left' | 'right'; speed?: number; actors: SpriteActorRef[] }> }
    | { type: 'idleVisit'; weight?: number; actor: { sheet: string }; flyAnim: string; sitAnim: string; fireAnim?: string; idleSeconds?: number; staySeconds?: number }
    | { type: 'edgeWalk'; weight?: number; actor: { sheet: string }; walkAnim: string; fallAnim?: string; runAnim: string; edge?: 'left' | 'right' }
    /** A whole mob sprinting across the bottom edge. */
    | { type: 'horde'; weight?: number; actor: SpriteActorRef; count?: number; speed?: number }
    /** Workers build a structure stage by stage; a destroyer flies in and wrecks it; workers scatter. */
    | { type: 'build'; weight?: number;
        builders: { sheet: string; anim: string; count?: number };
        structure: { sheet: string; stages: string[]; rubble: string };
        destroyer: { sheet: string; anim: string; altAnim?: string } }
    /** A rider careens around the screen on a mount, falls off, and is caught by runners below. */
    | { type: 'rodeo'; weight?: number;
        mount: { sheet: string; anim: string };
        rider: { sheet: string; anim: string; fallAnim?: string };
        catchers: { sheet: string; anim: string; count?: number } }
    /** A grand procession crosses the screen... then everyone flees back the other way, chased. */
    | { type: 'parade'; weight?: number;
        groups: Array<{ sheet: string; anim: string; count?: number; gap?: number }>;
        chaser: { sheet: string; anim: string; altAnim?: string } }
    /** Actor drags a prop (booth) on screen, sets up, marches back and forth in front of it, drags it away. */
    | { type: 'sentry'; weight?: number;
        prop: { sheet: string; anim: string };
        actor: { sheet: string; dragAnim: string; marchAnim: string };
        marchSeconds?: number }
    /** Singers file in one by one into rows, a conductor arrives and conducts them, all disperse. */
    | { type: 'choir'; weight?: number;
        singers: { sheet: string; anim: string; singAnim: string; count?: number; rows?: number };
        conductor: { sheet: string; anim: string; conductAnim: string };
        singSeconds?: number }
    /** A line of actors slowly leapfrogs across the screen, rear hopping over the front. */
    | { type: 'leapfrog'; weight?: number;
        actor: { sheet: string; anim: string; hopAnim?: string };
        count?: number }
    /** A herder chases a flock into the shape of a word, then stands aside and waves at the viewer. */
    | { type: 'wordFormation'; weight?: number;
        herd: { sheet: string; anim: string; idleAnim: string };
        herder: { sheet: string; runAnim: string; waveAnim: string };
        words: string[];
        holdSeconds?: number }
    /** A single actor zooms chaotically all over the screen (jetpack!) and exits. */
    | { type: 'frolic'; weight?: number;
        actor: { sheet: string; anim: string };
        seconds?: number }
    /** Actor runs in, circles the user's cursor a few times (herding it), sits proudly, runs off. */
    | { type: 'herdCursor'; weight?: number;
        actor: { sheet: string; runAnim: string; sitAnim: string } }
    /** Roadies set up a stage, the band rocks out (with floating notes), the audience bops along. */
    | { type: 'concert'; weight?: number;
        stage: { sheet: string; anim: string };
        band: Array<{ sheet: string; anim: string }>;
        audience?: { sheet: string; anim: string; count?: number };
        playSeconds?: number }
    /** Dancers bounce at random spots under a shower of confetti. */
    | { type: 'danceParty'; weight?: number;
        dancers: { sheet: string; anim: string; count?: number };
        seconds?: number }
    /** A herder stacks the flock into a pyramid, row by row... which eventually topples. */
    | { type: 'pyramid'; weight?: number;
        herd: { sheet: string; anim: string; idleAnim: string };
        herder: { sheet: string; anim: string };
        rows?: number }
    /** A machine is wheeled in and throws a ball; the retriever fetches it back. Repeatedly. */
    | { type: 'fetch'; weight?: number;
        machine: { sheet: string; anim: string; throwAnim?: string };
        ball: { sheet: string; anim: string };
        retriever: { sheet: string; runAnim: string };
        throws?: number }
    /** Teacher drags in a blackboard; pupils sit in rows and are lectured at. */
    | { type: 'classroom'; weight?: number;
        board: { sheet: string; anim: string };
        teacher: { sheet: string; dragAnim: string; teachAnim: string };
        pupils: { sheet: string; anim: string; sitAnim: string; count?: number; rows?: number };
        teachSeconds?: number };

export type SpriteTheaterConfig = {
    /** Integer pixel scale 1-6 (rendered with image-rendering: pixelated). */
    scale: number;
    minDelaySeconds: number;
    maxDelaySeconds: number;
    sheets: Record<string, SpriteSheet>;
    scenes: SpriteScene[];
};

export type UiThemeManifest = {
    schemaVersion: number;
    id: string;
    name: string;
    description?: string;
    author?: string;
    version?: string;
    stylesheet: string;
    preview?: string;
    lockMode?: 'light' | 'dark';
    lockAccent?: boolean;
    fonts?: UiThemeFontFace[];
    spriteTheater?: SpriteTheaterConfig;
    /** Optional themed quote/fact pack: replaces the dashboard quotes while this theme is active. */
    quotes?: UiThemeQuote[];
};

export type UiThemeQuote = {
    text: string;
    author?: string;
};

export type InstalledUiTheme = UiThemeManifest & {
    source: 'builtin' | 'installed';
    /** Base URL (with trailing slash) for resolving stylesheet/preview/font paths. Empty for the virtual default theme. */
    baseUrl: string;
};

/** The virtual default theme: no stylesheet, the app as shipped. */
export const DEFAULT_UI_THEME: InstalledUiTheme = {
    schemaVersion: UI_THEME_SCHEMA_VERSION,
    id: DEFAULT_UI_THEME_ID,
    name: 'Creative Flow',
    description: 'The standard interface. Supports dark/light mode and accent palettes.',
    author: 'Creative Flow',
    stylesheet: '',
    source: 'builtin',
    baseUrl: '',
};

export const UI_THEME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,49}$/;

const isRelativePackPath = (value: string): boolean => {
    if (typeof value !== 'string' || value.length === 0 || value.length > 200) return false;
    if (value.includes('\\') || value.includes('..') || value.startsWith('/') || /^[a-zA-Z]:/.test(value)) return false;
    if (value.includes('://')) return false;
    return true;
};

export type ManifestValidation =
    | { ok: true; manifest: UiThemeManifest }
    | { ok: false; reason: string };

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
    const num = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    return Math.min(max, Math.max(min, num));
};

const SPRITE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/;

/** Validate the optional spriteTheater block. Returns the sanitized config or an error reason. */
const validateSpriteTheater = (
    raw: unknown,
    isRelative: (value: string) => boolean
): { ok: true; config: SpriteTheaterConfig } | { ok: false; reason: string } => {
    if (!raw || typeof raw !== 'object') {
        return { ok: false, reason: '"spriteTheater" must be an object.' };
    }
    const data = raw as Record<string, unknown>;

    const rawSheets = data.sheets;
    if (!rawSheets || typeof rawSheets !== 'object' || Array.isArray(rawSheets)) {
        return { ok: false, reason: 'spriteTheater needs a "sheets" object.' };
    }
    const sheetEntries = Object.entries(rawSheets as Record<string, unknown>);
    if (sheetEntries.length === 0 || sheetEntries.length > 16) {
        return { ok: false, reason: 'spriteTheater supports 1-16 sprite sheets.' };
    }
    const sheets: Record<string, SpriteSheet> = {};
    for (const [name, entry] of sheetEntries) {
        if (!SPRITE_NAME_PATTERN.test(name)) return { ok: false, reason: `Invalid sheet name "${name}".` };
        const sheet = entry as Record<string, unknown>;
        if (!sheet || typeof sheet !== 'object'
            || typeof sheet.src !== 'string' || !isRelative(sheet.src) || !/\.(png|webp)$/i.test(sheet.src)) {
            return { ok: false, reason: `Sheet "${name}" needs a relative .png/.webp "src".` };
        }
        const frameWidth = clampNumber(sheet.frameWidth, 0, 4, 128);
        const frameHeight = clampNumber(sheet.frameHeight, 0, 4, 128);
        if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight)) {
            return { ok: false, reason: `Sheet "${name}" needs integer frameWidth/frameHeight (4-128).` };
        }
        const rawAnims = sheet.animations;
        if (!rawAnims || typeof rawAnims !== 'object' || Array.isArray(rawAnims)) {
            return { ok: false, reason: `Sheet "${name}" needs an "animations" object.` };
        }
        const animations: Record<string, SpriteAnimation> = {};
        const animEntries = Object.entries(rawAnims as Record<string, unknown>);
        if (animEntries.length === 0 || animEntries.length > 16) {
            return { ok: false, reason: `Sheet "${name}" supports 1-16 animations.` };
        }
        for (const [animName, animEntry] of animEntries) {
            if (!SPRITE_NAME_PATTERN.test(animName)) return { ok: false, reason: `Invalid animation name "${animName}".` };
            const anim = animEntry as Record<string, unknown>;
            const frames = Array.isArray(anim?.frames)
                ? anim.frames.filter((f): f is number => Number.isInteger(f) && f >= 0 && f < 64).slice(0, 32)
                : [];
            if (frames.length === 0) return { ok: false, reason: `Animation "${name}.${animName}" needs integer frame indices.` };
            animations[animName] = { frames, fps: clampNumber(anim.fps, 6, 1, 24) };
        }
        sheets[name] = { src: sheet.src, frameWidth, frameHeight, animations };
    }

    const rawScenes = data.scenes;
    if (!Array.isArray(rawScenes) || rawScenes.length === 0 || rawScenes.length > 20) {
        return { ok: false, reason: 'spriteTheater needs 1-20 "scenes".' };
    }
    // Scene behavior now ships with the pack (scenes/<type>.mjs), so the app
    // only checks the shape generically: a well-formed type name and a sane
    // weight. Scene-specific fields are the module's own contract; a scene
    // whose module is missing or crashes is skipped at runtime.
    const scenes: SpriteScene[] = [];
    for (const entry of rawScenes) {
        const scene = entry as Record<string, unknown>;
        if (!scene || typeof scene !== 'object' || typeof scene.type !== 'string' || !SPRITE_NAME_PATTERN.test(scene.type)) {
            return { ok: false, reason: 'Each scene needs a "type" (letters/digits/_/-, max 32 chars).' };
        }
        if (scene.weight !== undefined && (typeof scene.weight !== 'number' || !Number.isFinite(scene.weight) || scene.weight < 0)) {
            return { ok: false, reason: `Scene "${scene.type}" has an invalid "weight".` };
        }
        scenes.push(entry as SpriteScene);
    }

    return {
        ok: true,
        config: {
            scale: Math.round(clampNumber(data.scale, 3, 1, 6)),
            minDelaySeconds: clampNumber(data.minDelaySeconds, 45, 10, 900),
            maxDelaySeconds: clampNumber(data.maxDelaySeconds, 180, 15, 1800),
            sheets,
            scenes,
        },
    };
};

/** Validate a parsed theme.json. Unknown keys are ignored (forward compatibility). */
export const validateUiThemeManifest = (raw: unknown): ManifestValidation => {
    if (!raw || typeof raw !== 'object') {
        return { ok: false, reason: 'theme.json is not a JSON object.' };
    }
    const data = raw as Record<string, unknown>;

    if (typeof data.schemaVersion !== 'number' || !Number.isInteger(data.schemaVersion)) {
        return { ok: false, reason: 'theme.json is missing an integer "schemaVersion".' };
    }
    if (data.schemaVersion > UI_THEME_SCHEMA_VERSION) {
        return { ok: false, reason: `Theme requires schema version ${data.schemaVersion}; this app supports up to ${UI_THEME_SCHEMA_VERSION}. Update the app.` };
    }
    if (typeof data.id !== 'string' || !UI_THEME_ID_PATTERN.test(data.id)) {
        return { ok: false, reason: 'Theme "id" must be 2-50 chars of lowercase letters, digits, and hyphens.' };
    }
    if (data.id === DEFAULT_UI_THEME_ID) {
        return { ok: false, reason: 'Theme id "default" is reserved.' };
    }
    if (typeof data.name !== 'string' || data.name.trim().length === 0 || data.name.length > 80) {
        return { ok: false, reason: 'Theme "name" is required (max 80 characters).' };
    }
    if (typeof data.stylesheet !== 'string' || !data.stylesheet.endsWith('.css') || !isRelativePackPath(data.stylesheet)) {
        return { ok: false, reason: 'Theme "stylesheet" must be a relative .css path inside the pack.' };
    }
    if (data.preview !== undefined && (typeof data.preview !== 'string' || !isRelativePackPath(data.preview))) {
        return { ok: false, reason: 'Theme "preview" must be a relative path inside the pack.' };
    }
    if (data.lockMode !== undefined && data.lockMode !== 'light' && data.lockMode !== 'dark') {
        return { ok: false, reason: 'Theme "lockMode" must be "light" or "dark".' };
    }
    if (data.lockAccent !== undefined && typeof data.lockAccent !== 'boolean') {
        return { ok: false, reason: 'Theme "lockAccent" must be a boolean.' };
    }

    let fonts: UiThemeFontFace[] | undefined;
    if (data.fonts !== undefined) {
        if (!Array.isArray(data.fonts) || data.fonts.length > 12) {
            return { ok: false, reason: 'Theme "fonts" must be an array of at most 12 entries.' };
        }
        fonts = [];
        for (const entry of data.fonts) {
            const font = entry as Record<string, unknown>;
            if (!font || typeof font !== 'object'
                || typeof font.family !== 'string' || font.family.length === 0 || font.family.length > 80
                || typeof font.src !== 'string' || !isRelativePackPath(font.src)) {
                return { ok: false, reason: 'Each font entry needs a "family" and a relative "src" path.' };
            }
            fonts.push({
                family: font.family,
                src: font.src,
                weight: typeof font.weight === 'string' ? font.weight : undefined,
                style: typeof font.style === 'string' ? font.style : undefined,
            });
        }
    }

    let spriteTheater: SpriteTheaterConfig | undefined;
    if (data.spriteTheater !== undefined) {
        const theater = validateSpriteTheater(data.spriteTheater, isRelativePackPath);
        if (!theater.ok) return { ok: false, reason: theater.reason };
        spriteTheater = theater.config;
    }

    let quotes: UiThemeQuote[] | undefined;
    if (data.quotes !== undefined) {
        if (!Array.isArray(data.quotes) || data.quotes.length === 0 || data.quotes.length > 60) {
            return { ok: false, reason: 'Theme "quotes" must be an array of 1-60 entries.' };
        }
        quotes = [];
        for (const entry of data.quotes) {
            const quote = entry as Record<string, unknown>;
            if (!quote || typeof quote !== 'object' || typeof quote.text !== 'string'
                || quote.text.trim().length === 0 || quote.text.length > 240) {
                return { ok: false, reason: 'Each quote needs a "text" of at most 240 characters.' };
            }
            quotes.push({
                text: quote.text.trim(),
                author: typeof quote.author === 'string' ? quote.author.slice(0, 80) : undefined,
            });
        }
    }

    return {
        ok: true,
        manifest: {
            schemaVersion: data.schemaVersion,
            id: data.id,
            name: data.name.trim(),
            description: typeof data.description === 'string' ? data.description.slice(0, 300) : undefined,
            author: typeof data.author === 'string' ? data.author.slice(0, 120) : undefined,
            version: typeof data.version === 'string' ? data.version.slice(0, 40) : undefined,
            stylesheet: data.stylesheet,
            preview: data.preview as string | undefined,
            lockMode: data.lockMode as 'light' | 'dark' | undefined,
            lockAccent: data.lockAccent as boolean | undefined,
            fonts,
            spriteTheater,
            quotes,
        },
    };
};

/** File extensions a theme pack may contain. Everything else is rejected at install. */
export const UI_THEME_ALLOWED_EXTENSIONS = new Set([
    '.json', '.css', '.woff2', '.woff', '.ttf', '.otf', '.svg', '.png', '.webp', '.mjs',
]);

const FORBIDDEN_CSS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
    { pattern: /@import\b/i, reason: 'theme.css must not use @import.' },
    { pattern: /url\(\s*["']?\s*(https?:)?\/\//i, reason: 'theme.css must not reference external URLs.' },
    { pattern: /expression\s*\(/i, reason: 'theme.css must not use expression().' },
    { pattern: /javascript:/i, reason: 'theme.css must not contain javascript: URLs.' },
    { pattern: /url\(\s*["']?\s*data:(?!image\/|font\/)/i, reason: 'theme.css data: URIs are limited to image/* and font/*.' },
];

export const validateUiThemeCss = (css: string): { ok: true } | { ok: false; reason: string } => {
    for (const { pattern, reason } of FORBIDDEN_CSS_PATTERNS) {
        if (pattern.test(css)) return { ok: false, reason };
    }
    return { ok: true };
};

const FORBIDDEN_SVG_PATTERNS = [/<script/i, /\bon\w+\s*=/i, /javascript:/i];

export const validateUiThemeSvg = (svg: string): boolean => (
    !FORBIDDEN_SVG_PATTERNS.some((pattern) => pattern.test(svg))
);

/**
 * Pre-hydration script (mirrors buildThemePreferencesInitScript): re-applies the
 * stored theme's stylesheet + lockMode before first paint to avoid a default-theme flash.
 * Must run after theme-preferences-init so lockMode wins over the stored mode preference.
 */
export const buildUiThemeInitScript = () => `(() => {
  try {
    const raw = window.localStorage.getItem(${JSON.stringify(UI_THEME_STORAGE_KEY)});
    if (!raw) return;
    const stored = JSON.parse(raw);
    if (!stored || typeof stored.id !== 'string' || stored.id === ${JSON.stringify(DEFAULT_UI_THEME_ID)}) return;
    if (typeof stored.stylesheetUrl !== 'string' || !stored.stylesheetUrl.startsWith('/')) return;
    const root = document.documentElement;
    root.dataset.uiTheme = stored.id;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.id = ${JSON.stringify(UI_THEME_STYLESHEET_ELEMENT_ID)};
    link.href = stored.stylesheetUrl;
    document.head.appendChild(link);
    if (stored.lockMode === 'light' || stored.lockMode === 'dark') {
      root.dataset.themeMode = stored.lockMode;
      root.style.colorScheme = stored.lockMode;
    }
  } catch {}
})();`;
