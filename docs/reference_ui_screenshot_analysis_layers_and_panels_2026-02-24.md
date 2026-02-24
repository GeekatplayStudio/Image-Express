# Reference UI Screenshot Analysis: Layers, Panel Cleanliness, and Action Placement

Date: 2026-02-24
Scope: Functional/UX analysis of provided screenshots, with direct comparison to current Image-Express behavior and a concrete implementation roadmap.

---

## 1) Executive Summary

The reference UI is cleaner mainly because it uses a strong **two-level hierarchy**:

1. **Global layer actions in a compact icon bar at panel top** (create, visibility mode, lock mode, mask/clip, arrange, delete, overflow).
2. **Per-layer row is mostly content-first** (eye + thumbnail + name + one contextual toggle), not a row full of micro-buttons.

In your current implementation, layer rows still expose many direct actions (lock, clip, visibility, delete) in-row, which is powerful but visually noisy. The key upgrade is to move high-frequency actions to the top action strip and keep row-level actions minimal/contextual.

---

## 2) Image-by-Image Detailed Functional Analysis

### Image A — Main editor with selected image + left “Size & position” + right “Layers”

Observed elements:
- Left tool strip with compact mono icons.
- Left flyout panel titled “Size & position” with:
  - active subtool header (“Move”),
  - auto-select mode dropdown,
  - alignment row,
  - advanced settings disclosure,
  - transform/crop quick links.
- Right “Layers” panel with top compact action row + blend/opacity controls + layer list.

Functional model inferred:
- Tool panels are **task-local** and context-switch quickly.
- Layers panel acts as **stack command center**, not a verbose inspector.
- Blend + opacity are treated as **stack-level, always-visible controls** near the top.

Cleanliness drivers:
- Strong vertical rhythm.
- Per-section grouping; low icon/text clutter.
- Limited persistent controls per layer row.

---

### Image B — Generative panel

Observed elements:
- Large mode button (“Generative fill”).
- Selection affordances (“Select more / less”).
- Mode dropdown (“Selection brush”).
- Core brush controls in a dedicated bounded card.
- Additional operations listed below as mode entries.

Functional model inferred:
- **Primary task first**, advanced paths second.
- Sliders grouped in one high-contrast “active controls” region.

Cleanliness drivers:
- Focused active region; secondary actions de-emphasized.

---

### Image C — Adjust panel

Observed elements:
- Preset strip at top.
- Named adjustment list grouped with dividers.
- Deep options (Levels/Curves/Light and color) clearly separated.

Functional model inferred:
- Progressive disclosure by category.
- Mental model: “quick presets first, precision controls next.”

---

### Image D — Select panel

Observed elements:
- Active submode (“Object selection”).
- Add/subtract/create selection actions.
- Advanced settings disclosure.
- Alternative selection tools list (brush/quick/lasso/marquee).
- Detect objects toggle + detected object chips.

Functional model inferred:
- Selection is treated as a **workflow state machine**, not just tool toggle.

---

### Image E — Retouch panel

Observed elements:
- Active retouch mode with controls card.
- Tool variants listed below.
- Toggle options (“sample all layers”, “remove after each stroke”).

Functional model inferred:
- Shared control template reused across retouch subtools.

---

### Image F — Quick actions panel

Observed elements:
- Scrollable grouped actions: Adjustments, Background, Auto, Lighting, Detected objects.
- Detect objects section mirrors Select panel object chips.

Functional model inferred:
- Aggregator panel provides shortcuts without forcing deep panel navigation.

---

### Image G — Effects panel

Observed elements:
- Search field at top.
- Category accordions.
- Visual effect cards with labels.

Functional model inferred:
- Visual browsing prioritized over raw parameter editing.

---

### Image H — Paint panel

Observed elements:
- Active mode (“Brush”) with controls card.
- Brush preset dropdown.
- Size/hardness/flow sliders.
- Advanced settings disclosure.
- Related modes listed below (eraser/bucket/gradient/smudge).

Functional model inferred:
- Consistent panel pattern reused from Select/Retouch/Generative.

---

### Image I — Shapes panel

Observed elements:
- Active shape (“Rectangle”).
- Advanced settings (corner radius + constraint modes + toggles).
- Other shape types listed below.
- Presets section.

Functional model inferred:
- Strong “active shape config + other shape switcher” split.

---

### Image J — Type panel

