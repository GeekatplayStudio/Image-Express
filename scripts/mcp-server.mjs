#!/usr/bin/env node
/**
 * Image Express MCP server — exposes the app's local HTTP API as Model
 * Context Protocol tools so MCP clients (Claude Desktop, Claude Code, etc.)
 * can drive the app: browse designs/templates/assets, install theme and
 * ambience packs, queue AI image generation, and check app status.
 *
 * Transport: stdio. The app itself must be running (dev or desktop) — this
 * server is a thin bridge, it does not start the app.
 *
 * Usage:
 *   node scripts/mcp-server.mjs                  # assumes http://localhost:3457
 *   IMAGE_EXPRESS_URL=http://localhost:3927 node scripts/mcp-server.mjs
 *
 * Claude Code:    claude mcp add image-express -- node scripts/mcp-server.mjs
 * Claude Desktop: see docs/MCP.md
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const BASE_URL = (process.env.IMAGE_EXPRESS_URL || 'http://localhost:3457').replace(/\/$/, '');

/**
 * Destructive tools are only offered when the user opts in.
 *
 * A model that can silently delete designs or install a pack from a URL is a
 * different risk from one that can list them. MCP clients do prompt for tool
 * calls, but the safer default is for the capability not to be there at all.
 */
const ALLOW_DESTRUCTIVE = /^(1|true|yes)$/i.test(process.env.IMAGE_EXPRESS_MCP_ALLOW_DESTRUCTIVE || '');

/**
 * Shared secret written by the app into its data directory.
 *
 * Without it the bridge called the API as an anonymous stranger, which the
 * server cannot tell apart from a web page in the user's browser reaching
 * localhost. Reading it proves this process can already read the app's data
 * directory, which is the same trust boundary the app itself has.
 */
function readLocalApiToken() {
    const explicit = process.env.IMAGE_EXPRESS_API_TOKEN?.trim();
    if (explicit) return explicit;

    const candidates = [];
    if (process.env.IMAGE_EXPRESS_DATA_DIR) {
        candidates.push(path.join(process.env.IMAGE_EXPRESS_DATA_DIR, 'local-api-token'));
    }
    if (process.env.APPDATA) {
        candidates.push(path.join(process.env.APPDATA, 'Image Express', 'data', 'local-api-token'));
    }
    if (process.env.HOME) {
        candidates.push(path.join(process.env.HOME, 'Library', 'Application Support', 'Image Express', 'data', 'local-api-token'));
        candidates.push(path.join(process.env.HOME, '.config', 'Image Express', 'data', 'local-api-token'));
    }
    candidates.push(path.join(process.cwd(), 'data', 'local-api-token'));

    for (const candidate of candidates) {
        try {
            const token = readFileSync(candidate, 'utf8').trim();
            if (token.length >= 32) return token;
        } catch {
            // Try the next location.
        }
    }
    return '';
}

const API_TOKEN = readLocalApiToken();

/** Call the app's HTTP API; returns parsed JSON or throws with a useful message. */
const api = async (path, init = {}) => {
    let response;
    try {
        response = await fetch(`${BASE_URL}${path}`, {
            ...init,
            headers: {
                'content-type': 'application/json',
                // Identifies this as an authorised local tool rather than a web
                // page that happened to reach localhost.
                ...(API_TOKEN ? { authorization: `Bearer ${API_TOKEN}` } : {}),
                ...(init.headers || {}),
            },
            signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
        });
    } catch (error) {
        throw new Error(
            `Could not reach Image Express at ${BASE_URL} (${error.message}). ` +
            'Is the app running? Set IMAGE_EXPRESS_URL if it runs on another port.'
        );
    }
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
    if (!response.ok) {
        if (response.status === 403 && !API_TOKEN) {
            throw new Error(
                'Image Express refused this request because no local API token was found. ' +
                'Start the app once to create it, or set IMAGE_EXPRESS_API_TOKEN.'
            );
        }
        throw new Error(`API ${path} returned ${response.status}: ${data?.error || text.slice(0, 300)}`);
    }
    return data;
};

