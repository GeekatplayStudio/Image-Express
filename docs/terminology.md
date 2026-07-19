# Terminology

The canonical object names for Image Express. **These are enforced** — see
`npm run audit:terms`. Use them in UI strings, docs, and new code.

## The hierarchy

```
Workspace          the whole editing environment (chrome, panels, rails)
 └─ Canvas         the white artboard in the centre of the workspace
     └─ Layers     the objects placed on the canvas
         ↓ combine into
     Page          one composed unit of work (what the user saves/opens)
         ↓ collect into
     Album         a set of related pages
```

Read it as: *layers sit on the **canvas**; a finished canvas is a **page**;
pages are collected into an **album**.*

## Rules

### "Canvas" is reserved

`Canvas` means **only** the white artboard in the centre of the workspace —
the drawing surface itself. It is correct in:

- "Add to Canvas", "Place on Canvas", "Center canvas"
- "Canvas Size", "Canvas background", "Canvas Preview"
- "Double-click empty canvas to recenter"

It is **wrong** as a name for a document. A saved, openable, nameable unit is
a **Page**, never a canvas. "New canvas", "Duplicate canvas", "Switch between
canvases" are all violations — they mean Page.

### Banned terms and their replacements

| Do not use | Use instead | Note |
|---|---|---|
| Design (as a noun for a document) | Page | "Save design" → "Save page" |
| Canvas (as a document) | Page | the artboard sense stays |
| Project | Album | |
| Federation | Album (plural: Albums) | legacy name for the album overview |
| Stack | Album | the 3D overview is the **Album view** |

### Permitted exceptions

Two uses of "project" are about *software*, not user content, and are
deliberately kept:

- `settings.workspace.projectDependencies` — npm dependencies of the app
- `docs.moreHelp.body` — support for the open-source project

Anything else matching a banned term is a defect.

## Placeholders

Placeholder names inside translated strings are read by translators and should
match the glossary too: `{pages}`, not `{canvases}`.