Observed elements:
- Add text CTA.
- Style presets and template tiles.

Functional model inferred:
- Creation-centric text entry point; then presets.

---

### Image K — Add image panel

Observed elements:
- Upload CTA.
- Search field.
- Categorized image collections with horizontal cards.

Functional model inferred:
- Asset acquisition integrated with curated discovery.

---

### Image L — Foreground color panel

Observed elements:
- Color wheel + square picker + hex + RGB fields + swatches.
- Foreground/background swap and eyedropper affordance.

Functional model inferred:
- Centralized, reusable color system panel.

---

### Image M — Layers panel (compact) + single row settings icon

Observed elements:
- Top icon action strip.
- Blend + opacity row.
- Layer row with eye + thumb + name + single “settings/tune” icon on right.

Functional model inferred:
- Row-level complexity intentionally constrained.
- Deeper layer edits likely opened via settings toggle.

This is the pattern you specifically requested.

---

### Image N — Layers + floating Properties card for selected layer

Observed elements:
- Selected layer shows settings toggle in emphasized style.
- Separate properties card appears (Dimensions, W/H/X/Y, lock ratio, transforms).

Functional model inferred:
- **Split panel strategy**:
  - layer list remains clean,
  - detailed per-layer controls opened in dedicated property surface.

---

### Image O — Layers with arrange mode + dedicated Properties panel below

Observed elements:
- Arrange icon highlighted.
- Layer order shown cleanly.
- Properties panel docked below layers.

Functional model inferred:
- Two synchronized panels (stack + inspector) with explicit mode focus.

---

### Image P — “Size & position” minimal variant

Observed elements:
- Very reduced set: mode, auto-select, align, advanced, transform/crop links.

Functional model inferred:
- Minimal defaults with deep options behind disclosure.

---

## 3) Cross-Screenshot Interaction Patterns (What Makes It Cleaner)

1. **Top action strip per panel**
   - Main actions are iconized and co-located.
2. **One-row = one responsibility**
   - Layer row does not carry every operation inline.
3. **Context card / secondary panel for detailed edits**
   - Settings are detached from list row.
4. **Progressive disclosure**
   - “Advanced settings” collapsed by default.
5. **Visual hierarchy consistency**
   - Header → primary mode → active controls card → secondary options.
6. **Reduced micro-control density**
   - Fewer tiny hover-only icons in row improves scan speed.

---

## 4) Current Image-Express Behavior (Code-Based)

### Layers architecture today

