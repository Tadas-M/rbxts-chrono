# Changelog

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