/** Last path segment of a URL, so an import without a name still gets one. */
const deriveFilename = (url) => {
    try {
        const last = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
        return last || 'imported-asset';
    } catch {
        return 'imported-asset';
    }
};

/**
 * Standard MCP annotations. Clients use these to decide when to ask the user
 * before running a tool, so a wrong hint here has real consequences.
 */
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITES = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
/** Reaches out to an address the caller supplies. */
const FETCHES_REMOTE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

/** Wrap a tool handler: returns MCP text content, converts errors to isError results. */
const handler = (fn) => async (args) => {
    try {
        const result = await fn(args ?? {});
        return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] };
    } catch (error) {
        return { isError: true, content: [{ type: 'text', text: String(error.message || error) }] };
    }
};

const server = new McpServer({ name: 'image-express', version: '1.0.0' });

/**
 * Register a tool unless it is destructive and the user has not opted in.
 *
 * Not registering is stronger than describing the risk in the tool text: a
 * capability that is absent cannot be invoked by a confused model, a prompt
 * injection in a web page the model read, or a mis-click on an approval dialog.
 */
const registerTool = (name, spec, run) => {
    const destructive = spec.annotations?.destructiveHint === true;
    if (destructive && !ALLOW_DESTRUCTIVE) return;
    server.registerTool(name, spec, run);
};

// ---- status ---------------------------------------------------------------
registerTool('app_status', {
    title: 'App status',
    annotations: READ_ONLY,
    description: 'Check that Image Express is running and reachable, and report the base URL plus library counts (designs, templates, themes, ambience packs).',
    inputSchema: {},
}, handler(async () => {
    const [designs, templates, themes, ambience] = await Promise.all([
        api('/api/designs/list'), api('/api/templates/list'), api('/api/themes'), api('/api/ambience'),
    ]);
    return {
        running: true,
        baseUrl: BASE_URL,
        designs: (designs.designs || []).length,
        templates: (templates.templates || []).length,
        themes: (themes.themes || themes || []).length,
        ambiencePacks: (ambience.packs || ambience.ambience || ambience || []).length,
    };
}));

// ---- designs --------------------------------------------------------------
registerTool('list_designs', {
    title: 'List designs',
    annotations: READ_ONLY,
    description: 'List the user\'s saved designs with id, name, thumbnail URL, and last-modified time.',
    inputSchema: {},
}, handler(async () => (await api('/api/designs/list')).designs || []));

registerTool('rename_design', {
    title: 'Rename a design',
    annotations: WRITES,
    description: 'Rename a saved design by id.',
    inputSchema: {
        id: z.string().describe('Design id from list_designs'),
        name: z.string().min(1).describe('New display name'),
    },
}, handler(async ({ id, name }) => api('/api/designs/rename', {
    method: 'POST', body: JSON.stringify({ id, name }),
})));

registerTool('delete_design', {
    title: 'Delete a design',
    annotations: DESTRUCTIVE,
    description: 'Permanently delete a saved design by id. Irreversible — confirm with the user before calling.',
    inputSchema: { id: z.string().describe('Design id from list_designs') },
}, handler(async ({ id }) => api('/api/designs/delete', {
    method: 'POST', body: JSON.stringify({ id }),
})));

// ---- templates ------------------------------------------------------------
registerTool('list_templates', {
    title: 'List templates',
    annotations: READ_ONLY,
    description: 'List saved design templates with id, name, and thumbnail.',
    inputSchema: {},
}, handler(async () => (await api('/api/templates/list')).templates || []));

// ---- assets ---------------------------------------------------------------
registerTool('list_assets', {
    title: 'List assets',
    annotations: READ_ONLY,
    description: 'List uploaded media assets (images etc.) in the user\'s library.',
    inputSchema: {},
}, handler(async () => {
    const data = await api('/api/assets/list');
    return data.assets || data.files || data;
}));

