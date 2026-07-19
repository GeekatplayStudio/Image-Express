# Glossary — Canonical Terminology

This is the **single source of truth** for what we call things. Use these terms
in issues, docs, roadmaps, and conversation. Several of them differ from the
names still used inside the code (see the mapping table) — the canonical term
always wins in discussion; the code column tells you where to look.

## The hierarchy

```
Library ──▶ Album ──▶ Page ──▶ (Workspace, Canvas, Layers)
 (all       (a set    (one     ├─ Workspace: the whole editing area where layers live
  albums)    of        design   ├─ Canvas: the export boundary inside the workspace
             pages)     spread)  └─ Layers: the objects (images, text, shapes, …)
```

## Terms

| Term | Definition |
|---|---|
| **Workspace** | The whole editing area where **all layers reside** — the full Fabric surface you pan and zoom, including anything sitting off to the sides. |
| **Canvas** | The export boundary **inside** the workspace: the rectangle where placed assets will be exported. **Anything outside the canvas is removed on export.** |
| **Layer** | A single object on a page — an image, text block, shape, adjustment, etc. Layers live in the workspace; only the parts inside the canvas export. |
| **Page** | One canvas together with all its layers — a single design surface. Pages are what you switch between and see in the 3D stack view. |
| **Album** | A collection of pages (a multi-page design / project). |
| **Library** | The collection of **all albums** — the user's whole body of work. |

## Mapping to the code (important)

The codebase predates this terminology and still uses older names. When you read
code, translate:

| Canonical term | In the code it's called… | Where |
|---|---|---|
| **Canvas** (export boundary) | `artboard` / `artboardRect` | `fabric-utils.ts`, `useEditorTopCanvasControls.ts`, most editor code |
| **Workspace** (full editing surface) | the Fabric `canvas` instance / viewport | everywhere a `fabric.Canvas` is used |
| **Page** | `canvas` (a `Canvas` entry in a project) | `lib/multicanvas/projectStore.ts`, `useMultiCanvasProject.ts` |
| **Album** | `project` (a `Project`) | `lib/multicanvas/projectStore.ts`, `Dashboard.tsx` |
| **Library** | `Federation` / the projects state (all projects) | `lib/multicanvas/projectStore.ts` (`image-express-projects` in localStorage) |

> ⚠️ The biggest foot-gun: the code word **`canvas`** means two different
> canonical things. A `fabric.Canvas` instance is the **Workspace**; a
> multicanvas `Canvas` record is a **Page**. The canonical **Canvas** (export
> boundary) is the code's **`artboard`**. Always disambiguate by context.

User-facing UI already uses the canonical album/page in places (e.g. the
Dashboard says "album" and "pages"); internal identifiers and most docs do not
yet. New user-facing strings should use the canonical terms.

## Tools that act on these

- **Crop (layer)** — trims the sides of a single **image layer**
  (Properties → Crop, four sliders). Non-destructive. Does **not** touch the
  page or canvas.
- **Adjust (page)** — the toolbar crop/adjust tool resizes the **Canvas**
  (export boundary) for the whole **page**. It is page-scoped, never per-layer.
