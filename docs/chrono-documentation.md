# Chrono Replication Library - Comprehensive Documentation

> **Version**: 2.3.0
> **Purpose**: Custom character/entity replication system for Roblox
> **Author**: Parihsz (GitHub)
>
> This is the canonical reference for all projects consuming Chrono (via the `@rbxts/chrono`
> npm package, formerly `rbxts-chrono`). A consuming project may have an older version installed — check its
> `package.json` before relying on version-specific behavior. See
> [Migrating 2.2.0 → 2.3.0](#migrating-220--230),
> [Migrating 2.1.6 → 2.2.0](#migrating-216--220),
> [Migrating 2.1.4 → 2.1.6](#migrating-214--216) and
> [Migrating 2.0.4 → 2.1.4](#migrating-204--214) at the end.

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Concepts](#core-concepts)
4. [Configuration](#configuration)
5. [Entity System](#entity-system)
6. [Replication Flow](#replication-flow)
7. [Interpolation System](#interpolation-system)
8. [Network Protocol](#network-protocol)
9. [Performance Optimizations](#performance-optimizations)
10. [API Reference](#api-reference)
11. [Migrating 2.2.0 → 2.3.0](#migrating-220--230)
12. [Migrating 2.1.6 → 2.2.0](#migrating-216--220)
13. [Migrating 2.1.4 → 2.1.6](#migrating-214--216)
14. [Migrating 2.0.4 → 2.1.4](#migrating-204--214)

---

## Overview

Chrono is a custom entity replication library designed to replace or augment Roblox's native character replication. It provides:

- **Efficient CFrame replication** using binary buffers with compressed rotation
- **Distance-based tick rates** (full/half/none) for bandwidth optimization
- **Client-owned entity support** with server validation
- **Hermite interpolation** for smooth movement on clients
- **Interpolation modes** (`CFRAME` / `ALIGN` / `NONE`) — `ALIGN` lets physics move the entity, for ragdolls (2.2.0+)
- **Frustum culling** to skip rendering off-screen entities
- **Entity mounting** for parent-child CFrame relationships (applied on both server and client)
- **Replication rules** for per-entity visibility control
- **Per-player entity grids** exposing which entities each player currently sees
- **Lag compensation** from snapshot history and `ServerClock.ToServerTime` (2.3.0+)
- **Per-type tickers** for stepping your own simulation at an entity type's tick rate (2.3.0+)

---

## Architecture

### File Structure

```
src/Chrono/                      # Vendored upstream src/ inside @rbxts/chrono
├── init.luau                    # Entry point, Start() function, re-exported types
├── Shared/                      # Shared between client/server
│   ├── Types.luau              # Type definitions
│   ├── Config.luau             # Configuration management, validation + FLAGS
│   ├── Entity.luau             # Entity class and operations
│   ├── Holder.luau             # Entity registry (ID mapping)
│   ├── Events.luau             # Global event signals
│   ├── Snapshots.luau          # Circular buffer for CFrame history
│   ├── ClockUnwrap.luau        # u32 fixed-point timestamp quantize/unwrap
│   ├── InterpolationMath.luau  # Hermite interpolation, velocity and idle detection
│   ├── Ticker.luau             # Server-side tick scheduling + per-type Ticked signal
│   ├── ReplicationRules.luau   # Visibility filtering
│   ├── ModelHelper.luau        # Model replication helpers
│   ├── ApplyMounts.luau        # Entity mounting resolution
│   ├── CFrameLock.luau         # NATIVE_WITH_LOCK locker part (2.3.0+)
│   ├── HumanoidState.luau      # Humanoid state replication for ALIGN mode (2.3.0+)
│   ├── Signal.luau             # Custom event implementation
│   ├── Stats.luau              # Performance metrics + debugger replication
│   ├── Warn.luau               # Severity-levelled warnings
│   └── Bin.luau                # Cleanup utility
├── Server/
│   ├── Replicate.luau          # Main server replication loop (PostSimulation)
│   ├── Sender.luau             # Serialization and packet sending
│   ├── Receiver.luau           # Client→Server packet handling
│   ├── EntityGrid.luau         # Distance-based entity sorting (public API)
│   ├── Player.luau             # Player character registration (public as Chrono.Player)
│   ├── EntityStats.luau        # Per-entity debugger stats (2.3.0+)
│   └── ServerClock.luau        # Clock synchronization + lag compensation conversion
└── Client/
    ├── Replicate.luau          # Main client interpolation loop
    ├── Sender.luau             # Client→Server packet sending
    ├── Receiver.luau           # Server→Client packet handling
    ├── ClientClock.luau        # Render time calculation
    ├── InterpolationBuffer.luau # Adaptive jitter buffer
    ├── AlignDriver.luau        # AlignPosition/AlignOrientation driver for ALIGN mode (moved from Shared in 2.3.0)
    ├── Frustum.luau            # Frustum culling (2.3.0+)
    ├── ModelResolver.luau      # Resolves NATIVE models that stream in late
    ├── EntityStats.luau        # Per-entity debugger stats (2.3.0+)
    └── Player.luau             # Player character client handling
```

---

## Core Concepts

### Entity

An Entity is a wrapper around a Roblox `Model` or `BasePart` that Chrono tracks and replicates. Each entity has:

- **id**: Unique 16-bit identifier (1-65535)
- **networkOwner**: The player who controls this entity's movement (or nil for server)
- **entityConfig**: Configuration determining tick rate, buffer size, rotation mode
- **model**: The associated Roblox instance
- **snapshot**: Circular buffer of historical CFrame values for interpolation
- **latestCFrame**: Most recent known position

### Network Ownership

- **Server-owned** (networkOwner = nil): Server pushes CFrame updates, clients interpolate
- **Client-owned** (networkOwner = Player): Client pushes CFrame updates, server validates and broadcasts to other clients
- If Roblox resets part ownership out from under you, call `Entity.SyncOwnerShip(entity)` on the server to resync.

### Model Replication Modes

1. **NATIVE**: Uses Roblox's built-in model replication. Model exists in workspace, Chrono only syncs CFrame.
2. **NATIVE_WITH_LOCK**: Same as NATIVE but server CFrame replication is disabled via a Motor6D trick. Good for player characters and NPCs.
   - Since 2.1.1: does **not** disable server-side physics for NPCs, the lock state replicates to clients and is applied to client-owned entities (stops Roblox physics replicating back to the server).
   - Since 2.1.3: the local player's **own character** keeps client→server replication even when locked (fixes shift-lock oddities when the HumanoidRootPart isn't the priority root).
3. **CUSTOM**: Server and client have separate cloned models. Lower bandwidth but requires manual animation sync.

### Tick Modes

Based on distance from viewers:
- **NORMAL**: Full tick rate
- **HALF**: Half tick rate for entities at medium distance
- **NONE**: No replication for entities beyond visible range

Past `HALF_TICK_DISTANCE`, `NATIVE_WITH_LOCK` and `CUSTOM` entities stop being sent to that player,
while `NATIVE` entities stay at half rate because Roblox replicates the model anyway. Since 2.3.0
an entity's owner always counts as a NORMAL viewer, so client-owned entities tick at full rate
whatever the distance.

---

## Configuration

### Global Config Options

Set via `Chrono.Config.SetConfig(name, value)` **before** calling `Chrono.Start()`:

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `MIN_BUFFER` | number | 0.09 | Minimum interpolation buffer (seconds) |
| `MAX_BUFFER` | number | 0.5 | Maximum interpolation buffer (seconds) |
| `WARNING_SEVERITY` | string | "MEDIUM" | Warning level: "NONE", "LOW", "MEDIUM", "HIGH" |
| `MAX_SNAPSHOT_COUNT` | number | 30 | Max CFrame history entries |
| `CHECK_NEW_VERSION` | boolean | true | Check GitHub for updates |
| `DEFAULT_NORMAL_TICK_DISTANCE` | number | 50 | Distance for full tick rate |
| `DEFAULT_HALF_TICK_DISTANCE` | number | 100 | Distance for half tick rate (beyond = no replication for non-`NATIVE` entities) |
| `DEFAULT_MODEL_REPLICATION_MODE` | string | "NATIVE" | Default model mode |
| `DEFAULT_INTERPOLATION_MODE` | string | "CFRAME" | How clients apply interpolated transforms: "CFRAME", "ALIGN", "NONE" (2.2.0+; see [Interpolation Modes](#interpolation-modes)) |
| `PLAYER_REPLICATION` | string | "AUTOMATIC" | Auto-register player characters |
| `REPLICATE_DEATHS` | string | "PLAYER_CHARACTERS" | Death replication filter |
| `REPLICATE_CFRAME_SETTERS` | string | "PLAYER_ENTITIES" | CFrame setter replication filter |
| `MAX_TOTAL_BYTES_PER_FRAME_PER_PLAYER` | number | 300 | **Baseline** client upload limit; effective budget scales +21 bytes per client-owned entity |
| `GRID_UPDATE_INTERVAL` | number | 0.1 | Seconds between entity grid updates |
| `GRID_MAX_UPDATE_TIME` | number | 0.0005 | Per-frame time budget (seconds) for grid updates |

Removed configs (existed in 2.0.x): `SHOW_WARNINGS` (boolean; replaced by `WARNING_SEVERITY`),
`SEND_FULL_ROTATION` (use the per-entity-type `FULL_ROTATION` field instead).

`Config.SetWarningSeverity(level)` sets `WARNING_SEVERITY` at runtime (also usable from the debugger).

Since 2.3.0, `SetConfig` errors on unknown names and invalid values: the wrong type, negative
numbers, options outside the list above, a non-integer `MAX_SNAPSHOT_COUNT`, or a
`GRID_MAX_UPDATE_TIME` of 0. `Chrono.Start()` errors if `MIN_BUFFER` exceeds `MAX_BUFFER`.

### Feature Flags

`Chrono.Config.FLAGS` — all default `true`; can be toggled to revert to pre-fix behavior:

| Flag | Description |
|------|-------------|
| `CHARACTER_WAIT_DELAY` | Waits for `CharacterAppearanceLoaded` (up to 3 seconds) before registering a character (2.3.0+) |
| `SERVER_VELOCITY_FIX` | Fixes server velocity calculation when two packets arrive back-to-back |
| `VELOCITY_CALC_FIX` | Fixes velocity calculation when dt is less than the tick rate |
| `SNAPSHOT_INTERPOLATION_FIX` | Fixes snapshot interpolation jitter after replication pauses briefly and resumes |
| `SET_CFRAME_FIX` | Adds a teleport flag to packets so clients snap instead of easing |
| `FIX_TELEPORT_JITTER` | Prevents bounce-back when clearing snapshots then teleporting (snapshot buffer locking) |

### Entity Type Configuration

Register custom entity types via `Chrono.Config.RegisterEntityType(name, config)`:

```lua
Chrono.Config.RegisterEntityType("GROUND_ENEMY", {
    TICK_RATE = 1/30,           -- 30 updates per second
    BUFFER = 0.1,               -- 100ms interpolation delay
    FULL_ROTATION = false,      -- Y-axis only (yaw)
    AUTO_UPDATE_POSITION = true, -- Auto-read CFrame from model
    STORE_SNAPSHOTS = false,    -- Store snapshots on server (default false)
    MODEL_REPLICATION_MODE = "CUSTOM",
    NORMAL_TICK_DISTANCE = 75,
    HALF_TICK_DISTANCE = 150,
    HALF_TICK_MARGIN = 15,      -- 2.3.0+; added within 150 studs, removed past 165
    CUSTOM_INTERPOLATION = false, -- Disable auto-interpolation (default false)
    INTERPOLATION_MODE = "CFRAME", -- 2.2.0+; defaults to DEFAULT_INTERPOLATION_MODE
})
```

**EntityConfigInput Fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `TICK_RATE` | number | — (required) | Seconds between updates (e.g., 1/20 = 20 Hz) |
| `BUFFER` | number | dynamic | Interpolation delay in seconds. `0` or omitted → dynamic (adaptive) buffer for server-owned entities (2.1.6+); client-owned entities always use a dynamic buffer |
| `FULL_ROTATION` | boolean | false | Send all 3 rotation axes vs yaw-only |
| `AUTO_UPDATE_POSITION` | boolean | true | Auto-read CFrame from model each tick |
| `STORE_SNAPSHOTS` | boolean | false | Store snapshots on server for server-owned entities |
| `MODEL_REPLICATION_MODE` | string | - | "NATIVE", "NATIVE_WITH_LOCK", or "CUSTOM" |
| `NORMAL_TICK_DISTANCE` | number | 50 | Distance threshold for full tick rate |
| `HALF_TICK_DISTANCE` | number | 100 | Distance threshold for half tick rate |
| `HALF_TICK_MARGIN` | number | 0 | Studs past `HALF_TICK_DISTANCE` an entity stays sent to a player who already has it, so entities near the edge don't keep being added and removed (2.3.0+) |
| `CUSTOM_INTERPOLATION` | boolean | false | Disable automatic interpolation for the whole type; fixed at runtime. Prefer `SetInterpolationMode(entity, "NONE")` |
| `INTERPOLATION_MODE` | string | `DEFAULT_INTERPOLATION_MODE` | Per-type interpolation mode override (2.2.0+) |
| `INTERPOLATION_FUNCTION` | function | Hermite | Blends two snapshots; see [Interpolation Function](#interpolation-function) (2.3.0+) |
| `ASSEMBLY_ROOT_PART_CHECK` | boolean | false | Skip client interpolation while the primary part isn't the assembly root, such as when welded to another entity |

Removed in 2.3.0: `ATTACH_MODEL_META_DATA`. Chrono no longer attaches model metadata.

Since 2.3.0, `RegisterEntityType` errors on invalid fields, and types are checked again at
`Chrono.Start()`. `TICK_RATE` must be finite and above 0, `BUFFER` finite, distances and margins
non-negative. Registering replaces the whole type, including built-ins such as `PLAYER`, so
include every field you want to keep.

**Built-in entity types:**
- `DEFAULT`: TICK_RATE = 1/20, BUFFER = 0.1
- `WITH_ROT`: `PLAYER` + `FULL_ROTATION = true` (2.2.0+; NATIVE mode, dynamic buffer, `ASSEMBLY_ROOT_PART_CHECK = true`, `HALF_TICK_DISTANCE = math.huge`). Before 2.2.0 it was DEFAULT + FULL_ROTATION (`BUFFER = 0.1`). Intended as the profile to switch a ragdolled player to
- `PLAYER`: NATIVE mode, TICK_RATE = 1/20, dynamic buffer, `ASSEMBLY_ROOT_PART_CHECK = true`, `HALF_TICK_DISTANCE = math.huge` (2.1.6+: players stay replicated at all distances, matching Roblox's default behavior)

**Changing buffers at runtime (client, 2.1.6+):**
- Per entity: `Chrono.Entity.SetClockBuffer(entity, seconds)` overrides one entity's buffer.
- Per entity type: `Chrono.Config.GetEntityType(name):UpdateBuffer(seconds)` updates every
  entity of that type (shared clocks and owned per-entity clocks), except entities with their
  own `SetClockBuffer` override. Pass `0` for a dynamic buffer.

### Type Tickers

(2.3.0+) Each entity type has one shared ticker on the server, available through its config after
`Chrono.Start()`. It is nil on clients. `Ticked` fires at the type's `TICK_RATE`, before Chrono
processes the type's entities, and keeps firing while connected even with no entities in range.

```lua
local ticker = assert(Chrono.Config.GetEntityType("NPC").ticker)
local connection = ticker.Ticked:Connect(function(tick, dt)
    Chrono.Entity.Push(entity, tick.lastTicked, Simulate(dt))
end)
```

Treat ticker fields as read-only: `config`, `tickRate`, `lastTicked` (the `Entity.Push` timestamp,
on the server's `os.clock()` timeline), `dt`, `isHalf` and `objects`. `objects` only holds entities
being ticked, so don't use it to iterate every entity of a type.

### Model Registration

Pre-register models for efficient CUSTOM mode replication:

```lua
Chrono.Config.RegisterEntityModel("ZOMBIE", zombieModel, Vector3.new(4, 6, 4))
-- Third param is broad phase size for frustum culling
```

---

## Entity System

### Creating Entities

> **2.1.6+:** `Entity.new` errors if called before `Chrono.Start()`. A script that doesn't call
> `Start` itself can wait with `Chrono.Started(callback)` (2.3.0+).

```lua
-- Server-side
local entity = Chrono.Entity.new(
    "GROUND_ENEMY",     -- Entity config name (optional, defaults to "DEFAULT")
    zombieModel,        -- Model, BasePart, or registered model string
    "CUSTOM",           -- Model replication mode (optional)
    CFrame.new(0,5,0)   -- Initial CFrame (optional)
)
```

**Model String (Auto-Cloning):**

When the `model` parameter is a **string** instead of a Model/BasePart instance, Chrono automatically clones the model registered with `Config.RegisterEntityModel()`. The string is stored in `entity.modelString` for reference.

### Entity Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | Unique 16-bit identifier (1-65535) |
| `networkOwner` | `Player?` | Player controlling this entity (nil = server) |
| `entityConfig` | `EntityConfig` | Configuration (tick rate, buffer, rotation mode) |
| `model` | `Model \| BasePart?` | The associated Roblox instance |
| `modelString` | `string?` | Original model name if created from registered string |
| `snapshot` | `Snapshot?` | Circular buffer of CFrame history. On the server, requires client ownership or `STORE_SNAPSHOTS` |
| `latestCFrame` | `CFrame?` | Most recent known position |
| `latestTime` | `number?` | Timestamp of latest CFrame. On the server, for client-owned entities, the packet arrival time |
| `lastClientClock` | `number?` | On the server, for client-owned entities: the owner's clock time of the newest packet |
| `destroyed` | `boolean` | Whether entity has been destroyed |
| `paused` | `boolean` | Whether replication is paused |
| `registered` | `boolean` | Whether registered in global entity map |
| `isHalfTicked` | `boolean?` | Whether on half-tick rate (client) |
| `autoUpdatePosition` | `boolean` | Auto-read CFrame from model |
| `interpolation` | `boolean` | Whether automatic interpolation runs (client) |
| `broadPhase` | `Vector3?` | Frustum culling bounding box size |
| `mountParentId` | `number?` | ID of parent entity (if mounted) |
| `mountOffset` | `CFrame?` | Offset from mount parent |
| `isContextOwner` | `boolean` | True if the current context (client/server) owns this entity |

### Entity Methods (Static Functions)

All entity methods are called as `Chrono.Entity.MethodName(entity, ...)`:

| Method | Description |
|--------|-------------|
| `SetModel(entity, model, mode?, noDestroy?)` | Change the model |
| `SetConfig(entity, configName)` | Change entity configuration |
| `GetEntityType(entity)` | Name of the entity's type, e.g. `"PLAYER"` (2.3.0+) |
| `SetClockBuffer(entity, buffer?)` | Per-entity interpolation buffer override (client only, 2.1.6+; see notes below) |
| `GetClock(entity)` | The entity's client clock, or nil on the server (2.3.0+) |
| `SetBroadPhase(entity, vector?)` | Set frustum culling bounds |
| `GetData(entity)` | Get custom user data |
| `SetData(entity, data)` | Set custom user data (replicated) |
| `SetNetworkOwner(entity, player?)` | Set who controls this entity |
| `SyncOwnerShip(entity)` | Resync entity+model network ownership (server; use if Roblox resets part ownership) |
| `SetMount(entity, parent?, offset?)` | Mount to another entity (server only) |
| `ClearMount(entity)` | Remove mount relationship (server only) |
| `GetMountRoot(entity)` | Top of the mount chain and this entity's offset from it; an unmounted entity returns itself and `CFrame.identity` (2.3.0+) |
| `Push(entity, time, cframe, velocity?)` | Push a CFrame snapshot (returns boolean: true if newest) |
| `GetAt(entity, time)` | Get interpolated CFrame at time (negative time → latest). Falls back to `latestCFrame` without history (2.3.0+) |
| `GetCFrame(entity)` | Get current CFrame |
| `SetCFrame(entity, cframe)` | Teleport entity (see notes below) |
| `SetAutoUpdatePos(entity, autoUpdate)` | Enable/disable auto position reading |
| `GetTargetRenderTime(entity)` | Get client render timestamp; **returns -1 without a client clock**, as on the server |
| `GetPrimaryPart(entity)` | Get the primary part |
| `PauseReplication(entity)` | Stop replicating this entity |
| `ResumeReplication(entity)` | Resume replication |
| `Clear(entity)` | Clear snapshot buffer and latest time; `latestCFrame` is kept |
| `LockNativeServerCFrameReplication(entity)` | Lock server-side CFrame |
| `UnlockNativeServerCFrameReplication(entity)` | Unlock server-side CFrame |
| `GetModelReplicationType(entity)` | "NATIVE" \| "CUSTOM" \| "NATIVE_WITH_LOCK" |
| `SetInterpolationMode(entity, mode?)` | "CFRAME" \| "ALIGN" \| "NONE" — per-entity override; replicates from server (2.2.0+). nil returns to the type's mode (2.3.0+) |
| `Destroy(entity)` | Destroy and unregister |
| `GetEvent(entity, eventName)` | Get entity event |

**Method Behavior Notes:**

- **`SetCFrame(entity, cframe)`**: Marks a teleport so client interpolation snaps rather than easing through (see `SET_CFRAME_FIX` / `FIX_TELEPORT_JITTER` flags). On non-owner clients it clears the snapshot buffer. Use for teleportation.
- **`Push(entity, time, cframe, velocity?)`**: Returns `true` if this snapshot is the newest in the buffer. Use for continuous movement updates.
- **`SetNetworkOwner(entity, player?)`**: Clears the snapshot buffer and recreates the ClientClock. This ensures clean state when ownership transfers. Since 2.3.0, other clients ease the entity from where it was drawn over 0.3 seconds instead of snapping.
- **`SetMount(entity, parent?, offset?)`**: Since 2.3.0, errors on a self-mount or a parent that isn't registered, which includes a destroyed parent. Destroying a parent clears its children's mounts on the server.
- **`SetClockBuffer(entity, buffer?)`** (client only — errors on the server, 2.1.6+): Sets a per-entity interpolation buffer, creating a dedicated client clock for the entity. Overrides the config's `BUFFER` and is unaffected by later `config:UpdateBuffer` calls. Pass `0` (or negative) for a dynamic buffer; pass `nil` to clear the override and fall back to the config's buffer. Intended for client-owned entities — for server-owned entities prefer `Config.GetEntityType(name):UpdateBuffer(seconds)`.

### Entity Events

| Event | Parameters | Description |
|-------|------------|-------------|
| `Destroying` | entity | Entity about to be destroyed |
| `NetworkOwnerChanged` | entity, newOwner, prevOwner | Network ownership changed |
| `PushedSnapShot` | entity, time, cframe, isNewest | New CFrame pushed |
| `TickChanged` | entity, tickType ("NONE"/"HALF"/"NORMAL") | Tick mode changed |
| `DataChanged` | entity, data | Custom data changed |
| `Ticked` | entity, dt | Entity was ticked |
| `ModelChanged` | entity, newModel, oldModel | Model changed |
| `LockChanged` | entity, isLocked | Lock state changed |

---

## Replication Flow

### Server Main Loop (PostSimulation)

> Moved from PreSimulation to **PostSimulation** in v2.1.0 — anything that must write
> physics/CFrames before Chrono reads them should run in or before simulation.

```
1. EntityGrid.Update()
   - For each entity, check distance to all players
   - Categorize into NORMAL/HALF/NONE tick buckets per player
   - Move entities between Tickers based on proximity

2. UpdatePlayerPositions()
   - Track player character positions for distance checks

3. ApplyMounts()
   - Mounted entity CFrames are resolved on the server too (since v2.1.0)

4. UpdateTickers()
   - For each Ticker that's due to tick:
     - Fire the ticker's Ticked signal (2.3.0+)
     - For each entity in the ticker:
       - If server-owned and AUTO_UPDATE_POSITION: read CFrame from model
       - Push to snapshot
       - If CFrame changed: serialize to buffer
       - If it just stopped changing: serialize a stop snapshot (2.3.0+)

5. CheckEntityChanges()
   - Collect property changes for reliable replication

6. UpdateHeartbeat()
   - Server clock heartbeat to loaded players at 10 Hz (HEARTBEAT_RATE = 1/10)

7. UpdateClientClockRelay()
   - Relay client clock wrap state to all clients every 60 seconds

8. For each Player: Sender.ReplicatePlayer()
   - Send CFrame updates (unreliable buffers)
   - Send stop and teleport updates (reliable, SafeReplicate)
   - Send new entities, removed entities and property changes (reliable)

9. UpdateEntityStats()
   - Collect per-entity stats while a debugger is open or stats are forced
```

Tickers run on a fixed schedule since 2.3.0, so occasional late frames don't shift later ticks.

### Client Main Loop (Heartbeat)

```
1. RenderCache.UpdateAll()
   - Advance render time for all client clocks

2. Frustum.Prepare()
   - Calculate camera frustum planes

3. For each entity:
   - Resolve NATIVE models that streamed in late (2.3.0+)
   - Skip if destroyed, mounted, paused, custom interpolation, or mode "NONE"
   - Defer "ALIGN" entities to the PreSimulation pass below
   - Skip if network owner (we control it)
   - Check frustum culling
   - Get interpolated CFrame at render time
   - Apply ownership-change smoothing (2.3.0+)
   - Set primaryPart.CFrame

4. UpdateEntityStats() and AlignDriver.ApplyVelocities()
   - Collect debugger stats and set ALIGN assembly velocities

5. ApplyMounts()
   - Resolve mounted entity CFrames

6. Sender.Update()
   - For client-owned entities: serialize and send updates

PreSimulation (2.2.0+):
   - For each deferred "ALIGN" entity: sample at render time (advanced by the time
     since Heartbeat) and update its AlignPosition/AlignOrientation targets
```

---

## Interpolation System

### Interpolation Modes

(2.2.0+) Controls how the client applies the interpolated transform to entities it doesn't own.
Resolved per entity as `SetInterpolationMode` override → entity type `INTERPOLATION_MODE` →
`DEFAULT_INTERPOLATION_MODE`.

| Mode | Behavior |
|------|----------|
| `CFRAME` (default) | Assigns `primaryPart.CFrame` every frame. Exact and cheapest, but teleports the assembly, discarding physics state. |
| `ALIGN` | Welds a hidden driver part (`__CHRONO_ALIGN` Camera container under the primary part, `RootPriority = 127`) and drives it with rigid, max-responsiveness `AlignPosition`/`AlignOrientation`. Physics keeps resolving joints and collisions, so ragdolls don't fight replication. Skips `ASSEMBLY_ROOT_PART_CHECK`. Since 2.3.0 it also sets `AssemblyLinearVelocity` to match Roblox's replication. |
| `NONE` | Applies nothing. Snapshots still arrive, so read them with `Entity.GetAt` and move the entity yourself. |

While an entity is in `ALIGN` mode, the server also replicates its Humanoid's current state
and its enabled/disabled state mask; non-owner clients apply them (`Ragdoll` is applied as
`Physics`). Leaving `ALIGN` stops this and destroys the driver. Since 2.3.0, a client that takes
ownership restores the Humanoid's own enabled states and leaves `Physics` through `GettingUp`.

Upstream marks `ALIGN` **experimental** with unknown interactions with other constraints:
switch to it only while ragdolled and back to `CFRAME` afterwards, rather than as a default.

```lua
-- server
local entity = Chrono.Holder.GetEntityFromModel(character)
Chrono.Entity.SetInterpolationMode(entity, "ALIGN")
Chrono.Entity.SetConfig(entity, "WITH_ROT")  -- PLAYER has yaw-only rotation
RAGDOLL(character)

-- on recovery
UN_RAGDOLL(character)
Chrono.Entity.SetInterpolationMode(entity, "CFRAME")
Chrono.Entity.SetConfig(entity, "PLAYER")
```

`NONE` is the preferred way to stop Chrono driving an entity: it is per entity and can be
changed at runtime, whereas `CUSTOM_INTERPOLATION` applies to the whole type and is fixed.

### Interpolation Function

(2.3.0+) `INTERPOLATION_FUNCTION` on an entity type replaces the default blend between two
snapshots. It must be the same on server and client, so register it in your shared config module.

```lua
Chrono.Config.RegisterEntityType("BOAT", {
    TICK_RATE = 1/20,
    INTERPOLATION_FUNCTION = function(from: CFrame, to: CFrame, v0: Vector3, v1: Vector3, t: number, dt: number): CFrame
        return from:Lerp(to, t) -- linear
    end,
})
```

### Stop Snapshots

(2.3.0+) When an entity stops changing, its owner sends one reliable stop snapshot with zero
velocity, so clients settle exactly where it stopped instead of overshooting. When movement
resumes, a zero-velocity snapshot is inserted just before the new one so it starts from rest. An
entity that moves in regular bursts with gaps between them is treated as still moving, so stops
only fire on longer pauses.

### Snapshot Buffer

A circular buffer storing up to `MAX_SNAPSHOT_COUNT` (default 30) CFrame snapshots with timestamps.

```lua
type SnapshotData = {
    t: number,       -- Timestamp
    value: CFrame,   -- Position/rotation
    velocity: Vector3 -- Calculated velocity for Hermite
}
```

**Operations:**
- `Push(time, cframe, velocity)`: Insert sorted by time
- `PushWithCheck(time, cframe, velocity?, tickRate, stopped?)`: `Push` with the stop and idle handling used for replicated entities; estimates a nil velocity (2.3.0+). The value must have a `Position`
- `GetLatest()`: Get newest snapshot
- `GetAt(time, bypassLock?)`: Get interpolated CFrame at specific time; **negative time returns the latest snapshot**
- `Clear()`: Reset buffer

The buffer uses a `lockedTime` mechanism (see `FIX_TELEPORT_JITTER`) so that stale snapshots
in-flight during a teleport/clear can't be retrieved afterwards.

### Timestamps

Since v2.1.3, replicated timestamps are **u32 fixed-point at 0.1 ms precision**
(`ClockUnwrap.quantize`: `floor(seconds * 10000) % 2^32`), with wrap-around handling
(`ClockUnwrap.unwrap`) so long-running servers don't overflow. Local snapshot times remain
plain seconds; quantization happens at the network boundary.

### Hermite Interpolation

For smooth curves between snapshots, Chrono uses Hermite spline interpolation:

```lua
-- p0, p1: positions at t=0 and t=1
-- v0, v1: velocities at t=0 and t=1
-- t: interpolation factor (0-1)
-- dt: time delta between snapshots

local t2 = t * t
local t3 = t2 * t
local h00 = 2*t3 - 3*t2 + 1
local h10 = t3 - 2*t2 + t
local h01 = -2*t3 + 3*t2
local h11 = t3 - t2

return p0*h00 + v0*dt*h10 + p1*h01 + v1*dt*h11
```

Since 2.3.0, tangents are capped at 3× the segment length to reduce overshoot. Rotation uses
`CFrame:Lerp`.

### Client Clock System

Each entity configuration gets a `ClientClock` that tracks:
- **lastClockAt**: Most recent server timestamp received
- **lastClockDuration**: Local time when that was received
- **renderAt**: Current render timestamp (slightly behind server)

**Render Time Calculation:**
1. When snapshot arrives, record server time and local time
2. Calculate `estimatedServerTime = lastClockAt + (now - lastClockDuration)`
3. Calculate `buffer` from the send interval + jitter deviation, or the fixed `BUFFER`
4. `renderAt` advances each frame, staying `buffer` behind estimated server time
5. Smooth corrections if render time drifts too far

The server additionally pushes a clock heartbeat at 10 Hz so client clocks stay reliable even
when few entity packets are flowing.

Since 2.3.0, a fixed `BUFFER` grows by one extra tick interval for half-rate entities, so they
don't stall between their slower updates. `Entity.GetClock(entity)` returns the clock in use.

### Adaptive Buffer

The `InterpolationBuffer` dynamically adjusts based on network jitter:

```lua
-- Exponential moving average of latency
averageLatency = averageLatency + (latency - averageLatency) * 0.1

-- Jitter estimation (RFC 3550)
deviation = deviation + (|latency - lastLatency| - deviation) * 0.1

-- Largest recent gap between sends, up to 3 ticks; ignores idle time and decays slowly (2.3.0+)
maxSendGap = gap > maxSendGap and gap or maxSendGap + (gap - maxSendGap) * 0.005

-- Final buffer = max(tickRate, maxSendGap) + (2 * deviation)
-- Below MIN_BUFFER: MIN_BUFFER + (MIN_BUFFER - buffer) * 0.2. Capped at MAX_BUFFER
```

Client-owned entities always use this dynamic buffer. Since 2.1.6, server-owned entities use
it too when their config's `BUFFER` is `0`, and it can be selected at runtime via
`Entity.SetClockBuffer(entity, 0)` or `config:UpdateBuffer(0)`.

---

## Network Protocol

### Remote Events

Located in `Shared.Remotes`:
- **Replicate** (UnreliableRemoteEvent): CFrame updates
- **ReplicateFull** (RemoteEvent): Entity creation/removal/changes
- **SafeReplicate** (RemoteEvent): Reliable path for stop and teleport snapshots
- **Death** (UnreliableRemoteEvent): Death replication
- **ClientLoaded** (RemoteEvent): Client ready signal
- **Heartbeat** (UnreliableRemoteEvent): Server clock heartbeat (10 Hz)
- **ClientHeartbeat** / **ClientClockRelay** (RemoteEvent): Client clock sync channels

### CFrame Serialization

Positions are f32 per axis; rotation is compressed to u16 per axis:

**Yaw-only:** entity id (u16) + position (3× f32) + Y rotation (u16)
**Full rotation:** entity id (u16) + position (3× f32) + X/Y/Z rotation (3× u16)

Client-owned entries add a u8 flags byte after the entity id: `1` full rotation, `2` half rate,
`4` teleport, `8` stop (2.3.0+).

**Rotation Mapping:**
```lua
-- Encode: radians (-π to π) → u16 (0-65535)
function MapRotation(rad)
    return round((rad + π) / (2π / 65535))
end

-- Decode: u16 → radians
function UnmapRotation(u16)
    return (u16 / 65535) * 2π - π
end
```

### Packet Structure

Packet header timestamps are **u32 fixed-point (0.1 ms)** since v2.1.3 (previously f32 seconds).

**Server → Client (Unreliable):** `[u32 quantized ticker timestamp][u8 flags][u8 entity count][entity data...]`

Header flags: `1` half rate, `2` full rotation. Server-owned stop snapshots use the same layout
over `SafeReplicate`, which is how clients recognise them.

**Server → Client (Reliable):**
```lua
{
    newEntities: { EntityReceivePacket... },
    removedIds: { number... },
    entityChanges: { {id, data: {{key, value}...}}... }
}
```

Since 2.3.0, `NATIVE` models are sent as an `InstanceHandle`, so a model that streams in after its
entity arrives is resolved later on the client.

**Client → Server (Unreliable):** `[u32 quantized client clock][entity data...]`

Stop and teleport updates use `SafeReplicate` instead. The server drops positions containing NaN or
infinity.

Serialization uses a pre-allocated 900-byte buffer, flushed before overflow.

---

## Performance Optimizations

### Distance-Based Tick Rates

The `EntityGrid` module sorts entities into buckets per player:

1. **NORMAL** (0 to NORMAL_TICK_DISTANCE): Full tick rate
2. **HALF** (NORMAL_TICK_DISTANCE to HALF_TICK_DISTANCE): Half tick rate
3. **NONE** (beyond HALF_TICK_DISTANCE): Not replicated, except `NATIVE` entities, which stay at half rate

`HALF_TICK_MARGIN` adds a gap between where an entity is added and removed (2.3.0+).

Grid updates every `GRID_UPDATE_INTERVAL` (default 0.1 s) with a `GRID_MAX_UPDATE_TIME`
(default 0.5 ms) per-frame budget to avoid hitches. Both are configurable since v2.0.7 and read at
`Chrono.Start()` since v2.3.0.

Since v2.1.0 only entities with active mounts are iterated for mount resolution each frame
(instead of all entities).

### Frustum Culling

Client skips interpolation for entities outside camera view:

1. Calculate camera frustum planes
2. For entities with `broadPhase` bounds:
   - Test 8 corners of bounding box against frustum
   - If none visible, skip interpolation
   - Stagger culled entity checks across 4 frames

### Bandwidth Budget

Bytes the server accepts from each player per frame are limited by
`MAX_TOTAL_BYTES_PER_FRAME_PER_PLAYER`:
**budget = 300 (baseline) + 21 bytes × number of client-owned entities**. Excess data is dropped
with a warning. Configure the baseline via `SetConfig`.

### Entity ID Recycling

- IDs are 16-bit (max 65535 entities)
- Destroyed entity IDs are recycled after 5-10 second delay
- Stack-based reuse prevents immediate collision

---

## API Reference

### Chrono (Main Module)

```lua
Chrono.Start(config?: ModuleScript)
-- Must be called on both server and client after configuration
-- Optionally pass a config module to require before starting

Chrono.Started(callback: () -> ())
-- 2.3.0+; runs callback once started, immediately if already started
```

Top-level exports: `Start`, `Started`, `Entity`, `Holder`, `Events`, `Config`, `ReplicationRules`,
`Stats`, `Snapshots`, and (server-only) `ServerClock`, `ServerReceiver`, `Player`, `EntityGrid`.
(In `@rbxts/chrono`, `ServerReceiver` is exposed as `Chrono.Receiver`.)

### Chrono.Config

```lua
Config.SetConfig(name: ConfigName, value: any)     -- Set global configuration (before Start())
Config.SetWarningSeverity(level: WarningLevel)     -- "NONE" | "LOW" | "MEDIUM" | "HIGH"
Config.RegisterEntityType(name: string, config: EntityConfigInput)
Config.GetEntityType(name: string): EntityConfig  -- 2.1.6+; locked config, has :UpdateBuffer(seconds) on the client and .ticker on the server. Unknown names return DEFAULT
Config.RegisterEntityModel(name: string, model: Model|BasePart|false, broadPhase?: Vector3)
Config.SetModelPrimaryForChrono(model: Model, primaryName: string)
Config.FLAGS: { [string]: boolean }                -- see Feature Flags above
```

### Chrono.Entity

```lua
Entity.new(config?, model?, mode?, initCFrame?): Entity
Entity.SetModel(entity, model?, mode?, noDestroy?)
Entity.SetConfig(entity, configName)
Entity.GetEntityType(entity): string  -- 2.3.0+
Entity.SetClockBuffer(entity, buffer?)  -- client only, 2.1.6+
Entity.GetClock(entity): ClientClock?  -- 2.3.0+; nil on the server
Entity.SetBroadPhase(entity, broadPhase?)
Entity.GetData(entity): any
Entity.SetData(entity, data)
Entity.SetNetworkOwner(entity, player?)
Entity.SyncOwnerShip(entity)
Entity.SetMount(entity, parent?, offset?)
Entity.ClearMount(entity)
Entity.GetMountRoot(entity): (Entity, CFrame)  -- 2.3.0+
Entity.Push(entity, time, cframe, velocity?): boolean
Entity.GetAt(entity, time): CFrame?
Entity.GetCFrame(entity): CFrame?
Entity.SetCFrame(entity, cframe)
Entity.GetTargetRenderTime(entity): number  -- -1 without a client clock
Entity.SetAutoUpdatePos(entity, autoUpdate)
Entity.GetPrimaryPart(entity): BasePart?
Entity.PauseReplication(entity)
Entity.ResumeReplication(entity)
Entity.Clear(entity)
Entity.LockNativeServerCFrameReplication(entity)
Entity.UnlockNativeServerCFrameReplication(entity)
Entity.GetModelReplicationType(entity): "NATIVE" | "CUSTOM" | "NATIVE_WITH_LOCK"
Entity.SetInterpolationMode(entity, "CFRAME" | "ALIGN" | "NONE" | nil)  -- 2.2.0+; nil since 2.3.0
Entity.Destroy(entity)
Entity.GetEvent(entity, eventName): Event
```

### Chrono.Holder

```lua
Holder.RegisterEntity(entity)
Holder.UnregisterEntity(entity)
Holder.GetEntityStorageInstance(): Camera
Holder.SetAsCharacter(player, entity)
Holder.RemovePlayerCharacter(entity)
Holder.GetEntityFromPlayer(player): Entity?
Holder.GetEntityFromId(id): Entity?
Holder.GetEntityFromModel(model): Entity?
Holder.idMap: {[number]: Entity}
```

### Chrono.Events

```lua
Events.EntityAdded: Event<(entity) -> ()>
Events.EntityRemoved: Event<(entity) -> ()>
Events.PlayerCharacterRegistered: Event<(player, entity) -> ()>
Events.PlayerCharacterUnregistered: Event<(player, entity) -> ()>
Events.PlayerOwnedAdded: Event<(player, entity) -> ()>
Events.PlayerOwnedRemoved: Event<(player, entity) -> ()>
Events.EntityMountChanged: Event<(entity, mountParentId: number?) -> ()>  -- nil when unmounted
```

### Chrono.ReplicationRules

```lua
ReplicationRules.SetReplicationRule(target, rule)
-- target: Player | Model | number | Entity
-- rule: ReplicationRule | RuleFn | nil

ReplicationRules.Allows(entity, viewer): boolean
ReplicationRules.Include(players: {Player}): RuleFn
ReplicationRules.Exclude(players: {Player}): RuleFn

type ReplicationRule = {
    filterType: "include" | "exclude",
    filterPlayers?: {Player}
}
```

### Chrono.EntityGrid (Server Only)

Public since v2.1.0 — tracks which entities are replicated to each player.

```lua
EntityGrid.GetEntityHolder(player: Player): PlayerEntityHolder?
-- nil if the player has not loaded yet

EntityGrid.IsReplicated(player: Player, entity: Entity): boolean
-- 2.3.0+; whether the entity is currently sent to the player

EntityGrid.UpdatePlayerPosition(player: Player, position: vector)
-- Override the position used for proximity-based replication culling

type PlayerEntityHolder = {
    PLAYER: Player,
    HALF: { Entity },              -- entities replicating at half tick rate
    NORMAL: { Entity },            -- entities replicating at normal tick rate
    REPLICATED: { [Entity]: true },-- all entities currently replicated to this player
    EntityAdded: Signal<(entity) -> ()>,   -- entity started replicating to this player
    EntityRemoving: Signal<(entity) -> ()>,-- entity stopped replicating to this player
}
-- Connect via holder.EntityAdded.Event:Connect(...)
```

### Chrono.Stats

```lua
Stats.CLIENT = { ... }   -- client-side metrics (culling, interpolation time, bandwidth)
Stats.SERVER = { ... }   -- server-side metrics (ticker time, grid time, bandwidth)
Stats.SERVER.GRID_STATS  -- 2.1.6+: { [playerName]: { HALF: { entityId }, NORMAL: { entityId } } }
-- Since 2.3.0 only updates while an authorized debugger is open or Stats.SetForced(true) is on

Stats.REPLICATE_PERMISSIONS: { [number]: boolean }
-- Non-optional map of UserIds allowed to receive server stats.
-- NOTE: pre-2.0.7 "nil = broadcast to all" semantics are GONE. Server stats replicate only
-- to permitted players who currently have the debugger open (saves ~100 kb/s otherwise).

Stats.ReplicateStatsForPlayer(userId: number | Player)      -- server only
Stats.StopReplicatingStatsForPlayer(userId: number | Player) -- server only
Stats.HasPermissionToReplicate(userId: number | Player): boolean
Stats.SetForced(value: boolean)  -- 2.3.0+; collect per-entity and grid stats without a debugger
```

### Chrono.Receiver / ServerReceiver (Server Only)

```lua
Receiver.RegisterMiddleMan(name: string, priority: number, func: MiddleManFn)
-- Higher priority runs first
-- func(player, entity, cframe, arriveTime) -> boolean (true = block)

Receiver.UnregisterMiddleMan(name: string)
```

### Chrono.ServerClock (Server Only)

```lua
ServerClock.Store(player, clientClockTime)
ServerClock.ConvertTo(player, clock, "Server"|"Client"): number
ServerClock.ToServerTime(entity?, renderTime, maxRewind?): number?  -- 2.3.0+
ServerClock.Remove(player)
```

**Lag compensation (2.3.0+):** the client sends `Entity.GetTargetRenderTime(target)` with the shot,
and the server rewinds to what the shooter saw. `ToServerTime` clamps to the last `maxRewind`
seconds (default 1) and returns nil for a missing entity or invalid time.

```lua
-- Server
local rewindTo = ServerClock.ToServerTime(target, renderTime)
local wasAt = rewindTo and Entity.GetAt(target, rewindTo)
```

Server-owned targets need `STORE_SNAPSHOTS = true`, or `GetAt` returns the current CFrame. For
mounted targets, send the render time of `Entity.GetMountRoot(target)` and multiply the rewound
root CFrame by the returned offset.

### Chrono.Player (Server Only)

Exposed by `@rbxts/chrono` since 2.3.0, for `PLAYER_REPLICATION = "CUSTOM"`.

```lua
Player.RegisterPlayer(player, character, { config = "PLAYER", modelRepMode = nil }): Entity
-- Replaces the previous character entity, handles R6 primary parts, assigns ownership.
-- The options table is required; pass {} for defaults.

Player.UnregisterPlayer(player)
-- Not called for you in CUSTOM mode; connect it to Players.PlayerRemoving
```

### Chrono.Snapshots

```lua
Snapshots.New(lerpFunction): Snapshot
-- Create custom snapshot with custom interpolation function
```

---

## Migrating 2.2.0 → 2.3.0

Covers upstream 2.2.1 through 2.3.0. Most code compiles unchanged; audit these first.

API breaks (will error or fail to compile):
- `ATTACH_MODEL_META_DATA` removed from `EntityConfigInput`. Delete it; Chrono no longer attaches
  model metadata.
- `ServerClock.Store` lost its third `clientServerTimeNow` parameter.
- `Config.SetConfig` and `Config.RegisterEntityType` now validate. Wrong types, unknown config
  names, negative distances and a non-positive `TICK_RATE` error, where they used to pass silently.
  `Chrono.Start()` errors if `MIN_BUFFER` exceeds `MAX_BUFFER`.
- `Entity.SetMount` errors on a self-mount (previously a warning) or a parent that isn't
  registered (previously accepted). A destroyed parent counts, so guard mounts to entities that
  can die with `parent.registered`.
- Luau consumers: `entityConfig.TICKER` is now `ticker`, and `Ticker.AddCallback`/`RemoveCallback`
  are replaced by `ticker.Ticked`.

Behavioral changes (compile fine, may affect gameplay/tuning):
- **Character entities can register up to 3 seconds after `CharacterAdded`**, because automatic
  registration now waits for `CharacterAppearanceLoaded` (it was a fixed 0.1 s). Code that reads
  `Holder.GetEntityFromPlayer` right after `CharacterAdded` should use
  `Events.PlayerCharacterRegistered`, or set `Config.FLAGS.CHARACTER_WAIT_DELAY = false`.
- `ServerClock.ConvertTo` no longer subtracts one-way delay, so converted times shift by about
  that much. For lag compensation, switch to `ServerClock.ToServerTime`.
- Stopped entities now send a reliable stop snapshot, and movement resumes from rest. Motion near
  stops looks different, and `PushedSnapShot` fires for the extra snapshot.
- The dynamic buffer now includes the largest recent send gap: `max(tickRate, maxSendGap) + 2 ×
  deviation`. Expect a slightly larger buffer on entities with uneven send rates.
- Half-rate entities with a fixed `BUFFER` render one tick interval later.
- Client-owned entities always tick at full rate for their owner, regardless of distance.
- Other clients ease an entity for 0.3 seconds after its owner changes instead of snapping.
- `NetworkOwnerChanged` now fires last, after `PlayerOwnedRemoved`/`PlayerOwnedAdded`.
- `Entity.GetAt` returns `latestCFrame` when the snapshot buffer is empty, where it returned nil.
- Destroying an entity clears its children's mounts on the server, firing `EntityMountChanged`.
- `Stats.SERVER.GRID_STATS` stops updating unless a debugger is open; call
  `Stats.SetForced(true)` if you read it from code.

New API worth adopting:
- `Chrono.Started(callback)` for scripts that don't own startup.
- `ServerClock.ToServerTime`, `Entity.GetClock`, `Entity.GetMountRoot` for lag compensation.
- `config.ticker.Ticked` to step your own simulation at a type's tick rate; see
  [Type Tickers](#type-tickers).
- `HALF_TICK_MARGIN` to stop entities flickering in and out near `HALF_TICK_DISTANCE`.
- `INTERPOLATION_FUNCTION` for a custom snapshot blend.
- `Entity.GetEntityType`, `EntityGrid.IsReplicated`, `Stats.SetForced`,
  `Entity.SetInterpolationMode(entity, undefined)`.

Package changes (rbxts consumers):
- `Chrono.Player` is now exposed (server only).
- `BUFFER` is optional in `EntityConfigInput`, so reading `entityConfig.BUFFER` gives
  `number | undefined`.
- `Holder.GetEntityFromModel` also accepts a `BasePart`.

---

## Migrating 2.1.6 → 2.2.0

No breaking API changes — existing code compiles and runs unchanged. The default
interpolation mode is `CFRAME`, identical to 2.1.6 behavior.

Package change (rbxts consumers):
- The npm package is now **`@rbxts/chrono`** (was `rbxts-chrono`) and bundles the Chrono
  Luau runtime. Replace `"@rbxts/chrono": "npm:rbxts-chrono@..."` with
  `"@rbxts/chrono": "^2.2.0"`, and **delete the `chrono-lua` entry from your Rojo project
  file** — it is no longer installed or needed. Imports are unchanged.

Behavioral changes (compile fine, may affect gameplay/tuning):
- Built-in `WITH_ROT` entity type is now `PLAYER` + `FULL_ROTATION`: NATIVE mode, dynamic
  buffer (`BUFFER = 0`, was `0.1`), `ASSEMBLY_ROOT_PART_CHECK = true`, replicated at all
  distances. Register your own type if you used `WITH_ROT` for non-player entities.
- The `NATIVE_WITH_LOCK` locker part's `RootPriority` dropped 127 → 126 so the `ALIGN`
  driver can outrank it.

New API worth adopting:
- `Entity.SetInterpolationMode(entity, "CFRAME" | "ALIGN" | "NONE")`, per-type
  `INTERPOLATION_MODE`, global `DEFAULT_INTERPOLATION_MODE` — see
  [Interpolation Modes](#interpolation-modes). Use `ALIGN` around ragdolls; use `NONE` instead
  of `CUSTOM_INTERPOLATION` when you need to drive an entity yourself.

---

## Migrating 2.1.4 → 2.1.6

No breaking API changes — existing code compiles and runs unchanged, with one exception:

- **`Entity.new` now errors if called before `Chrono.Start()`.** Audit initialization order:
  any entity created during module load before `Start()` runs will now throw instead of
  silently misbehaving.

Behavioral changes (compile fine, may affect gameplay/tuning):
- Built-in `PLAYER` entity type now defaults `HALF_TICK_DISTANCE = math.huge` — player
  characters stay replicated at all distances (matching Roblox's native behavior). Register a
  custom config if you relied on distance-based culling of players.
- `BUFFER = 0` on an entity config now selects a dynamic (adaptive) buffer for server-owned
  entities. Previously only client-owned entities were dynamic.

New API worth adopting:
- `Entity.SetClockBuffer(entity, buffer?)` (client only) — per-entity interpolation buffer
  override; `0` = dynamic, `nil` clears.
- `Config.GetEntityType(name)` — public access to a locked entity config; call
  `:UpdateBuffer(seconds)` on it to retune every entity of a type at runtime.
- `Stats.SERVER.GRID_STATS` — per-player breakdown of entity ids replicating at HALF/NORMAL
  tick rates, for debugging replication distance tuning.

---

## Migrating 2.0.4 → 2.1.4

API breaks (will error or fail to compile):
- `SetConfig("SHOW_WARNINGS", ...)` — removed; use `SetConfig("WARNING_SEVERITY", level)` or
  `Config.SetWarningSeverity(level)`. New default is `"MEDIUM"` (old behavior was silent), so
  expect new warnings in output.
- `SEND_FULL_ROTATION` global config — removed; use per-entity-type `FULL_ROTATION`.
- `Config.FLAGS.HEARTBEAT_CLOCK_SYNC` (briefly added in 2.0.10) — removed; the heartbeat is
  always on now. Current flags are listed under [Feature Flags](#feature-flags).
- `Stats.REPLICATE_PERMISSIONS = nil` no longer broadcasts stats to everyone; use
  `Stats.ReplicateStatsForPlayer(userId)`.

Behavioral changes (compile fine, may affect gameplay/tuning):
- `Entity.GetTargetRenderTime` returns **-1** (was 0) when no render cache exists; negative
  values passed to `GetAt` return the latest snapshot.
- Server replication loop moved **PreSimulation → PostSimulation** — audit RunService binding
  order for code that must run before/after Chrono in a frame.
- `MAX_TOTAL_BYTES_PER_FRAME_PER_PLAYER`: old flat default 3000 → new 300 baseline scaling
  +21 bytes per client-owned entity. Re-evaluate any tuned value.
- DEFAULT entity type `TICK_RATE` changed 1/30 → 1/20; built-in PLAYER config now sets
  `ASSEMBLY_ROOT_PART_CHECK = true`.
- Mounts now apply on **both server and client** — remove server-side workarounds that manually
  position mounted entities, or they'll double-apply.
- `NATIVE_WITH_LOCK`: no longer disables server-side physics for NPCs; lock state replicates to
  clients; the local player's own character keeps client→server replication.
- Snapshot/packet timestamps are u32 at 0.1 ms precision with clock wrapping (was f32) — audit
  code doing math on raw replicated timestamps or custom `Snapshots.New` usage.

New API worth adopting:
- `EntityGrid.GetEntityHolder` / `UpdatePlayerPosition` with per-player `EntityAdded`/
  `EntityRemoving` signals — replaces homegrown "which entities does this player see" tracking.
- `Events.EntityMountChanged`, `Entity.SyncOwnerShip`, `GRID_UPDATE_INTERVAL` /
  `GRID_MAX_UPDATE_TIME` configs, `ASSEMBLY_ROOT_PART_CHECK` / `ATTACH_MODEL_META_DATA`
  per-entity-type options.

---

*Documentation generated from source code analysis of Chrono v2.3.0*
