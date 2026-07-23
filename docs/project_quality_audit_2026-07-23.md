# Image Express Project Quality Audit

> P0 implementation update (2026-07-23): the quality gate, runtime capability profiles,
> persistent-data roots and migration, native packaging, updater runtime, release workflow,
> package verification, and installer-first documentation described in this audit have been
> implemented. Signing/notarization and clean-machine Windows/Linux release validation remain
> external release prerequisites.

Date: 2026-07-23  
Repository: `GeekatplayStudio/Image-Express`  
Audited version: `0.2.0`, `main` branch

## Executive conclusion

Image Express is an ambitious, functioning product with an unusually broad feature set: a
Next.js/React design application, Fabric.js editing, Three.js rendering, local and cloud AI
providers, an Electron shell, Docker support, internationalization, and a growing automated
test suite.

The project is not yet a clean reference implementation or a release-ready consumer desktop
application. The largest risks are not cosmetic:

1. The automated quality gate is red: lint and tests fail.
2. The documented one-click release process does not exist as automation.
3. Packaged desktop builds do not have a correct persistent-data boundary.
4. Several privileged local-maintenance and file-mutating APIs are unsafe if the web app is
   exposed beyond the user's own machine.
5. The largest UI coordinators have grown to 2,000-4,000 lines, increasing regression risk and
   making ownership unclear.
6. Documentation promises behavior that the packaged application does not currently deliver,
   particularly automatic updates and persistence across upgrades.

The best path is not a rewrite. Preserve the working product and improve it incrementally:
first make the build truthful and releasable, then create explicit platform and feature
boundaries, then reduce the largest coordinators one workflow at a time.

## Audit scope and evidence

The audit inspected:

- repository structure and Git state;
- `package.json`, lockfile, Next.js, TypeScript, ESLint, Jest, and Playwright configuration;
- application entry points and major editor components;
- API routes, server-side persistence, authentication, installer, updater, and dependency
  maintenance code;
- Electron main/preload processes and electron-builder configuration;
- Windows and macOS bootstrap installers and launchers;
- Docker build and runtime configuration;
- GitHub Actions and release/tag state;
- existing project audits and installation documentation.

Commands run during this audit:

| Check | Result |
|---|---|
| `npm run audit:repo` | Passed as a reporting tool; found 34 source files over 500 lines |
| `npm run lint` | Failed: 2 errors, 43 warnings |
| `npm test -- --runInBand` | Failed: 5 suites failed, 112 passed; 7 tests failed, 712 passed, 1 skipped |
| `npm run build` | Passed; one Turbopack file-tracing warning |
| `npm audit --omit=dev` | 2 moderate vulnerabilities in the MCP/Hono dependency path |
| `npm run desktop:pack` | Passed on macOS arm64 |
| Packaged-app smoke test | Passed; app launched and `/` returned HTTP 200 |

The macOS test bundle was approximately 391 MB, including a 131 MB Next.js standalone
resource. It was unsigned, used Electron's default icon, and did not contain
`electron-updater`.

Existing uncommitted work was not changed by this audit. At audit start it included a modified
`package-lock.json` and an untracked `docs/prd_3d_layer_vfx_2026-07-23.md`.

## What the project already does well

### Strong product and technical foundation

- TypeScript strict mode is enabled.
- The renderer uses Electron context isolation and disables Node integration.
- The packaged Electron server binds to loopback and searches for a free port.
- The Electron shell isolates the Next.js server in a child process and writes useful startup
  diagnostics.
- The production web build succeeds and generates a valid standalone server.
- The application already has feature-oriented subdirectories and has begun extracting editor
  logic into hooks.
- The project includes unit, integration, API-route, and browser E2E test infrastructure.
- File upload code includes type detection, size limits, filename sanitization, and some
  ownership checks.
- Theme/ambience zip handling and several path-based APIs show attention to traversal risks.
- The repository includes audit scripts, i18n tooling, terminology documentation, and detailed
  feature notes.
- Local/cloud provider abstractions and background job modules are promising seams for further
  modularization.

