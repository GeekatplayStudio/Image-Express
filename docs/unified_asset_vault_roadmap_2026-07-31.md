# Unified Asset Vault — Implementation Roadmap

Date: 2026-07-31  
Status: in progress  
Spec: [`unified_asset_vault_implementation_2026-07-31.md`](./unified_asset_vault_implementation_2026-07-31.md)

> **Policy:** The classic **Asset Library** (`AssetLibrary.tsx`) remains the source of truth for CRUD until vault parity is complete. Vault is additive — expand, never remove.

---

## Feature parity matrix (classic library → vault)

| Feature | Classic library | Vault target | Status |
|---|---|---|---|
| Image grid + thumbnails | ✅ | ✅ | ✅ Phase 0 |
| Video preview + playback | ✅ | ✅ | ✅ Phase 0 |
| Audio preview + playback | ✅ | ✅ | ✅ Phase 0 |
| 3D model preview (GLB) | ✅ `Asset3DPreview` | ✅ reused | ✅ Phase 0 |
| Model hover popup | ✅ | 🔜 | ⬜ Phase 2 |
| Full-size detail modal | ✅ | ✅ | ✅ Phase 0 |
| Video frame capture | ✅ | 🔜 | ⬜ Phase 2 |
| Upload (drag + button) | ✅ | 🔜 delegate to classic | ⬜ Phase 2 |
| Delete | ✅ | 🔜 delegate to classic | ⬜ Phase 2 |
| Rename | ✅ | 🔜 delegate to classic | ⬜ Phase 2 |
| Public / private sharing | ✅ | 🔜 delegate to classic | ⬜ Phase 2 |
| Personal / shared scope | ✅ | ✅ filters | ✅ Phase 0 |
| Custom groups / folders | ✅ localStorage | 🔜 Vault Albums | 🔄 Phase 1 (Album→Page trees) |
| Multi-select + bulk ops | ✅ | 🔜 | ⬜ Phase 2 |
| Import / export bundle (ZIP) | ✅ | 🔜 | ⬜ Phase 3 |
| Merge duplicates (multi-source) | ✅ | ✅ dedupe by key | ✅ Phase 0 |
| Local + server + Drive sources | ✅ | ✅ unified catalog | ✅ Phase 1 |
| Keyword search | ✅ | ✅ | ✅ Phase 0 |
| AI caption / tags index | ✅ | ✅ preserved metadata | ✅ Phase 0 |
| Semantic / vector search | ❌ | ✅ hybrid Smart mode | ✅ Phase 1 |
| Find similar | ❌ | ✅ | ✅ Phase 1 |
| Storage mode (local/hybrid/cloud) | ✅ | ✅ respects settings | ✅ Phase 1 |
| Add local drives / folders | ❌ | ✅ watch roots | ✅ Phase 1 |
| 3D vault Album → Page → Assets | ❌ | ✅ | ✅ Phase 1 redesign |
| Organize lenses (type/date/location/subject) | ❌ | ✅ | ✅ Phase 1 |
| 3D model preview quality | ✅ | ✅ improved Asset3DPreview | ✅ Phase 1 |
| Add to canvas | ✅ | ✅ | ✅ Phase 0 |
| Alt/Option + right-click circular menu | ❌ | ✅ | ✅ Phase 0 |
| Smart cluster albums | ❌ | ✅ | ✅ Phase 1 |
| AI caption / embed enrich | ❌ | ✅ Ollama | ✅ Phase 1 |
| Multi-drive / NAS indexing | ❌ | 🔜 Electron | ⬜ Phase 3 |
| Super Agent / MCP vault tools | ❌ | 🔜 | ⬜ Phase 4 |

Legend: ✅ done · 🔄 partial · 🔜 planned · ⬜ not started

---

## Phase 0 — Foundation & entry points

- [x] Roadmap + parity matrix (this document)
- [x] `src/features/asset-vault/contracts/*` — shared types + Zod schemas
- [x] `src/features/asset-vault/domain/*` — registry helpers, bookcase engine, query fusion
- [x] `src/lib/server/vault-store.ts` — JSON persistence under `data/vault/`
- [x] `getVaultDir()` in `appPaths.ts`
- [x] API: `GET /api/assets/vault/status`
- [x] API: `POST /api/assets/vault/search`
- [x] API: `GET|POST /api/assets/vault/bookcases`
- [x] API: `POST /api/assets/vault/sync` — rebuild server catalog
- [x] `AssetVaultModal` — unified browse + search UI
- [x] `VaultCircularMenu` — Alt/Option + right-click ring
- [x] Editor integration (non-breaking; classic library unchanged)
- [x] i18n keys (`vault.*`)
- [x] Unit tests for domain + API

