# Terminology — Canonical Names

**The single source of truth for what we call things.** Use these terms in UI
strings, docs, issues, roadmaps, and new code. Parts of this are **enforced** —
see `npm run audit:terms`.

> Consolidated 2026-08-07 from `GLOSSARY.md` and `terminology.md`, which both
> claimed to be canonical and **disagreed** on what "Workspace" meant. §1
> records how that was resolved.

---

## 1. The disagreement, resolved

The two former docs defined **Workspace** two different ways:

- *"The whole editing area where all layers reside — the full Fabric surface you
  pan and zoom."*
- *"The whole editing environment (chrome, panels, rails)."*

Both senses exist in the code (`EditorWorkspaceShell` is chrome;
`DesignCanvas`'s "workspace background" is the Fabric surface), which is exactly
why the ambiguity survived. The resolution:

| Term | Means | Do not use it for |
|---|---|---|
| **Workspace** | The whole editing **environment** — chrome, rails, panels, and the canvas stage together. This is the sense used by Settings → Workspace and `EditorWorkspaceShell`. | The Fabric drawing surface |
| **Canvas stage** | The pannable, zoomable Fabric surface that holds layers, including anything parked off to the sides. | Anything user-facing — prefer "workspace" in UI copy |
| **Canvas** | The **export boundary**: the artboard rectangle. Anything outside it is removed on export. | A saved document — that is a **Page** |

Both former docs already agreed that **Canvas** means the artboard, so nothing
about the enforced rules changed.

---

## 2. The hierarchy

```
Library ──▶ Bookshelf ──▶ Album ──▶ Page ──▶ (Canvas, Layers)
 (all        (a set of     (a set    (one design surface:
  shelves)    albums;       of        one canvas + its layers)
              a resource    pages)
              boundary)
```

Read it as: *layers sit on the **canvas**; a canvas plus its layers is a
**page**; pages collect into an **album**; albums stand on a **bookshelf**;
all shelves together are the **library**.*

| Term | Definition |
|---|---|
| **Layer** | One object on a page — image, text, shape, adjustment. Layers live on the canvas stage; only the parts inside the canvas export. |
| **Canvas** | The export boundary inside the workspace. |
| **Page** | One canvas together with all its layers — a single design surface. What you save, name and open. Pages are what the 3D stack view shows. |
| **Album** | A collection of pages (a multi-page design). |
| **Bookshelf** | A collection of albums, and a **hard resource boundary**: linked layers never sync across shelves. The widest zoom level in the 3D stack view. Not the Asset Vault's `Bookcase` (a saved collection of vault *assets*). |
| **Library** | All bookshelves — the user's whole body of work. |

---

## 3. Enforced rules

### "Canvas" is reserved

`Canvas` means **only** the artboard — the drawing surface itself. Correct uses:

- "Add to Canvas", "Place on Canvas", "Center canvas"
- "Canvas Size", "Canvas background", "Canvas Preview"
- "Double-click empty canvas to recenter"

It is **wrong** as a name for a document. A saved, openable, nameable unit is a
**Page**. "New canvas", "Duplicate canvas", "Switch between canvases" are all
violations — they mean Page.

### Banned terms

| Do not use | Use instead | Note |
|---|---|---|
| Design (as a noun for a document) | Page | "Save design" → "Save page" |
| Canvas (as a document) | Page | the artboard sense stays |
| Project | Album | |
| Federation | Album (plural: Albums) | legacy name for the album overview |
| Stack | Album | the 3D overview is the **Album view** |

### Permitted exceptions

Two uses of "project" are about *software*, not user content, and are kept
deliberately:

- `settings.workspace.projectDependencies` — npm dependencies of the app
- `docs.moreHelp.body` — support for the open-source project

Anything else matching a banned term is a defect.

### Placeholders

Placeholder names inside translated strings are read by translators and must
match this glossary: `{pages}`, not `{canvases}`.

---

## 4. Mapping to the code

The codebase predates this vocabulary. When reading code, translate:

| Canonical | In the code | Where |
|---|---|---|
| **Canvas** (export boundary) | `artboard` / `artboardRect` | `fabric-utils.ts`, `useEditorTopCanvasControls.ts` |
| **Canvas stage** | the `fabric.Canvas` instance / viewport | anywhere a `fabric.Canvas` is used |
| **Page** | `canvas` (a `Canvas` entry in a project) | `lib/multicanvas/projectStore.ts` |
| **Album** | `project` (a `Project`) | `lib/multicanvas/projectStore.ts`, `Dashboard.tsx` |
| **Bookshelf** | `Bookshelf` (`bookshelfId` on each `Project`) | `lib/multicanvas/projectStore.ts`, `Editor/BookshelfScene.tsx` |
| **Library** | `Federation` / all projects state | `lib/multicanvas/projectStore.ts` (IndexedDB `image-express` / `projects-state`) |

> ⚠️ **The biggest foot-gun:** the code word `canvas` means two different
> canonical things. A `fabric.Canvas` instance is the **canvas stage**; a
> multicanvas `Canvas` record is a **Page**. The canonical **Canvas** (export
> boundary) is the code's **`artboard`**. Always disambiguate by context.

User-facing UI already uses canonical album/page in places (the Dashboard says
"album" and "pages"); internal identifiers largely do not. All *new* user-facing
strings must use the canonical terms.

---

## 5. Tools that act on these

- **Crop (layer)** — trims the sides of a single **image layer** (Properties →
  Crop, four sliders). Non-destructive. Does not touch the page or canvas.
- **Adjust (page)** — the toolbar crop/adjust tool resizes the **Canvas**
  (export boundary) for the whole **page**. Page-scoped, never per-layer.
