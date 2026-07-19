# Theme Packs — Implementation Specification

**Audience:** an implementing AI model (e.g. Claude Sonnet) or developer working in this repository.
**Status:** approved design, ready to implement.
**Scope:** purely visual, installable UI theme packs — colors, window/panel shapes, fonts, icon styling, decorative effects. **Zero functional changes.** Canvas document content (user artwork) is never themed.

---

## 1. Current state of theming (what already exists — do not break it)

The app is Next.js (App Router) + Tailwind v4 + Electron shell, with an existing two-axis theme system:

| Mechanism | File | Notes |
|---|---|---|
| Mode (dark/light/system) | [src/lib/themePreferences.ts](../src/lib/themePreferences.ts) | Sets `data-theme-mode` on `<html>`, persisted in `localStorage` key `image-express-theme-preferences`, applied pre-hydration via `buildThemePreferencesInitScript()` injected in [src/app/layout.tsx](../src/app/layout.tsx) |
| Accent preset (ocean/ember/meadow/violet) | same file + [src/app/ui-theme.css](../src/app/ui-theme.css) | Sets `data-theme-accent` on `<html>`; CSS selects on `:root[data-theme-accent='…']` |
| Semantic CSS variables | [src/app/globals.css](../src/app/globals.css) | `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`, `--tool-accent` etc., mapped into Tailwind via `@theme` block |
| Canvas-side JS tokens | [src/lib/theme-tokens.ts](../src/lib/theme-tokens.ts) | `AppThemeTokens` per accent preset (circular menu colors, swatches). Read at runtime via `getAppTheme()` keyed off `document.documentElement.dataset.themeAccent` |
| Settings UI | [src/components/settings/tabs/workspace/AppearancePanel.tsx](../src/components/settings/tabs/workspace/AppearancePanel.tsx) | Appearance section inside Settings → Workspace tab, uses `useWorkspacePreferences` hook |
| Sync component | [src/components/ThemePreferenceSync.tsx](../src/components/ThemePreferenceSync.tsx) | Listens for `image-express:theme-preferences-changed` event |
| Server data dir convention | [src/lib/server/user-auth-store.ts:36](../src/lib/server/user-auth-store.ts) | `path.join(process.cwd(), 'data')` — themes will follow this |

**Key architectural decision:** Theme Packs are a **third, orthogonal axis** layered on top. Mode and accent keep working; a theme pack may optionally *lock* them (e.g. the Mac 1-bit theme forces its own palette regardless of dark/light).

---

## 2. Concept

- A **theme pack** is a folder with a `theme.json` manifest + a `theme.css` stylesheet (+ optional fonts/assets).
- **Built-in themes** ship in `public/themes/<themeId>/`.
- **Downloaded themes** are a specially structured `.zip`; the app unpacks them server-side into `data/themes/<themeId>/` and serves files through an API route.
- The active theme is applied by setting `data-ui-theme="<themeId>"` on `<html>` and injecting a `<link rel="stylesheet">` pointing at the theme's CSS. The **default theme injects nothing** — the app looks exactly as it does today.
- Users pick/activate themes by clicking a card in **Settings → Workspace → Appearance**, in a new "Interface Themes" section (the user calls this the "properties window"; use the existing AppearancePanel).
- Everything is same-resolution, vector/CSS-based. No pixelation, no low-res assets. Retro feel comes from **shapes, colors, borders, fonts, and effects**, not from downscaling.

---

## 3. Theme pack file format

### 3.1 Folder / zip structure

```
<themeId>.zip
└── theme.json          (required, must be at zip root)
    theme.css           (required)
    preview.svg|png     (required — card thumbnail, ~320×200)
    fonts/*.woff2       (optional)
    assets/*.svg|png    (optional — decorative images referenced from theme.css via relative url())
```

Rule: all `url()` references inside `theme.css` must be **relative** (`fonts/x.woff2`, `assets/y.svg`). No absolute URLs, no external hosts (validated at install).

### 3.2 `theme.json` manifest schema

