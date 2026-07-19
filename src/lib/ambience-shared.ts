/**
 * Shared (client + server) types and validation for Dashboard Ambience packs —
 * downloadable background eye-candy for the hub/dashboard only (never the editor).
 *
 * A pack is a JSON config plus assets AND its own effect engine (effect.mjs,
 * a plain ES module loaded by DashboardAmbience at runtime) — the app only
 * ships the loader. See docs/THEME_PACKS_SPEC.md for the shared rules.
 */

export const AMBIENCE_SCHEMA_VERSION = 1;
export const DEFAULT_AMBIENCE_ID = 'none';
export const AMBIENCE_STORAGE_KEY = 'image-express-ambience';
export const AMBIENCE_CHANGED_EVENT = 'image-express:ambience-changed';

/** Stock effect engines (canonical modules in ambience-packs/effect-modules/).
 *  The name is informational — the behavior comes from the pack's effect.mjs,
 *  so packs may also declare their own effect names. */
export const AMBIENCE_EFFECTS = ['matrix', 'constellation', 'aurora', 'bokeh', 'floating-images', 'sprite-scape'] as const;
export type AmbienceEffect = string;

/** sprite-scape: a living pixel-art backdrop — background image + sprite actors
 *  with built-in behaviors. Packs supply art + config only, never code. */
export type AmbienceSpriteAnimation = { frames: number[]; fps: number };

export type AmbienceSpriteSheet = {
    src: string;
    frameWidth: number;
    frameHeight: number;
    animations: Record<string, AmbienceSpriteAnimation>;
};

export type AmbienceActorBehavior = 'flyLoop' | 'perch' | 'patrol' | 'buzz' | 'shooter';

export type AmbienceActor = {
    behavior: AmbienceActorBehavior;
    sheet: string;
    anim: string;
    /** flyLoop: occasional burst anim (fire); shooter: the shooting pose. */
    altAnim?: string;
    /** patrol: played while pausing between walks. */
    idleAnim?: string;
    /** How many copies of this actor to spawn (1-6). */
    count?: number;
    /** Vertical range as fraction of screen height (flyLoop/buzz). */
    band?: [number, number];
    speed?: number;
    /** perch: fixed position as fraction of screen (0-1). */
    x?: number;
    y?: number;
    /** shooter: projectile color (#rrggbb). */
    boltColor?: string;
};

/** A flock that periodically reassembles itself into words from a list
 *  (sheep herded into "HAPPY", "WOOF", ...) using the built-in 3x5 pixel font. */
export type AmbienceWordFlock = {
    sheet: string;
    /** Played while running to a new position. */
    anim: string;
    /** Played while holding formation. */
    idleAnim: string;
    words: string[];
    /** Vertical center of the word area as a fraction of screen height. */
    y?: number;
    /** Seconds between re-formations (clamped 10-120). */
    periodSeconds?: number;
};

export type AmbienceSpriteConfig = {
    scale: number; // 1-6 integer, rendered pixelated
    background?: { src: string; opacity?: number };
    sheets: Record<string, AmbienceSpriteSheet>;
    actors: AmbienceActor[];
    wordFlock?: AmbienceWordFlock;
};

export type AmbienceOptions = {
    /** 1-4 CSS hex colors used by the effect. */
    colors: string[];
    /** Overall strength 0.05-0.5 — deliberately capped so it never distracts. */
    opacity: number;
    /** Relative element density 0.2-2. */
    density: number;
    /** Relative animation speed 0.2-2. */
    speed: number;
    /** Whether the effect reacts to the mouse. */
    mouseReact: boolean;
};

export type AmbienceManifest = {
    schemaVersion: number;
    id: string;
    name: string;
    description?: string;
    author?: string;
    version?: string;
    effect: AmbienceEffect;
    preview?: string;
    options: AmbienceOptions;
    /** Relative paths to pack images (used by 'floating-images'). */
    images?: string[];
    /** Config for the 'sprite-scape' effect. */
    sprites?: AmbienceSpriteConfig;
};

export type InstalledAmbience = AmbienceManifest & {
    source: 'builtin' | 'installed';
    baseUrl: string;
};