These strengths mean the project can become an excellent example without replacing its main
technology choices.

## Current architecture

### Runtime shape

```text
React UI and editor
    |
    +-- Fabric.js 2D canvas
    +-- Three.js / React Three Fiber 3D
    +-- browser storage and IndexedDB
    +-- Next.js API routes
            |
            +-- filesystem persistence
            +-- AI provider proxies
            +-- local runtime installers
            +-- Git/npm maintenance
            +-- local user/auth stores

Delivery:
    web/npm ------> Next.js server
    Docker -------> Next.js standalone server
    desktop ------> Electron -> loopback Next.js standalone server
```

This shared runtime is convenient, but desktop-local capabilities, self-hosted server
capabilities, and browser-facing APIs currently share too much code and too many permissions.

### Repository scale

- Approximately 123,000 TypeScript/JavaScript lines under `src`.
- 516 source/test files scanned by the repository audit.
- 117 Jest suites and 720 tests discovered.
- More than 70 server routes are produced by the Next.js build.
- 1,303 installed package entries are reported by npm audit, including optional and peer
  dependencies.

### Largest maintainability hotspots

The current repository audit reports:

| File | Approximate lines | Main risk |
|---|---:|---|
| `ImageGeneratorModal.tsx` | 4,081 | provider orchestration, form state, annotations, jobs, and UI are coupled |
| `PropertiesPanel.tsx` | 3,823 | many layer/property domains share one coordinator |
| `AssetLibrary.tsx` | 3,043 | browsing, upload, cloud behavior, preview, indexing, and mutations are coupled |
| `Toolbar.tsx` | 2,735 | tool registry, menus, interaction behavior, and presentation are coupled |
| `ThreeDGenerator.tsx` | 2,169 | multiple provider flows and complex UI share one component |
| `EditorView.tsx` | 1,376 | still a large composition root after useful hook extractions |
| `SetupWizardModal.tsx` | 1,109 | seven setup domains in one modal |
| `googleDrive.ts` | 1,048 | browser, API, persistence, and provider concerns are mixed |
| `comfyui/libraryServer.ts` | 1,243 | filesystem discovery and workflow domain logic are intertwined |

Large files are not automatically bad. Here, the combination of size, many unrelated state
transitions, and broad test fixtures makes changes costly and explains why UI tests frequently
drift after feature additions.

## Findings and recommendations

Priority definitions:

- **P0:** release blocker or material data/security risk;
- **P1:** high regression/maintenance cost;
- **P2:** important engineering maturity work;
- **P3:** refinement after the foundations are stable.

### P0: Restore a truthful green quality gate

Current state:

- ESLint fails on a React ref read during render and a `prefer-const` error.
- Jest has five failing suites:
  - `SettingsModal.test.tsx`: missing `ToastProvider` in the test harness;
  - `Toolbar.test.tsx`: stale accessible title expectation;
  - `AssetLibrary.test.tsx`: Jest cannot transform Three.js ESM;
  - `SetupWizardModal.test.tsx`: stale step expectation and missing canvas test support;
  - `ui-preferences.test.ts`: expected defaults drifted from implementation.
- Several otherwise passing suites produce React `act(...)` warnings.
- CI uses Node 20 even though the package declares Node 24+.
- CI only runs on Ubuntu, while desktop distribution targets Windows, macOS, and Linux.

Recommendation:

1. Fix the two lint errors and make zero errors non-negotiable.
2. Repair the five failing suites. Do not delete or weaken assertions merely to make CI green.
3. Add a shared `renderApp` test helper containing I18n, Dialog, and Toast providers.
4. Mock browser graphics at the correct boundary:
   - unit tests mock `modelThumbnail`/Three.js adapters;
   - browser tests cover actual WebGL/canvas behavior;
   - `jest.setup.ts` supplies deliberate canvas stubs where rendering is not under test.
5. Treat unexpected `console.error`, unhandled rejection, and React `act` warnings as test
   failures after the existing warnings are cleaned.