```jsonc
{
  "schemaVersion": 1,              // required, integer; reject if > supported
  "id": "macos-classic",           // required, ^[a-z0-9][a-z0-9-]{1,49}$ — becomes folder name
  "name": "Original Apple OS",     // required, display name
  "description": "1-bit black & white, late-1980s classic.",
  "author": "Creative Flow",
  "version": "1.0.0",
  "stylesheet": "theme.css",       // relative path inside pack
  "preview": "preview.svg",
  "lockMode": "light",             // optional: "light" | "dark" — force resolved mode while active
  "lockAccent": true,              // optional: hide/disable the accent-preset picker while active
  "fonts": [                       // optional, self-hosted only
    { "family": "ChicagoFLF", "src": "fonts/chicago.woff2", "weight": "400", "style": "normal" }
  ],
  "appTokens": {                   // optional: full or partial override of AppThemeTokens
    "primaryHex": "#000000",       // (see §5.3 — merged over the active accent preset)
    "paintSwatches": ["#000000", "#ffffff", "..."]
  }
}
```

Loader must **ignore unknown keys** (forward compatibility) and reject packs whose `id` collides with a built-in theme id.

### 3.3 The CSS contract

`theme.css` must scope every rule under `:root[data-ui-theme='<id>']` (validated loosely at install: warn if the attribute selector string is absent). A theme works by overriding the variable contract below — plus any additional scoped rules it wants (scanlines, title-bar decorations, scrollbar styling).

**Tier 1 — existing variables (already consumed app-wide, override for free):**
`--background --foreground --card --card-foreground --popover --popover-foreground --primary --primary-foreground --tool-accent --tool-accent-foreground --secondary --secondary-foreground --muted --muted-foreground --accent --accent-foreground --destructive --destructive-foreground --border --input --ring --radius --ui-brand-gradient-start/mid/end --ui-avatar-gradient-start/end --ui-slider-accent`

**Tier 2 — new variables to introduce (Phase 1 refactor, §5.1):**

```css
:root {
  /* shape */
  --ui-radius-panel: var(--radius);      /* modals, floating panels */
  --ui-radius-control: calc(var(--radius) - 2px); /* buttons, inputs, selects */
  --ui-radius-pill: 9999px;              /* chips, toggles */
  --ui-border-width: 1px;
  --ui-panel-border: 1px solid var(--border);
  --ui-panel-shadow: 0 8px 30px rgb(0 0 0 / 0.25);
  /* typography */
  --ui-font-sans: Inter, Arial, Helvetica, sans-serif;
  --ui-font-mono: ui-monospace, "Cascadia Mono", monospace;
  /* chrome */
  --ui-titlebar-bg: var(--card);
  --ui-titlebar-fg: var(--card-foreground);
  --ui-scrollbar-thumb: var(--secondary);
  /* icons (lucide is stroke-based → pure CSS restyling) */
  --ui-icon-stroke-width: 2;
  --ui-icon-color: currentColor;
  /* effects layer */
  --ui-screen-filter: none;              /* e.g. CRT: contrast/sepia filter on the app shell */
  --ui-overlay-opacity: 0;               /* opacity of the .ui-theme-overlay effects div */
}
```

`body { font-family: var(--ui-font-sans); }` in globals.css replaces the current hard-coded stack.

---

## 4. Runtime architecture

### 4.1 New module `src/lib/ui-themes.ts` (client)

```ts
export type UiThemeManifest = { /* mirrors §3.2, validated */ };
export type InstalledTheme = UiThemeManifest & {
  source: 'builtin' | 'installed';
  baseUrl: string; // '/themes/<id>/' or '/api/themes/files/<id>/'
};

export const UI_THEME_STORAGE_KEY = 'image-express-ui-theme';
export const UI_THEME_CHANGED_EVENT = 'image-express:ui-theme-changed';
export const DEFAULT_UI_THEME_ID = 'default';

export async function listThemes(): Promise<InstalledTheme[]>;   // GET /api/themes
export function applyUiTheme(theme: InstalledTheme | null): void; // see below
export function loadActiveThemeId(): string;                      // localStorage, fallback 'default'
export async function activateTheme(id: string): Promise<void>;  // persist + apply + dispatch event
export function buildUiThemeInitScript(): string;                 // pre-hydration FOUC guard, see §4.3
```

