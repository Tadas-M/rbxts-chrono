# Changelog

## 2.3.0 (2026-11-06)

Tracks Chrono v2.2.1 → v2.3.0.

### Breaking Changes

- **`ATTACH_MODEL_META_DATA` removed from `EntityConfigInput`** — Chrono no longer attaches model metadata.
- **`ServerClock.Store` lost its `clientServerTimeNow` parameter.**
- **`Config.SetConfig` and `Config.RegisterEntityType` validate their input** — Unknown config names and invalid values now error, and `Chrono.Start()` errors if `MIN_BUFFER` exceeds `MAX_BUFFER`.
- **`Entity.SetMount` errors on a self-mount or a parent that isn't registered** — A destroyed parent counts. A self-mount used to warn, and an unregistered parent was accepted.

### New Features

- **`Chrono.Started(callback)`** — Runs a callback once Chrono has started.
- **`EntityConfig.ticker`** and the new **`Ticker`** interface — Each entity type's shared server ticker, with a `Ticked` event for stepping your own simulation.
- **`ServerClock.ToServerTime(entity, renderTime, maxRewind?)`** — Converts a client's render time to a server time for `Entity.GetAt`, for lag compensation.
- **`Entity.GetClock(entity)`** and the new **`ClientClock`** interface.
- **`Entity.GetMountRoot(entity)`** — Top of the mount chain and the entity's offset from it.
- **`Entity.GetEntityType(entity)`** — Name of the entity's type.
- **`Entity.SetInterpolationMode(entity, undefined)`** — Returns to the type's mode.
- **`HALF_TICK_MARGIN`** and **`INTERPOLATION_FUNCTION`** in `EntityConfigInput`, with a new `InterpolationFunction` type. `BUFFER` is now optional, matching the runtime.
- **`EntityGrid.IsReplicated(player, entity)`**, **`Stats.SetForced(value)`**, **`Config.FLAGS.CHARACTER_WAIT_DELAY`**, **`Snapshot.PushWithCheck`**, **`ChronoSignal.HasListeners`** and **`Entity.lastClientClock`**.

### Package

- **`Chrono.Player`** (server only) — `RegisterPlayer` and `UnregisterPlayer`, previously not exposed by this package, for `PLAYER_REPLICATION = "CUSTOM"`.
- **`Holder.GetEntityFromModel`** also accepts a `BasePart`, matching the runtime.

### Behavioral Changes (upstream, no type impact)

- Automatic character registration waits for `CharacterAppearanceLoaded`, up to 3 seconds (was a fixed 0.1 seconds). Disable with `Config.FLAGS.CHARACTER_WAIT_DELAY`.
- `ServerClock.ConvertTo` no longer subtracts one-way delay.
- Stopped entities send a reliable stop snapshot, and movement resumes from rest.
- The dynamic buffer accounts for the largest recent send gap, and a fixed `BUFFER` grows by one tick interval for half-rate entities.
- Client-owned entities always tick at full rate for their owner.
- Other clients ease an entity for 0.3 seconds after its owner changes.
- `NetworkOwnerChanged` fires after `PlayerOwnedRemoved`/`PlayerOwnedAdded`.
- `Entity.GetAt` falls back to `latestCFrame` when the snapshot buffer is empty.
- Destroying an entity clears its children's mounts on the server.
- `Stats.SERVER.GRID_STATS` only updates while a debugger is open or stats are forced.

## 2.2.0 (2026-10-03)

Tracks Chrono v2.2.0. No breaking API changes.

### Package

- **Renamed to `@rbxts/chrono`** (was `rbxts-chrono`). Consumers that aliased `"@rbxts/chrono": "npm:rbxts-chrono@..."` switch to `"@rbxts/chrono": "^2.2.0"`; imports are unchanged.
- **Chrono runtime is bundled** in `src/Chrono` instead of the `chrono-lua` GitHub dependency. Remove any `chrono-lua` mapping from your Rojo project file.

### New Features

- **`Entity.SetInterpolationMode(entity, mode)`** — Per-entity override of how clients apply interpolated transforms; replicates from the server.
- **`InterpolationMode`** type — `"CFRAME" | "ALIGN" | "NONE"`. `ALIGN` (experimental) drives AlignPosition/AlignOrientation so physics moves the entity, for ragdolls; `NONE` applies nothing.
- **`DEFAULT_INTERPOLATION_MODE`** config (default `"CFRAME"`) and per-type **`INTERPOLATION_MODE`** in `EntityConfigInput`.

### Behavioral Changes (upstream, no type impact)

- Built-in `WITH_ROT` entity type is now `PLAYER` + `FULL_ROTATION` (NATIVE mode, dynamic buffer, `ASSEMBLY_ROOT_PART_CHECK`, replicated at all distances).
- In `ALIGN` mode the server replicates Humanoid state and enabled-state mask to clients.
- `NATIVE_WITH_LOCK` locker part `RootPriority` 127 → 126.

## 2.1.6 (2026-08-27)

Tracks chrono-lua releases v2.1.5 → v2.1.6. No breaking API changes.

### New Features

- **`Entity.SetClockBuffer(entity, buffer?)`** — Client-only per-entity interpolation buffer override; creates a dedicated client clock. Pass `0` (or negative) for a dynamic buffer, `undefined` to clear the override. Errors on the server.
- **`Config.GetEntityType(name)`** — Public access to a locked entity type config (new `EntityConfig` interface with `NAME` and an `UpdateBuffer(seconds)` method that retunes every entity of the type at runtime; entities with a `SetClockBuffer` override are skipped).
- **`Stats.SERVER.GRID_STATS`** — Per-player-name map of entity ids replicating at `HALF`/`NORMAL` tick rates.

### Behavioral Changes (upstream, no type impact)

- `Entity.new` now errors if called before `Chrono.Start()`.
- `BUFFER = 0` on an entity config selects a dynamic (adaptive) buffer for server-owned entities.
- Built-in `PLAYER` entity type defaults `HALF_TICK_DISTANCE = math.huge` (players replicated at all distances).

### Internal

- `Entity.entityConfig` retyped from `EntityConfigInput` to the new `EntityConfig` (locked config).
- Updated `chrono-lua` dependency from `v2.1.4` to `v2.1.6`.

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
