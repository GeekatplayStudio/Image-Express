/**
 * The technology reference shown in Help → Technology.
 *
 * Written to be *shown to someone else*: each entry says what the thing does
 * here and why it was chosen, including the alternatives that were rejected.
 * An entry that cannot answer "why this one" does not earn a line.
 *
 * `package` is cross-checked against package.json by a test, so a dependency
 * that is upgraded or removed makes this file fail rather than quietly start
 * lying. Entries with no `package` are platform pieces (node:sqlite), external
 * services (Ollama, ComfyUI) or things we built ourselves — nothing to pin.
 *
 * English only, deliberately. Library names and architectural rationale are not
 * translated in this codebase's other technical docs either, and pushing ~120
 * prose strings through eleven locale files would produce eleven stale copies.
 */

export type TechEntry = {
    name: string;
    /** npm package name, when this is a dependency. Verified by test. */
    package?: string;
    /** Major version as shipped. Verified against package.json by test. */
    version?: string;
    /** What it actually does in this app. */
    role: string;
    /** Why this one — ideally naming what was rejected. */
    why: string;
};

export type TechGroup = {
    id: string;
    title: string;
    /** One line on what this layer is for. */
    summary: string;
    entries: TechEntry[];
};

export const TECHNOLOGY_GROUPS: TechGroup[] = [
    {
        id: 'foundation',
        title: 'Foundation',
        summary: 'The runtime everything else sits on — one codebase that runs as a website and as a desktop app.',
        entries: [
            {
                name: 'Next.js (App Router)',
                package: 'next',
                version: '16',
                role: 'Serves the UI and every server route under /api. Server-side code (file access, API keys, the job queue) runs in the same process as the app.',
                why: 'One framework for UI and backend means the desktop build is the same code as the web build, with no separate server to install or keep in sync.',
            },
            {
                name: 'React',
                package: 'react',
                version: '19',
                role: 'The whole interface. State that derives from changing inputs is adjusted during render rather than corrected afterwards in effects.',
                why: 'The effect-based version rendered the wrong value first and then re-rendered — visible as flicker when switching album views. Deriving it means the wrong state never renders.',
            },
            {
                name: 'TypeScript',
                package: 'typescript',
                version: '5',
                role: 'Strict mode across the codebase, including the contracts shared between client and server.',
                why: 'The client and server agree on shapes by construction. A renamed field is a compile error, not a blank panel at runtime.',
            },
            {
                name: 'Tailwind CSS',
                package: 'tailwindcss',
                version: '4',
                role: 'All styling. Themes are CSS custom properties, so light/dark and theme packs swap without a rebuild.',
                why: 'No stylesheet to keep in sync with components, and dead styles disappear with the markup that used them.',
            },
            {
                name: 'Electron',
                package: 'electron',
                version: '41',
                role: 'The desktop shell: native file dialogs, whole-drive indexing, logs and user-data folders, auto-update.',
                why: 'Browsers cannot return real filesystem paths. Indexing a drive in place — without copying files — needs a native shell.',
            },
            {
                name: 'Node.js',
                version: '≥ 24',
                role: 'The server runtime. Version 24 or newer is required.',
                why: 'node:sqlite ships with Node from 22 onward, which is what lets the catalog and vector store avoid a native module entirely.',
            },
        ],
    },
    {
        id: 'canvas',
        title: 'Canvas & document model',
        summary: 'The editor itself — layers, selection, text, and every file format that goes in or out.',
        entries: [
            {
                name: 'Fabric.js',
                package: 'fabric',
                version: '7',
                role: 'The canvas engine: layers, transforms, selection, grouping, and the object model documents are saved from.',
                why: 'A retained-mode object model, so a layer stays an editable object rather than pixels. Raw canvas would mean rebuilding hit-testing, transforms and serialisation.',
            },
            {
                name: 'Tiptap',
                package: '@tiptap/react',
                version: '3',
                role: 'Rich text editing inside text layers.',
                why: 'Built on ProseMirror, so text structure is a real document model — formatting survives editing rather than being re-parsed from HTML.',
            },
            {
                name: 'ag-psd',
                package: 'ag-psd',
                version: '31',
                role: 'Reads and writes Photoshop .psd files with layers intact.',
                why: 'The only maintained JavaScript library that round-trips layered PSD. Flattening on import would make the format useless for real work.',
            },
            {
                name: 'opentype.js',
                package: 'opentype.js',
                version: '1',
                role: 'Parses font files to convert text into editable vector outlines.',
                why: 'Converting text to paths needs the real glyph outlines, which the browser will not hand over.',
            },
            {
                name: 'pdf.js / jsPDF',
                package: 'pdfjs-dist',
                version: '6',
                role: 'pdf.js reads PDFs into the canvas; jsPDF writes them on export.',
                why: 'Import and export are genuinely different problems; the best library for each differs, and pairing them beats one that does both adequately.',
            },
            {
                name: 'exifr',
                package: 'exifr',
                version: '7',
                role: 'Reads EXIF and embedded metadata — camera, date, GPS, and any generation prompt written into the file.',
                why: 'It is what lets the vault group by date and location, and lets an AI-generated image carry its own prompt.',
            },
            {
                name: 'heic-to · utif2',
                package: 'heic-to',
                version: '1',
                role: 'Decode HEIC (iPhone photos) and TIFF, neither of which browsers display natively.',
                why: 'Without these, a folder of iPhone photos indexes as unreadable files.',
            },
            {
                name: 'JSZip',
                package: 'jszip',
                version: '3',
                role: 'Portable library bundles and multi-file exports.',
                why: 'Export a whole library as one file and re-import it on another machine.',
            },
            {
                name: 'dnd-kit',
                package: '@dnd-kit/core',
                version: '6',
                role: 'Drag-and-drop for layer reordering and panel arrangement.',
                why: 'Keyboard-accessible and pointer-agnostic, which HTML5 drag-and-drop is not.',
            },
        ],
    },
    {
        id: 'three-d',
        title: '3D',
        summary: 'Model viewing, lighting and rendering models into layers.',
        entries: [
            {
                name: 'three.js',
                package: 'three',
                version: '0.182',
                role: 'The 3D renderer: model loading, lighting, shadows, materials.',
                why: 'The de-facto WebGL engine. Everything below builds on it rather than replacing it.',
            },
            {
                name: 'React Three Fiber',
                package: '@react-three/fiber',
                version: '9',
                role: 'Drives three.js from React, so the 3D scene is described the same way as the rest of the UI.',
                why: 'Lighting controls become ordinary React state instead of manual scene-graph bookkeeping.',
            },
            {
                name: 'drei',
                package: '@react-three/drei',
                version: '10',
                role: 'Ready-made camera controls, environments, shadows and the GLTF loader.',
                why: 'These are solved problems; hand-rolling orbit controls and IBL environments earns nothing.',
            },
        ],
    },
    {
        id: 'ai',
        title: 'AI & generation',
        summary: 'Local models where possible, external providers where necessary — and never a key in the browser.',
        entries: [
            {
                name: 'Ollama (local)',
                role: 'Runs local models for text embeddings (semantic search), vision captioning, search-query expansion and Super Agent planning.',
                why: 'Local means private and free. Nothing about the vault leaves the machine, and search keeps working with no account and no network.',
            },
            {
                name: 'Transformers.js',
                package: '@huggingface/transformers',
                version: '3',
                role: 'Runs CLIP and depth-estimation models directly in the browser via WebGPU/WASM.',
                why: 'Depth maps for 3D layers and image embeddings need no server round trip and no install.',
            },
            {
                name: 'ComfyUI (optional)',
                role: 'Local generation workflows, driven through a bundled workflow library.',
                why: 'For users who already run ComfyUI, generation stays entirely on their own hardware.',
            },
            {
                name: 'External providers',
                role: 'Tripo, Meshy and Hitem3D for 3D generation; Stability, OpenAI and Google for images.',
                why: 'Each is genuinely better at something. Keys live in an encrypted server-side vault, are never sent to the browser, and every provider is reached through one adapter so adding another does not touch the UI.',
            },
            {
                name: 'Super Agent',
                role: 'Turns a brief into a finished layout. An LLM produces the plan; a deterministic executor applies each step to the canvas.',
                why: 'Splitting planning from execution is the point. The model is only allowed to choose *what* to do from a fixed vocabulary of steps — it never runs arbitrary code — and if no model is available a rule-based planner still produces a usable layout.',
            },
        ],
    },
    {
        id: 'vault',
        title: 'Asset vault & vector search',
        summary: 'Indexes hundreds of thousands of files in place, and finds them by meaning rather than filename.',
        entries: [
            {
                name: 'node:sqlite',
                role: 'Stores the asset catalog and the embedding vectors. Ships with Node — no dependency, no native build.',
                why: 'better-sqlite3 was rejected: a native module needs rebuilding for every Electron major, and that recurring cost is exactly what hurts a desktop app. A JSON store was measured and abandoned — one 768-dimension vector serialises to ~15.6 KB, so the file hit V8’s 536 MB string limit at roughly 34,400 assets and silently stopped saving.',
            },
            {
                name: 'Vector index (built here)',
                role: 'Two-stage nearest-neighbour search. An int8-quantised copy of the matrix is scanned in memory, then the shortlist is rescored against exact float32 vectors read from disk.',
                why: 'int8 is a quarter the memory of float32 — 154 MB instead of 614 MB at 200k assets — and because only the shortlist is rescored, the scores and ordering returned are still exact. Measured 100% recall@40.',
            },
            {
                name: 'No ANN index — deliberately',
                role: 'No HNSW or IVF. A full scan at 200k vectors takes about 100 ms.',
                why: 'Below the point where an approximate index earns its build time, memory and recall risk. Worth revisiting past a million vectors, not before.',
            },
            {
                name: 'sharp',
                package: 'sharp',
                version: '0.35',
                role: 'Generates cached WebP grid thumbnails, in the background and on demand.',
                why: 'Added no new dependency — Next already ships it. The grid previously used full-size originals: 1.3–2.0 MB per tile against about 5 KB now.',
            },
        ],
    },
    {
        id: 'queue',
        title: 'The job queue ("Q")',
        summary: 'Every long-running task — generation, indexing, provider polling — runs here, server-side.',
        entries: [
            {
                name: 'Lanes',
                role: 'Independent concurrency limits: local GPU runs 1 at a time, local CPU 4, and each remote provider gets 3.',
                why: 'GPU work must serialise or it thrashes. One slow provider cannot starve the others, and background indexing runs at negative priority so anything you are waiting on goes first.',
            },
            {
                name: 'Server-side, not in the tab',
                role: 'Jobs are owned by the server and survive closing the tab or restarting the app.',
                why: 'Browser-side polling abandoned running jobs when the tab closed — and you had already paid for them. API keys also stop needing to live in the browser.',
            },
            {
                name: 'Leases & recovery',
                role: 'A running job holds a renewable lease. One whose lease expired when the process died is recovered as interrupted rather than left "running" forever.',
                why: 'A crash should not leave a job that lies about its state.',
            },
            {
                name: 'Server-Sent Events',
                role: 'Progress is pushed to the UI over one connection, opening with a full snapshot.',
                why: 'Polling every job would be constant traffic for mostly no change. The opening snapshot means nothing is missed across a reconnect.',
            },
            {
                name: 'Cooperative stop',
                role: 'Stopping a running job sets a flag it checks between batches, then finishes as cancelled.',
                why: 'Killing mid-write would corrupt state. A job that never checks the flag completes normally — reporting finished work as cancelled would be its own lie.',
            },
        ],
    },
    {
        id: 'api',
        title: 'API layer & security',
        summary: 'Every route goes through the same contract: validate, authorise, respond in one shape.',
        entries: [
            {
                name: 'Zod',
                package: 'zod',
                version: '4',
                role: 'Validates every request body against a schema before a route touches it, with body-size limits.',
                why: 'A route that parses raw JSON trusts whatever arrives. Validating at the boundary means handlers work with known-good data.',
            },
            {
                name: 'One API contract',
                role: 'Shared helpers give every route the same JSON error shape, a request id, and consistent status codes.',
                why: 'The client handles one error format instead of a different guess per endpoint, and a request id ties a UI error to a server log line.',
            },
            {
                name: 'Outbound URL policy (SSRF)',
                role: 'Any URL the server is asked to fetch is checked first. Link-local addresses are refused everywhere; loopback and private ranges are allowed locally but refused when self-hosted.',
                why: 'Without it, "save this image from a URL" turns the server into a probe for the network it sits on. Cloud metadata endpoints are the classic target.',
            },
            {
                name: 'Filesystem policy',
                role: 'Serving an indexed file requires two independent checks: the path passes the runtime access policy, and it sits inside a folder you actually registered.',
                why: 'Passing one gate is not enough. Either alone would expose the whole filesystem to anything that can reach the port.',
            },
            {
                name: 'Local API token & CSRF',
                role: 'A token in the data directory authenticates local tools, compared in constant time. Bodyless POSTs additionally check the request is not cross-site.',
                why: 'A form on any website can POST to localhost. Origin checks stop another page driving your local app.',
            },
            {
                name: 'Encrypted key vault',
                role: 'Provider API keys are encrypted on disk and only ever used server-side.',
                why: 'A key in localStorage is readable by any script on the page and rides along on every request.',
            },
        ],
    },
    {
        id: 'mcp',
        title: 'MCP (Model Context Protocol)',
        summary: 'Lets an AI assistant drive the app directly — generate, index, search, organise.',
        entries: [
            {
                name: 'MCP SDK',
                package: '@modelcontextprotocol/sdk',
                version: '1',
                role: 'Exposes the app as an MCP server over stdio, with 23 tools covering assets, generation, the vault and the job queue.',
                why: 'The open standard for tool-calling assistants. Speaking it means any MCP-capable client works, rather than one bespoke integration.',
            },
            {
                name: 'Token-authenticated bridge',
                role: 'The MCP server authenticates to the app with the local API token; it does not get its own privileged access.',
                why: 'The bridge is subject to the same authorisation as everything else, so it cannot become a way around it.',
            },
            {
                name: 'Destructive tools are opt-in',
                role: 'Tools that delete or overwrite decline unless explicitly enabled by an environment variable.',
                why: 'An assistant should not be one misunderstood instruction away from deleting your library.',
            },
        ],
    },
    {
        id: 'quality',
        title: 'Quality gates',
        summary: 'What has to pass before anything ships — all of it enforced, none of it advisory.',
        entries: [
            {
                name: 'Jest',
                package: 'jest',
                version: '30',
                role: 'Unit and integration tests across roughly 196 suites and 1,570 tests.',
                why: 'Tests describe why behaviour exists, not just that it works — several here exist because a specific regression reached a user.',
            },
            {
                name: 'Playwright',
                package: '@playwright/test',
                version: '1',
                role: 'End-to-end checks for the flows that must never silently break, such as export.',
                why: 'Export correctness cannot be proven with mocks; it needs a real browser producing a real file.',
            },
            {
                name: 'Ratchets',
                role: 'File size (500 lines) and translation coverage may only improve. A file over the limit may shrink but never grow.',
                why: 'A gate that is permanently red teaches everyone to ignore red gates. Ratcheting makes each change leave the codebase no worse.',
            },
            {
                name: 'Architecture & bundle budgets',
                role: 'Import boundaries between layers are enforced, and the JavaScript bundle has a hard size ceiling.',
                why: 'Layering violations and bundle growth are both invisible until they are expensive.',
            },
        ],
    },
];

/** Every entry, flattened — used for the search filter. */
export function allTechEntries(): Array<TechEntry & { groupId: string; groupTitle: string }> {
    return TECHNOLOGY_GROUPS.flatMap((group) => group.entries.map((entry) => ({
        ...entry,
        groupId: group.id,
        groupTitle: group.title,
    })));
}

/** Case-insensitive match across every field a reader would search by. */
export function matchesTechQuery(
    entry: TechEntry & { groupTitle: string },
    query: string,
): boolean {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [entry.name, entry.package, entry.role, entry.why, entry.groupTitle]
        .some((field) => field?.toLowerCase().includes(needle));
}
