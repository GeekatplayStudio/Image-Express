# Mobile Capture Companion Scaffold

Date: 2026-04-04

## Summary

An initial Expo-based mobile companion scaffold now exists under `mobile-companion/`.

This is not a mobile editor. It is a capture-and-upload companion that fits the previously documented plan.

## Delivered In This Scaffold

- standalone Expo app structure under `mobile-companion/`,
- secure persistence for base URL and auth session token,
- AsyncStorage-backed persistence for the mobile upload queue,
- password login against the existing auth route,
- Google sign-in against the existing Google auth route,
- photo capture,
- video capture,
- audio recording,
- import of existing image/video/audio files,
- upload queue UI,
- recent uploads view backed by the existing asset list API,
- upload integration with the hardened bearer-token asset upload route.

## Important Repo Integration Detail

The root Next.js repo now excludes `mobile-companion/**` from:

- root TypeScript compilation,
- root ESLint processing.

This avoids breaking the existing web build while the mobile app lives as a nested standalone project.

## Files Added

- `mobile-companion/package.json`
- `mobile-companion/package-lock.json`
- `mobile-companion/app.json`
- `mobile-companion/babel.config.js`
- `mobile-companion/tsconfig.json`
- `mobile-companion/App.tsx`
- `mobile-companion/src/lib/api.ts`
- `mobile-companion/src/lib/storage.ts`
- `mobile-companion/src/types.ts`
- `mobile-companion/README.md`

## Validation Completed

- `npm install` completed successfully inside `mobile-companion/`.
- `npx expo install @react-native-async-storage/async-storage` completed successfully.
- `npx expo install expo-auth-session expo-web-browser` completed successfully.
- `mobile-companion/package-lock.json` now exists.
- `npm run typecheck` completed successfully inside `mobile-companion/`.
- the scaffold currently reports no TypeScript diagnostics in the mobile app files.

## What Still Needs To Happen

1. Run the Expo app on a device or emulator and verify Google sign-in with real OAuth client IDs.
2. Add resumable upload work for larger video files.
3. Expand the recent uploads view into richer server asset browsing and filtering.
4. Add upload-side metadata such as duration, capture timestamp, and device details.
5. Decide whether long-lived queue persistence should move from URI-based replay to a more durable local file strategy.

## Validation Scope

The root web app build remains valid after this scaffold because the mobile folder is excluded from the current web toolchain.

The mobile app itself has now been validated at the dependency-resolution and TypeScript levels, but it has not yet been exercised on a physical device or emulator.