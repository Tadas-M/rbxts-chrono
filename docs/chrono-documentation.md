# Chrono Replication Library - Comprehensive Documentation

> **Version**: 2.1.6
> **Purpose**: Custom character/entity replication system for Roblox
> **Author**: Parihsz (GitHub)
>
> This is the canonical reference for all projects consuming Chrono (via `rbxts-chrono` /
> `chrono-lua`). A consuming project may have an older version installed — check its
> `package.json` before relying on version-specific behavior. See
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
11. [Migrating 2.1.4 → 2.1.6](#migrating-214--216)
12. [Migrating 2.0.4 → 2.1.4](#migrating-204--214)

---

## Overview

Chrono is a custom entity replication library designed to replace or augment Roblox's native character replication. It provides:

- **Efficient CFrame replication** using binary buffers with compressed rotation
- **Distance-based tick rates** (full/half/none) for bandwidth optimization
- **Client-owned entity support** with server validation
- **Hermite interpolation** for smooth movement on clients
- **Frustum culling** to skip rendering off-screen entities
- **Entity mounting** for parent-child CFrame relationships (applied on both server and client)
- **Replication rules** for per-entity visibility control
- **Per-player entity grids** exposing which entities each player currently sees

---

## Architecture

### File Structure

```
chrono-lua/src/
├── init.luau                    # Entry point, Start() function, re-exported types
├── Shared/                      # Shared between client/server
│   ├── Types.luau              # Type definitions
│   ├── Config.luau             # Configuration management + FLAGS
│   ├── Entity.luau             # Entity class and operations
│   ├── Holder.luau             # Entity registry (ID mapping)
│   ├── Events.luau             # Global event signals
│   ├── Snapshots.luau          # Circular buffer for CFrame history
│   ├── ClockUnwrap.luau        # u32 fixed-point timestamp quantize/unwrap
│   ├── InterpolationMath.luau  # Hermite interpolation
│   ├── Ticker.luau             # Server-side tick scheduling
│   ├── ReplicationRules.luau   # Visibility filtering
│   ├── ModelHelper.luau        # Model replication helpers
│   ├── ApplyMounts.luau        # Entity mounting resolution
│   ├── Signal.luau             # Custom event implementation
│   ├── Stats.luau              # Performance metrics + debugger replication
│   ├── Warn.luau               # Severity-levelled warnings
│   ├── Bin.luau                # Cleanup utility
│   └── FastStackPlus.luau      # Stack data structure
├── Server/
│   ├── Replicate.luau          # Main server replication loop (PostSimulation)
│   ├── Sender.luau             # Serialization and packet sending
│   ├── Receiver.luau           # Client→Server packet handling
│   ├── EntityGrid.luau         # Distance-based entity sorting (public API)
│   ├── Player.luau             # Player character auto-registration
│   └── ServerClock.luau        # Clock synchronization
└── Client/
    ├── Replicate.luau          # Main client interpolation loop
    ├── Sender.luau             # Client→Server packet sending
    ├── Receiver.luau           # Server→Client packet handling
    ├── ClientClock.luau        # Render time calculation
    ├── InterpolationBuffer.luau # Adaptive jitter buffer
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
| `DEFAULT_HALF_TICK_DISTANCE` | number | 100 | Distance for half tick rate (beyond = no replication) |
| `DEFAULT_MODEL_REPLICATION_MODE` | string | "NATIVE" | Default model mode |
| `PLAYER_REPLICATION` | string | "AUTOMATIC" | Auto-register player characters |
| `REPLICATE_DEATHS` | string | "PLAYER_ENTITIES" | Death replication filter |
| `REPLICATE_CFRAME_SETTERS` | string | "PLAYER_ENTITIES" | CFrame setter replication filter |
| `MAX_TOTAL_BYTES_PER_FRAME_PER_PLAYER` | number | 300 | **Baseline** rate limit; effective budget scales +21 bytes per client-owned entity |
| `GRID_UPDATE_INTERVAL` | number | 0.1 | Seconds between entity grid updates |
| `GRID_MAX_UPDATE_TIME` | number | 0.0005 | Per-frame time budget (seconds) for grid updates |

Removed configs (existed in 2.0.x): `SHOW_WARNINGS` (boolean; replaced by `WARNING_SEVERITY`),
`SEND_FULL_ROTATION` (use the per-entity-type `FULL_ROTATION` field instead).

`Config.SetWarningSeverity(level)` sets `WARNING_SEVERITY` at runtime (also usable from the debugger).

### Feature Flags

`Chrono.Config.FLAGS` — all default `true`; can be toggled to revert to pre-fix behavior:

| Flag | Description |
|------|-------------|
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
    CUSTOM_INTERPOLATION = false, -- Disable auto-interpolation (default false)
})
```

**EntityConfigInput Fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `TICK_RATE` | number | — (required) | Seconds between updates (e.g., 1/20 = 20 Hz) |
| `BUFFER` | number | — (required) | Interpolation delay in seconds. `0` → dynamic (adaptive) buffer for server-owned entities (2.1.6+); client-owned entities always use a dynamic buffer |
| `FULL_ROTATION` | boolean | false | Send all 3 rotation axes vs yaw-only |
| `AUTO_UPDATE_POSITION` | boolean | true | Auto-read CFrame from model each tick |
| `STORE_SNAPSHOTS` | boolean | false | Store snapshots on server for server-owned entities |
| `MODEL_REPLICATION_MODE` | string | - | "NATIVE", "NATIVE_WITH_LOCK", or "CUSTOM" |
| `NORMAL_TICK_DISTANCE` | number | 50 | Distance threshold for full tick rate |
| `HALF_TICK_DISTANCE` | number | 100 | Distance threshold for half tick rate |
| `CUSTOM_INTERPOLATION` | boolean | false | Disable automatic interpolation |
| `ASSEMBLY_ROOT_PART_CHECK` | boolean | false | Verify the primary part is the assembly root part (or inside the model) |
| `ATTACH_MODEL_META_DATA` | boolean | true | Set explicitly false to stop Chrono attaching model metadata (see Shared/ModelHelper) |

**Built-in entity types:**
- `DEFAULT`: TICK_RATE = 1/20, BUFFER = 0.1
- `WITH_ROT`: DEFAULT + FULL_ROTATION
- `PLAYER`: NATIVE mode, TICK_RATE = 1/20, dynamic buffer, `ASSEMBLY_ROOT_PART_CHECK = true`, `HALF_TICK_DISTANCE = math.huge` (2.1.6+: players stay replicated at all distances, matching Roblox's default behavior)

**Changing buffers at runtime (client, 2.1.6+):**
- Per entity: `Chrono.Entity.SetClockBuffer(entity, seconds)` overrides one entity's buffer.
- Per entity type: `Chrono.Config.GetEntityType(name):UpdateBuffer(seconds)` updates every
  entity of that type (shared clocks and owned per-entity clocks), except entities with their
  own `SetClockBuffer` override. Pass `0` for a dynamic buffer.

### Model Registration

Pre-register models for efficient CUSTOM mode replication:

```lua
Chrono.Config.RegisterEntityModel("ZOMBIE", zombieModel, Vector3.new(4, 6, 4))
-- Third param is broad phase size for frustum culling
```

---

## Entity System

### Creating Entities

> **2.1.6+:** `Entity.new` errors if called before `Chrono.Start()`.

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
| `snapshot` | `Snapshot?` | Circular buffer of CFrame history (client) |
| `latestCFrame` | `CFrame?` | Most recent known position |
| `latestTime` | `number?` | Timestamp of latest CFrame |
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
| `SetClockBuffer(entity, buffer?)` | Per-entity interpolation buffer override (client only, 2.1.6+; see notes below) |
| `SetBroadPhase(entity, vector?)` | Set frustum culling bounds |
| `GetData(entity)` | Get custom user data |
| `SetData(entity, data)` | Set custom user data (replicated) |
| `SetNetworkOwner(entity, player?)` | Set who controls this entity |
| `SyncOwnerShip(entity)` | Resync entity+model network ownership (server; use if Roblox resets part ownership) |
| `SetMount(entity, parent?, offset?)` | Mount to another entity |
| `ClearMount(entity)` | Remove mount relationship |
| `Push(entity, time, cframe, velocity?)` | Push a CFrame snapshot (returns boolean: true if newest) |
| `GetAt(entity, time)` | Get interpolated CFrame at time (negative time → latest) |
| `GetCFrame(entity)` | Get current CFrame |
| `SetCFrame(entity, cframe)` | Teleport entity (see notes below) |
| `SetAutoUpdatePos(entity, autoUpdate)` | Enable/disable auto position reading |
| `GetTargetRenderTime(entity)` | Get client render timestamp; **returns -1 when no render cache is configured** |
| `GetPrimaryPart(entity)` | Get the primary part |
| `PauseReplication(entity)` | Stop replicating this entity |
| `ResumeReplication(entity)` | Resume replication |
| `Clear(entity)` | Clear snapshot buffer, reset cached cframe/time |
| `LockNativeServerCFrameReplication(entity)` | Lock server-side CFrame |
| `UnlockNativeServerCFrameReplication(entity)` | Unlock server-side CFrame |
| `GetModelReplicationType(entity)` | "NATIVE" \| "CUSTOM" \| "NATIVE_WITH_LOCK" |
| `Destroy(entity)` | Destroy and unregister |
| `GetEvent(entity, eventName)` | Get entity event |

**Method Behavior Notes:**

- **`SetCFrame(entity, cframe)`**: Marks a teleport so client interpolation snaps rather than easing through (see `SET_CFRAME_FIX` / `FIX_TELEPORT_JITTER` flags). On non-owner clients it clears the snapshot buffer. Use for teleportation.
- **`Push(entity, time, cframe, velocity?)`**: Returns `true` if this snapshot is the newest in the buffer. Use for continuous movement updates.
- **`SetNetworkOwner(entity, player?)`**: Clears the snapshot buffer and recreates the ClientClock. This ensures clean state when ownership transfers.
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

3. UpdateTickers()
   - For each Ticker that's due to tick:
     - For each entity in the ticker:
       - If server-owned and AUTO_UPDATE_POSITION: read CFrame from model
       - Push to snapshot
       - If CFrame changed: serialize to buffer

4. ApplyMounts()
   - Mounted entity CFrames are resolved on the server too (since v2.1.0)

5. CheckEntityChanges()
   - Collect property changes for reliable replication

6. For each Player: Sender.ReplicatePlayer()
   - Send new entities (reliable)
   - Send removed entities (reliable)
   - Send property changes (reliable)
   - Send CFrame updates (unreliable buffers)

7. UpdateHeartbeat()
   - Server clock heartbeat to loaded players at 10 Hz (HEARTBEAT_RATE = 1/10)
```

### Client Main Loop (Heartbeat)

```
1. RenderCache.UpdateAll()
   - Advance render time for all client clocks

2. PrepareFrustumCheck()
   - Calculate camera frustum planes

3. For each entity:
   - Skip if destroyed, mounted, or custom interpolation
   - Skip if network owner (we control it)
   - Check frustum culling
   - Get interpolated CFrame at render time
   - Set primaryPart.CFrame

4. ApplyMounts()
   - Resolve mounted entity CFrames

5. Sender.Update()
   - For client-owned entities: serialize and send updates
```

---

## Interpolation System

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

Rotation is interpolated via axis-angle blending.

### Client Clock System

Each entity configuration gets a `ClientClock` that tracks:
- **lastClockAt**: Most recent server timestamp received
- **lastClockDuration**: Local time when that was received
- **renderAt**: Current render timestamp (slightly behind server)

**Render Time Calculation:**
1. When snapshot arrives, record server time and local time
2. Calculate `estimatedServerTime = lastClockAt + (now - lastClockDuration)`
3. Calculate `buffer` from tick rate + jitter deviation
4. `renderAt` advances each frame, staying `buffer` behind estimated server time
5. Smooth corrections if render time drifts too far

The server additionally pushes a clock heartbeat at 10 Hz so client clocks stay reliable even
when few entity packets are flowing.

### Adaptive Buffer

The `InterpolationBuffer` dynamically adjusts based on network jitter:

```lua
-- Exponential moving average of latency
averageLatency = averageLatency + (latency - averageLatency) * 0.1

-- Jitter estimation (RFC 3550)
deviation = deviation + (|latency - lastLatency| - deviation) * 0.1

-- Final buffer = tickRate + (2 * deviation)
-- Clamped between MIN_BUFFER and MAX_BUFFER
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
- **SafeReplicate** (RemoteEvent): Reliable replication path
- **Death** (RemoteEvent): Death replication
- **ClientLoaded** (RemoteEvent): Client ready signal
- **Heartbeat** (RemoteEvent): Server clock heartbeat (10 Hz)
- **ClientHeartbeat** / **ClientClockRelay**: Client clock sync channels

### CFrame Serialization

Positions are f32 per axis; rotation is compressed to u16 per axis:

**Yaw-only:** entity id (u16) + position (3× f32) + Y rotation (u16)
**Full rotation:** entity id (u16) + position (3× f32) + X/Y/Z rotation (3× u16)

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

**Server → Client (Reliable):**
```lua
{
    newEntities: { EntityReceivePacket... },
    removedIds: { number... },
    entityChanges: { {id, data: {{key, value}...}}... }
}
```

**Client → Server (Unreliable):** `[u32 quantized client clock][entity data...]`

Serialization uses a pre-allocated 900-byte buffer, flushed before overflow.

---

## Performance Optimizations

### Distance-Based Tick Rates

The `EntityGrid` module sorts entities into buckets per player:

1. **NORMAL** (0 to NORMAL_TICK_DISTANCE): Full tick rate
2. **HALF** (NORMAL_TICK_DISTANCE to HALF_TICK_DISTANCE): Half tick rate
3. **NONE** (beyond HALF_TICK_DISTANCE): Not replicated

Grid updates every `GRID_UPDATE_INTERVAL` (default 0.1 s) with a `GRID_MAX_UPDATE_TIME`
(default 0.5 ms) per-frame budget to avoid hitches. Both are configurable since v2.0.7.

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

Per-player outgoing bytes are limited by `MAX_TOTAL_BYTES_PER_FRAME_PER_PLAYER`:
**budget = 300 (baseline) + 21 bytes × number of client-owned entities**. Configure the
baseline via `SetConfig`.

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
```

Top-level exports: `Start`, `Entity`, `Holder`, `Events`, `Config`, `ReplicationRules`,
`Stats`, `Snapshots`, and (server-only) `ServerClock`, `ServerReceiver`, `Player`, `EntityGrid`.
(In `rbxts-chrono`, `ServerReceiver` is exposed as `Chrono.Receiver`.)

### Chrono.Config

```lua
Config.SetConfig(name: ConfigName, value: any)     -- Set global configuration (before Start())
Config.SetWarningSeverity(level: WarningLevel)     -- "NONE" | "LOW" | "MEDIUM" | "HIGH"
Config.RegisterEntityType(name: string, config: EntityConfigInput)
Config.GetEntityType(name: string): EntityConfig  -- 2.1.6+; locked config, has :UpdateBuffer(seconds)
Config.RegisterEntityModel(name: string, model: Model|BasePart|false, broadPhase?: Vector3)
Config.SetModelPrimaryForChrono(model: Model, primaryName: string)
Config.FLAGS: { [string]: boolean }                -- see Feature Flags above
```

### Chrono.Entity

```lua
Entity.new(config?, model?, mode?, initCFrame?): Entity
Entity.SetModel(entity, model?, mode?, noDestroy?)
Entity.SetConfig(entity, configName)
Entity.SetClockBuffer(entity, buffer?)  -- client only, 2.1.6+
Entity.SetBroadPhase(entity, broadPhase?)
Entity.GetData(entity): any
Entity.SetData(entity, data)
Entity.SetNetworkOwner(entity, player?)
Entity.SyncOwnerShip(entity)
Entity.SetMount(entity, parent?, offset?)
Entity.ClearMount(entity)
Entity.Push(entity, time, cframe, velocity?): boolean
Entity.GetAt(entity, time): CFrame?
Entity.GetCFrame(entity): CFrame?
Entity.SetCFrame(entity, cframe)
Entity.GetTargetRenderTime(entity): number  -- -1 when no render cache
Entity.SetAutoUpdatePos(entity, autoUpdate)
Entity.GetPrimaryPart(entity): BasePart?
Entity.PauseReplication(entity)
Entity.ResumeReplication(entity)
Entity.Clear(entity)
Entity.LockNativeServerCFrameReplication(entity)
Entity.UnlockNativeServerCFrameReplication(entity)
Entity.GetModelReplicationType(entity): "NATIVE" | "CUSTOM" | "NATIVE_WITH_LOCK"
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

Stats.REPLICATE_PERMISSIONS: { [number]: boolean }
-- Non-optional map of UserIds allowed to receive server stats.
-- NOTE: pre-2.0.7 "nil = broadcast to all" semantics are GONE. Server stats replicate only
-- to permitted players who currently have the debugger open (saves ~100 kb/s otherwise).

Stats.ReplicateStatsForPlayer(userId: number | Player)      -- server only
Stats.StopReplicatingStatsForPlayer(userId: number | Player) -- server only
Stats.HasPermissionToReplicate(userId: number | Player): boolean
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
ServerClock.Store(player, clientClockTime, clientServerTimeNow?)
ServerClock.ConvertTo(player, clock, "Server"|"Client"): number
ServerClock.Remove(player)
```

### Chrono.Snapshots

```lua
Snapshots.New(lerpFunction): Snapshot
-- Create custom snapshot with custom interpolation function
```

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

*Documentation generated from source code analysis of chrono-lua v2.1.6*
