# Left Toolbar Parity Map (Reference vs Image Express)

Date: 2026-02-25  
Scope: Left tool rail only (tool identity, grouping, discoverability, and cursor behavior).

## 1) Source Of Truth Used
- Code:
  - `src/components/Toolbar.tsx`
  - `src/components/Editor/ToolsDropdownMenu.tsx`
  - `src/components/Editor/EditorView.tsx`
  - `src/components/DesignCanvas.tsx`
- Docs:
  - `docs/unified_progress_status.md`
  - `docs/reference_ui_screenshot_analysis_layers_and_panels_2026-02-24.md`

## 2) Current Left Toolbar Tool Inventory

### A) Persistent icons on left rail (currently visible)
1. `Selection` group button
   - Subtools: `Move`, `Marquee`, `Lasso`, `Magic Wand`, `Path Select`
   - Shortcuts: `V`, `M`, `L`, `W`, `A`
2. `Retouch` group button
   - Subtools: `Healing Brush`, `Clone Stamp`, `History Brush`, `Blur Tool`, `Sharpen Tool`, `Dodge Tool`
   - Shortcuts: `J`, `S`, `Y`, `B`, `(none for sharpen)`, `O`
3. `Text`
4. `Shapes`
5. `Pen` (vector path tool)
6. `Brushes` (raster paint)
7. `Fill / Gradient`
8. `Gallery` (assets)
9. `Library` (templates)
10. `AI Zone`
11. `AI 3D`

### B) Tools available only in Tools dropdown (not persistent in left rail)
1. `Crop`
2. `Eyedropper`
3. `Zoom`
4. `Hand`

## 3) Parity Gap Map (Left Rail)

Legend:
- `Done`: present as first-class tool identity
- `Partial`: behavior exists but not as reference-style left-rail tool/group
- `Missing`: absent

| Reference group | Reference expectation | Current state | Gap | Priority |
|---|---|---|---|---|
| Size & position | Move + transform/crop entry point | Move exists; Crop is dropdown-only | Crop not persistent in rail group; move panel parity missing | P1 |
| Generative | Dedicated left-rail group with fill/expand/upscale actions | `AI Zone` exists | No reference-style grouped Generative panel flow | P2 |
| Adjust | Dedicated adjust group | Adjustments exist mainly in right rail/panels | Left-rail adjust identity missing | P2 |
| Select | Object selection, selection brush, quick selection, lasso, marquee | Move + content mask tools (marquee/lasso/wand/quick-select/selection-brush) + path-select alias | Content pixel selection shipped (ants mask). Remaining: object-selection mode identity, detect-object panel | P2 |
| Retouch | Remove, spot healing, healing, clone, liquify, dodge/burn/sponge | healing/clone/history/blur/sharpen/dodge done | Missing `Remove`, `Spot Healing`, `Liquify`, `Burn`, `Sponge`; tool naming/stack parity incomplete | P1 |
| Quick actions | Dedicated left-rail quick actions group | No dedicated group | Missing | P2 |
| Effects | Dedicated effects browser group | Effects are mostly in properties flows | Missing left-rail group identity | P2 |
| Paint | Brush + eraser + bucket + gradient + smudge | Brush + gradient are present; no eraser/smudge tool identity | Missing `Eraser`, `Smudge`, dedicated `Paint Bucket` identity | P1 |
| Shapes | Rectangle/ellipse/triangle/polygon/line/move-shapes + presets | Rect/circle/triangle/star/arrows/bubble via shapes menu | Missing first-class `Line`, `Polygon`, explicit `Move Shapes` mode and reference-style shape group panel | P1 |
| Type | Add text + styles/presets in one panel | Text tool exists; style controls are spread between top/right | Needs reference-style Type group surface for presets flow | P2 |
| Add image | Upload + search + curated assets in left group | Gallery exists | Partial parity (needs panel structure closer to reference) | P2 |
| Eyedropper + FG/BG/swap | Persistent bottom utility controls in rail | Eyedropper is dropdown-only; FG/BG/swap not in left rail | Missing persistent utility cluster parity | P0 |

## 4) Cursor Parity Map

### A) Current cursor behavior
- `select`: `default` / `move`
- `hand`: `grab` and `grabbing` while panning (implemented via `DesignCanvas`)
- `zoom`: fixed `zoom-in`
- Most other tools: generic `crosshair`
  - marquee/lasso/wand/healing/clone/history/blur/sharpen/dodge/paint/gradient/pen/crop/eyedropper

### B) Cursor gaps vs reference-like behavior
1. No mode-specific zoom cursor (`zoom-in` vs `zoom-out`) tied to top option mode.
2. No brush-size cursor preview ring for paint/retouch tools.
3. No eyedropper pipette-style cursor.
4. No specialized pen/path-edit cursor states (add point, convert point, etc.).
5. No centralized cursor map; cursor logic is split and mostly static.

### C) Cursor implementation priority
1. `P0`: Add centralized cursor resolver (single map/function for all tools).
2. `P0`: Add zoom mode cursor switching (`in`/`out`).
3. `P1`: Add brush/retouch radius cursor overlay.
4. `P1`: Add eyedropper cursor.
5. `P2`: Add advanced pen/path cursor variants.

## 5) Recommended Execution Order (One Step At A Time)
1. **Step 1 (P0): Left utility parity + cursor foundation**
   - Make `Crop`, `Eyedropper`, `Zoom`, `Hand` persistent in left rail.
   - Add FG/BG/swap utility cluster in left rail.
   - Introduce centralized cursor resolver + zoom in/out cursor.
2. **Step 2 (P1): Selection group parity**
   - ~~Add Selection Brush + Quick Selection identities.~~ Done — both paint the content mask (2026-08-02).
   - Add Object Selection mode affordance and detect-object section parity.
3. **Step 3 (P1): Retouch parity**
   - Add Spot Healing/Remove/Liquify/Burn/Sponge identities.
   - Keep engine-safe fallbacks where behavior is not complete yet.
4. **Step 4 (P1): Paint + Shapes parity**
   - Add Eraser/Smudge/Paint Bucket identities under Paint.
   - Add Line/Polygon/Move Shapes identities under Shapes.
5. **Step 5 (P2): Generative/Adjust/Quick actions/Effects wrappers**
   - Add left-rail group identities that route to existing real engines/panels.

## 6) Immediate Next Task To Start
- Implement **Step 1** first:
  - persistent left-rail utilities,
  - FG/BG/swap controls,
  - centralized cursor map with zoom mode parity.
