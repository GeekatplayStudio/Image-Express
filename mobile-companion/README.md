# Image Express Mobile Companion

This is a standalone Expo scaffold for the Image Express mobile capture companion. It is intentionally scoped to one job: capture media on a phone and upload it into the existing Image Express asset pipeline.

## What It Does Today

- signs in against the existing `POST /api/user/auth/login` route,
- signs in with Google against the existing `POST /api/user/auth/google` route,
- stores the returned session token in secure storage,
- captures photos,
- captures videos,
- records audio,
- imports existing image, video, or audio files,
- persists the upload queue locally with AsyncStorage,
- shows recent uploaded assets from the server,
- uploads queued items through the hardened `POST /api/assets/upload` route.

## Folder Layout

- `App.tsx`: single-screen MVP shell for login, capture, queue, and upload.
- `src/lib/api.ts`: API requests for login and upload.
- `src/lib/storage.ts`: secure storage for auth data and AsyncStorage persistence for the upload queue.
- `src/types.ts`: mobile companion types.

## Run It

1. Open a terminal in `mobile-companion`.
2. Install dependencies if this is a fresh clone:
   `npm install`
3. Start Expo:
   `npm run start`
4. Open the app on a device or emulator.

## Validation Status

- Dependencies were installed successfully in this workspace.
- `npm run typecheck` passes for the current scaffold.
- The next required validation step is running Expo on a device or emulator against a reachable LAN URL.

## Google Sign-In Configuration

Set one or more of these Expo public env vars before starting the mobile app:

- `EXPO_PUBLIC_GOOGLE_AUTH_CLIENT_ID` for a generic fallback client ID.
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` for iOS native auth.
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` for Android native auth.
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` for web auth.

The mobile app sends the same client ID it used for Google auth back to `/api/user/auth/google`, which matches the server route's audience fallback behavior.

## Important Connection Note

Do not use `http://localhost:3000` on a physical device.

Use the LAN address of the machine running Image Express, for example:

`http://192.168.1.24:3000`

## Current Backend Contract

The mobile app assumes:

- login returns `user.sessionToken`,
- authenticated uploads send `Authorization: Bearer <sessionToken>`,
- upload calls include `owner` set to the authenticated user email.

See:

- `../docs/mobile_capture_backend_auth_and_upload_contract_2026-04-04.md`

## Current Limitations

- There is no resumable upload yet for larger videos.
- Video poster generation and richer upload metadata are not implemented yet.
- Queue persistence currently depends on the captured file URIs remaining valid on-device; a more durable local file strategy may still be needed for longer retention windows.
- Google sign-in still requires real Google OAuth client IDs to be configured for the mobile environment before it can be exercised on-device.

## Recommended Next Steps

1. Run and verify Google sign-in on a real device or emulator with valid OAuth client IDs.
2. Add resumable upload and retry behavior for larger video files.
3. Add richer upload metadata such as duration and capture timestamp.
4. Expand the recent uploads view into fuller asset browsing backed by `GET /api/assets/list`.