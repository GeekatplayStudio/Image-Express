# Mobile Capture Backend Auth And Upload Contract

Date: 2026-04-04

## Purpose

Document the backend contract that now exists for authenticated media upload and legacy server asset access, so the planned mobile capture companion can integrate against a stable path.

## What Changed

The app now issues a signed session token from the existing login flows and uses that token to protect legacy server-backed asset routes whenever the request is acting on behalf of a non-guest user.

Implemented routes:

- `POST /api/user/auth/login`
- `POST /api/user/auth/google`
- `POST /api/assets/upload`
- `GET /api/assets/list`
- `POST /api/assets/rename`
- `POST /api/assets/delete`
- `POST /api/assets/visibility`

Supporting modules:

- `src/lib/server/user-session.ts`
- `src/lib/authSession.ts`

## Session Token Behavior

## Issuance

The following routes now return a `sessionToken` inside the `user` payload on successful authentication:

- `POST /api/user/auth/login`
- `POST /api/user/auth/google`

Response shape:

```json
{
  "success": true,
  "user": {
    "id": "usr_...",
    "email": "artist@example.com",
    "displayName": "Artist",
    "roles": ["creator"],
    "rights": ["assets:own"],
    "status": "approved",
    "sessionToken": "<signed-token>"
  }
}
```

## Storage

The current web app stores the authenticated user object, including `sessionToken`, in localStorage under:

- `image-express-user`

## Validation

The token is:

- signed server-side,
- time-bounded,
- tied to user id and email,
- invalidated if the backing user record changes materially enough to move `updatedAt` beyond the token issue time.

## Server Asset Route Rules

## Guest behavior

Guest uploads and guest-owned asset actions remain allowed without authentication when the owner is `Guest` or omitted.

## Authenticated user behavior

If a request specifies a non-guest owner, the request must include:

```http
Authorization: Bearer <sessionToken>
```

If the token is missing, the route returns `401`.

If the token user and requested owner do not match, the route returns `403`.

When authentication succeeds, the server resolves the effective owner from the token-backed user identity instead of trusting the body/query owner field.

## Route Contract Details

## `POST /api/assets/upload`

Purpose:

- Upload a captured or imported media file into server-backed asset storage.

Request:

- multipart form data
- fields:
  - `file`
  - `category` optional, defaults to `uploads`
  - `owner` optional for guest flows, required by current callers for authenticated flows
  - `isPublic` optional

Auth:

- required when `owner` is non-guest

Type handling:

- image, video, audio, and known model formats are accepted
- unsupported types return `415`

Current size limits:

- images: 50 MB
- videos: 200 MB
- audio: 100 MB
- models: 250 MB

Success response:

```json
{
  "success": true,
  "path": "/api/assets/serve/uploads/images/file-123.png",
  "filename": "file-123.png",
  "type": "images",
  "category": "uploads",
  "owner": "artist@example.com",
  "isPublic": false
}
```

## `GET /api/assets/list`

Purpose:

- List server-backed assets for the current user, shared view, or both.

Query parameters:

- `type`
- `category`
- `owner`
- `scope`
- `includePublic`
- `visibility`
- `search`

Auth:

- required when `owner` is non-guest

Notes:

- the authenticated user becomes the effective owner filter
- this closes the earlier owner-spoof path based only on query parameters

## `POST /api/assets/rename`

Purpose:

- Rename a server-backed asset when the authenticated user owns it.

Auth:

- required when `owner` is non-guest

## `POST /api/assets/delete`

Purpose:

- Delete a server-backed asset when the authenticated user owns it.

Auth:

- required when `owner` is non-guest

## `POST /api/assets/visibility`

Purpose:

- Toggle public/private visibility for a server-backed asset when the authenticated user owns it.

Auth:

- required when `owner` is non-guest

## Current Web Client Behavior

The existing web client now sends the session token automatically for legacy server asset calls from:

- `src/components/AssetLibrary.tsx`
- `src/components/Editor/useEditorCanvasAssetActions.ts`

This means:

- authenticated legacy server asset listing now uses the token,
- server rename/delete/visibility now use the token,
- editor drag-and-drop upload to the server route now uses the token.

## Mobile Companion Integration Guidance

## Recommended initial flow

1. Authenticate with `POST /api/user/auth/login` or `POST /api/user/auth/google`.
2. Persist the returned `sessionToken` securely on device.
3. Upload captured media through `POST /api/assets/upload` with `Authorization: Bearer <sessionToken>`.
4. Use `GET /api/assets/list` with the same bearer token to confirm that the upload is visible.

## Minimal mobile upload example

```http
POST /api/assets/upload
Authorization: Bearer <sessionToken>
Content-Type: multipart/form-data
```

Form fields:

- `file`: captured photo, video, audio, or supported model file
- `category`: `uploads`
- `owner`: authenticated user email
- `isPublic`: `false` for MVP

## Known Limitations

- This is a signed token model, not a refresh-token or cookie-session system.
- There is no resumable upload yet for large mobile video uploads.
- The legacy server asset routes are now protected for non-guest owners, but a dedicated mobile upload endpoint still may be preferable later.
- The asset library still depends on the existing server/local/cloud storage model and does not yet include mobile-specific source labels or sync UX.

## Recommended Next Steps

1. Add a dedicated mobile upload route or keep using `/api/assets/upload` as the stable MVP contract.
2. Add richer upload metadata: duration, dimensions, source device, captured timestamp.
3. Add thumbnail/poster generation for uploaded video.
4. Add resumable upload strategy for larger mobile video files.
5. Add asset-library UX for `Source: Mobile` and recent mobile uploads.