# P1 Engineering Implementation

Date: 2026-07-23  
Status: first production slice implemented

## Scope completed

The first P1 slice moves the agentic image-edit job lifecycle out of
`ImageGeneratorModal` and establishes rules that new feature code can follow.

### Feature architecture

- Added `src/features/generation/application` for the queue/poll/result workflow.
- Added `src/features/generation/contracts` for Zod-validated job identifiers, status,
  result, and public-error payloads.
- Added `src/shared/application/operationState.ts` with explicit idle, validating,
  running, succeeded, failed, and cancelled states.
- Removed the queue/poll loop and response casting from the modal.
- Added tests for success, public API failure, cancellation, contract validation, and
  impossible progress values.

### API and filesystem safety

- Added a reusable server API contract layer with stable error codes, retryability, and
  request IDs.
- Added bounded request-size handling to agentic generation uploads.
- Job routes reject malformed/path-like identifiers before filesystem access.
- Generation job JSON and revision records have schema version `1`.
- JSON records use temporary-file-plus-rename writes.
- Generation data and outputs use the typed data/asset path service.
- Generated image URLs use the asset-serving API instead of assuming a writable `public`
  directory.
- Provider API keys, tokens, passwords, and secrets are redacted from persisted job records.
  Runtime-only provider parameters are discarded after processing.

### Enforced engineering standards

- Added `npm run audit:architecture`.
- New feature modules cannot import legacy component or Next route internals.
- Shared code cannot depend on features, components, or application routes.
- New feature UI cannot call `fetch` directly.
- New shared and feature modules have enforceable size budgets.
- Production code cannot introduce direct `process.cwd()` data roots outside the path service
  and the explicitly isolated Comfy workspace adapter.
- CI now runs the architecture audit as part of `npm run verify`.
- Lint now uses `--max-warnings=0`; the existing warning backlog was eliminated.
- Added CODEOWNERS coverage for release, desktop, server, runtime, auth, and generation-contract
  boundaries.

## Verification target

The slice is complete when:

```bash
npm run verify
```

passes with zero lint warnings and the generation contract, client state-machine, persistence,
and route tests remain green.

## Recommended next P1 slices

1. Extract annotation/reference management from `ImageGeneratorModal`.
2. Apply the API contract helper and Zod schemas to designs, templates, and assets.
3. Introduce project/design schema versions and deterministic migration tests.
4. Define repository ports for projects, assets, preferences, credentials, and jobs.
5. Add a typed feature-capability registry and hide unfinished stable-build controls.
6. Continue coherent extraction of `PropertiesPanel` and `AssetLibrary`.