registerTool('import_asset_from_url', {
    title: 'Import an asset from a URL',
    annotations: FETCHES_REMOTE,
    description: 'Download an image from an http(s) URL into the asset library so it can be used in designs.',
    inputSchema: {
        url: z.string().url().describe('Direct http(s) URL of the image to import'),
        name: z.string().optional().describe('Optional file name to store it under'),
    },
}, handler(async ({ url, name }) => api('/api/assets/save-url', {
    // The route requires `filename`, not `name` — sending `name` made this tool
    // fail with "Missing url or filename" every single time it was called.
    method: 'POST',
    body: JSON.stringify({ url, filename: name || deriveFilename(url) }),
    timeoutMs: 60_000,
})));

// ---- themes & ambience ----------------------------------------------------
registerTool('list_themes', {
    title: 'List UI themes',
    annotations: READ_ONLY,
    description: 'List installed interface theme packs (id, name, description, whether animated via spriteTheater).',
    inputSchema: {},
}, handler(async () => {
    const data = await api('/api/themes');
    const themes = data.themes || data;
    return (Array.isArray(themes) ? themes : []).map((t) => ({
        id: t.id, name: t.name, description: t.description,
        author: t.author, version: t.version, source: t.source,
        animated: Boolean(t.spriteTheater),
    }));
}));

registerTool('install_theme_from_url', {
    title: 'Install a theme pack',
    annotations: FETCHES_REMOTE,
    description: 'Download and install a theme pack zip from an http(s) URL. Note: theme packs contain code (scene modules) that will run in the app — only install packs from sources the user trusts.',
    inputSchema: {
        url: z.string().url().describe('Direct http(s) URL of the theme pack .zip'),
        overwrite: z.boolean().optional().describe('Replace an already-installed theme with the same id'),
    },
}, handler(async ({ url, overwrite }) => api('/api/themes/install', {
    method: 'POST', body: JSON.stringify({ url, overwrite }), timeoutMs: 60_000,
})));

registerTool('list_ambience_packs', {
    title: 'List ambience packs',
    annotations: READ_ONLY,
    description: 'List installed dashboard ambience packs (background effects for the hub).',
    inputSchema: {},
}, handler(async () => {
    const data = await api('/api/ambience');
    const packs = data.packs || data.ambience || data;
    return (Array.isArray(packs) ? packs : []).map((p) => ({
        id: p.id, name: p.name, description: p.description, effect: p.effect, version: p.version,
    }));
}));

registerTool('install_ambience_from_url', {
    title: 'Install an ambience pack',
    annotations: FETCHES_REMOTE,
    description: 'Download and install a dashboard ambience pack zip from an http(s) URL. Packs contain an effect module that will run in the app — only install from trusted sources.',
    inputSchema: {
        url: z.string().url().describe('Direct http(s) URL of the ambience pack .zip'),
        overwrite: z.boolean().optional(),
    },
}, handler(async ({ url, overwrite }) => api('/api/ambience/install', {
    method: 'POST', body: JSON.stringify({ url, overwrite }), timeoutMs: 60_000,
})));

// ---- AI generation & Brand / Super Agent tools ----------------------------
registerTool('generate_image', {
    title: 'Generate an image (AI)',
    annotations: WRITES,
    description: 'Queue an AI image generation job in Image Express using the configured provider (e.g. local ComfyUI). Returns a job/prompt id; generation is asynchronous.',
    inputSchema: {
        prompt: z.string().min(1).describe('Text prompt describing the image'),
        provider: z.string().optional().describe('Provider id, e.g. "comfy" (default: app-configured provider)'),
    },
}, handler(async ({ prompt, provider }) => api('/api/ai/generate-image', {
    method: 'POST', body: JSON.stringify({ prompt, provider: provider || 'comfy' }), timeoutMs: 60_000,
})));

registerTool('get_brand_profile', {
    title: 'Get active brand profile',
    annotations: READ_ONLY,
    description: 'Fetch the active Brand Kit profile guidelines including palette, fonts, and logo layout rules.',
    inputSchema: {},
}, handler(async () => api('/api/ai/brand-manager/profile')));

