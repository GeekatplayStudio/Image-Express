# Image Express — Functionality Reference

**What the application does, from the user's side.** This is the behavioural
source of truth: before changing a feature, check what is promised here; after
changing one, update it.

- How it works internally: [ARCHITECTURE.md](ARCHITECTURE.md)
- What's next: [ROADMAP.md](ROADMAP.md)
- Naming: [TERMINOLOGY.md](TERMINOLOGY.md)

Legend: **Shipped** · **Partial** (usable, gaps listed) · **Beta**

---

## 1. Product in one paragraph

A design studio that fuses a professional 2D canvas, live 3D generation, and any
AI provider — local or cloud — into one workspace. It runs as a desktop app, a
self-hosted web app, or from npm on your own machine. Every AI feature uses the
user's own keys, or runs entirely offline via ComfyUI and Ollama. No telemetry,
no bundled models, no bundled art.

---

## 2. Getting in

### Startup and setup wizard — Shipped
The shell decides desktop vs web behaviour on load. The setup wizard auto-opens
unless completion is marked for the current scope (`completedByScope`, migrated
from a legacy global marker) or an existing setup config is detected.

### Sessions and accounts — Shipped
Three session types: guest (web, unauthenticated), authenticated web user, and
local desktop pseudo-user.

- Email/password registration creates a **pending** user requiring admin approval.
- Google sign-in maps to an existing approved user, or creates a pending request.
- Login outcomes are status-gated: `pending`, `rejected`, `disabled`, `approved`.
- Admins can approve and manage users; admin routes verify the requester.
- Password recovery: one-time token (30 min), emailed via Resend when configured;
  in-profile change requires the current password and an approved, non-disabled account.

Facebook sign-in is **not implemented** — the UI presents it as coming soon.

### Dashboard — Shipped
Start actions: new custom-size page, upload media, generate 3D, generate image,
open template, open/delete a recent page.

The three levels of the hierarchy are three collapsing bars, ordered **Pages,
Albums, Bookshelves**, with Pages open by default — returning users are
continuing the page they left far more often than they are reorganising
shelves. Each bar expands into a horizontal row of cards: left-drag to pan, a
scrub bar underneath, arrows on both sides. Pages merges the two stores that
both mean "a page" to the user — canvases inside albums and standalone designs
saved on the server — newest first. Opening a page makes both its album and
that page active before entering the editor. Which bars are open persists in
`localStorage`, read through `useSyncExternalStore` so a stored preference can
never disagree with the server-rendered markup and break hydration.

The Stack view shows every page as a
floating plane in 3D, with three zoom levels — pages in an album, albums as a
lattice, and **Bookshelves** (a shelf is a hard resource boundary; linked layers
never cross it). Drag to orbit, Space/Shift-drag to pan, scroll to change level,
Alt+scroll for depth, arrows to cycle.

---

## 3. The editor

### Canvas and workspace — Shipped
A full-size Fabric surface with an explicit **artboard** — the export boundary.
Anything outside the artboard is removed on export. The artboard stays at the
bottom of the stack and is excluded from selection and deletion. A dimension
overlay shows while an object is active.

**Navigation:** Space+drag pans, Hand mode locks panning, wheel zooms around the
pointer, double-click on empty canvas recenters the artboard there.
Delete/Backspace is guarded so it never fires while editing text.

### Tools — Shipped
Left rail with Photoshop-style flyouts: right-click Selection, Retouch, or
Fill/Gradient to switch sub-tools. Fill/Gradient includes a **New Fill/Gradient
Layer** mode.