- `PropertiesPanel` routes to `LayersView` when active tool is `layers`.
  - See [src/components/PropertiesPanel.tsx](src/components/PropertiesPanel.tsx#L2140).
- `LayersView` currently includes:
  - top toolbar (`new folder`, `group`, `ungroup`, `duplicate`),
  - inline blend/opacity controls,
  - full sortable layer list.
  - See [src/components/properties/LayersView.tsx](src/components/properties/LayersView.tsx#L150).
- Each layer row (`SortableLayerItem`) currently exposes many row actions:
  - lock/unlock,
  - clip toggle,
  - move out of folder,
  - visibility,
  - delete.
  - See [src/components/properties/SortableLayerItem.tsx](src/components/properties/SortableLayerItem.tsx#L229).

### Strengths you currently have

- Strong power features already implemented (grouping, clipping, drag reorder, nested folders).
- Direct per-row controls are efficient for power users.
- Blend/opacity already present globally in layers panel.

### Where current UI is noisier than reference

- Row action density is high (many icons exposed per row).
- No dedicated single “row settings” toggle that opens a focused per-layer inspector card.
- Actions are split between row controls and inspector in a way that increases scanning overhead.

---

## 5) Gap Analysis: Reference vs Current (Layers-Focused)

### Gap 1 — Action placement model
- Reference: global actions in top strip; row mostly informational + one contextual affordance.
- Current: many per-row controls.

### Gap 2 — Settings access pattern
- Reference: single settings toggle per selected row opens detail card/panel.
- Current: detail editing is broader and less explicitly tied to “row settings toggle.”

### Gap 3 — Visual simplification
- Reference: lower in-row icon count; stronger selected-row emphasis.
- Current: hover tool cluster per row increases visual weight.

### Gap 4 — Layer panel composition
- Reference: clear split between stack controls and object property card.
- Current: functionally available, but not as explicit in interaction choreography.

---

## 6) Recommended Implementation Plan (Prioritized)

## Phase 1 — Clean Layer Row + Top Action Bar Parity (High Impact)

Goal: Make layers look cleaner without losing current capabilities.

1. **Introduce a compact top action strip mode in `LayersView`**
   - Keep core global actions in header bar.
   - Move rarely-used row actions out of persistent row icons.

2. **Refactor row action model in `SortableLayerItem`**
   - Persist only:
     - eye visibility,
     - thumbnail,
     - name,
     - one settings toggle button on selected row.
   - Move lock/clip/delete/duplicate into:
     - top action strip (acting on selected layer), or
     - row overflow menu.

3. **Selected-layer action targeting**
   - Top strip actions execute on current selected layer(s).
   - Disable actions when no selection.

Acceptance criteria:
- Layer row shows max 1-2 controls at rest.
- Delete/lock/clip still available but not always visible in-row.
- Existing behavior remains functional via top strip/overflow.

---

## Phase 2 — Right-Side Layer Settings Toggle + Dedicated Inspector Card

Goal: Match your requested pattern: “selected layer options via right-side toggle, not in list.”

1. **Add row settings toggle affordance**
   - Right-end icon visible on selected row.
   - Clicking opens a dedicated layer inspector card/pane.

2. **Create Layer Inspector surface**
   - Initial fields:
     - Dimensions (W/H), Position (X/Y), lock ratio,
     - quick transforms,
     - blend, opacity,
     - lock, clip, delete.

3. **Panel choreography**
   - Option A (cleanest): split stacked panel view (Layers above, Inspector below).
   - Option B: floating card anchored to selected row.

Acceptance criteria:
- Layer details are editable without row icon clutter.
- Inspector is clearly linked to selected layer.
- Toggling off returns to minimal list.

---

## Phase 3 — Arrange Mode UX

Goal: Align with reference arrange emphasis and cleaner reorder state.

1. Add explicit “Arrange mode” state in layer header.
2. Emphasize reorder affordances only in arrange mode.
3. Keep non-arrange mode visually quieter.

Acceptance criteria:
- Reordering is obvious when enabled.
- Normal mode is cleaner and less control-heavy.

---

## Phase 4 — Progressive Disclosure + Consistency Pass

1. Collapse advanced settings by default in stack and inspector.
2. Normalize spacing, icon size, and card hierarchy.
3. Ensure parity with your dark theme tokens and existing components.

Acceptance criteria:
- Fewer always-open control clusters.
- Better first-scan readability.

---

## 7) Suggested Technical Execution Order (Code Files)

1. `src/components/properties/LayersView.tsx`
   - Add top strip action model + selected-target behavior.
2. `src/components/properties/SortableLayerItem.tsx`
   - Reduce persistent row controls.
   - Add selected-row settings toggle.
3. `src/components/PropertiesPanel.tsx`
   - Manage layer inspector visibility/state and selected-layer binding.
4. `src/components/Editor/EditorView.tsx` (only if needed)
   - Minor panel choreography updates.
5. Tests:
   - `src/components/Editor/__tests__/EditorView.test.tsx`
   - `src/components/Editor/__tests__/TopToolOptionsBar.test.tsx` (if any layer top-bar interaction is touched)
   - plus new/updated tests for `LayersView`/`SortableLayerItem` if present.

---

## 8) Risk Notes

- Current per-row controls are power-user friendly; removing them abruptly can frustrate users.
- Mitigation: keep overflow menu or optional “compact mode” transition period.
- Clipping and grouping actions need clear discoverability after relocation.

---

## 9) Final Recommendation

Implement Phase 1 + Phase 2 first. That pair gives the biggest visual cleanup while preserving your existing strong feature set.

You already have richer functionality than the reference in several areas; the missing piece is mostly **interaction architecture and control density**, not core capability.

---

## 10) Implementation Status Snapshot (Current)

- [x] Phase 1 complete: top-strip selected-layer actions + cleaner row density.
- [x] Phase 2 complete: selected-layer settings toggle opens dedicated mini inspector (X/Y/W/H).
- [x] Phase 3 complete: explicit Arrange Layers mode gates drag-sort behavior.
- [ ] Phase 4 pending: broader consistency pass (full right icon rail taxonomy now includes color/swatches/brushes/channels/paths/adjustments; history/navigator/info shortcuts and categorized adjustment launcher quick controls are also implemented).
