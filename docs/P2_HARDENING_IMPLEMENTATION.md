# P2 Hardening Implementation

Date: 2026-07-23  
Status: engineering-maturity baseline implemented

## Outcome

P2 turns diagnostics, dependency safety, and performance limits into product behavior and
automated policy. The work deliberately avoids opt-out telemetry: diagnostics stay on the
user's machine unless the user explicitly copies or shares them.

## Privacy-safe diagnostics

The Electron shell and Next.js server now write newline-delimited JSON records:

- desktop log: `<user-data>/logs/desktop.jsonl`;
- server log: `<user-data>/logs/server.jsonl`;
- maximum active log size: 2 MB;
- retained rotations: three.

Both loggers redact sensitive object keys and string values, including API keys, authorization
headers, bearer tokens, passwords, secrets, prompts, image fields, home paths, application
paths, and data/storage roots. Server responses log stable request IDs, public error codes,
status, and retryability without logging request bodies.

Desktop startup records elapsed timings for Electron ready, local server ready, and window
ready. Updater state and child-server lifecycle are recorded, while child stdout/stderr content
is intentionally not copied into support logs.

The Help menu exposes three desktop-only actions through the context-isolated preload bridge:

1. **Open Logs Folder**
2. **Open User Data Folder**
3. **Copy Diagnostics**

Copied diagnostics contain application/runtime versions, platform and architecture, uptime,
startup timings, update state, free disk bytes, placeholder storage paths, and log file
names/sizes. They do not contain log contents, credentials, prompts, images, or full local
paths.

## Dependency governance

Production dependency maintenance is no longer an end-user feature:

- the panel is omitted from production builds;
- the dependency-maintenance API rejects desktop and self-hosted profiles, even if a caller has
  the desktop capability token;
- the workflow remains available only to a loopback developer workspace.

Automated controls:

- `npm run audit:dependencies` audits production packages in CI and release verification;
- `config/dependency-audit-exceptions.json` is the reviewed, expiring exception registry;
- Dependabot opens grouped weekly npm updates and monthly GitHub Actions updates;
- Jest and `jest-environment-jsdom` are aligned on major version 29;
- direct security-sensitive dependencies are exact-pinned.

`@huggingface/transformers` is pinned to 3.8.1, eliminating the high-severity
`adm-zip`/`onnxruntime-node` audit path present in 4.2.0. MCP stays on 1.29.0 because the older
version suggested by npm reintroduces two high-severity SDK advisories.

The remaining moderate Hono advisory concerns its Windows HTTP `serve-static` adapter. Image
Express uses MCP's `StdioServerTransport`, not that adapter. The exception expires on
2026-10-31 so a fixed dependency path must be adopted or the risk must be reviewed again.
High and critical production vulnerabilities have no exceptions.

Release builds already generate a CycloneDX SBOM and SHA-256 checksums.

All desktop build/distribution scripts now call the canonical `npm run build` lifecycle. This
ensures the repeat-build cleanup runs before Next.js and prevents stale `.next/node_modules`
output from breaking a second package attempt.

## Performance budgets

`npm run audit:bundle` measures every JavaScript file under `.next/static/chunks` after a
production build and fails when:

- aggregate client JavaScript exceeds 12,500,000 bytes; or
- any single emitted chunk exceeds 3,250,000 bytes.

The check runs at the end of `npm run verify`. These are regression budgets based on the
existing application, not aspirational performance claims. Future slices should lower them as
large features are isolated and dynamically loaded.

The verified P2 build emitted 43 chunks totaling 11,827,431 bytes. The largest chunk was
2,996,359 bytes.

The depth-estimation transformer remains behind a dynamic import, so its runtime is not
executed unless depth generation is requested.

## Verification

Run the complete offline quality gate:

```bash
npm run verify
```

Run the network-backed production dependency policy separately:

```bash
npm run audit:dependencies
```

Focused P2 coverage includes:

- structured-log redaction and JSONL output;
- desktop Help support bridge behavior and browser-only absence;
- runtime-profile denial of dependency maintenance in desktop/self-hosted modes;
- Electron main/preload syntax checks;
- unpacked macOS desktop packaging and package-content verification;
- dependency exceptions and expiry enforcement;
- bundle output measurement after a production build.

## Remaining P2 roadmap

This baseline does not claim that all maturity work is finished. Continue in small, measurable
slices:

1. ~~Add packaged Electron smoke tests on Windows, macOS, and Linux CI runners.~~ Implemented
   in P2.1.
2. Continue Playwright critical-journey coverage beyond the P2.1 save/persistence and export
   journeys, particularly provider failure and update behavior.
3. Add an opt-in crash-reporting design only after its privacy contract and retention policy
   are approved.
4. Split and dynamically import the 3D editor, provider/setup modals, and large asset previews;
   then lower bundle budgets.
5. Virtualize large asset and layer lists and move thumbnail/image processing to workers.
6. Add interaction-latency, repeated-open memory, startup, and export-time benchmarks with
   versioned baselines.
7. Add axe smoke tests plus manual keyboard/focus/reduced-motion release checks.
8. Eliminate the remaining Turbopack whole-project file-tracing warning at the ComfyUI library
   server boundary.