**Shortcuts:** `V` Move · `M` Marquee · `L` Lasso · `W` Quick Select ·
`Shift+W` Magic Wand · `K` Selection Brush · `A` Path Select · `T` Text ·
`U` Shapes · `P` Pen · `B` Brush · `R` Blur · `J` Healing · `S` Clone Stamp ·
`O` Dodge · `G` Gradient · `I` Eyedropper · `C` Crop · `H` Hand · `Z` Zoom.
`Ctrl/Cmd+J` duplicate · `Ctrl/Cmd+D` deselect · `Ctrl/Cmd+Z` undo ·
`Ctrl/Cmd+Shift+Z` redo · `Ctrl/Cmd+S` save · Alt-drag duplicates.

### Content (pixel) selection — Shipped
Marquee, Lasso, Magic Wand (contiguous or colour-range), Quick Select
(paint-grow into similar colours) and Selection Brush (paint expands, Alt
contracts) all write a real marching-ants mask **inside the layer** — not
whole-layer picks. Escape / `Ctrl+D` clears. **Mask from Selection** promotes it
to a layer mask. Delete/Cut/Fill honour the active mask.

### Retouch — Shipped
Real brush-based tools, not filter presets: Spot Healing, Clone Stamp, Dodge,
Burn, Sponge, History Brush, Blur/Sharpen, driven by a shared raster engine.

### Layers — Shipped
Locking, folders, multi-select, arrange mode, drag into/out of groups,
duplication, and non-destructive clip masks with gradient fades (linear or
radial, with editable angle and start/end opacity). Photoshop-style clipping
clips the top object to the one below.

### Properties panel — Shipped
Context-aware. Adjustment layers: Curves (spline, per-channel), Levels,
Exposure, Hue/Saturation, Brightness/Contrast, Colour Balance (with
preserve-luminosity), Light & Colour, Solid Colour, Black & White.

Colour: embedded wheel with live preview, editable RGB/HSB/CMYK/Lab cards,
sRGB / Adobe RGB / CMYK preview modes, saveable harmony sets, grouped swatches.
**Color Constellation** adds a 3D OKLCH picker — palette-as-geometry with
connected harmony nodes.

Shadow & stroke: drop shadow (blur 0–150px, offset ±200px, opacity, blend
modes), inside stroke, outside border.

Text: curved and circular text via SVG arc commands (up to a full 359.5°
circle), 13 font families, weights 100–900, and a text-effects pack — shadow,
stroke, glow, highlight, gradient, sticker, texture, readability.

Paint: Pencil, Spray, Oil, Watercolour with Normal/Multiply/Screen/Overlay
blending; strokes auto-group into Paint Folders, one layer per session.

### Channels — Partial
Composite, Red, Green, Blue, Alpha and Luminosity rows in the right rail and
circular context menu, each with opacity, composite masking, isolate, invert and
mask actions. Images use non-destructive ColorMatrix filters; fillable layers
support direct per-channel edits.
*Missing:* saved named channels and load-channel-as-selection.

### 3D layers — Shipped
Pose, light and shadow a generated or uploaded model inside a canvas layer, with
true-penumbra soft shadows that scale with the model. Lighting carries over to
the next model opened. **Frame Bake** captures the current 3D pose into a flat,
still-editable 2D PNG layer.

### Multi-canvas and linked layers — Shipped
Every album is a deck of pages you switch between instantly. Any layer marked
**Linked** broadcasts into every other page, even across albums, and edits
propagate live: renames, adjustments (brightness, contrast, hue, curves,
channels…), filters, opacity, visibility, and fill sync to every linked copy,
while position and size stay per-page. **Replace Asset** (properties panel,
image layers) opens the Asset Vault and swaps the picked image into the layer
in place — every linked copy on every page and album follows, each keeping
its own position and rendered size. The Stack view draws these links as
glowing bridge curves. Bookshelves are a hard boundary — links never cross
them.

### Autosave — Shipped
Off by default; enable in Settings → Workspace.

---

## 4. AI

All AI is opt-in and uses the user's own keys, or runs fully local.

### Image generation — Shipped
Stability AI, OpenAI (DALL·E 3), Google Gemini, Banana.dev/NanoBanana, and full
ComfyUI integration (local, Docker, or Comfy Cloud) with a workflow library
browser and same-origin proxying. All providers normalize to one shape, so they
are swappable mid-project.