registerTool('save_brand_profile', {
    title: 'Save brand profile',
    annotations: WRITES,
    description: 'Create or update a Brand Kit profile (palette, fonts, logo and layout rules). Pass the full profile object; it becomes the active profile.',
    inputSchema: {
        profile: z.object({
            id: z.string().min(1),
            name: z.string().min(1),
        }).passthrough().describe('BrandProfile object (id, name, palette, typography, logo, layout, assets)'),
    },
}, handler(async ({ profile }) => api('/api/ai/brand-manager/profile', {
    method: 'POST', body: JSON.stringify({ profile }),
})));

registerTool('set_active_brand_profile', {
    title: 'Set active brand profile',
    annotations: WRITES,
    description: 'Switch which saved Brand Kit profile is active for audits and Super Agent tasks.',
    inputSchema: {
        profileId: z.string().min(1).describe('Id of the profile to activate'),
    },
}, handler(async ({ profileId }) => api('/api/ai/brand-manager/profile', {
    method: 'POST', body: JSON.stringify({ activeProfileId: profileId }),
})));

registerTool('delete_brand_profile', {
    title: 'Delete brand profile',
    annotations: DESTRUCTIVE,
    description: 'Delete a saved Brand Kit profile by id. The default kit is restored if the last profile is removed.',
    inputSchema: {
        profileId: z.string().min(1).describe('Id of the profile to delete'),
    },
}, handler(async ({ profileId }) => api(`/api/ai/brand-manager/profile?id=${encodeURIComponent(profileId)}`, {
    method: 'DELETE',
})));

registerTool('delete_super_agent', {
    title: 'Delete custom sub-agent',
    annotations: DESTRUCTIVE,
    description: 'Delete a registered Super Agent / sub-agent definition by id.',
    inputSchema: {
        agentId: z.string().min(1).describe('Id of the agent to delete'),
    },
}, handler(async ({ agentId }) => api(`/api/ai/super-agent/agents?id=${encodeURIComponent(agentId)}`, {
    method: 'DELETE',
})));

registerTool('audit_brand_compliance', {
    title: 'Audit canvas for brand compliance',
    annotations: WRITES,
    description: 'Run a VLM or heuristic brand compliance check on the active canvas against current brand guidelines.',
    inputSchema: {
        imageDataUrl: z.string().optional().describe('Base64 image data URL of canvas (optional)'),
    },
}, handler(async ({ imageDataUrl }) => api('/api/ai/brand-manager/audit', {
    method: 'POST', body: JSON.stringify({ imageDataUrl }), timeoutMs: 45_000,
})));

registerTool('list_super_agents', {
    title: 'List Super Agents',
    annotations: READ_ONLY,
    description: 'List available autonomous Super Agents and custom sub-agent definitions.',
    inputSchema: {},
}, handler(async () => api('/api/ai/super-agent/agents')));

registerTool('create_super_agent', {
    title: 'Create custom sub-agent',
    annotations: WRITES,
    description: 'Register a new specialized sub-agent with custom dimensions, role, and prompt instructions.',
    inputSchema: {
        name: z.string().min(1).describe('Name of the agent'),
        description: z.string().optional().describe('Agent role and capabilities'),
        defaultWidth: z.number().optional().describe('Default target canvas width'),
        defaultHeight: z.number().optional().describe('Default target canvas height'),
    },
}, handler(async (agent) => api('/api/ai/super-agent/agents', {
    method: 'POST', body: JSON.stringify({ agent }),
})));

registerTool('execute_super_agent_task', {
    title: 'Execute Super Agent task plan',
    annotations: WRITES,
    description: 'Generates a multi-step design plan and step execution sequence for a natural language prompt.',
    inputSchema: {
        prompt: z.string().min(1).describe('High-level design prompt'),
    },
}, handler(async ({ prompt }) => api('/api/ai/super-agent/plan', {
    method: 'POST', body: JSON.stringify({ prompt }), timeoutMs: 60_000,
})));

// ---------------------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[image-express-mcp] ready — bridging ${BASE_URL}`);
