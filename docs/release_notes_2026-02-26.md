# Release Notes — 2026-02-26

## Summary
This release consolidates recent editor UX and workflow upgrades across adjustments, color tooling, text editing, shapes, and swatch management, with matching documentation updates.

## Shipped
- Expanded adjustment layer system with additional types:
  - Brightness/Contrast
  - Color Balance
  - Light and Color
  - Solid Color
- Left-rail-first adjustment creation flow (`Adjustment Layers`) with immediate focus on new layer properties.
- Right properties color panel parity upgrade:
  - Embedded color wheel
  - Editable RGB / HSB / CMYK / Lab channel values
  - Profile context modes (sRGB, Adobe RGB, CMYK Print)
- Harmony workflow upgrades:
  - Save, rename, delete
  - Import/export JSON
  - Compact/collapsible harmony list improvements
- Swatches workflow upgrades:
  - Grouped swatch sets
  - Create/select/remove groups
  - Add/remove swatches directly in the swatches panel
  - Persistence updates for grouped swatches
- Text workflow updates:
  - Multiline text editing in properties panel
  - Text-on-path render safety improvements to reduce clipping
- Shape tool expansion:
  - Thought bubble, cloud, hexagon, diamond

## Validation
- Production build passed (`npm.cmd run build`).
- Docs updated to align feature and progress tracking with shipped implementation.

## Commit / Push
- Commit: `2030711`
- Branch: `main`
- Remote: `origin`
- Status: pushed to GitHub
