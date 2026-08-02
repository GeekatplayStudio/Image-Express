# Color Constellation (3D OKLCH picker)

Additive color workflow beside the classic `ColorWheelTool` / `ColorPicker`.

## Goals (MVP shipped)

- Palette-as-geometry in OKLCH: lightness ↑, chroma = radius, hue = angle
- Connected harmony nodes (complementary → hexadic, analogous, split-complementary)
- Same hex emit contract as the classic wheel (`onColorSelect`)
- Shared localStorage for harmony sets + swatches (`saved-harmony-palettes`, `saved-color-swatches`)
- Classic wheel remains available via **Classic wheel | Constellation** toggle (`ColorPickerModeHost`)

## Entry points

- Color properties panel → `ColorPickerModeHost` (panel variant)
- Toolbar color-wheel / eyedropper floating tool → `ColorPickerModeHost` (floating variant)

## Module map

| Area | Path |
|---|---|
| Domain OKLCH + clip | `src/features/color-constellation/domain/oklch.ts` |
| Harmonies / transforms | `src/features/color-constellation/domain/constellation.ts` |
| Volume samples | `src/features/color-constellation/domain/volumeSamples.ts` |
| Persistence | `src/features/color-constellation/application/constellationStore.ts` |
| UI shell | `src/components/ColorConstellation/*` |

## Out of scope (later)

AI prompt transforms, accessibility/material gravity fields, timeline animation, full live-scene preview beyond the current product canvas color application.
