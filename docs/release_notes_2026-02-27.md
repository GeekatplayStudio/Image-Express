# Release Notes — 2026-02-27

## Summary
This update focuses on runtime stability and cloud-auth robustness while continuing the editor refactor program to reduce integration-file complexity.

## Shipped
- Fixed canvas flicker / React update-depth loop risk by stabilizing `DesignCanvas` initialization callbacks with refs and tightening effect dependencies.
- Reduced repeated Fabric canvas teardown/re-init behavior from parent callback identity churn.
- Hardened Google Drive cloud listing flow:
  - passive asset fetch now uses non-interactive auth
  - no popup auth attempts from background effects
  - graceful fallback to local/server assets when re-auth requires user action
- Added safer default for `listDriveAssets` auth mode to prevent unintended popup token requests.
- Added extraction slices in editor menu/header composition and top tool-options bridge props to continue line-count reduction work.

## Validation
- Production build passed (`npm.cmd run build`).
- Type checks clean for updated stability/auth modules.

## Notes
- Browser-level extension message-channel errors (`listener indicated an asynchronous response...`) are environment/extension-originated and not from app message listeners in this codebase.