### 3D generation — Shipped
Meshy, Tripo and Hitem3D, with full PBR texturing. Hitem3D also exposes depth
and split endpoints.

### Local-only AI — Shipped
Ollama drives local SVG generation and layer/canvas **AI Critique**. Vision
support is read from Ollama's own per-model capability report — never a
hardcoded model list — so new models work immediately. When the saved model
cannot read images, the critique panel lists installed vision models plus a
curated, size-labelled install list checked live against the Ollama library,
with streamed download progress.

### AI Edit Notes — Beta
Annotate a layer with point notes, save a flattened reference layer with
embedded instructions, and hand it to a ComfyUI/Flux workflow for guided
editing. Annotated requests require both a notes overlay and a combined mask.

### AI Upscale — Shipped
One Upscale tool (toolbar and Tools menu), seven routes: local **ComfyUI** (the
default — free, private, uses the bundled Lanczos workflow or any installed
upscale model), **Stability** conservative 4x, **Fal.ai Clarity** (generative
detail with a creativity dial and optional prompt), **Replicate Real-ESRGAN**
(fast, faithful pixel upscale), **Magnific via Freepik** (extreme generative
detail to 16x), **Topaz Labs** (archival fidelity), and **Claid.ai**
(logo/text-preserving, e-commerce). Source is the selected layer or the whole
canvas; the result lands as a **new layer** positioned over the source at full
resolution, named and tagged with its provider — the original stays underneath.
Settings → Services → Upscale Services holds per-provider keys (synced to the
account like every other key), one-line best-for guidance per service, and the
default service/scale/creativity the tool preselects. External providers run
through a server proxy (`/api/ai/upscale` + `/poll`) with the user's own key
forwarded per-request and never stored; provider-returned result URLs are
re-validated against the outbound URL policy before the server fetches them.

