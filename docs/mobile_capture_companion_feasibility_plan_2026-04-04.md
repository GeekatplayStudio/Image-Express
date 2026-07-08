# Mobile Capture Companion Feasibility Plan

Date: 2026-04-04

## Goal

Determine whether Image Express can support a mobile application that captures photos, videos, and audio and imports them directly into the existing application.

## Short Answer

Yes, this is feasible.

The recommended Phase 1 is not a full mobile editor. The recommended Phase 1 is a companion mobile uploader app that signs in, captures media, uploads it to shared storage, and makes it appear in the existing Image Express asset library.

## Why This Is Feasible In The Current Repo

The current codebase already contains most of the ingestion side needed for media import:

- The app is a Next.js 16 web application with an Electron desktop shell, not a mobile stack yet.
- The asset model already supports `images`, `videos`, `audio`, and `models`.
- The asset library already accepts uploads for image, video, audio, and model files.
- The upload API already detects media type from MIME type or file extension and writes files into the asset folders.
- The editor already has partial media behavior for video and audio through placeholders, preview, and HTML export support.

This means the missing piece is not basic media ingestion. The missing piece is a safe, mobile-ready product path and the supporting backend contract.

## Verified Repo Findings

### 1. No mobile runtime exists yet

- `package.json` contains Next.js and Electron scripts, but no Expo, React Native, or Capacitor dependencies.
- `next.config.ts` uses `output: "standalone"`, which means the current app expects a server runtime and is not set up as a static mobile bundle.

Implication:

- Turning the current app into a true native mobile app is possible, but it is not a packaging-only task.
- A full mobile editor would be a separate product effort.

### 2. Media upload is already implemented

Relevant files:

- `src/app/api/assets/upload/route.ts`
- `src/components/AssetLibrary.tsx`
- `src/types.ts`

Current behavior:

- The upload route accepts multipart form data with a file.
- It classifies uploads as image, video, audio, or model.
- It stores files under `public/assets/<category>/<type>/...`.
- The asset library input already accepts `image/*,video/*,audio/*` plus model formats.

Implication:

- Mobile-captured media can be imported into the app's asset system.
- The backend shape already exists and can be upgraded rather than invented from scratch.

### 3. Media support inside the editor is partial, not absent

Relevant files:

- `src/components/Toolbar.tsx`
- `src/components/Editor/EditorViewOverlays.tsx`
- `src/components/Editor/editorHtmlExportTemplates.ts`
- `docs/feature_implementation_tracker.md`

Current behavior:

- Images are first-class editable assets.
- Video and audio can be inserted as media placeholders.
- Media preview overlays exist for video and audio playback.
- Video frame capture into the canvas already exists.
- HTML export already knows how to render video and audio elements.

Implication:

- A mobile uploader immediately adds value even before deeper media editing work.
- Full timeline-style video or audio editing is not the current state of the editor.

### 4. Storage behavior is the main product constraint

Relevant files:

- `src/lib/assetStorageSettings.ts`
- `src/components/AssetLibrary.tsx`
- `src/lib/localAssetStore.ts`

Current behavior:

- Default asset storage mode is `hybrid`.
- Hybrid mode loads local assets and cloud assets and can include legacy server assets.
- Local asset storage uses IndexedDB, which is device-local.

Implication:

- A mobile companion app only solves cross-device import if uploads land in shared storage.
- Uploading into browser-local IndexedDB is not useful for cross-device import.
- The safe MVP target is shared server storage or a real cloud provider path.

### 5. The current upload route is not production-ready for public mobile clients

Relevant file:

- `src/app/api/assets/upload/route.ts`

Current behavior:

- The route trusts `owner` from request form data.
- The route writes directly to public asset folders.
- There is no visible authentication, file-size policy, quota, or upload hardening in the route.

Implication:

- This route is good enough for internal workflows and desktop/web prototyping.
- It should not be exposed as the final mobile ingestion endpoint without authentication and validation.