/** Virtual default: no background effect. */
export const DEFAULT_AMBIENCE: InstalledAmbience = {
    schemaVersion: AMBIENCE_SCHEMA_VERSION,
    id: DEFAULT_AMBIENCE_ID,
    name: 'None',
    description: 'No background effect — the plain dashboard.',
    author: 'Creative Flow',
    effect: 'aurora',
    options: { colors: ['#000000'], opacity: 0, density: 1, speed: 1, mouseReact: false },
    source: 'builtin',
    baseUrl: '',
};

export const AMBIENCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,49}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const isRelativePackPath = (value: string): boolean => {
    if (typeof value !== 'string' || value.length === 0 || value.length > 200) return false;
    if (value.includes('\\') || value.includes('..') || value.startsWith('/') || /^[a-zA-Z]:/.test(value)) return false;
    if (value.includes('://')) return false;
    return true;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type AmbienceValidation =
    | { ok: true; manifest: AmbienceManifest }
    | { ok: false; reason: string };

const SPRITE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/;
const ACTOR_BEHAVIORS = new Set<AmbienceActorBehavior>(['flyLoop', 'perch', 'patrol', 'buzz', 'shooter']);
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

const validateAmbienceSprites = (
    raw: unknown,
    isRelative: (value: string) => boolean
): { ok: true; config: AmbienceSpriteConfig } | { ok: false; reason: string } => {
    if (!raw || typeof raw !== 'object') return { ok: false, reason: '"sprites" must be an object.' };
    const data = raw as Record<string, unknown>;

    const rawSheets = data.sheets;
    if (!rawSheets || typeof rawSheets !== 'object' || Array.isArray(rawSheets)) {
        return { ok: false, reason: 'sprites needs a "sheets" object.' };
    }
    const sheetEntries = Object.entries(rawSheets as Record<string, unknown>);
    if (sheetEntries.length === 0 || sheetEntries.length > 8) {
        return { ok: false, reason: 'sprites supports 1-8 sheets.' };
    }
    const sheets: Record<string, AmbienceSpriteSheet> = {};
    for (const [name, entry] of sheetEntries) {
        if (!SPRITE_NAME_PATTERN.test(name)) return { ok: false, reason: `Invalid sheet name "${name}".` };
        const sheet = entry as Record<string, unknown>;
        if (!sheet || typeof sheet !== 'object'
            || typeof sheet.src !== 'string' || !isRelative(sheet.src) || !/\.(png|webp)$/i.test(sheet.src)) {
            return { ok: false, reason: `Sheet "${name}" needs a relative .png/.webp "src".` };
        }
        const frameWidth = typeof sheet.frameWidth === 'number' ? Math.round(sheet.frameWidth) : 0;
        const frameHeight = typeof sheet.frameHeight === 'number' ? Math.round(sheet.frameHeight) : 0;
        if (frameWidth < 4 || frameWidth > 128 || frameHeight < 4 || frameHeight > 128) {
            return { ok: false, reason: `Sheet "${name}" needs frameWidth/frameHeight between 4 and 128.` };
        }
        const rawAnims = sheet.animations;
        if (!rawAnims || typeof rawAnims !== 'object' || Array.isArray(rawAnims)) {
            return { ok: false, reason: `Sheet "${name}" needs an "animations" object.` };
        }
        const animations: Record<string, AmbienceSpriteAnimation> = {};
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
            animations[animName] = { frames, fps: clamp(typeof anim.fps === 'number' ? anim.fps : 6, 1, 24) };
        }
        sheets[name] = { src: sheet.src, frameWidth, frameHeight, animations };
    }

    let background: AmbienceSpriteConfig['background'];
    if (data.background !== undefined) {
        const bg = data.background as Record<string, unknown>;
        if (!bg || typeof bg !== 'object' || typeof bg.src !== 'string' || !isRelative(bg.src) || !/\.(png|webp)$/i.test(bg.src)) {
            return { ok: false, reason: 'sprites "background" needs a relative .png/.webp "src".' };
        }
        background = {
            src: bg.src,
            opacity: clamp(typeof bg.opacity === 'number' ? bg.opacity : 1, 0.1, 1),
        };
    }

    const rawActors = data.actors;
    if (!Array.isArray(rawActors) || rawActors.length === 0 || rawActors.length > 12) {
        return { ok: false, reason: 'sprites needs 1-12 "actors".' };
    }
    const actors: AmbienceActor[] = [];
    let totalSpawns = 0;
    for (const entry of rawActors) {
        const actor = entry as Record<string, unknown>;
        if (!actor || typeof actor !== 'object'
            || typeof actor.behavior !== 'string' || !ACTOR_BEHAVIORS.has(actor.behavior as AmbienceActorBehavior)
            || typeof actor.sheet !== 'string' || !sheets[actor.sheet]
            || typeof actor.anim !== 'string' || !sheets[actor.sheet].animations[actor.anim]) {
            return { ok: false, reason: 'Each actor needs a valid behavior, sheet, and anim.' };
        }
        const anims = sheets[actor.sheet].animations;
        if (actor.altAnim !== undefined && (typeof actor.altAnim !== 'string' || !anims[actor.altAnim])) {
            return { ok: false, reason: `Actor altAnim "${actor.altAnim}" not found in sheet "${actor.sheet}".` };
        }
        if (actor.idleAnim !== undefined && (typeof actor.idleAnim !== 'string' || !anims[actor.idleAnim])) {
            return { ok: false, reason: `Actor idleAnim "${actor.idleAnim}" not found in sheet "${actor.sheet}".` };
        }
        const count = Math.round(clamp(typeof actor.count === 'number' ? actor.count : 1, 1, 6));
        totalSpawns += count;
        let band: [number, number] | undefined;
        if (Array.isArray(actor.band) && actor.band.length === 2
            && typeof actor.band[0] === 'number' && typeof actor.band[1] === 'number') {
            band = [clamp(actor.band[0], 0, 1), clamp(actor.band[1], 0, 1)];
        }
        actors.push({
            behavior: actor.behavior as AmbienceActorBehavior,
            sheet: actor.sheet,
            anim: actor.anim,
            altAnim: actor.altAnim as string | undefined,
            idleAnim: actor.idleAnim as string | undefined,
            count,
            band,
            speed: clamp(typeof actor.speed === 'number' ? actor.speed : 1, 0.2, 3),
            x: typeof actor.x === 'number' ? clamp(actor.x, 0, 1) : undefined,
            y: typeof actor.y === 'number' ? clamp(actor.y, 0, 1) : undefined,
            boltColor: typeof actor.boltColor === 'string' && HEX_PATTERN.test(actor.boltColor) ? actor.boltColor : undefined,
        });
    }
    if (totalSpawns > 20) return { ok: false, reason: 'sprites supports at most 20 spawned actors in total.' };

    let wordFlock: AmbienceWordFlock | undefined;
    if (data.wordFlock !== undefined) {
        const flock = data.wordFlock as Record<string, unknown>;
        const wordPattern = /^[A-Za-z !?]{1,10}$/;
        if (!flock || typeof flock !== 'object'
            || typeof flock.sheet !== 'string' || !sheets[flock.sheet]
            || typeof flock.anim !== 'string' || !sheets[flock.sheet].animations[flock.anim]
            || typeof flock.idleAnim !== 'string' || !sheets[flock.sheet].animations[flock.idleAnim]
            || !Array.isArray(flock.words) || flock.words.length === 0 || flock.words.length > 24
            || !flock.words.every((word) => typeof word === 'string' && wordPattern.test(word))) {
            return { ok: false, reason: 'wordFlock needs a valid sheet/anim/idleAnim and 1-24 words (letters/!/?, max 10 chars).' };
        }
        wordFlock = {
            sheet: flock.sheet,
            anim: flock.anim,
            idleAnim: flock.idleAnim,
            words: flock.words as string[],
            y: typeof flock.y === 'number' ? clamp(flock.y, 0.1, 0.9) : 0.55,
            periodSeconds: clamp(typeof flock.periodSeconds === 'number' ? flock.periodSeconds : 30, 10, 120),
        };
    }

    return {
        ok: true,
        config: {
            scale: Math.round(clamp(typeof data.scale === 'number' ? data.scale : 3, 1, 6)),
            background,
            sheets,
            actors,
            wordFlock,
        },
    };
};