`applyUiTheme` behavior:
1. Set `document.documentElement.dataset.uiTheme = id` (or delete for `default`).
2. Manage a single `<link id="ui-theme-stylesheet" rel="stylesheet">`: point `href` at `baseUrl + stylesheet` for non-default themes; remove for default. Swap by loading the new link first, removing the old on `load` (no flash).
3. Inject `@font-face` rules (from `fonts[]`) into a `<style id="ui-theme-fonts">` element with absolute-ized `src` URLs.
4. If `lockMode` is set, re-apply the resolved mode: set `data-theme-mode` to the locked value (do **not** overwrite the user's stored mode preference — restore it on theme deactivation by re-running `applyThemePreferences(loadThemePreferences())`).
5. Dispatch `UI_THEME_CHANGED_EVENT`.

### 4.2 Server side

**Storage:** `data/themes/<themeId>/` (follows the `user-auth-store` convention). Built-ins live in `public/themes/<themeId>/` and are served statically.

**New module `src/lib/server/ui-theme-store.ts`:**
- `listInstalledThemes()` — scan `data/themes/*/theme.json`, parse + validate, skip invalid folders.
- `installThemeFromZip(buffer)` — validate + extract (see §6), returns manifest. Extraction goes to a temp dir first, then atomic rename to `data/themes/<id>/` (replace-on-reinstall allowed after confirmation flag).
- `uninstallTheme(id)` — remove folder; reject built-in ids.

**New API routes** (follow existing route conventions in `src/app/api/`):

| Route | Method | Purpose |
|---|---|---|
| `/api/themes` | GET | Merged list: built-ins (hardcoded registry of the 4 shipped ids reading `public/themes`) + installed. Returns `InstalledTheme[]` |
| `/api/themes/install` | POST | Body: multipart file upload **or** `{ url }` to download. 20 MB limit. Returns manifest or 400 with a human-readable reason |
| `/api/themes/[id]` | DELETE | Uninstall (installed themes only) |
| `/api/themes/files/[id]/[...path]` | GET | Static file server for installed themes. Must resolve within `data/themes/<id>/` (path-traversal guard: `path.resolve` + prefix check), whitelist extensions `.css .json .woff2 .woff .ttf .otf .svg .png .webp`, correct Content-Type, `Cache-Control: no-cache` (theme can be reinstalled) |

If auth middleware exists on other API routes, mirror it here.

### 4.3 FOUC prevention

Extend the boot script pattern: in [src/app/layout.tsx](../src/app/layout.tsx), alongside `buildThemePreferencesInitScript()`, inject `buildUiThemeInitScript()` which reads `UI_THEME_STORAGE_KEY` and, if a non-default theme with a cached `{ id, stylesheetUrl, lockMode }` snapshot (store this snapshot in the same localStorage value on activation) is present, synchronously writes `data-ui-theme` and a `<link>` tag via `document.write`-free DOM insertion, and applies `lockMode` to `data-theme-mode`. Wrap in try/catch falling back to default, same as the existing script.

### 4.4 Effects overlay (for CRT etc.)

Add one `div.ui-theme-overlay` (pointer-events: none; position: fixed; inset: 0; z-index above all UI) rendered once in the root layout shell. Default CSS: `opacity: var(--ui-overlay-opacity); display: contents-none`. Themes style it (scanlines gradient, vignette) purely via their scoped CSS. Also apply `filter: var(--ui-screen-filter)` on the app-shell wrapper (NOT on `<html>`, to avoid breaking `position: fixed` stacking — pick the top-level app container in `page.tsx`). **Performance guard:** effects must be static CSS (gradients, box-shadows); no animated filters, no per-frame JS.

---

## 5. Refactor phases (implementation order)

### Phase 1 — variable contract (no visible change)
1. Add Tier-2 variables to `globals.css` `:root` with values matching today's look; switch `body` font-family to `var(--ui-font-sans)`.
2. Sweep components for hard-coded rounded classes on **chrome** (modals, panels, toolbars, inputs) and migrate to the semantic radii. Practical approach: Tailwind v4 — redefine `--radius-lg/md/sm` in the `@theme` block to the new vars (already indirected via `--radius`), and add `--radius-panel`, `--radius-pill` theme keys. `rounded-full` on chrome → `rounded-[var(--ui-radius-pill)]` (or a utility class `.ui-pill`). Do this for the major chrome surfaces only (Toolbar, PropertiesPanel, SettingsModal, Dashboard cards, modal shells) — perfect coverage is not required for v1; themes degrade gracefully.
3. Scrollbar CSS in globals.css → use `--ui-scrollbar-thumb`.
4. Lucide icons: the app renders them with default stroke. Add a global rule `svg.lucide { stroke-width: var(--ui-icon-stroke-width); }` — verify lucide-react emits the `lucide` class (it does).

### Phase 2 — runtime + server (theme engine)
`src/lib/ui-themes.ts`, `ui-theme-store.ts`, the 4 API routes, layout boot script, overlay div, manifest validation (write it once, shared client/server, in `src/lib/ui-themes-shared.ts` since server modules can't import client modules).

### Phase 3 — Settings UI
In `AppearancePanel.tsx` (or a sibling `InterfaceThemesPanel.tsx` rendered by `WorkspaceTab`), add an **Interface Themes** section:
- Grid of theme cards: preview image, name, author/version, `source` badge ("Built-in" / "Installed"), active ring (`border-primary bg-primary/10` pattern already used for accent buttons).
- Click card → `activateTheme(id)` — **applies instantly** (consistent with accent behavior).
- "Install theme…" button → file picker for `.zip` → POST to `/api/themes/install` → on success refresh list + toast; on failure show the server's reason string.
- Secondary "Install from URL" input (downloads server-side; the URL is user-provided).
- Trash icon on installed (non-active, non-built-in) themes → confirm → DELETE.
- When active theme has `lockAccent`, disable the accent-palette grid with a note "Controlled by the active theme". Same for mode select when `lockMode` set.
- i18n: run all new strings through `useI18n()`/`t()` following existing keys style (`settings.workspace.*`).

### Phase 4 — canvas-adjacent tokens (optional, do last)
`getAppTheme()` in `theme-tokens.ts`: after resolving the accent preset, shallow-merge `appTokens` from the active theme manifest (expose the active manifest via a module-level cache in `ui-themes.ts`). This lets the Mac/CP-M themes recolor the circular context menu and default swatches. The `UI_THEME_CHANGED_EVENT` already gives consumers a refresh hook. **Never** theme the user's document content itself.

### Phase 5 — the four shipped themes (§7) + tests (§8)

---

## 6. Zip install validation (security — implement all of these)

1. **Size limits:** zip ≤ 20 MB, uncompressed total ≤ 60 MB, ≤ 200 entries (zip-bomb guard).
2. **Zip-slip:** reject any entry whose normalized path escapes the extraction root (`..`, absolute paths, drive letters, backslash tricks). Normalize with `path.posix`.
3. **Extension whitelist:** only `.json .css .woff2 .woff .ttf .otf .svg .png .webp`. Reject anything else (no `.js`, no `.html`).
4. **Manifest validation:** parse `theme.json`, enforce schema §3.2 (strict id regex; `stylesheet`/`preview`/`fonts[].src` must be relative paths that exist in the zip).
5. **CSS sanitation:** reject `theme.css` containing `@import`, `url(http`, `url(//`, `url("http`, `expression(`, `javascript:` (case-insensitive scan). Relative `url()` only. Also strip/reject `<` characters in SVG-referencing data URIs? — keep simple: allow `data:` URIs for images/fonts only (`data:image/`, `data:font/`).
6. **SVG assets:** reject SVG files containing `<script`, `onload=`, `onerror=`, `javascript:` (they render via `<img>`/CSS `url()` which doesn't execute scripts, but defense-in-depth is cheap).
7. **Collision:** installing over an existing installed theme requires `overwrite: true`; installing over a built-in id is always rejected.
8. Use `yauzl` or `adm-zip` (check `package-lock.json` first — `tar` override exists; prefer a dependency already in the tree; if none, add `yauzl` as it streams and enforces limits cleanly).
9. Extract to `data/.tmp-theme-<random>/`, validate everything, then rename into place. Clean temp dir on any failure.

Note: theme CSS can still restyle the whole UI (that's its job) — the sandbox goal is *no script execution and no network beacons*, which the rules above achieve.

---

## 7. Built-in vs. authored themes — where they actually live

**Only the virtual `default` theme ships in the git repository / public build.** Every other theme pack (retro or otherwise) is authored and built in a **local, gitignored workspace** and is never committed:

- Source: `theme-packs/<id>/` (theme.json, theme.css, preview.svg, fonts/, assets/) — gitignored via `/theme-packs/` in `.gitignore`.
- Built zips: `theme-packs/dist/<id>.zip` — same gitignore rule.
- Installed copies at runtime: `data/themes/<id>/` — gitignored via `/data/`.

`node theme-packs/build.mjs [id]` builds one or all packs into zips. A user installs a zip through Settings → Workspace → Interface Themes, which unpacks it into `data/themes/<id>/`. **Removing a theme through the UI only deletes `data/themes/<id>/`** — the author's source in `theme-packs/<id>/` is untouched, so rebuilding and reinstalling reproduces it exactly. There is no code path that copies from `theme-packs/` into `data/` automatically; the zip-upload/URL-install API is the only route in.

This split exists so that:
1. A `git clone` of this repo — and anything pushed to GitHub — contains **only** the default theme. No retro/branded packs are ever public.
2. Installed packs can only be added by a user explicitly downloading and installing a zip through the Settings UI (or the author testing their own local build) — never by pulling from the app's own source tree.

### 7.1 `default` — Creative Flow (active by default)
Virtual theme: no folder needed beyond a registry entry (no stylesheet, preview generated from current brand gradient). Selecting it removes `data-ui-theme` and the injected link. Everything looks exactly as today. `lockMode`/`lockAccent` absent — mode + accent pickers fully functional.

### 7.2 Retro/period-inspired packs — legal guardrails for authors

Retro OS-styled packs are period **aesthetics**, not the products themselves — copyright generally does not protect a broad visual style. But avoid reproducing anything that could read as a specific proprietary product or imply affiliation with its maker:

- **Names/ids must not be a product's exact trademark.** Use "inspired by" language instead: e.g. a pack inspired by a 1980s home-computer desktop is **"Chunky Desktop"**, not "Amiga Workbench"; a pack inspired by classic 1-bit Mac System is **"Platinum Mono"**, not "Macintosh" or "Apple OS"; a pack inspired by a DOS word processor is **"Blue Screen Word Processor"**, not "WordPerfect". See the actual pack list in `theme-packs/` for the current naming (each `theme.json` description says what it's "inspired by").
- **No proprietary logos, icons, wallpapers, or system sounds.** Every visual element here is CSS (colors, borders, shadows, radii) or hand-authored SVG shapes — never a copied icon set or bitmap asset from a real OS.
- **Don't reproduce a product's exact distinctive UI text/labels** (e.g. a literal status-bar format like `Doc 1 Pg 1 Ln 1" Pos 1"`, or an app's literal window-title like "Program Manager") — genericize preview mockup text.
- **Fonts: lead with free/open alternatives**, not proprietary system font names (Chicago, Geneva, Tahoma, MS Sans Serif). Current packs use Liberation Sans, IBM Plex Sans/Mono, Cascadia Mono, Inter, JetBrains Mono, or generic Helvetica/Arial fallbacks — referencing a system font by name in a CSS fallback stack (so the browser only uses it if the user's OS happens to have it) is standard practice and not itself infringing, but the *primary* choice should always be a free font.
- **Don't blend so many signature details from one product that it becomes a pixel-for-pixel trade-dress copy.** Mixing influences (e.g. blocky bevels from one era with a different era's palette) keeps a pack clearly original.
- This is not legal advice; if these packs become part of a commercial release, have IP counsel review the most faithful ones before launch.

---

## 8. Testing (Jest, follow existing `__tests__` conventions)

1. **Manifest validation unit tests** (`ui-themes-shared`): valid manifest passes; bad id, missing stylesheet, absolute paths, unknown schemaVersion rejected; unknown keys ignored.
2. **Zip install tests** (`ui-theme-store`): zip-slip entry rejected; oversized rejected; disallowed extension rejected; `@import`/`url(http` in CSS rejected; happy path extracts and lists; uninstall of built-in id rejected.
3. **Client apply tests** (jsdom): `applyUiTheme` sets/removes `data-ui-theme` and the link element; `lockMode` overrides `data-theme-mode` and restores on switch back to default; event dispatched.
4. **Boot script:** `buildUiThemeInitScript()` output is syntactically valid (`new Function(...)` doesn't throw) — mirrors existing pattern.
5. **File-serving route:** path traversal (`/api/themes/files/x/../../secret`) → 404/400; wrong extension → 400.
6. Existing theme tests must keep passing (mode/accent behavior unchanged when theme = default).

---

## 9. Enhancements (in-scope niceties, clearly marked optional)

- **Live hover preview** (v1.1): on card hover ≥400 ms, apply theme temporarily; revert on mouse-out. Trivial given `applyUiTheme` is idempotent.
- **"Export current theme"**: zip up any installed theme for sharing (GET `/api/themes/[id]/export`).
- **Reduced-motion/accessibility:** honor `prefers-reduced-motion` (no animated effects — already mandated); ensure each shipped theme keeps ≥4.5:1 contrast for body text (the palettes above do).
- **Theme "extras" flags** in manifest (`"effects": ["scanlines","vignette"]`) with a per-user toggle to disable effects while keeping colors — good for the CRT theme on low-end GPUs.
- **Future sound/cursor packs:** out of scope; the manifest's ignored-unknown-keys rule leaves room.

## 10. Non-goals / guardrails (repeat for the implementer)

- No functional/behavioral changes; no layout dimension changes (widths, heights, spacing stay identical — only radius, border, color, font, shadow, decorative overlays).
- No JS execution from theme packs, ever.
- No theming of canvas content, exports, or generated images.
- No external network fetches from theme CSS.
- Don't regress the pre-hydration flash guards or the existing accent/mode systems.

---

## 11. Implemented extensions (as-built addendum)

Everything in §1-§10 shipped, plus the following systems. Pack authoring
sources live in the gitignored `theme-packs/` and `ambience-packs/` folders
(see their READMEs for formats); only the loader/runtime engines below are
committed. Since the sprite-theater refactor, animation behavior code ships
*inside* the packs (plain `.mjs` ES modules) rather than being prebuilt into
the app — installing a pack therefore installs code that will run in the app,
so only install packs from trusted sources.

### 11.1 Sprite Theater (extended/animated themes)
Optional `"spriteTheater"` block in `theme.json`: sprite-sheet PNGs +
declarative scene configs + one behavior module per scene type at
`scenes/<type>.mjs` in the pack. `src/components/SpriteTheater.tsx` is the
loader/runtime: it dynamic-imports each referenced scene module from the
pack's base URL and schedules/draws the returned scene. Stock modules
(`flyAcross, chase, idleVisit, edgeWalk, horde, build, rodeo, parade, sentry,
choir, leapfrog, wordFormation, frolic, herdCursor, concert, danceParty,
pyramid, fetch, classroom`) live in `theme-packs/scene-modules/` and are
copied into each pack that uses them (see theme-packs/README.md).
Animated themes show a ✨ "Animated" badge on their card, and a bottom-center
frequency slider ("Occasionally" → "Annoying", localStorage
`image-express-sprite-frequency`) appears while one is active.

### 11.2 Dashboard Ambience packs
A parallel installable pack type (`ambience.json`, `data/ambience/`,
`/api/ambience/*`) rendering hub-only background effects. Each pack ships its
own engine as `effect.mjs`, dynamic-imported by the loader
`src/components/DashboardAmbience.tsx`. Stock engines in
`ambience-packs/effect-modules/`: `matrix, constellation, aurora, bokeh,
floating-images, sprite-scape` (living backdrop with `flyLoop / perch / patrol /
buzz / shooter` actors and an optional `wordFlock` that re-forms into words).

### 11.3 Theme quote packs
Optional `"quotes": [{text, author?}]` (1-60) in `theme.json` replaces the
dashboard quote pool while the theme is active (`Dashboard.tsx` resolves via
`UI_THEME_CHANGED_EVENT`).

### 11.4 Word engine
The 3x5 pixel font (A-Z, space, !, ?) used to arrange actors into words is
embedded in the modules that need it (`scene-modules/wordFormation.mjs` and
`effect-modules/sprite-scape.mjs`) so each pack stays self-contained.

### 11.5 Support links
Both install panels link to https://geekatplay.gumroad.com/ ("Get more themes &
support Vlad"), and `SupportCorner.tsx` renders the collapsible bottom-right
heart button.