6. Change CI to Node 24 and use `npm ci`.
7. Add a dedicated `typecheck` script (`tsc --noEmit`) instead of relying only on Next build.
8. Require `lint`, `typecheck`, unit tests, production build, and selected E2E smoke tests before
   merge.

Acceptance criteria:

- `npm run validate` exits zero on a clean clone.
- CI runs the same commands locally and remotely.
- Test output has no unexplained React lifecycle warnings.

### P0: Separate desktop-local trust from network-server trust

Current state:

- The Electron server binds correctly to `127.0.0.1`.
- `scripts/start-web.mjs` starts Next.js without a host argument and intentionally probes all
  interfaces, so the npm launch path may be reachable on the LAN.
- Docker explicitly binds to `0.0.0.0`.
- Several mutating routes do not require authentication:
  - design save, rename, and delete;
  - system Git update;
  - local runtime installer;
  - parts of dependency/runtime management in non-production/local modes;
  - theme/ambience installation;
  - guest asset operations.
- `POST /api/system/update` can launch the project update script.
- `POST /api/runtime/installer/run` can launch local installer scripts.
- self-hosted authentication has a fixed development secret fallback if
  `IMAGE_EXPRESS_SESSION_SECRET` is not set.
- the browser UI grants the local guest an `admin` role, which is acceptable for a local desktop
  presentation but must never be treated as server authorization.

Recommendation:

Introduce explicit runtime profiles:

```text
desktop-local
  loopback only
  single user
  local maintenance APIs allowed through an Electron-issued capability

developer-local
  loopback by default
  explicit flag required for LAN exposure

self-hosted
  network capable
  authentication and CSRF protection required
  installer, git update, and dependency mutation disabled
  persistent volume required
```

Implement a server capability policy, not scattered `NODE_ENV` checks. Every route declares a
capability such as `design:write`, `asset:write`, `runtime:install`, `app:update`, or
`admin:users`. The desktop shell should generate a random per-launch token and provide it to the
local server and renderer bridge; privileged local routes require that token. Self-hosted mode
must reject local machine-maintenance capabilities.

Also:

- fail startup in self-hosted mode when the session secret uses the development fallback;
- add CSRF/origin checks to all cookie/bearer-mutating routes as appropriate;
- rate-limit login, password reset, remote URL fetching, uploads, and AI proxy routes;
- add request size limits before fully buffering JSON, images, or zip files;
- ensure every file operation resolves through a shared safe-path utility;
- add security-focused route tests for unauthorized, cross-owner, traversal, and oversized
  requests.

### P0: Move all mutable data out of the application bundle and source tree

Current state:

- designs, assets, installed themes, installed ambience, auth data, keys, jobs, and logs are
  resolved from `process.cwd()` in many modules.
- the Electron production server runs with `.app/Contents/Resources/next-standalone` as its
  working directory.
- packaged resources are not a safe persistent-write location:
  - installed applications may not be writable;
  - writing inside a signed macOS bundle invalidates the sealed application;
  - application updates replace bundled resources;
  - user documents should not be mixed with program files.
- documentation currently says installed packs survive updates, which is not guaranteed by this
  layout.

Recommendation:

Create one typed path service:

```ts
type AppPaths = {
  bundledResources: string;
  userData: string;
  documents: string;
  assets: string;
  designs: string;
  themes: string;
  ambience: string;
  logs: string;
  cache: string;
  temp: string;
};
```

For Electron, derive writable paths from `app.getPath('userData')`, `documents`, `logs`, and
`temp`, then pass the resolved base through environment variables to the Next.js child. For
Docker, use `/data` and require/document a volume. For npm development, use a configurable
`.local-data` or current `data` directory that is ignored by Git.

Bundled read-only assets and user-installed mutable assets must be separate roots. A storage
repository can merge their catalog views without merging their files.

Add a one-time migration:

1. detect data in legacy `public/assets` and `data`;
2. show the source, target, required space, and backup location;
3. copy and verify before switching;
4. keep a migration marker and recovery log;
5. never delete the legacy copy automatically in the first release.

