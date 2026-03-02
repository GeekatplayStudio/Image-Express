# AI Edit Notes v2 — Unified Implementation Specification

## 1) Goal
Implement region-based AI editing where users can click/draw directly on an image and attach instructions, then generate an edited image using:
1. Original image layer
2. Notes layer (visual annotations + masks + structured JSON)

This enables edits like:
- click jacket → “change jacket color to red”
- brush around letters → “replace this text with Korean”
- draw pose/skeleton → “make person stand like this pose”

## 2) Required Output Package (per generation)
The generation request must include all of the following artifacts:
- `original` (PNG): immutable source image
- `notes_overlay` (PNG): user-visible notes/marks layer only
- `combined_mask` (PNG): union mask from enabled editable note regions
- `annotations_json` (JSON): note geometry, ordering, mode, strength, instruction
- `prompt_positive` and `prompt_negative`
- `references[]` + `references_meta`
- optional `pose_hint` (PNG)

## 3) UX/Interaction Requirements
- Tools: `point`, `box`, `polygon`, `brush`, `pose`, `text-note`
- Per-note controls:
  - instruction text
  - enable/disable
  - reorder (priority)
  - mode: `auto|inpaint|replace|style|pose|text`
  - strength: 0..1
  - delete
- Overlay behavior:
  - note badges (1,2,3…)
  - highlight selected note
  - show/hide notes layer
  - mask preview

## 4) Prompt/Mask Compilation Rules
### Prompt
- Sort enabled notes by ascending priority.
- Include region descriptors from normalized geometry.
- Merge global prompt + note instructions.
- Enforce quality constraints for common intents (e.g., garment recolor isolation, text legibility).

### Mask
- Build `combined_mask` as union of enabled editable regions.
- Render anti-aliased edges for polygon/brush.
- Keep note-level geometry in JSON for provider-specific controls.

## 5) API Contract
### `POST /api/generate` (multipart)
Required fields in AI Edit mode:
- `original`
- `notes_overlay`
- `combined_mask`
- `annotations_json`
- `prompt_positive`
- `prompt_negative`
- `provider_name`
- `provider_model`
- `provider_params`
- `references[]`
- `references_meta`
Optional:
- `pose_hint`

### Job polling
- `GET /api/jobs/:id` -> status/progress/message/error/resultImageUrl
- `GET /api/jobs/:id/result` -> imageUrl + provider metadata

## 6) Provider Abstraction Requirements
Provider interface input must support:
- original image buffer
- notes overlay buffer
- combined mask buffer
- optional pose hint
- references by role
- compiled prompts
- model params

Adapters:
- `flux`
- `nanobanana`
- `mock`

Output:
- image buffer
- normalized meta (`seed`, `steps`, timings, provider id)

## 7) Persistence & Revision History
Persist per job:
- source files (`original`, `notes_overlay`, `combined_mask`, refs, pose_hint)
- `annotations_json`
- compiled prompt files
- provider params
- output image and metadata

Store revision records linking original image -> output image for replay/debug.

## 8) Acceptance Criteria
- Jacket color edit changes jacket only.
- Text replacement with Korean is legible and localized to target region.
- Pose note + optional pose reference influences output pose.
- Multiple notes applied in priority order.
- Two-layer assets are always generated and stored.
- Progress/failure states are visible and actionable.

## 9) Current Implementation Delta (as of this spec)
Implemented:
- annotation type schema + prompt compiler
- async jobs API and polling
- provider abstraction stubs
- initial AI Edit notes UI controls

In progress:
- true visual two-layer exports (`notes_overlay`, `combined_mask`) wired by geometry
- richer direct-on-image authoring (click/draw tools)

## 10) Implementation Sequence (execution order)
1. Layer export engine (overlay + mask rendering)
2. API payload enforcement for layer files
3. UI tooling for direct-on-image placement/drawing
4. provider adapter enrichment for mask/overlay-aware calls
5. regression tests + acceptance scenario tests
