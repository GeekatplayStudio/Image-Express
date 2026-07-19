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

const BASE_URL = (process.env.IMAGE_EXPRESS_URL || 'http://localhost:3457').replace(/\/$/, '');

/** Call the app's HTTP API; returns parsed JSON or throws with a useful message. */
const api = async (path, init = {}) => {
    let response;
    try {
        response = await fetch(`${BASE_URL}${path}`, {
            ...init,
            headers: { 'content-type': 'application/json', ...(init.headers || {}) },
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
        throw new Error(`API ${path} returned ${response.status}: ${data?.error || text.slice(0, 300)}`);
    }
    return data;
};

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

// ---- status ---------------------------------------------------------------
server.registerTool('app_status', {
    title: 'App status',
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
server.registerTool('list_designs', {
    title: 'List designs',
    description: 'List the user\'s saved designs with id, name, thumbnail URL, and last-modified time.',
    inputSchema: {},
}, handler(async () => (await api('/api/designs/list')).designs || []));

server.registerTool('rename_design', {
    title: 'Rename a design',
    description: 'Rename a saved design by id.',
    inputSchema: {
        id: z.string().describe('Design id from list_designs'),
        name: z.string().min(1).describe('New display name'),
    },
}, handler(async ({ id, name }) => api('/api/designs/rename', {
    method: 'POST', body: JSON.stringify({ id, name }),
})));

server.registerTool('delete_design', {
    title: 'Delete a design',
    description: 'Permanently delete a saved design by id. Irreversible — confirm with the user before calling.',
    inputSchema: { id: z.string().describe('Design id from list_designs') },
}, handler(async ({ id }) => api('/api/designs/delete', {
    method: 'POST', body: JSON.stringify({ id }),
})));

// ---- templates ------------------------------------------------------------
server.registerTool('list_templates', {
    title: 'List templates',
    description: 'List saved design templates with id, name, and thumbnail.',
    inputSchema: {},
}, handler(async () => (await api('/api/templates/list')).templates || []));

// ---- assets ---------------------------------------------------------------
server.registerTool('list_assets', {
    title: 'List assets',
    description: 'List uploaded media assets (images etc.) in the user\'s library.',
    inputSchema: {},
}, handler(async () => {
    const data = await api('/api/assets/list');
    return data.assets || data.files || data;
}));

server.registerTool('import_asset_from_url', {
    title: 'Import an asset from a URL',
    description: 'Download an image from an http(s) URL into the asset library so it can be used in designs.',
    inputSchema: {
        url: z.string().url().describe('Direct http(s) URL of the image to import'),
        name: z.string().optional().describe('Optional file name to store it under'),
    },
}, handler(async ({ url, name }) => api('/api/assets/save-url', {
    method: 'POST', body: JSON.stringify({ url, name }), timeoutMs: 60_000,
})));

// ---- themes & ambience ----------------------------------------------------
server.registerTool('list_themes', {
    title: 'List UI themes',
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

server.registerTool('install_theme_from_url', {
    title: 'Install a theme pack',
    description: 'Download and install a theme pack zip from an http(s) URL. Note: theme packs contain code (scene modules) that will run in the app — only install packs from sources the user trusts.',
    inputSchema: {
        url: z.string().url().describe('Direct http(s) URL of the theme pack .zip'),
        overwrite: z.boolean().optional().describe('Replace an already-installed theme with the same id'),
    },
}, handler(async ({ url, overwrite }) => api('/api/themes/install', {
    method: 'POST', body: JSON.stringify({ url, overwrite }), timeoutMs: 60_000,
})));

server.registerTool('list_ambience_packs', {
    title: 'List ambience packs',
    description: 'List installed dashboard ambience packs (background effects for the hub).',
    inputSchema: {},
}, handler(async () => {
    const data = await api('/api/ambience');
    const packs = data.packs || data.ambience || data;
    return (Array.isArray(packs) ? packs : []).map((p) => ({
        id: p.id, name: p.name, description: p.description, effect: p.effect, version: p.version,
    }));
}));

server.registerTool('install_ambience_from_url', {
    title: 'Install an ambience pack',
    description: 'Download and install a dashboard ambience pack zip from an http(s) URL. Packs contain an effect module that will run in the app — only install from trusted sources.',
    inputSchema: {
        url: z.string().url().describe('Direct http(s) URL of the ambience pack .zip'),
        overwrite: z.boolean().optional(),
    },
}, handler(async ({ url, overwrite }) => api('/api/ambience/install', {
    method: 'POST', body: JSON.stringify({ url, overwrite }), timeoutMs: 60_000,
})));

// ---- AI generation --------------------------------------------------------
server.registerTool('generate_image', {
    title: 'Generate an image (AI)',
    description: 'Queue an AI image generation job in Image Express using the configured provider (e.g. local ComfyUI). Returns a job/prompt id; generation is asynchronous.',
    inputSchema: {
        prompt: z.string().min(1).describe('Text prompt describing the image'),
        provider: z.string().optional().describe('Provider id, e.g. "comfy" (default: app-configured provider)'),
    },
}, handler(async ({ prompt, provider }) => api('/api/ai/generate-image', {
    method: 'POST', body: JSON.stringify({ prompt, provider: provider || 'comfy' }), timeoutMs: 60_000,
})));

// ---------------------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[image-express-mcp] ready — bridging ${BASE_URL}`);
