# Changelog

## 2.0.4 (2026-04-27)

Tracks chrono-lua patch releases v2.0.1 → v2.0.4.

### Breaking Changes

- **`Entity.setModelPrimaryForChrono` moved to `Config.SetModelPrimaryForChrono`** — Matches the upstream rename in chrono-lua v2.0.2. Update call sites from `Chrono.Entity.setModelPrimaryForChrono(model, name)` to `Chrono.Config.SetModelPrimaryForChrono(model, name)`.

### New Features

- **`Config.RegisterEntityModel` accepts `false` for the `model` parameter** — Register a data-only entity type with no physical model (chrono-lua v2.0.3).
- **`Entity.interpolation`** — New writable boolean field on entities controlling whether automatic client-side interpolation runs. Defaults to `true` on the client, `false` on the server.
- **`Config.FLAGS`** — Exposed runtime feature flags table (`SNAPSHOT_INTERPOLATION_FIX`, `SET_CFRAME_FIX`).

### Internal

- Updated `chrono-lua` dependency from `v2.0.0` to `v2.0.4`.
- JSDoc note added to `Entity.SetCFrame` documenting the new teleport-timestamp / snapshot-clear semantics introduced by the `SET_CFRAME_FIX` flag.

## 2.0.0 (2026-04-10)

Stable release — migrated from `2.0.0-experimental` to match Chrono v2.0.0.

### Breaking Changes

- **`SEND_FULL_ROTATION` removed from `ConfigName`** — This config option is no longer user-settable via `Config.SetConfig()`. Use the per-entity `FULL_ROTATION` option in `EntityConfigInput` instead.

### New Features

- **`Entity.Push` now accepts optional `velocity`** — `Push(entity, time, value, velocity?)` allows passing a `Vector3` velocity for improved interpolation.
- **`Entity.GetModelReplicationType`** — New method to query an entity's current replication mode (`"NATIVE" | "CUSTOM" | "NATIVE_WITH_LOCK"`).
- **`Entity.setModelPrimaryForChrono`** — New method to set a custom primary part attribute on a model for Chrono interpolation (useful for R6 characters).
- **`ServerClock.Store` now accepts optional `clientServerTimeNow`** — Improved clock synchronization accuracy using server time reference.
- **New Entity properties** — Added readonly access to: `broadPhase`, `autoUpdatePosition`, `latestTime`, `modelString`, `modelReplicationMode`, `mountParentId`, `mountOffset`, `snapshot`, `entityConfig`.

### Internal

- Updated `chrono-lua` dependency from `v2.0.0-experimental` to `v2.0.0`.
