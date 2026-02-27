# Functionality Reference & Quality Assurance Checklist

This document serves as a source of truth for the `PropertiesPanel` and related functionality. 
**MANDATORY:** Before and after any code modification, verify these features are preserved.

---
## Refactoring Tracking (Feb 1 2026)

### Session Updates
| Date | Component | Change | Status |
|------|-----------|--------|--------|
| Feb 27 2026 | `EditorView.tsx` + extracted `src/components/Editor/*` modules | Continued modularization of editor integration shell; header/workspace/export/selection/retouch/shell effects moved to dedicated modules | ✅ Done |
| Feb 27 2026 | Build + focused `EditorView` regressions | Revalidated export/share, top utility controls, selection, and retouch behavior after refactor slices | ✅ Verified |
| Feb 1 2026 | `ShadowStrokeProperties.tsx` | Increased shadow offset range from ±50 to ±200 | ✅ Done |
| Feb 1 2026 | `ShadowStrokeProperties.tsx` | Increased shadow blur max from 100 to 150 | ✅ Done |
| Feb 1 2026 | `TextProperties.tsx` | Enhanced UI with presets (Flat, Arc↑, Arc↓, Circle) | ✅ Done |
| Feb 1 2026 | `TextProperties.tsx` | Added visual feedback for curve direction | ✅ Done |
| Feb 1 2026 | `PropertiesPanel.tsx` | Improved text curve algorithm with cubic bezier for extreme values | ✅ Done |
| Feb 1 2026 | `PropertiesPanel.tsx` | Implemented `applyAdjustmentLayers()` function | ✅ Done |
| Feb 1 2026 | `PropertiesPanel.tsx` | Apply adjustment layers to all images below in stack | ✅ Done |
| Feb 1 2026 | `LayersView.tsx` | Moved layer opacity + blend controls to Layers view header | ✅ Done |
| Feb 1 2026 | `UserProfileModal.tsx` | Added profile image scaling + embed info toggle | ✅ Done |
| Feb 1 2026 | `AdjustmentControls.tsx` | Added numerical inputs for Curves UI | ✅ Done |
| Feb 1 2026 | `PropertiesPanel.tsx` | Implemented drag-into-folder logic | ✅ Done |
| Feb 1 2026 | `LayersView.tsx` | Added folder drop detection in `handleDragEnd` | ✅ Done |
| Feb 1 2026 | `EditorView.tsx` | Added AI usage label overlay in exports | ✅ Done |
| Feb 1 2026 | `DesignCanvas.tsx` | Locked artboard to bottom and non-selectable | ✅ Done |
| Feb 1 2026 | `PropertiesPanel.tsx` | Added Curves and Levels filter support to adjustment layers | ✅ Done |
| Feb 1 2026 | `PaintProperties.tsx` | Added `setCoords()` calls to fix brush stroke positioning | ✅ Done |
| Feb 2 2026 | `PropertiesPanel.tsx` | Implemented `textEffectConfigUpdate` for parametric text effects | ✅ Done |
| Feb 2 2026 | `TextEffectsProperties.tsx` | Created UI for Text Effects with per-preset settings | ✅ Done |
| Feb 8 2026 | `Toolbar.tsx` | Fixed Pen Tool path drift by normalizing coordinates | ✅ Done |
| Feb 8 2026 | `GradientControls.tsx` | Fixed type safety (removed `any`) | ✅ Done |
| Feb 8 2026 | `Dashboard.test.tsx` | Updated tests for Custom Size modal flow | ✅ Done |
| Feb 8 2026 | Build | `npm run build` passes | ✅ Verified |
| Feb 8 2026 | Lint | `npm run lint` - warnings only, no errors | ✅ Verified |
| Feb 1 2026 | Build | `npm run build` passes | ✅ Verified |
| Feb 1 2026 | Lint | `npm run lint` - warnings only, no errors | ✅ Verified |
| Feb 24 2026 | `LayersView.tsx` + `SortableLayerItem.tsx` | Moved selected-layer lock/clip/delete to top strip and reduced persistent row actions | ✅ Done |
| Feb 24 2026 | `LayersView.tsx` + `PropertiesPanel.tsx` | Added selected-layer inspector toggle and dedicated X/Y/W/H mini-surface | ✅ Done |
| Feb 24 2026 | `LayersView.tsx` + `SortableLayerItem.tsx` | Added explicit Arrange Layers mode; drag-sort enabled only in arrange mode | ✅ Done |
| Feb 24 2026 | `LayersView.test.tsx` | Added tests for inspector toggle/properties and arrange mode toggle | ✅ Done |

---
## 1. QA & Build Standards
- [x] **Linting**: Code passes `eslint` without errors (warnings acceptable).
- [x] **Build**: Project builds successfully (`npm run build`).
- [x] **Type Safety**: Reduced `any` usage where practical.

## 2. Selection Handling
- [x] **Single Selection**: Properties panel updates to reflect the single selected object.
- [x] **Multi-Selection**: Shows "Multiple Selection" header, Alignment tools, Group button.
- [x] **Group Selection**: Shows "Group" header, Ungroup button.
- [x] **No Selection**: Shows Canvas Settings (Size, Background Color).

## 3. Global Properties (All Object Types)
- [x] **Opacity**: Slider works, updates canvas in real-time.
- [x] **Blend Mode**: Dropdown works, updates `globalCompositeOperation`.
- [x] **Visibility**: Toggle layer visibility (affects Canvas and Layers View).

