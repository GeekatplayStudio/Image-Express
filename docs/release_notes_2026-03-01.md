# Release Notes — 2026-03-01

## Highlights
- Improved AI Edit Notes reliability for long-running Comfy/Flux workloads.
- Updated aspect sizing behavior to better balance user control and model-optimized render dimensions.
- Added automatic cleanup for temporary `job_*` artifacts.

## AI Edit Notes + Comfy/Flux
- Added longer AI Edit Notes polling windows for heavy provider runs.
- Added manual abort controls during AI Edit Notes processing.
- Improved Comfy recovery behavior so canceled prompt IDs are not auto-resumed after reload.
- Improved provider/task/workflow compatibility handling for reference-image edit routes.

## Aspect & Render Sizing
- Primary aspect input remains user-editable.
- UI displays model-adapted render dimensions for selected workflow/model.
- Users are warned when current custom size is suboptimal for selected model bucket.

## Job Lifecycle & Cleanup
- Temporary job uploads (source/mask/notes/references/prompts/annotation artifacts) are cleaned automatically after process completion.
- Job record files are removed after final result retrieval.
- Old terminal jobs are pruned automatically with a retention window (default: 6 hours).

## Notes
- Final generated outputs remain in `public/assets/generated/images`.
- Cleanup targets temporary processing artifacts and stale terminal job records.
