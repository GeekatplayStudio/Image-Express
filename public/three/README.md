# 3D assets served by the app

- `draco/`, `basis/` — three.js' Draco and Basis decoders, copied from
  `node_modules/three/examples/jsm/libs` by `scripts/sync-three-assets.mjs`.
  Run that script after upgrading `three`; a test fails when they drift.
- `hdri/` — the ten lighting environments the 3D editor offers. CC0 HDRIs from
  Poly Haven, as packaged by `@pmndrs/assets` 1.7.0 (CC0-1.0) — the same looks
  drei's presets fetch from a CDN, kept here so the editor works offline.