### AI Campaign Manager — Shipped
A campaign layer alongside the Brand Kit (Tools menu, or right-click the Super
Agent toolbar button for the Super Agent / Campaign Manager picker). Each
stored campaign holds allowed fonts, palette colors, campaign assets,
reference images, and free-form **plain-language requirements**; multiple
campaigns persist to `data/campaign/` on the server (localStorage as offline
cache) and are reselectable later. **Verify** checks the canvas against the
selected campaign in report-only or **auto-fix** mode: deterministic
font/color checks run through the brand audit engine via a campaign adapter
(rules a campaign doesn't define are zeroed out, not enforced), the
plain-language requirements travel to the AI reviewer (local Ollama VLM or
the configured OpenAI/Gemini provider) as extra prompt instructions, and
violations are highlighted on the canvas with severity colors. Auto-fix
reuses the brand machinery: font swap to the campaign's first font, color
snap to the nearest palette color; unfixable findings stay in the report.

### AI-assisted asset search — Shipped (opt-in)
New uploads are indexed automatically: dimensions and any embedded generation
prompt always; an AI caption plus tags from a local Ollama vision model when
enabled. Lets you find an asset by what is *in* it.

### Background work — Shipped
Every generation is queued, never run inline, so the app stays usable. A thin
**pipeline rail** under the top toolbar shows where each request is — queued, on
your GPU, at an external API, validating, saving — distinguishing external from
local work. Hover for detail, cancel what is still queued, retry what failed
with the real error, and get a toast on completion. Configure in Settings →
Workspace: Hidden / Minimal / Detailed, plus a completion-notification toggle.
Jobs survive an app restart; interrupted ones report as interrupted rather than
spinning forever.

---

## 5. Assets

### Asset Library — Shipped
Drag-and-drop multi-file ingestion (mixed images/video/audio/3D routes to the
right tabs), folders, search, personal-vs-shared scope, public/private
visibility, live rotating 3D previews on hover, and real rendered thumbnails for
3D models. Single click opens a large preview with Add-to-Canvas; double-click
or the hover **+** adds it directly. Video previews scrub and offer **Capture
Frame** to grab the current frame as a new image layer.

Local and Google Drive 3D selections are copied once into the durable local
asset store before canvas placement, so saved layers survive reloads instead of
depending on a browser-session `blob:` URL. Older volatile model layers are
recovered by filename when possible; otherwise editing and Unfold stop with a
clear localized prompt to re-add the source rather than crashing the 3D view.

### Asset Vault — Shipped
Indexes assets **in place** across local drives — nothing is moved. On a local
install, "Browse drive / folder" opens a server-backed folder picker (the
browser's File System API cannot return real paths; the server on your own
machine can), so drives can be indexed without the desktop build. Self-hosted
servers expose only operator-allowlisted roots.

The left sidebar switches between:
- **Groups** — derived lenses: type, date, location, subject.
- **Folders** — the real directory tree as it sits on disk, with recursive
  counts and an "include subfolders" toggle. Folder nodes are keyed by path, so
  your place survives a re-index.

Search supports natural-language queries with type filters and sort hints, plus
semantic similarity via local embeddings.

**Find similar** works in two tiers: the same semantic index search uses, and —
when an asset has no embedding yet — folder, type, filename and date affinity,
which needs no indexing at all and reports *why* each match was chosen.

**Grid tiles are resizable** with a six-step size slider, remembered between
sessions, and are served as small cached renditions rather than full-size
originals.

### Indexing service — Shipped
A skinny strip at the bottom of the vault runs indexing on demand. **Index now**
precaches thumbnails and builds the semantic index across everything indexed,
as a background service that chains bounded passes until the whole catalog is
covered.

It reports what it is doing in its own words — "Prepared 1,036 thumbnails —
40,339 of 220,644 checked…" — with a progress bar and a **Stop** button. It runs
below interactive work and pauses between batches, so browsing and generation
stay responsive; a grid tile still served in ~110 ms while it was running.
Progress is durable, so a restart costs at most one pass, and pressing Index now
twice never doubles the work.

### Portable library bundles — Shipped
Export the whole library (with owner/visibility metadata) as one file and
re-import it elsewhere. Import dedupes deterministically by
type/category/owner/visibility/name and reports duplicates and failures inline.

### Cloud storage — Partial
Google Drive backup mirrors every save. A shared provider abstraction exists for
Dropbox / OneDrive / S3-compatible, and Settings exposes the choice, but only
Drive is live; unsupported providers stay explicit and local-safe.

---

## 6. Export

### Formats — Shipped
PNG, JPG (with a quality prompt), SVG, PDF, JSON, and a self-contained offline
HTML bundle. Exports are marked when generative AI content is present.

### Machine embroidery (.DST) — Shipped
Export any page to Tajima .DST. Choose thread-colour count, physical width, fill
density and max stitch length, and optionally skip the background (transparent
areas and the border-dominant colour are auto-detected and never stitched). The
engine produces real running-stitch fills with tie-in/tie-off locks and proper
jump-vs-travel logic. The preview offers zoom/pan and a **stitch-out simulator**
that draws the needle path in sewing order.

### Cricut fabrication export (.SVG) — Shipped
Convert the active artboard to a high-contrast monochrome mask, trace it into
closed and physically scaled vector paths, remove small islands, simplify nodes,
and automatically nest independent elements across custom material sheets with
optional 90-degree rotation. Stacked-profile mode computes layers from target
depth and stock thickness, adds per-layer registration score marks, and exports
one SVG or a multi-sheet ZIP with a fabrication manifest. Processing stays local.
See [CRICUT_EXPORT.md](CRICUT_EXPORT.md) for the dimensional contract and current
extruded-silhouette scope.

### Unified Fabrication Studio — Shipped

One left-rail family now groups 3D generation/editing, the 3D Asset Vault,
Cricut Studio, and a five-axis CNC foam-cutter planner. Right-click the family
for subtools or choose Fabrication Studio from the workspace circular selector.
The library includes process-filtered material guidance and a complete,
searchable hardware inventory with subsystem/axis filters, locally persisted
acquired counts, progress, safety-critical markers, and CSV export. See
[FABRICATION_STUDIO.md](FABRICATION_STUDIO.md).

Selected 3D models also have a context-sensitive **Unfold** command: right-click
the model and choose Unfold to create an origami-style triangular net directly
on the canvas. The client-side pipeline simplifies dense GLB/GLTF meshes, avoids
overlapping faces, creates cut/fold lines and glue tabs, splits difficult models
into islands, and packs dimensioned vector sheets with no required setup. A
local eight-candidate planner selects the strongest net and predicts 3D
fold-back confidence from topology, edge/area fidelity, watertightness, and
signed mountain/valley fold angles.

### Media export overlay — Partial
Single-canvas crop workflow (A1–A3) plus a frame-to-variant bridge (B1).
*Missing:* the full campaign workspace — create/rename/duplicate/delete variants
and deterministic export-all.

### Sharing — Partial
Exports a PNG and opens Facebook/Instagram for manual upload. Direct posting
APIs are not implemented.

---

## 7. Interface

### Languages — Shipped
Eleven languages from the top-bar globe menu with automatic persistence.
**English, Russian and Ukrainian are at 100% UI coverage.** The rest fall back
to English string-by-string, so nothing renders blank. Spanish is next.

### Theme and ambience packs — Shipped
A pack can restyle every panel, button and font **and** populate the dashboard
with sprite animations and living background scenes, built purely from CSS and
PNG sprite sheets — no JavaScript ever ships inside a pack, so installing one is
always safe. Each animated pack brings its own rotating jokes/facts and a
frequency slider from *Occasionally* to *Annoying*. A zero-animation default is
always available, and everything disables under `prefers-reduced-motion`.
Bundled: the classic look, **Rococo**, and **Clarity — High Contrast**
(AAA-contrast surfaces, 3px borders, bold-yellow focus rings).

### Help → Technology — Shipped
Help → Technology opens a searchable reference to everything the app is built
on: 45 technologies across nine areas, each with what it does here and why it
was chosen over the alternatives. The filter searches the reasoning too, so
looking up a rejected option finds the entry explaining the decision. Stated
versions are checked against the real dependency list on every build, so the
page cannot quietly go out of date.

### Preferences — Shipped
Settings → Workspace: theme mode and accent palette, tool-rail hover labels,
number-drag hints, autosave, pipeline rail mode, job-completion notifications,
dashboard ambience, interface themes, dependencies, and login activity.

---

## 8. Integrations

- **MCP server** — exposes the local HTTP API as tools so Claude Desktop, Claude
  Code or any MCP client can drive the app. See [MCP.md](MCP.md).
- **Desktop** — Electron shell; the production server runs as an independent
  child process so a server crash cannot take the window down. See
  [DESKTOP.md](DESKTOP.md).
- **Mobile capture companion** — an Expo scaffold under `mobile-companion/`
  with a defined auth and upload contract. Not shipped as a product.

---

## 9. Known gaps

Tracked in [ROADMAP.md](ROADMAP.md); listed here so behaviour claims stay honest.

| Area | Gap |
|---|---|
| Background jobs | Meshy/Tripo/Hitem3D/Stability still polled from the browser — closing the tab abandons them |
| Channels | No saved channels, no load-as-selection |
| Media overlay | No full campaign-variant workspace |
| Social | No direct posting; manual export only |
| Auth | No Facebook sign-in |
| Cloud storage | Google Drive only in practice |
| Key vault | Encrypted at rest, but rotation policy and stronger authz still open |
| Scale | All persistence is filesystem JSON — single-node only |