## Recommended Product Direction

## Recommendation

Build a companion mobile uploader app first.

Do not start with a full mobile editor.

### Why the companion app is the right first move

- It directly solves the stated problem: capture photos, video, and audio on a phone and bring them into Image Express.
- It avoids forcing the existing desktop/web editor into a small-screen workflow before the capture problem is solved.
- It lets the team reuse the existing web and desktop editor as the editing environment.
- It is far lower risk than a full mobile port of the editor.

## Delivery Options

### Option A: Mobile web capture inside the current app

Use the existing web app on mobile with capture-oriented file inputs, for example:

- `accept="image/*" capture="environment"`
- `accept="video/*" capture`
- `accept="audio/*" capture`

Pros:

- Fastest prototype.
- Reuses the current app immediately.
- Good for proving user demand and testing backend flow.

Cons:

- Browser capture UX is inconsistent across iOS and Android.
- Background uploads and retries are limited.
- App-store distribution is not solved.
- Device permission behavior is less controllable.

Use this when:

- The team wants a 1-2 sprint validation path.

### Option B: Native companion app for capture and upload

Recommended implementation path:

- Build a small native mobile app focused only on sign-in, capture, import, upload queue, and recent uploads.

Technology recommendation:

- Prefer Expo / React Native for the companion uploader.

Reasoning:

- The capture app has a narrow scope, so native capture APIs matter more than UI code reuse.
- The current Next.js application is server-backed, so wrapping it as a local native bundle is not the cleanest first move.
- Expo is a better fit for a focused camera/audio/file uploader than trying to make the full Next app behave like a native app.

Alternative:

- Capacitor is still viable if the team wants a web-heavy shell that points to a hosted environment, but it is not the best first choice for a companion uploader.

### Option C: Full mobile editor

Possible, but not recommended for Phase 1.

Why not first:

- The current editor is large, desktop-oriented, and built around Fabric.js interactions.
- The mobile UI, gesture model, panel density, and editing precision would all need separate product design.
- This is a much larger project than the capture/import requirement.

## Recommended Architecture

### Phase 1 architecture

- Existing Image Express web app remains the main editor.
- Existing desktop Electron shell remains unchanged.
- New mobile companion app handles capture and upload only.
- A hardened server upload API receives mobile media.
- Uploaded assets appear in the shared asset library for the same user.

### Data flow

1. User signs into the mobile app.
2. User captures a photo, video, or audio clip, or picks existing media.
3. Mobile app uploads media to a shared backend endpoint.
4. Backend validates the upload, resolves the signed-in user, stores the file, records metadata, and returns an asset descriptor.
5. Desktop/web app refreshes the asset library and shows the new asset.

## Backend Work Required Before Mobile Launch

### 1. Create a mobile-safe upload endpoint

Recommended paths:

- Add a dedicated endpoint such as `POST /api/mobile/assets/upload`, or
- Harden `POST /api/assets/upload` and place proper auth and validation in front of it.

Required changes:

- Resolve owner from authenticated identity, not request body.
- Enforce MIME and extension allowlists.
- Enforce size limits per media type.
- Add rate limits and abuse protection.
- Reject malformed uploads early.

### 2. Decide the shared storage target

For cross-device visibility, the mobile app must upload into storage that both phone and desktop/web can see.

Safe MVP choices:

- Shared server asset storage.
- Google Drive-backed storage if the team wants cloud sync behavior.

Avoid for this use case:

- Local-only IndexedDB storage.

### 3. Add media metadata and processing

Recommended metadata:

- `source: mobile`
- `devicePlatform`
- `capturedAt`
- `duration` for video/audio
- `width` and `height` for images/video
- `mimeType`
- `sizeBytes`

Recommended background processing:

- Generate thumbnails for video.
- Extract poster frame for video.
- Normalize or transcode if needed later.

### 4. Add asset refresh behavior across devices