## 4. Recent Fixes (Feb 1 2026)
- [x] **Layers Visibility Icon**: Fixed - calls `updateObjects()` after toggle.
- [x] **Adjustment Layers**: Fixed - now applies filters to underlying images.
- [x] **Masking**: Implemented - Select two objects → Mask.
- [x] **Folder Creation**: Implemented - Creates group or groups selection.
- [x] **Painting Tool**: Fixed brush stroke positioning with proper coordinate transforms.
- [x] **Shadow Offsets**: Extended range to ±200px for more flexibility.
- [x] **Shadow Blur**: Extended max to 150px.
- [x] **Text Curves**: Improved algorithm with cubic bezier for smooth arcs.
- [x] **Pen Tool Path**: Fixed - Paths now save with relative coordinates.

## 5. Shadow & Stroke System
- [x] **Stroke**: Inside/Outside rendering toggle.
- [x] **Border**: Separate properties for border (outside) vs stroke (inside).
- [x] **State Sync**: Switching between stroke/border preserves/restores values.
- [x] **Shadow Blur**: Now supports up to 150px blur.
- [x] **Shadow Offset**: Now supports ±200px offset range.

## 6. Transform Tools (Collapsible)
- [x] **Position**: X / Y inputs update object position.
- [x] **Dimensions**: W / H inputs update object size.
- [x] **Rotation**: Angle input rotates object.
- [x] **Skew/Taper**: Standard Skew X/Y and Pseudo-3D Taper/Skew Z.

## 7. Vector Styling (Shapes, Text, Paths)
- [x] **Fill - Solid**: Color picker updates fill color.
- [x] **Fill - Gradient**: 
    - [x] Toggle between Solid/Gradient.
    - [x] Linear/Radial types.
    - [x] Start/End stops and Angle.
- [x] **Stroke (Inside)**:
    - [x] Enable/Disable toggle.
    - [x] Color, Width, Opacity sliders.
- [x] **Border (Outside)**:
    - [x] Enable/Disable toggle.
    - [x] Color, Width, Opacity sliders.
- [x] **Drop Shadow**:
    - [x] Enable/Disable toggle.
    - [x] Color, Blur (0-150), Opacity, Offset X/Y (±200) sliders.
    - [x] Blend Mode dropdown.

## 8. Image Styling (Image Objects)
- [x] **Filters**: 
    - [x] **Blur**: Slider applies blur filter.
    - [x] **Brightness**: Slider applies brightness.
    - [x] **Contrast**: Slider applies contrast.
    - [x] **Saturation**: Slider applies saturation.
    - [x] **Vibrance**: Slider applies vibrance.
    - [x] **Noise**: Slider applies noise.
    - [x] **Pixelate**: Slider applies pixelate.

## 9. Text Styling (IText)
- [x] **Font Family**: Dropdown updates font (13 fonts available).
- [x] **Font Weight**: Selection updates weight.
- [x] **Curved Text**: 
    - [x] Strength slider (-100 to 100).
    - [x] Center slider for curve offset.
    - [x] Quick presets: Flat, Arc↑, Arc↓, Circle.
    - [x] Cubic bezier algorithm for smooth extreme curves.
- [x] **Text Effects**:
    - [x] **Vertical Stack**: UI matches Shadow/Stroke properties with expandable sections.
    - [x] **Individual Toggles**: Each effect (Neon, Glow, etc) has its own enable/disable switch.
    - [x] **Inline Config**: Sliders and pickers appear inline when an effect is enabled/expanded.
    - [x] **Mutual Exclusivity**: Turning one effect on automatically disables conflicting ones (clean state).

## 10. Adjustment Layers
- [x] **Creation**: Toolbar button creates adjustment layer overlay.
- [x] **Curves**: Spline-based LUT filter applied to underlying image.
- [x] **Levels**: Brightness/Contrast approximation applied.
- [x] **Exposure**: Brightness + Contrast filters.
- [x] **Hue/Saturation**: HueRotation + Saturation filters.
- [x] **Saturation/Vibrance**: Saturation + Vibrance filters.
- [x] **Black & White**: Grayscale filter.

## 11. UX Interactions
- [x] **Double Click Reset**: Double-clicking slider labels resets to default.
- [x] **Layers View**:
    - [x] Drag and drop reordering.
    - [x] Visibility/Lock toggles in list.
    - [x] Auto-updates when objects change.
    - [x] Selected-layer lock/clip/delete actions available in compact top strip.
    - [x] Selected-layer settings toggle opens dedicated mini inspector (X/Y/W/H).
    - [x] Arrange mode toggle gates drag-sort behavior for cleaner default list state.

## 12. User Profile
- [x] **Profile Modal**: Opens from avatar button in editor header.
- [x] **Profile Image**: Upload + scale slider for avatar cropping.
- [x] **Fields**: Display name, username, email, personal info.
- [x] **Embed Toggle**: Option to embed profile info in exports/templates.

## 13. Export Compliance
- [x] **AI Usage Label**: Exports include AI usage notice if AI-generated assets exist.

## 14. Canvas Integrity
- [x] **Artboard Lock**: Canvas artboard always stays at bottom layer.
- [x] **Non-selectable**: Artboard cannot be selected or deleted from Layers.

## 15. Paint Mode
- [x] **Brush Types**: Pencil, Spray, Oil, Watercolor.
- [x] **Brush Settings**: Color, Size, Opacity, Softness, Density.
- [x] **Blend Modes**: Normal, Multiply, Screen, Overlay, Darken, Lighten.
- [x] **Paint Layer**: New layer per paint session; selecting a paint layer reuses it.
- [x] **Coordinate Fix**: Proper transform when adding strokes to group.