/** Validate a parsed ambience.json. Unknown keys ignored; numeric options clamped to safe ranges. */
export const validateAmbienceManifest = (raw: unknown): AmbienceValidation => {
    if (!raw || typeof raw !== 'object') {
        return { ok: false, reason: 'ambience.json is not a JSON object.' };
    }
    const data = raw as Record<string, unknown>;

    if (typeof data.schemaVersion !== 'number' || !Number.isInteger(data.schemaVersion)) {
        return { ok: false, reason: 'ambience.json is missing an integer "schemaVersion".' };
    }
    if (data.schemaVersion > AMBIENCE_SCHEMA_VERSION) {
        return { ok: false, reason: `Pack requires schema version ${data.schemaVersion}; this app supports up to ${AMBIENCE_SCHEMA_VERSION}.` };
    }
    if (typeof data.id !== 'string' || !AMBIENCE_ID_PATTERN.test(data.id)) {
        return { ok: false, reason: 'Pack "id" must be 2-50 chars of lowercase letters, digits, and hyphens.' };
    }
    if (data.id === DEFAULT_AMBIENCE_ID) {
        return { ok: false, reason: 'Pack id "none" is reserved.' };
    }
    if (typeof data.name !== 'string' || data.name.trim().length === 0 || data.name.length > 80) {
        return { ok: false, reason: 'Pack "name" is required (max 80 characters).' };
    }
    if (typeof data.effect !== 'string' || !/^[a-z][a-z0-9-]{1,31}$/.test(data.effect)) {
        return { ok: false, reason: 'Pack "effect" must be a short lowercase name (e.g. "aurora").' };
    }
    if (data.preview !== undefined && (typeof data.preview !== 'string' || !isRelativePackPath(data.preview))) {
        return { ok: false, reason: 'Pack "preview" must be a relative path inside the pack.' };
    }

    const rawOptions = (data.options && typeof data.options === 'object' ? data.options : {}) as Record<string, unknown>;
    const rawColors = Array.isArray(rawOptions.colors) ? rawOptions.colors : [];
    const colors = rawColors.filter((color): color is string => typeof color === 'string' && HEX_COLOR_PATTERN.test(color)).slice(0, 4);
    if (colors.length === 0) {
        return { ok: false, reason: 'Pack "options.colors" needs at least one #rrggbb color.' };
    }
    const options: AmbienceOptions = {
        colors,
        opacity: clamp(typeof rawOptions.opacity === 'number' ? rawOptions.opacity : 0.2, 0.05, 0.5),
        density: clamp(typeof rawOptions.density === 'number' ? rawOptions.density : 1, 0.2, 2),
        speed: clamp(typeof rawOptions.speed === 'number' ? rawOptions.speed : 1, 0.2, 2),
        mouseReact: rawOptions.mouseReact === true,
    };

    let images: string[] | undefined;
    if (data.images !== undefined) {
        if (!Array.isArray(data.images) || data.images.length > 16) {
            return { ok: false, reason: 'Pack "images" must be an array of at most 16 entries.' };
        }
        images = [];
        for (const entry of data.images) {
            if (typeof entry !== 'string' || !isRelativePackPath(entry)) {
                return { ok: false, reason: 'Each image entry must be a relative path inside the pack.' };
            }
            images.push(entry);
        }
    }
    if (data.effect === 'floating-images' && (!images || images.length === 0)) {
        return { ok: false, reason: 'The "floating-images" effect requires at least one image.' };
    }

    let sprites: AmbienceSpriteConfig | undefined;
    if (data.sprites !== undefined) {
        const spritesValidation = validateAmbienceSprites(data.sprites, isRelativePackPath);
        if (!spritesValidation.ok) return { ok: false, reason: spritesValidation.reason };
        sprites = spritesValidation.config;
    }
    if (data.effect === 'sprite-scape' && !sprites) {
        return { ok: false, reason: 'The "sprite-scape" effect requires a "sprites" config.' };
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
            effect: data.effect as AmbienceEffect,
            preview: data.preview as string | undefined,
            options,
            images,
            sprites,
        },
    };
};

/** File extensions an ambience pack may contain — images, the manifest, and the effect module. */
export const AMBIENCE_ALLOWED_EXTENSIONS = new Set(['.json', '.svg', '.png', '.webp', '.mjs']);