The current app already refreshes its library through explicit fetches, but mobile-to-desktop visibility should be made deliberate.

Choose one:

- Manual refresh button in Asset Library.
- Short polling while Asset Library is open.
- WebSocket or SSE push updates for richer sync.

## Development Plan

## Phase 0: Product decision

Goal:

- Confirm that the mobile deliverable is a companion uploader, not a full editor.

Tasks:

- Define supported media types for MVP: photo, video, audio, gallery import.
- Define max upload sizes and duration limits.
- Define whether uploads should appear in personal assets only or optionally public/shared assets.
- Define whether uploads must arrive instantly in the desktop/web session.

Exit criteria:

- One approved scope document.
- One upload/storage decision.

## Phase 1: Backend hardening

Goal:

- Make media upload secure and mobile-safe.

Tasks:

- Add authenticated upload endpoint.
- Resolve user identity server-side.
- Add validation for MIME, size, and extension.
- Add structured error responses.
- Return normalized asset descriptors.
- Add tests for auth, file rejection, success, and metadata creation.

Exit criteria:

- Mobile uploads can be accepted securely.
- New assets appear in shared storage and are listable by the app.

## Phase 2: Mobile companion app MVP

Goal:

- Ship a narrow mobile app that captures and uploads media.

Core screens:

- Sign in
- Capture / Import
- Upload queue
- Recent uploads
- Settings

Core capabilities:

- Capture photo from camera.
- Capture video from camera.
- Capture audio from microphone.
- Pick from photo library and file picker.
- Upload with progress.
- Retry failed uploads.
- Show upload result and returned asset metadata.

Exit criteria:

- A signed-in user can capture media and upload it successfully on iOS and Android.

## Phase 3: Desktop/web integration polish

Goal:

- Make imported mobile media feel native inside Image Express.

Tasks:

- Add a clear refresh pattern in Asset Library.
- Optionally label assets as uploaded from mobile.
- Optionally add a filter such as `Source: Mobile`.
- Optionally add a desktop QR flow: desktop generates a QR code that opens the mobile uploader already scoped to the user's account/session.

Exit criteria:

- Users can see and use newly uploaded mobile assets without confusion.

## Phase 4: Production hardening

Goal:

- Make the system reliable for real users and larger media files.

Tasks:

- Add resumable upload for larger videos.
- Add background upload recovery.
- Add crash/error reporting.
- Add upload analytics and failure telemetry.
- Add moderation and storage cleanup policies if required.

Exit criteria:

- Upload reliability is acceptable on poor mobile networks.

## Risks And Constraints

### 1. Local-only asset mode does not solve cross-device import

If a user's workflow depends on local IndexedDB-only storage, mobile uploads will not automatically solve the cross-device problem.

### 2. Large video uploads will outgrow the current direct-to-server file write model

The current server route writes uploads directly to disk. That is acceptable for an MVP, but serious mobile video workflows usually need resumable or direct-to-object-storage uploads.

### 3. Media editing depth is currently uneven

The app already supports media placeholders, preview, HTML export, and video frame capture, but it is not a full mobile-first video/audio editor.

### 4. Real-time sync is not automatic yet

Cross-device visibility should be explicitly designed instead of assumed.

## Suggested MVP Success Criteria

- User can sign in on mobile.
- User can capture photo, short video, and audio note.
- Upload succeeds for authenticated users.
- Uploaded asset appears in the web/desktop asset library within an acceptable time window.
- Video preview and audio preview work from imported assets.
- Video frame capture continues to work from imported video.

## Final Recommendation

Proceed.

Recommended order:

1. Harden the upload backend.
2. Build a companion mobile uploader app.
3. Add asset-library refresh and mobile-source visibility.
4. Reassess later whether a full mobile editor is worth the cost.

This keeps the project aligned with the actual user need, reuses the current application architecture, and avoids turning a capture/import requirement into a full mobile editor rewrite.