Acceptance criteria:

- the app runs from a read-only application directory;
- user work survives reinstall and upgrade;
- uninstall behavior is documented and does not delete user work by default;
- backup/restore can operate on one documented user-data root.

### P0: Make release claims match release reality

Current state:

- there are no repository tags.
- there is no GitHub release workflow.
- only `.github/workflows/ci.yml` exists.
- `package.json` has no electron-builder `publish` provider.
- `electron-updater` is not present in the packaged `app.asar`, and `main.js` silently disables
  it when unavailable.
- the package has no custom desktop icon.
- the local package was unsigned and not notarized.
- documentation describes GitHub Releases and functional native auto-updates as if they are
  already production services.

Recommendation:

Until the release pipeline exists, label these items as planned. Then implement the release
roadmap in `docs/one_click_distribution_roadmap_2026-07-23.md`.

### P1: Reduce coordinator size through feature slices

Do not split files by arbitrary line count. Extract coherent workflows that own their state,
validation, service call, and tests.

Recommended extraction order:

1. `ImageGeneratorModal`
   - provider registry and capabilities;
   - generation request state machine;
   - annotation/edit-notes feature;
   - reference image management;
   - Comfy connection settings;
   - result and job status view.
2. `PropertiesPanel`
   - panel registry keyed by selected object/layer type;
   - layer operations service;
   - adjustment, text, selection, mask, and utility feature panels.
3. `AssetLibrary`
   - asset query/filter state;
   - upload/import commands;
   - preview feature;
   - cloud provider adapter;
   - indexing feature;
   - list/grid presentation.
4. `Toolbar`
   - declarative tool registry;
   - tool-group/flyout behavior;
   - color controls;
   - template actions;
   - toolbar view.
5. `ThreeDGenerator`
   - provider adapters and schemas;
   - job state machine;
   - model/depth/split workflows;
   - credentials/configuration UI.

Target pattern:

```text
src/features/generation/
  domain/
  application/
  infrastructure/
  ui/
  __tests__/

src/features/assets/
src/features/editor/
src/features/projects/
src/features/settings/
src/platform/desktop/
src/platform/web/
src/server/
src/shared/
```

This is a direction, not a request to move the entire repository at once. New work follows the
target structure; old modules migrate when touched.

Rules for extracted features:

- UI components do not call provider SDKs or filesystem helpers directly.
- application services accept typed ports/interfaces.
- provider and persistence adapters implement those ports.
- domain functions are framework-independent and easy to unit test.
- composition happens at the page, route, or Electron entry point.
- imports do not cross feature internals; each feature exposes a small public API.

### P1: Replace boolean-heavy async flows with explicit state machines

AI generation, background polling, installation, updates, uploads, and setup contain many
interacting booleans. Model them as discriminated unions:

```ts
type OperationState<T> =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'running'; startedAt: number; progress?: number }
  | { status: 'succeeded'; result: T }
  | { status: 'failed'; error: AppError; retryable: boolean }
  | { status: 'cancelled' };
```

This prevents impossible states, centralizes cancellation, and makes UI tests much smaller.

### P1: Standardize API contracts and errors

Current routes mix ad hoc casts, manual validation, and different response shapes.

Recommendation:

- define Zod schemas for every request and response;
- use a shared `parseJsonRequest` helper with byte limits;
- define one safe public error type with code, message, retryability, and request ID;
- avoid returning raw command/provider errors or secrets;
- centralize provider timeouts and cancellation;
- generate or maintain an OpenAPI description for the self-hosted API surface;
- test schemas separately from route wiring.

### P1: Create one persistence layer

The project currently combines:

- browser localStorage;
- IndexedDB;
- JSON/files under `public/assets`;
- server-side metadata files;
- cloud provider storage;
- packaged read-only resources.

Define repositories for projects, assets, preferences, credentials, jobs, themes, and users.
Each repository should state:

- ownership and tenancy;
- durability;
- maximum object size;
- serialization version;
- migration behavior;
- backup behavior;
- allowed runtime profiles.