## Phase 1 — Hybrid search & local merge

- [x] Client local catalog connector (IndexedDB → vault records)
- [x] Google Drive metadata in unified catalog
- [x] Text embedding / vector store skeleton (`hash-text-v1` + RRF; CLIP upgrade path)
- [x] Hybrid search (keyword + vector RRF) via Smart mode
- [x] Smart search mode with LLM query expansion (Ollama; hash fallback)
- [x] Bookcase rules: timeline, type, location (Drive + Indexed Drives)
- [x] Vault UI: timeline month shelves + Drive bookcase
- [x] Vault UI: 3D album room (floating boxes) → page stacks → file manager
- [x] Organize lenses: Type / Date / Location / Subject with animated reshuffle
- [x] Lens switch preserves 3D vs flat mode (does not force Room / 3D)
- [x] Flat Files view: left album → page sidebar (file-manager style) + asset grid
- [x] Sync + New Album surfaced on vault toolbar
- [x] Axis-aligned XYZ album grid + natural 3D nav (orbit / zoom / Space-pan / Alt-depth)
- [x] Natural-language sort phrases in vault search + explicit sort control
- [x] Compact chrome + Album/Page naming (bookcase retired from UI)
- [x] *Image Express* Beta on app title (not vault chrome)
- [x] Clicking a 3D album box opens the inside page-stack view
- [x] Watch roots: add drives/folders/paths + scan/index API
- [x] Vault Sources panel: native Browse drive/folder picker first (typed path = advanced)
- [x] Classic Asset3DPreview for models (Spin/Light); SVG album-room removed from vault chrome
- [x] Smart (vector + keyword) search default in vault UI + AI index on toolbar
- [x] Improved `Asset3DPreview` (zoom, spin toggle, errors) + model thumbnails in vault
- [x] On-the-fly manual album from current results
- [x] Vault UI: smart cluster + find similar
- [x] Local AI captioning + text embeddings (`/api/assets/vault/enrich`)
- [x] CLIP visual embedding helper (Transformers.js, lazy client load)

## Phase 2 — Full CRUD parity & richer previews

- [ ] Upload / delete / rename / visibility in vault UI
- [ ] Custom groups → manual bookcases migration
- [ ] Multi-select bulk operations
- [ ] Video frame capture in vault detail
- [ ] Model hover popup parity
- [ ] "Manage in classic library" removed when parity reached

## Phase 3 — Multi-location indexing

- [ ] Electron local drive connector + watcher
- [ ] Network share (UNC/SMB) connector
- [x] Watch roots UI in Storage settings
- [ ] Content-hash deduplication across origins
- [ ] Import/export through vault

## Phase 4 — Agents & canvas bridge

- [ ] Layer `assetRefId` in multicanvas snapshots
- [ ] Super Agent vault tools
- [ ] MCP `vault_search` / `vault_browse`
- [ ] Optional cutover flag: default to vault instead of classic library

---

## Switch-over criteria (classic → vault default)

All must be true before changing the default `assets` toolbar target:

1. Every row in the parity matrix marked ✅
2. E2E tests cover upload, delete, rename, share, preview, search, add-to-canvas
3. No regression in Drive / hybrid storage modes
4. User setting: "Prefer Asset Vault" (opt-in beta → default)

Until then: **toolbar Gallery → Asset Vault** (Classic Library remains available from inside the vault); **Alt+right-click → vault circular menu**.

---

## File map

| Path | Purpose |
|---|---|
| `src/features/asset-vault/contracts/` | Public types + Zod |
| `src/features/asset-vault/domain/` | Pure logic |
| `src/features/asset-vault/application/` | Services |
| `src/lib/server/vault-store.ts` | Server persistence |
| `src/app/api/assets/vault/` | HTTP API (search, sync, bookcases, watch-roots, enrich, similar) |
| `src/features/asset-vault/application/client/clipEmbedder.ts` | Optional Transformers.js CLIP helper |
| `src/lib/server/ollamaEmbeddings.ts` | Ollama embeddings + query expansion |
| `src/lib/server/vaultEnrichment.ts` | Caption + embed enrich pipeline |
| `src/components/AssetVault/` | Vault UI (Album room, Page stack, modal) |
| `src/features/asset-vault/domain/vaultAlbumTree.ts` | Album→Page trees per organize lens |
| `src/components/VaultCircularMenu.tsx` | Alt+right-click ring |
| `src/components/AssetLibrary.tsx` | Classic library (unchanged) |
