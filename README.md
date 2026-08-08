<div align="center">

<img src="docs/screenshots/hero-banner.svg" alt="Image Express — the open-source AI design studio" width="100%" />

# Image Express

**The free, open-source design studio that fuses a professional 2D canvas, live 3D generation, and any AI provider — local or cloud — into one workspace. Skin the whole thing with downloadable animated theme packs.**

[![License: Open Source](https://img.shields.io/badge/license-open--source-2563eb)](#-license)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Docker%20%7C%20Web-6b7280)](#-install--run)
[![Languages](https://img.shields.io/badge/UI%20languages-11-16a34a)](#-11-languages-out-of-the-box)

**[Quick Install](#-install--run)** ·
**[Features](#-why-image-express)** ·
**[Screenshots](#-see-it-in-action)** ·
**[Themes](#-make-it-yours-animated-theme-packs)** ·
**[Support the Project](#-support-the-project)**

</div>

---

## What is Image Express?

Most design tools make you juggle three separate apps: a vector/raster editor for layout, a 3D viewer for product shots and models, and a web console for AI generation. **Image Express is all three in one.** Design a poster, generate a 3D model from text, pose it, bake a flat render straight onto your canvas, retouch it with a real healing brush, run it past a local AI critique, and export — without ever leaving the tab.

It runs anywhere: as a **desktop app** on Windows/macOS, as a **self-hosted web app** in Docker, or straight from **npm** on your own machine. Every AI feature works with **your own keys** (Stability, OpenAI, Gemini, Meshy, Tripo, Hitem3D) or **entirely offline** with local ComfyUI and Ollama — your prompts and images never have to touch our servers, because we don't have any.

---

## 🚀 Install & Run

No native `.exe`/`.dmg` installer is published yet — the installer below is the
real, working path today. It's still just "download one file, double-click
it, answer a couple of questions" — no experience with computers required,
and it installs everything else (Git, Node.js) for you.

### 🪟 Windows — step by step

1. **[Click here to open `install.bat`](https://github.com/GeekatplayStudio/Image-Express/blob/main/install.bat)**, then click the little **⬇ download icon** near the top-right of the code box to save it.
2. Open your **Downloads** folder and **double-click `install.bat`**.
3. If a blue **"Windows protected your PC"** screen appears, click **More info**, then **Run anyway**. *(This only means the file isn't sold through the Microsoft Store — Image Express is free, open-source software, so it doesn't have a paid publisher certificate. It is not a virus warning.)*
4. A black window opens and walks you through everything else. **Press Enter** at each question to accept the suggested answer. It installs Git and Node.js if you don't already have them, then downloads and sets up Image Express — this takes a few minutes.
5. When it finishes, answer **yes** to "Create a desktop shortcut?" and **yes** to "Launch now?" — Image Express opens in your web browser.
6. **Next time**, just double-click the **Image Express** shortcut on your desktop (or `start.bat` inside `C:\Users\<you>\ImageExpress`).

### 🍎 macOS — step by step

The easiest way uses **Terminal** and skips every "unidentified developer"
warning entirely — it's three steps:

1. Open **Terminal**: press <kbd>⌘ Cmd</kbd> + <kbd>Space</kbd>, type `Terminal`, press Return.
2. **Copy** the line below, **paste** it into the Terminal window (right-click → Paste, or <kbd>⌘ Cmd</kbd> + <kbd>V</kbd>), then press Return:
   ```bash
   bash <(curl -fsSL https://raw.githubusercontent.com/GeekatplayStudio/Image-Express/main/install.command)
   ```
3. It asks a few questions — **press Return** at each one to accept the suggested answer. It installs Git and Node.js if needed, then downloads and sets up Image Express (a few minutes). When it asks, answer **yes** to "Launch Image Express now?"
4. **Next time**, open **Finder → your home folder → ImageExpress**, and double-click **`start.command`**.

<details>
<summary><b>Downloaded the ZIP instead, and macOS says it "could not verify this app is free of malware"?</b></summary>
<br>

**Nothing is wrong with your download, and no virus was found.** macOS blocks
*every* downloaded program whose author hasn't paid Apple $99/year for a
Developer ID certificate. Image Express is free and open source, so it doesn't
have one — and macOS shows the same wording for "unrecognised publisher" as it
does for real malware. The whole installer is readable
[here](https://github.com/GeekatplayStudio/Image-Express/blob/main/install.command)
before you run it. The same note ships inside the ZIP as
`macOS-READ-ME-FIRST.txt`.

Pick whichever you prefer:

**Drag it into Terminal** — easiest, changes no settings, needs no password.
Open **Terminal** (<kbd>⌘ Cmd</kbd> + <kbd>Space</kbd>, type `Terminal`,
Return), type `bash` followed by a **space**, then drag `install.command` from
Finder onto the Terminal window and press Return. Handing the file to Terminal
yourself isn't "launching an app", so Gatekeeper never gets a vote.

**Or approve it once.** Double-click `install.command`, let it be blocked, click
**Done**. Go to **Apple menu → System Settings → Privacy & Security**, scroll
down to the line saying `install.command` was blocked, click **Open Anyway**,
confirm with Touch ID or your password, then double-click the file again and
choose **Open**. *(On older macOS there's no such line — instead right-click, or
Control-click, the file in Finder and choose **Open**.)*

**You only do this once.** As it runs, the installer clears the quarantine flag
from its own folder, so `start.command` opens with a plain double-click from
then on.

</details>

<details>
<summary><b>Why isn't there just a normal installer with no warnings?</b></summary>
<br>

Because that requires Apple's paid Developer Program ($99/year) to sign and
notarize each release. The release pipeline is already wired for it —
[`.github/workflows/release.yml`](.github/workflows/release.yml) picks up
`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID` and
`APPLE_API_ISSUER` if those repository secrets are set, and produces a signed,
notarized `.dmg` that opens with no warning at all. Until those secrets exist,
every macOS build is unsigned and Gatekeeper will object. No script can work
around that; it's the point of the mechanism.

</details>

That's it. You never need to know what Git, Node.js, or npm are — the
installer handles all of that. Every step it takes is logged to a file you
can hand to support if anything goes wrong: `~/ImageExpress-setup.log` (macOS)
or `%USERPROFILE%\ImageExpress-setup.log` (Windows). Full details, Linux, and
manual/advanced setup: **[docs/INSTALLATION.md](docs/INSTALLATION.md)**.

> **Windows install slow (15+ min) or failing with `ENOTEMPTY`/`TAR_ENTRY_ERROR`?**
> That's real-time antivirus scanning fighting npm over thousands of small
> files. One admin-PowerShell command excludes just this project folder and
> makes installs several times faster — see
> [Troubleshooting](docs/INSTALLATION.md#5-troubleshooting).

### 🔄 Keep it updated (source installs)

| Action | Command / file |
|---|---|
| **Run (auto-updates when clean)** | `start.bat` (Windows) · `start.command` (macOS) · `npm run launch` |
| **Update code + deps** | `npm run update` |
| **Check only** | `npm run update -- --check` |
| **Also refresh libraries in-range** | `npm run update -- --libs` |
| **Force main branch + update** | `npm run update -- --main` |

The updater never destroys local edits (dirty tree → refuse) and only fast-forwards. Dependencies are repaired automatically via `scripts/ensure-deps.mjs` (`npm ci` when possible, `npm install` fallback, integrity marker).

Packaged desktop releases use the native GitHub Releases updater instead — the two systems are not mixed.

### 🐳 Self-host it (Docker / your own server)

```bash
docker build -t image-express .
docker run -p 3000:3000 image-express
```

Or classic npm on any server:

```bash
git clone https://github.com/GeekatplayStudio/Image-Express.git
cd Image-Express && npm install
npm run build && npm run start
```

### 🧑‍💻 Developer / npm scripts

```bash
npm run setup            # install/repair dependencies on the right Node + npm
npm run dev              # web dev server → http://localhost:3000
npm run desktop:dev      # Electron desktop shell, hot reload
npm run desktop:build    # package installers (Win NSIS / mac DMG / Linux AppImage)
npm run install:super    # interactive ComfyUI + Ollama installer, models fully opt-in
npm run doctor:node      # is this shell's Node new enough? where's a good one?
npm run verify           # the full gate: audits, lint, types, tests, build, bundle
```

### Node 24+ is required — and the toolchain enforces it for you

A version manager (nvm, nvm4w, volta, fnm) will happily leave an older Node
first on `PATH`, and npm downgrades that mismatch to a warning and installs
anyway — which is how you get a subtly wrong `node_modules`, a rewritten
lockfile, or a build that fails much later with an unrelated error.

So `setup`, `build`, `dev`, `start`, `update` and every `desktop:*` script
re-execute themselves under a supported Node when one exists anywhere on the
machine, and use **that** Node's npm rather than whatever the shell provides.
You do not have to fix your shell first. `npm run doctor:node` reports what is
being used.

Verified end-to-end from a shell serving Node 22.22.0 / npm 10.9.4, with a
supported Node 26.4.0 installed elsewhere and shadowed on `PATH`:

| Command | Exit | Result |
|---|---|---|
| `npm run setup` | 0 | switches to Node 26.4.0 **and npm 11.17.0** — no `EBADENGINE` |
| `npm run build` | 0 | |
| `npm run verify` | 0 | 163 suites, 1005 tests |
| `npm run desktop:pack` | 0 | Electron 41.10.4 |
| `npm run desktop:verify-package` | 0 | standalone 114 MB, inside the 400 MB budget |
| `npm run desktop:smoke-package` | 0 | packaged app launches: electron-ready → server-ready → window-ready |
| `package-lock.json` after install | — | unchanged |

The one path that cannot self-correct is a bare `npm install`: that is npm's own
process, so nothing in the repo runs before it. Use `npm run setup` instead, or
point your version manager at the pinned release — `nvm install 24.14.1 && nvm
use 24.14.1` (see [`.nvmrc`](.nvmrc)).

Full walkthrough, ComfyUI/Ollama setup, Docker volume mounts, and API-key configuration: **[docs/INSTALLATION.md](docs/INSTALLATION.md)** · desktop packaging internals: **[docs/DESKTOP.md](docs/DESKTOP.md)** · driving the app from AI agents (Claude Desktop/Code) via Model Context Protocol: **[docs/MCP.md](docs/MCP.md)** · canonical terminology (workspace / canvas / page / album / library): **[docs/TERMINOLOGY.md](docs/TERMINOLOGY.md)**.

> **Privacy by design**: no telemetry, no bundled models, no bundled art assets — a fresh clone is source code only. Every AI feature is opt-in and uses whichever provider *you* configure, including 100%-local ComfyUI + Ollama with zero cloud calls.

---

## 🖼 See It In Action

<table>
<tr>
<td width="50%">

**The full studio** — infinite 2D canvas, professional layer stack, retouch suite, and a context-aware properties panel with curves, channels, and non-destructive masks.

</td>
<td width="50%">

**The Stack** — every canvas in your project floating as a live plane in true 3D space, with three zoom levels: pages in an album, albums arranged as a 3D lattice of boxes, and **Bookshelves** — collections of albums, each shelf a hard boundary that never shares resources with its neighbors. Full 3D navigation everywhere: drag to orbit, Space/Shift-drag to pan, scroll to zoom between levels, Alt+scroll to travel in depth, arrow keys to cycle, hover to part the lattice. Deleting a box winds up, swells, and bursts into sparks.

</td>
</tr>
<tr>
<td><img src="docs/screenshots/feature-editor.svg" alt="Image Express main editor: canvas, layers, and properties panel" width="100%" /></td>
<td><img src="docs/screenshots/feature-stack-view.svg" alt="Image Express 3D Stack View of multiple linked canvases" width="100%" /></td>
</tr>
</table>

---

## ⭐ Why Image Express

### One canvas, three disciplines
- **Infinite 2D vector/raster canvas** (Fabric.js) with professional layer management — locking, folders, multi-select, arrange mode, non-destructive clip masks with gradient fades.
- **Switchable tool groups**: right-click Selection, Retouch, or **Fill/Gradient** on the rail to flip between their sub-tools, same as Photoshop's flyouts. Fill/Gradient includes a **New Fill/Gradient Layer** mode that drops a page-filling gradient layer ready to edit.
- **Content (pixel) selection**: Marquee, Lasso, Magic Wand (contiguous or color-range), **Quick Select** (paint-grow into similar colors), and **Selection Brush** (paint expand / Alt contract) write a marching-ants mask inside the layer — not whole-layer picks. Clear with Escape / Ctrl+D; **Mask from Selection** builds a real layer mask.
- **Live 3D layer editor** (Three.js/WebGL) — pose, light, and shadow a generated or uploaded 3D model right inside a canvas layer, with realistic soft shadows (true penumbra, not a blurred pixel grid) that scale correctly with the model instead of clipping at a fixed radius. Your lighting setup carries over to the next new model you open, so you're not re-lighting from scratch every time.
- **⚡ Frame Bake** — our name for capturing the exact 3D pose you like and baking it into a flat, further-editable 2D PNG layer with one click. Design in 3D, finish in 2D, no round-trip to another app.
- **Real retouching brushes**: Spot Healing, Clone Stamp, Dodge, Burn, Sponge, History Brush, Blur/Sharpen — not filter presets, actual brush-based tools.
- **Curved & circular text**, 13 font families, gradient editor, extended shape library, perspective front/back presets.
- **Photoshop-grade shortcuts**: `V/M/L/W/T/U/P/B/J/S/O/G/I/C/H/Z`, `Ctrl/Cmd+S` to save, Space-drag pan, Alt-drag duplicate, full undo/redo history.

### 🧩 Canvas Stacking & Cross-Canvas Sync *(unique to Image Express)*
Most tools give you one canvas per document. Image Express gives every project a whole **deck of canvases** you flip between instantly — and any layer can be marked **Linked**, broadcasting itself into every other canvas (even across different projects). Edit the linked object once — move it, recolor it, adjust it — and every copy across your entire workspace updates in real time. The **Stack View** visualizes these links as glowing bridge-curves between floating 3D planes, so you can literally *see* your project's data flow, node-editor style. Perfect for template families, multi-page campaigns, and brand-kit consistency.

### 🤖 Any AI you want — local or cloud, your keys, your rules
- **3D generation**: Meshy, Tripo, and Hitem3D — full PBR texturing, background job polling.
- **2D generation**: Stability AI, OpenAI (DALL·E 3), Google Gemini, Banana.dev/NanoBanana, and full **ComfyUI** integration (local, Docker, or Comfy Cloud) with a workflow library browser and same-origin proxying.
- **100% local option**: run **Ollama** for local SVG generation and layer/canvas **AI Critique** — nothing ever leaves your machine. Vision support is detected from Ollama's own per-model capability report (never a hardcoded model list, so brand-new models like `qwen3-vl` and `gemma4` just work), and when your saved model can't read images the critique panel shows every installed vision model plus a curated, size-labeled install list — checked live against the Ollama library — for one-click switch or install with streamed download progress.
- **AI Edit Notes (Beta)**: annotate a layer with point notes, save a flattened reference layer with embedded edit instructions, and hand it straight to a ComfyUI/Flux workflow for guided AI editing.
- A **polymorphic AI adapter layer** means every provider returns the same normalized shape to the UI — swap providers mid-project with zero rework.
- **Nothing ever locks you out while it works.** Every generation is queued, not run inline, so you keep editing while it churns. A hair-thin **pipeline rail** under the toolbar shows exactly where each request is — queued, on your GPU, at an external API, validating, saving — with the external-vs-local distinction called out, because "waiting on Stability" and "waiting on your own GPU" deserve different patience. Hover it for detail, cancel what's still queued, retry what failed (with the real error, not a shrug), and get a toast when it lands. Set it to Hidden, Minimal, or Detailed in Settings → Workspace. Jobs survive an app restart: an interrupted job reports as interrupted instead of spinning forever.

### 📚 Real asset & project management
- **Asset Library**: drag-and-drop multi-file ingestion (mixed images/video/audio/3D lands in the right tabs automatically), folders, search, personal-vs-shared scope, public/private visibility, and **live rotating 3D previews on hover** plus real rendered thumbnails for 3D models in the grid — not just an icon.
- **Single click opens a large preview** for any asset with an Add-to-Canvas button; **double-click or the hover “+” button** adds it straight to the canvas. Video previews support real scrubbing and a **Capture Frame** button that grabs the current frame as a new image layer.
- **AI-assisted asset search (optional, local)**: new uploads are indexed automatically — dimensions and any embedded generation prompt always, plus an AI caption + tags from a local Ollama vision model when you opt in — so you can find an asset by what's *in* it, not just its filename.
- **Index whole drives & folders — from the browser too**: on a local install, "Browse drive / folder" opens a real server-backed folder picker (the browser's File System API can't return paths; the server on your own machine can), so the Asset Vault can index any drive without the desktop build. Self-hosted servers expose only operator-allowlisted roots — never a visitor-browsable filesystem.
- **Browse by group or by folder**: the vault's left sidebar switches between *Groups* — the derived views (type, date, location, subject) — and *Folders*, the real directory tree exactly as it sits on disk, with recursive counts and an optional "include subfolders" toggle. Folder nodes are keyed by path, so your place survives a re-index; a 200k-asset catalog collapses to a few hundred folders and only the branches you open are rendered.
- **Big video previews actually work**: indexed files are served over HTTP byte ranges, so a player fetches only what it plays and can seek instantly. On a drive of render output where 11,620 of 16,136 videos are over 64 MB, that is the difference between every one of those tiles failing and a page loading in under two seconds — 29.6 s and 43 MB of transfer becomes 1.7 s and 256 KB.
- **Resizable thumbnails**: a six-step size slider over the grid, remembered between sessions. Five of the six steps reuse the same cached rendition the background precache already generates, so dragging it resizes instantly instead of regenerating every visible tile.
- **"Find similar" that answers without an index**: it searches the same semantic index as smart search, and falls back to what the file itself says — folder, type, filename, date — so it still returns real neighbours (and tells you *why* each one matched) while the semantic index is still building.
- **Portable Library Bundles**: export your entire asset library (with owner/visibility metadata) as one file and re-import it on another machine or project.
- **Server-side design storage** (no browser-storage limits), optional **Google Drive backup** mirroring every save automatically, and full **export** to PNG/JPG/SVG/PDF/JSON/self-contained offline HTML — plus **machine embroidery (.DST)**, see below.

### 🧵 Machine Embroidery Export — design it, sew it
Export any page straight to **Tajima .DST**, the format nearly every embroidery machine on the planet reads. Pick how many thread colors to reduce your design to, set physical width, fill density, and max stitch length, and optionally skip the background (transparent areas and the color dominating the page border are auto-detected and never stitched). The engine generates real running-stitch fills with tie-in/tie-off locks and proper jump-vs-travel logic — not a naive pixel-to-stitch dump — and the preview window includes **zoom/pan** plus a **stitch-out simulator**: drag a slider (or hit play) to watch the exact needle path draw itself in sewing order, thread by thread, before you commit it to a machine.

### 🌍 11 languages, growing
English, German, Spanish, French, Italian, Japanese, Polish, Portuguese, Russian, Ukrainian, and Chinese are all selectable from the top-bar globe menu, with automatic locale persistence. **English, Russian, and Ukrainian are at 100% UI coverage** today — every panel, from the dashboard to the deepest properties tab. The rest are being brought up to the same bar one functional area at a time (Spanish is next); until then they fall back to English string-by-string, so nothing ever renders blank.

### 🎭 Themes that are actually alive
Keep reading — this is the part that has to be seen to be believed. →

---

## 🎨 Make It Yours: Animated Theme Packs

Interface themes aren't just color swaps here. A theme pack can restyle every panel, button, and font in the app **and** populate your dashboard with small, tasteful sprite animations and living background scenes — built entirely from CSS and PNG sprite sheets (no JavaScript ever ships inside a pack, so installing one is always safe).

Everything below installs in one click from **Settings → Workspace → Interface Themes / Dashboard Ambience**, and nothing is bundled by default — only the classic look plus two accessibility/elegance themes ship with a fresh install. Everything else is a free download away.

<table>
<tr>
<td width="50%"><img src="docs/screenshots/theme-pixel-rpg.svg" width="100%" alt="Pixel RPG animated theme: a dragon flies past a knight-built castle" /><br/><sub align="center"><b>Pixel RPG</b> — a dragon circles the sky, knights build (and lose) a castle, a full royal parade marches by, and yes, a knight can ride the dragon.</sub></td>
<td width="50%"><img src="docs/screenshots/theme-pixel-cosmos.svg" width="100%" alt="Pixel Cosmos animated theme: a UFO lands and aliens run around" /><br/><sub align="center"><b>Pixel Cosmos</b> — flying saucers patrol the dashboard, land near your cursor, and aliens occasionally blaster-fight a giant space fly.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/theme-border-collie-wordflock.svg" width="100%" alt="Border Collie animated ambience: a flock of sheep spells out the word HELLO" /><br/><sub align="center"><b>Border Collie</b> — the flock literally spells words with their bodies, rehearses a sheep choir, holds a rock concert, and yes, there's a jetpack.</sub></td>
<td width="50%"><img src="docs/screenshots/theme-rococo.svg" width="100%" alt="Rococo pastel theme with gilded double-border buttons" /><br/><sub align="center"><b>Rococo</b> — bundled by default. A soft pastel salon: warm cream, muted rose &amp; sage, gilded double-border buttons, serif type. Elegant, never overdone.</sub></td>
</tr>
</table>

<img src="docs/screenshots/theme-clarity-contrast.svg" width="50%" alt="Clarity high-contrast accessibility theme" align="right" />

**Clarity — High Contrast** ships bundled too: pure black/white AAA-contrast surfaces, thick 3px borders, and unmistakable bold-yellow focus rings, built specifically for low-vision comfort — because accessibility shouldn't be a paid add-on.

Every animated pack comes with its own set of **original jokes and facts** that replace the dashboard's rotating quote ("A dragon's hoard is 90% gold and 10% things it sat on and forgot about."), a frequency slider to dial the animation from *Occasionally* to *Annoying*, and — because we know some of you want the studio to just be a studio — an always-available **default theme with zero animation**.

Building your own pack is straightforward and fully documented in [`docs/THEME_PACKS_SPEC.md`](docs/THEME_PACKS_SPEC.md) — packs are just JSON + CSS + PNG, no build step, no code execution, ever.

---

## 💚 Support the Project

Image Express is free and MIT-friendly open source, full stop — every feature above works without spending a cent. If it's useful to you and you'd like to say thanks, the most fun way is picking up an extra theme pack (dragons, aliens, sci-fi collies, and more retro-OS skins) from the shop below. It's entirely optional, genuinely appreciated, and every purchase goes straight back into building more of this.

<div align="center">

### **[🛍️ Browse more theme packs on Gumroad →](https://geekatplay.gumroad.com/)**

*No purchase is required for any core feature — this is a thank-you tip jar with really good production values.*

</div>

---

## 🛠️ Engineering Case Study

<details>
<summary><b>Click to expand — architecture, key decisions, and hard problems solved (for engineers evaluating the codebase)</b></summary>

### Executive Summary
* **Problem**: Digital design workflows are typically fractured. Designers are forced to toggle between vector editors (e.g., Photoshop, Illustrator) for canvas layouts, separate WebGL environments for 3D staging, and distinct web interfaces (e.g., ComfyUI, Automatic1111) for generative AI tasks.
* **Why Created**: Image Express was built to unify these disparate pipelines into a single, high-performance open-source platform. It bridges interactive 2D canvas layouts, live WebGL 3D inspectors, and multi-provider AI generators (local Ollama/ComfyUI alongside cloud Meshy/Tripo/Stability/OpenAI pathways) under a single UI.
* **Who it is for**: Digital creators, visual designers, and developers looking for a customizable, extensible design suite that exposes professional vector, brush, and AI controls.
* **Technical Interest**: Integrating a stateful 2D canvas (Fabric.js) with real-time 3D environments (Three.js), sandboxed desktop environments (Electron), and distributed, high-latency generative AI routes.

### Engineering Challenge
* **Context Synchronization**: Managing coordinate systems and transformation matrices across independent 2D vector layouts and WebGL 3D scenes. When 3D layers are resized, scaled, or rotated, matrix math must translate user gestures from canvas coordinate space to WebGL clip space in real-time.
* **Hybrid Execution & Network Fallbacks**: Transitioning dynamically between high-throughput cloud endpoints and local instances (ComfyUI, Ollama). The app must support Docker loopbacks (resolving local targets between `localhost` and `host.docker.internal`), handle transient service outages with server-side retries, and manage model downloads/installations inline.
* **Memory & Layout Overhead**: Running high-resolution canvas brush engines (Spot Healing, Dodge, Burn, Clone Stamp), complex non-destructive raster masking, and nested vector folders without triggering browser memory leaks or dropping frame rates in Electron.
* **Cross-Canvas State Propagation**: Once a layer can be "shared" across many canvases and projects simultaneously, every mutation (`object:modified`) has to fan out to every linked instance without creating circular update loops or desyncing transform state.

### Architecture Overview
Image Express uses a modular, decoupled architecture separating canvas layouts, AI adapters, and application runtimes.

```mermaid
graph TD
    A[Electron Desktop Shell / Web Browser] --> B[Next.js App Router Client]
    B --> C[Fabric.js 2D Vector Canvas]
    B --> D[Three.js WebGL 3D Inspector]
    B --> E[Command Manager / Serializable History]
    B --> J[Multi-Canvas Project Store + Stack/Federation 3D View]

    B --> F[Next.js API Gateway / Proxy]
    B -. SSE job events .-> K
    F --> K[Job Queue: durable store + lane scheduler]
    K --> G[Polymorphic AI Adapter Layer]

    G --> H[Local AI Providers: ComfyUI / Ollama]
    G --> I[Cloud AI Providers: Stability / OpenAI / Meshy / Tripo / Gemini]
```

* **Canvas Engine**: Standard Fabric.js core extended with custom subclass renderers (e.g., `WarpedImage` for perspective transformations, custom prototype extensions for styled text layout cards).
* **AI Abstraction Layer (`AiRuntimeManager`)**: A polymorphic adapter framework separating the front-end from individual generation APIs. It normalizes inputs and outputs, manages async polling states, and simplifies provider selection.
* **Job Queue (`src/lib/server/jobQueue/`)**: Long-running AI work never executes inside a request handler. Requests are *accepted* (`202` + job id) and handed to a durable, crash-safe queue with **lane-based concurrency** — the local GPU lane serializes to 1, the CPU lane runs 4, and each remote provider gets its own window so a slow provider can't starve the others. Running jobs hold a lease renewed by their own progress updates, so any job persisted as `running` at boot belonged to a dead process and is failed as `interrupted` rather than hanging forever. Clients subscribe to one **Server-Sent Events** stream instead of polling. Full record: [`docs/JOB_QUEUE.md`](docs/JOB_QUEUE.md).
* **Command Pattern Engine**: Tracks every user canvas interaction (moves, resizing, properties) as discrete, serializable command payloads. This provides a clear audit trail and enables reliable undo/redo capabilities.
* **Multi-Canvas Project Store**: Each project owns an array of canvases plus a shared-layer registry (`sharedLayerId`); a Three.js overlay (`CanvasStackView`) renders every canvas as a floating textured plane and every project as a navigable "room" in Federation mode, with animated bridge curves tracing live shared-layer links.
* **Theme/Ambience Pack Engine**: A sandboxed, code-free pack format (manifest JSON + CSS + PNG sprite sheets) drives both the interface theme system and a small built-in sprite/animation runtime (`SpriteTheater`, `DashboardAmbience`) — packs declare *scenes* from a fixed vocabulary (fly-across, chase, build-and-destroy, word-formation, concert, dance party, ...) that the app itself interprets and renders; no pack can execute arbitrary code.

### Technology Choices
* **Next.js 16 (App Router) & TypeScript**: Provides a robust SSR framework combined with static type safety. TypeScript coordinates complex Fabric interface configurations (`ExtendedFabricObject`) and ensures strict API contracts for polymorphic AI payloads.
* **Fabric.js**: Selected as the 2D layout engine for its out-of-the-box object tree, mouse event handling, vector controls, and serialization/cloning support.
  * *Alternatives Considered*: Native HTML5 Canvas API (rejected due to the excessive overhead of rebuilding selection bounds, multi-select, scaling anchors, and layered object rendering from scratch). Pixi.js (rejected because its WebGL focus makes vector editing, text path alignments, and standard SVG rendering overly complex).
* **Three.js & React Three Fiber**: Used for both the WebGL 3D layer inspector overlay and the Stack/Federation project-navigation view. Provides high-fidelity rendering, lighting controls, shadow maps, and PBR textures within a canvas container.
* **Electron**: Wraps the web application into a sandboxed desktop container. The production server now runs as an independent child process (not `require()`d in-process) so a server crash can never take the window down with it, with a free-port scan on launch and full startup tracing to a log file for support. That log is what users attach to a support ticket, so everything written to it — including the child server's raw stderr — passes through a single redaction module (`electron/logRedaction.js`) that masks home and install paths and strips credentials by pattern as well as by key, because server output is unstructured prose rather than tidy `KEY=value` pairs.
* **`node:sqlite` for the asset catalog**: At whole-drive scale the JSON catalog reached **153 MB**, and since a JSON document must be written whole, adding a single asset rewrote all 153 MB while any query parsed the entire set into heap. The replacement stores one row per asset with indexed columns for the filters the UI actually issues, turning folder and type navigation into queries instead of full scans.
  * *Alternatives Considered*: `better-sqlite3` (rejected — a native module means a rebuild on every Electron major, and that recurring cost is exactly what hurts a desktop app); Postgres or Mongo (rejected — a server process on a user's laptop is the wrong trade for a single-machine app); LMDB/LevelDB (rejected — no ad-hoc queries, and filtered scans are the whole point). `node:sqlite` ships with Node, so it costs zero dependencies and zero rebuilds; it is still flagged experimental, so the store probes for it and falls back to JSON rather than leaving the vault unusable.

### Key Engineering Decisions
* **Polymorphic AI Adapter Pattern**: To prevent API-specific leakage into React views, all generative actions run through `AiRuntimeManager`. This normalizes disparate responses into a unified structure, allowing hot-swapping between cloud engines and local models (e.g., local Ollama for SVG layouts vs. OpenAI or Stability).
* **Prototype-Injected Text Background Rendering**: Instead of writing separate wrapper groups that must manually re-align whenever text is modified, we patched `_render` directly on `fabric.IText` and `fabric.Textbox` prototypes. This intercepts the Fabric draw call, dynamically rendering styled rectangles, capsule pills, or speech bubble frames behind the text glyphs in real-time as the user types.
* **Centralized Command Persistence**: All editor actions are serialized to JSON commands. This makes the workspace history replayable, supports automated offline dry-runs for quality testing, and prepares the codebase for future real-time collaborative syncing.
* **No-Code-In-Packs Guarantee**: Theme and ambience packs are validated server-side (zip-slip protection, extension allow-lists, CSS pattern scanning for `@import`/external URLs, SVG script-tag stripping) before install, and every visual "scene" is drawn by first-party engine code reading declarative JSON — a pack can look like anything but can never run anything.

### Tradeoffs
* **Canvas Overlay vs. Native Grouping for 3D Layers**:
  * *Decision*: Rendered the 3D WebGL runtime in a HTML container positioned directly over the active 2D layer, rather than mapping 3D rendering cycles directly into Fabric's 2D context.
  * *Tradeoff*: Ensures highly performant lighting, environment maps, and rotation animations. However, it requires coordinate synchronization helpers to align the WebGL container position and dimensions with the 2D bounding boxes on canvas zoom or drag.
* **Next.js API Gateway as Proxy Tier**:
  * *Decision*: All AI generation and storage requests pass through local Next.js API endpoints.
  * *Tradeoff*: Prevents client-side CORS failures and keeps private API keys secure. However, it introduces a minor routing latency and memory overhead on the server when transferring heavy high-resolution image assets or 3D files.

### Interesting Technical Problems
* **Photoshop-Style Path Pen Loop Closure**:
  * *Problem*: When using the Pen tool to draw vector layouts, closing the shape by clicking the initial anchor point was unreliable, causing unclosed paths.
  * *Solution*: Implemented a fuzzy-coordinate threshold check (20px radius) and anchor index evaluation (`index === 0`). When triggered, the engine terminates draft drawing, compiles path nodes, sets the `penClosed` flag, and applies standard fill colors dynamically.
* **Text Circular Arcs & 360-Degree Wraps**:
  * *Problem*: Traditional text-on-path implementations using quadratic Bezier curves (`Q`) are constrained to soft curves and cannot wrap past $180^\circ$ to form a closed circle.
  * *Solution*: Replaced the parabolic curve math with SVG Arc commands (`A`) configured with radius $R = L/\theta$, swept flags, and large-arc thresholds ($>180^\circ$). This aligns text glyphs seamlessly up to a full $359.5^\circ$ circle.
* **Desktop Packaging Whole-Project Trace Leak**:
  * *Problem*: Next.js's standalone output tracer followed a few `path.join(process.cwd(), ...)` calls into treating the *entire monorepo* (including `.git`, local asset libraries, and build output) as a server dependency, ballooning a packaged desktop build from ~350 MB to over 5 GB.
  * *Solution*: Added `turbopackIgnore` hints at each dynamic-path call site plus an explicit `outputFileTracingExcludes` allowlist in `next.config.ts`, and moved `node_modules`/`.next` copying in the Electron packaging config to explicit `extraResources` entries (electron-builder silently skips dot-directories and `node_modules` in its default glob).

### Performance & Scalability
* **Clipping Mask Render Optimization**: Complex nested vector masks degrade layout frames. The engine caches path clip states and limits recalculation to selected or actively edited layers.
* **Queue-Backed Async Work**: 3D and image generation can take minutes. A server-side scheduler owns execution with per-lane concurrency caps and lease-based crash recovery, and pushes every state transition to the UI over a single SSE connection — so the browser holds no timers, and a job survives closing the tab that started it. The client-side provider poller that remains (Meshy/Tripo/Hitem3D/Stability) uses exponential backoff with jitter, caps in-flight requests, and stretches its interval when the tab is hidden; migrating it into the queue is tracked in [`docs/JOB_QUEUE.md`](docs/JOB_QUEUE.md).
* **Sprite Theater Frequency Throttling**: Animated theme scenes default to a "rare vignette" cadence (minutes between scenes, one scene at a time, pauses in hidden tabs, disabled entirely under `prefers-reduced-motion`) so ambient personality never competes with actual work — with a user-facing slider for those who want more.

### Lessons Learned
* **Proactive Component Extraction**: The primary editor file (`EditorView.tsx`) originally grew to over 7.4k lines, making it difficult to maintain. Extracting state, shortcuts, canvas wrappers, and history controls into dedicated hooks and components early in the project lifecycle is essential.
* **Subclassing vs. Prototype Modification**: While prototype patching (e.g., for Text Backgrounds) is quick, it can lead to prototype clutter. A future iteration will refactor these into formal Fabric subclasses (e.g., `fabric.TextBoxWithFrame`) to clean up namespace collisions.
* **Test Every Install Path For Real**: Assuming an installer script works because it "looks right" is how you ship a batch file that dies on the very first machine with a Node version manager installed. Every install/update/package flow in this project is now validated by actually running it end-to-end against a clean target directory, not just read for correctness.

</details>

---

## 🎨 Properties Panel Deep-Dive

<details>
<summary><b>Click to expand — full adjustment, color, and shortcut reference</b></summary>

### Adjustment Layers
- **Curves**: Spline-based color correction with per-channel control
- **Levels**: Black/Mid/White point adjustment
- **Exposure**: Brightness and contrast control
- **Hue/Saturation**: Color shift and intensity
- **Brightness/Contrast**: Dedicated tonal sliders
- **Color Balance**: RGB channel balancing with preserve-luminosity support
- **Light and Color**: Unified temperature/tint/exposure/saturation/vibrance control
- **Solid Color**: Blend-based color fill adjustment layer
- **Black & White**: Grayscale conversion

### Color & Swatches
- **Right Panel Color Wheel**: Embedded color wheel in properties color panel with live preview behavior
- **Channel Editing Modes**: Editable RGB / HSB / CMYK / Lab value cards
- **Profile Preview Modes**: sRGB, Adobe RGB, and CMYK print-preview context
- **Harmony Sets**: Save, rename, delete, import, and export harmony palettes
- **Grouped Swatches**: Create, select, and remove swatch groups directly in the Swatches panel, plus add/remove swatches per group
- **Mask Gradient Controls**: Clip-path masks support non-destructive linear or radial opacity fades with editable angle/start/end opacity.

### Channels
- **Real Channels Panel**: Composite, Red, Green, Blue, Alpha, and Luminosity rows are available in the right rail and circular context menu.
- **Per-Channel Controls**: Each editable channel supports opacity, composite masking, isolate, invert, and mask actions.
- **Layer-Aware Behavior**: Selected images use non-destructive ColorMatrix filters, while fillable layers and solid-color adjustments support direct per-channel value edits.

### Shadow & Stroke
- **Drop Shadow**: Blur (0-150px), Offset (±200px), Opacity, Blend Modes
- **Inside Stroke**: Renders over fill
- **Outside Border**: Renders under fill (paintFirst: stroke)

### Text Tools
- **Curved Text**: Quadratic/Cubic bezier paths with presets (Flat, Arc↑, Arc↓, Circle)
- **13 Font Families**: Arial, Times New Roman, Georgia, Impact, and more
- **Font Weights**: 100-900 plus normal/bold

### Paint Mode
- **Brush Types**: Pencil, Spray, Oil, Watercolor
- **Blend Modes**: Normal, Multiply, Screen, Overlay
- **Smart Grouping**: Strokes auto-grouped in Paint Folders

### Photoshop-Style Shortcuts
- **Navigation**: Space + Drag pans, Scroll zooms, and Double-click empty canvas recenters the artboard.
- **Layer Duplication**: Alt/Option + Drag duplicates the selected layer and drags the copy.
- **Selection Tools**: `V` Move, `M` Marquee, `L` Lasso, `W` Quick Select, `Shift+W` Magic Wand, `K` Selection Brush, `A` Path Select. Content tools paint a pixel mask (Shift adds; Alt on brush/quick contracts).
- **Creation & Retouch**: `T` Text, `U` Shapes, `P` Pen, `B` Brush, `R` Blur, `J` Healing, `S` Clone Stamp, `O` Dodge, `G` Gradient, `I` Eyedropper, `C` Crop, `H` Hand, `Z` Zoom.
- **History & Selection**: `Cmd/Ctrl+J` duplicates, `Cmd/Ctrl+D` deselects, `Cmd/Ctrl+Z` and `Cmd/Ctrl+Alt+Z` undo, `Cmd/Ctrl+Shift+Z` redo.

</details>

---

## 🔑 API Key Configuration

To unlock AI features, add your own keys in **Settings** — they're stored locally, never on our servers.

**3D Generation (Text-to-3D)**: [Meshy AI](https://www.meshy.ai/) · [Tripo AI](https://www.tripo3d.ai/) · [Hitem3D](https://www.hitems.com/) (bearer token or AK/SK)

**2D Generation (Text-to-Image)**: [Stability AI](https://platform.stability.ai/) · [OpenAI](https://platform.openai.com/) (DALL·E 3) · Google Gemini · Comfy Cloud (`COMFY_CLOUD_URL` / `COMFY_CLOUD_API_KEY`)

**Fully local, zero cost, zero cloud**: local ComfyUI + local Ollama — no API key needed at all.

Settings includes built-in key validation (server-side for Hitem3D, format preflight for Meshy/Tripo/Google) so typos get caught before you burn a generation credit.

**Optional Google Drive backup**: create an OAuth Web-app Client ID in Google Cloud Console, paste it into **Settings → Google Drive Backup**, click Connect — every save now also mirrors to a Drive folder automatically. Full steps in [docs/INSTALLATION.md](docs/INSTALLATION.md).

---

## 🏗 Project Structure

```
src/app/            Next.js App Router pages + all API routes (AI proxies, assets, designs, themes, queue)
src/components/      Dashboard, DesignCanvas, ThreeDGenerator, PropertiesPanel, PipelineRail, Editor/, properties/
src/lib/             AI adapters, multi-canvas store, theme/ambience engines, i18n, storage
src/lib/server/jobQueue/   Durable job queue: store, lane scheduler, per-kind handlers
electron/            Desktop shell (child-process server boot, auto-updater, startup logging)
theme-packs/          Theme-pack authoring workspace (gitignored — packs are downloads, not source)
ambience-packs/       Dashboard-ambience authoring workspace (gitignored, same reasoning)
docs/                ARCHITECTURE (how it works) · FUNCTIONALITY (what it does) · ROADMAP (what's next) · TERMINOLOGY · CHANGELOG, plus operational guides
```

## 🛠 Tech Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS · Fabric.js (2D) · Three.js / React Three Fiber (3D) · Electron · Lucide React

## 📚 Documentation

**Start here — these four cover the whole system:**

| Doc | Answers |
|---|---|
| **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** | How it works. Runtime profiles, the **"Q" job queue** in full, editor runtime, Asset Vault, provider adapters, the API surface, persistence, quality gates, module ownership. |
| **[FUNCTIONALITY.md](docs/FUNCTIONALITY.md)** | What it does, feature by feature, with honest status and a known-gaps table. |
| **[ROADMAP.md](docs/ROADMAP.md)** | What's next — the only forward-looking doc. Backlog, milestones, per-initiative acceptance criteria, cross-cutting debt. |
| **[TERMINOLOGY.md](docs/TERMINOLOGY.md)** | What things are called, what's banned, and how canonical names map onto older code names. Enforced by `npm run audit:terms`. |

**Reference:**

- [docs/CHANGELOG.md](docs/CHANGELOG.md) — delivery history, newest first
- [docs/INSTALLATION.md](docs/INSTALLATION.md) — full install guide (PC/Mac, ComfyUI, Ollama, Docker, Drive backup)
- [docs/DESKTOP.md](docs/DESKTOP.md) — desktop packaging, auto-update, and startup-log internals
- [docs/RELEASE_PROCESS.md](docs/RELEASE_PROCESS.md) — tag-to-artifact release pipeline
- [docs/JOB_QUEUE.md](docs/JOB_QUEUE.md) — the job queue's design rationale and extension guide
- [docs/DEPENDENCY_SECURITY.md](docs/DEPENDENCY_SECURITY.md) — how advisory fixes are pinned, enforced in CI, and waived (current state: `npm audit` clean)
- [docs/THEME_PACKS_SPEC.md](docs/THEME_PACKS_SPEC.md) — build your own theme/ambience pack (no code required)
- [docs/i18n_multilanguage_support.md](docs/i18n_multilanguage_support.md) — translation system and adding a language
- [docs/MCP.md](docs/MCP.md) — driving the app from AI agents via Model Context Protocol
- [docs/html-export-notes.md](docs/html-export-notes.md) — HTML export details and asset coverage
- [docs/prd_3d_layer_vfx_2026-07-23.md](docs/prd_3d_layer_vfx_2026-07-23.md) — 3D/VFX PRD, including the GPL-3.0 prior-art licensing position
- [docs/Hy3D_Documentation.md](docs/Hy3D_Documentation.md) — Hitem3D provider API notes
- [docs/DEPENDENCY_SECURITY.md](docs/DEPENDENCY_SECURITY.md) — how advisory fixes are pinned, enforced in CI, and waived (current state: `npm audit` clean)

---

## 🌟 Connect With Us

- **GitHub**: [GeekatplayStudio](https://github.com/GeekatplayStudio)
- **Theme Packs & Support**: [geekatplay.gumroad.com](https://geekatplay.gumroad.com/)
- **LinkedIn**: [Geekatplay](https://www.linkedin.com/in/geekatplay/)
- **YouTube (EN)**: [@geekatplay](https://www.youtube.com/@geekatplay) · **YouTube (RU)**: [@geekatplay-ru](https://www.youtube.com/@geekatplay-ru)
- **Website**: [Geekatplay.com](https://www.geekatplay.com) · **Photography**: [ChopinePhotography.com](https://www.chopinephotography.com)

<div align="center">
<sub>Copyright © 2026 V Chopine and Geekatplay Studio. Open source, built for creators who don't want to choose between a design tool, a 3D viewer, and an AI console.</sub>
</div>