Add schema versions to saved project/design data and deterministic migration tests. Never make a
new UI component understand legacy storage formats directly.

### P1: Clarify product boundaries and unfinished features

The repository audit finds live "coming soon" paths for cloud storage, auth, provider, 3D, and
panel features. A polished example application should not present inactive controls without a
clear product reason.

Use a typed feature capability registry:

```ts
type FeatureAvailability =
  | { state: 'available' }
  | { state: 'experimental'; warning: string }
  | { state: 'unavailable'; reason: string; documentationUrl?: string };
```

Hide internal scaffolding from stable builds. Experimental features should be explicitly
enabled, labeled consistently, and covered by a release note.

### P2: Improve dependency governance

Current state:

- npm reports two moderate production vulnerabilities through
  `@modelcontextprotocol/sdk`/`@hono/node-server`.
- several dependencies are behind their allowed or latest versions.
- Jest 29 is paired with `jest-environment-jsdom` 30, increasing compatibility risk.
- the app offers a UI that can update project dependency ranges to latest versions, a dangerous
  capability for end users and not an application feature.

Recommendation:

- remove dependency maintenance from production UI;
- use Dependabot or Renovate to create reviewed dependency PRs;
- run npm audit and license checks in CI with a documented exception file;
- align Jest and test-environment major versions;
- update dependencies in small groups with targeted tests;
- generate an SBOM for each release;
- pin GitHub Actions to trusted versions or commit SHAs according to project policy.

### P2: Improve test architecture and coverage quality

The quantity of tests is a strength, but some very large test files mirror very large production
components. Improve signal:

- test domain/application functions without rendering the entire modal;
- keep a small number of high-value integration tests for component composition;
- use Playwright for canvas/WebGL and full setup/install flows;
- add Electron smoke tests that launch the packaged artifact;
- add contract tests for every AI/cloud adapter with recorded sanitized fixtures;
- add persistence migration and crash-recovery tests;
- add installer tests in clean Windows and macOS VMs;
- publish coverage trends, but do not optimize for a single percentage.

Critical user journeys for E2E:

1. first launch and local mode;
2. create, edit, save, quit, reopen, recover;
3. import an image and export PNG/JPEG/PDF;
4. install an update without losing user data;
5. configure a provider and handle a failed request safely;
6. backup and restore;
7. uninstall/reinstall while preserving projects.

### P2: Add observability appropriate for a privacy-first desktop app

Keep telemetry opt-in. Add:

- structured JSON logs with levels and rotating size limits;
- a request/operation ID across UI, API, provider, and job logs;
- Help -> Open Logs Folder;
- Help -> Copy Diagnostics with secrets and file contents redacted;
- startup phase timings;
- updater/install state and last failure;
- crash reporting as an explicit opt-in, not a hidden default.

Do not write API keys, bearer tokens, prompts, image contents, or full user paths to support
logs.

### P2: Improve performance deliberately

The application loads several heavy ecosystems. Establish budgets:

- analyze Next.js client bundles in CI;
- dynamically import 3D, AI provider, setup, asset preview, and large modal features;
- avoid loading Three.js when the user never opens a 3D view;
- virtualize large asset/layer lists;
- move thumbnail generation and expensive image processing to workers;
- measure editor interaction latency, memory after repeated open/close, and export time;
- eliminate the current Turbopack whole-project tracing warning in
  `comfyui/libraryServer.ts`.

### P2: Accessibility and UI consistency

- use role/name queries in tests and treat test failures as feedback on stable accessible names;
- audit keyboard access, focus return, modal trapping, contrast, reduced motion, and screen-reader
  labels;
- centralize modal, form, empty-state, progress, and error patterns;
- avoid custom controls where native semantics work;
- include accessibility smoke tests with axe plus manual keyboard testing.

### P3: Documentation as a tested product surface

The README is impressive but too long for first-time users and currently mixes end-user,
developer, self-hosting, AI setup, and aspirational release claims.

Recommended documentation hierarchy:

