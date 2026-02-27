# Refactoring Tracking Document

## Issues to Fix

## Current Editor Refactor Status (2026-02-27)

- `src/components/Editor/EditorView.tsx` reduced from 7,453 lines to 1,337 lines.
- Ownership moved into dedicated runtime modules for:
  - header/menu composition
  - overlays/modals
  - properties panel shells
  - workspace shell and canvas workspace
  - export support helpers
  - selection interactions
  - retouch interactions
  - shell-level side effects
- Canonical tracking docs for the editor refactor:
  - `docs/component_responsibility_map.md`
  - `docs/refactor_component_audit_2026-02-26.md`
  - `docs/unified_progress_status.md`

### 1. Blending Modes
- [x] Fix blending modes not working in Stroke. (Action: Removed non-functional controls)
- [x] Fix blending modes not working in Border. (Action: Removed non-functional controls)
- [x] Fix blending modes not working in Shadow. (Action: Removed non-functional controls)
- [x] Verify if Fabric.js supports per-property blending. (finding: Only global object blending supported)

### 2. Default States
- [x] Ensure Shadow, Stroke, Border options are OFF by default for new layers.

### 3. Layout & Functionality Restoration
- [x] Move Layer Opacity and Blend Mode to the top.
- [x] Group Position, Rotation, Resizing into a collapsible 'Transform' section.
- [x] Move Alignment properties out of individual sections to the global section.

### 4. Audit Refactoring
- [x] Review refactored components for missing features.
    - Note: Removed explicit 'Blend Mode' dropdowns from Stroke/Border/Shadow panels to avoid user confusion.
    - Global Blend Mode is preserved at the top of the panel.
- [ ] Identify orphaned functions.
- [ ] Report findings.

### 5. Final Verification
- [ ] Run Lint.
- [ ] Run Build.

## Latest Validation (2026-02-27)

- `npx eslint src/components/Editor/EditorView.tsx src/components/Editor/useEditorShellEffects.ts`
- Focused `EditorView` regressions rerun for export/share and top utility controls.
- `npm run build`