```text
README
  What it is
  screenshots
  Download for Windows / macOS / Linux
  developer link

docs/user/
  install
  first-run
  backup
  update
  troubleshooting

docs/developer/
  architecture
  local-development
  testing
  release-process
  security-model

docs/reference/
  providers
  storage
  project-format
```

Use link checking and command smoke tests in CI. Every release claim should be traceable to an
automated acceptance test.

## Recommended engineering standards

### Definition of done

A change is complete when:

- behavior and non-goals are documented;
- types and validation cover the boundary;
- unit/integration tests cover success, failure, cancellation, and ownership where relevant;
- lint, typecheck, tests, build, and applicable E2E checks pass;
- user-facing strings are localized;
- logs do not expose secrets;
- persisted data has a migration/compatibility plan;
- the feature is enabled only in compatible runtime profiles;
- documentation reflects shipped behavior.

### Pull request size and ownership

- prefer one user-visible behavior or one refactoring seam per PR;
- do not combine dependency upgrades with feature changes;
- add `CODEOWNERS` for security/auth, persistence, packaging, and provider integrations;
- use an architecture decision record for irreversible platform choices;
- require a security review for new filesystem, process, remote-fetch, auth, or credential code.

### Useful automated budgets

Start with warnings, then make them blocking:

- production UI coordinator: warn above 600 lines;
- framework-independent domain/application module: warn above 350 lines;
- test file: warn above 700 lines;
- no new cross-feature internal imports;
- no direct `process.cwd()` outside the path service;
- no direct `spawn`/`exec` outside platform process adapters;
- no direct `localStorage` outside preference/session adapters;
- no new API route without schema, auth/capability declaration, and tests.

## Target architecture

```text
Presentation
  React components, hooks, accessible UI
          |
Application
  commands, queries, workflows, operation states
          |
Domain
  project, canvas, asset, generation, user rules
          |
Ports
  ProjectRepository, AssetRepository, Provider, Logger, Updater
          |
Adapters
  IndexedDB | filesystem | Google Drive | AI providers | Electron | Docker
```

Electron and Next.js remain delivery mechanisms, not places where business rules live.

## Suggested quality scorecard

This is a prioritization tool, not a grade.

| Area | Current | Target |
|---|---:|---:|
| Product capability | 8/10 | 9/10 |
| Build reproducibility | 5/10 | 9/10 |
| Test reliability | 5/10 | 9/10 |
| Code modularity | 4/10 | 8/10 |
| Desktop distribution | 3/10 | 9/10 |
| Data durability | 3/10 | 9/10 |
| Self-hosted security boundary | 3/10 | 9/10 |
| Documentation truthfulness | 5/10 | 9/10 |
| Observability/supportability | 6/10 | 9/10 |
| Accessibility confidence | 4/10 | 8/10 |

## First 30 days

Week 1:

- repair lint/tests and align CI with Node 24;
- correct documentation that overstates current releases/updates;
- define runtime profiles and disable network exposure by default;
- select and document the persistent user-data locations.

Week 2:

- implement the typed path service and legacy-data migration;
- add capability guards to privileged routes;
- add packaged desktop smoke tests;
- add custom application icons.

Week 3:

- implement the first signed/notarized draft release workflow;
- wire release metadata and updater packaging;
- add release checksums and an SBOM;
- start `ImageGeneratorModal` extraction with the generation state machine.

Week 4:

- publish an internal alpha release;
- test clean install, update, data survival, and uninstall on clean VMs;
- fix all discovered distribution defects;
- simplify the README around native downloads.

## Decision summary

The project should have two clearly different audiences:

1. **End users:** download a signed installer, install, and launch from an icon. They never install
   Git, Node, npm, Python, or source code for the core application.
2. **Contributors/self-hosters:** clone source and use documented development or Docker
   workflows.

Trying to make a source checkout behave like a consumer installer creates more failure points
and a less trustworthy product. Keep the bootstrap scripts as developer/recovery tools, but make
verified native releases the primary experience.

The implementation sequence and acceptance checklist are in
`docs/one_click_distribution_roadmap_2026-07-23.md`.
