/**
 * TypeScript definitions for Chrono v2.0.0-experimental
 * Custom Character Replication for Roblox
 * @see https://github.com/Parihsz/Chrono
 */

declare namespace Chrono {
	// ===== Type Aliases =====
	export type ModelReplicationMode = "NATIVE" | "NATIVE_WITH_LOCK" | "CUSTOM";
	export type PlayerReplicationMode = "AUTOMATIC" | "CUSTOM";
	export type ReplicationFilterMode = "NONE" | "PLAYER_ENTITIES" | "PLAYER_CHARACTERS";

	export type ConfigName =
		| "MIN_BUFFER"
		| "MAX_BUFFER"
		| "SHOW_WARNINGS"
		| "MAX_SNAPSHOT_COUNT"
		| "CHECK_NEW_VERSION"
		| "DEFAULT_NORMAL_TICK_DISTANCE"
		| "DEFAULT_HALF_TICK_DISTANCE"
		| "DEFAULT_MODEL_REPLICATION_MODE"
		| "PLAYER_REPLICATION"
		| "REPLICATE_DEATHS"
		| "REPLICATE_CFRAME_SETTERS"
		| "MAX_TOTAL_BYTES_PER_FRAME_PER_PLAYER"
		| "SEND_FULL_ROTATION";

	export type EntityEventName =
		| "Destroying"
		| "NetworkOwnerChanged"
		| "PushedSnapShot"
		| "TickChanged"
		| "DataChanged"
		| "Ticked"
		| "ModelChanged"
		| "LockChanged";

	export type RuleFn = (entity: Entity, viewer: Player, viewerEntityId?: number) => boolean;
	export type MiddleManFn = (player: Player, entity: Entity, cframe: CFrame, arriveTime: number) => boolean;

	// ===== Interfaces =====
	export interface ConfigValueMap {
		MIN_BUFFER: number;
		MAX_BUFFER: number;
		SHOW_WARNINGS: boolean;
		MAX_SNAPSHOT_COUNT: number;
		CHECK_NEW_VERSION: boolean;
		DEFAULT_NORMAL_TICK_DISTANCE: number;
		DEFAULT_HALF_TICK_DISTANCE: number;
		DEFAULT_MODEL_REPLICATION_MODE: ModelReplicationMode;
		PLAYER_REPLICATION: PlayerReplicationMode;
		REPLICATE_DEATHS: ReplicationFilterMode;
		REPLICATE_CFRAME_SETTERS: ReplicationFilterMode;
		MAX_TOTAL_BYTES_PER_FRAME_PER_PLAYER: number;
		SEND_FULL_ROTATION: boolean;
	}

	export interface Connection {
		Disconnect(): void;
		Connected: boolean;
	}

	export interface ChronoEvent<T extends Callback = Callback> {
		Connect(callback: T, defer?: boolean): Connection;
		Once(callback: T, defer?: boolean): Connection;
		Wait(defer?: boolean): LuaTuple<Parameters<T>>;
	}

	export interface SnapshotData<Value, Velocity> {
		t: number;
		value: Value;
		velocity: Velocity;
	}

	export interface Snapshot<Value, Velocity> {
		Push(timeStamp: number, value: Value, velocity: Velocity): void;
		GetLatest(): SnapshotData<Value, Velocity> | undefined;
		GetAt(at: number, bypassLock?: boolean): Value | undefined;
		Clear(): void;
	}

	export interface EntityConfigInput {
		BUFFER: number;
		TICK_RATE: number;
		FULL_ROTATION?: boolean;
		AUTO_UPDATE_POSITION?: boolean;
		STORE_SNAPSHOTS?: boolean;
		MODEL_REPLICATION_MODE?: ModelReplicationMode;
		NORMAL_TICK_DISTANCE?: number;
		HALF_TICK_DISTANCE?: number;
		CUSTOM_INTERPOLATION?: boolean;
	}

	export interface ClientStats {
		TOTAL_ENTITIES_CULLED: number;
		ENTITIES_MOVED_THIS_FRAME: number;
		TOTAL_CLIENT_ENTITIES_CHECKED_THIS_FRAME: number;
		TOTAL_CLIENT_ENTITIES: number;
		AVG_INTERPOLATION_TIME_MS: number;
		BYTES_RECEIVED_PER_SEC: number;
		NEW_ENTITIES_PER_SEC: number;
		ENTITY_CHANGES_PER_SEC: number;
		ENTITY_REMOVALS_PER_SEC: number;
	}

	export interface ServerStats {
		AVG_TICKER_TIME_MS: number;
		ENTITY_GRID_UPDATE_TIME_MS: number;
		GRID_UPDATE_SECTIONS: number;
		NUMBER_OF_ENTITIES: number;
		NON_TICKED: number;
		ENTITIES_FULL_TICKED: number;
		ENTITIES_HALF_TICKED: number;
		REPLICATE_PLAYER_TIME_MS: number;
		BYTES_RECEIVED_PER_SEC: number;
		BYTES_SENT_PER_SEC: number;
		PACKETS_SENT_PER_SEC: number;
	}

	export interface Entity {
		/** Unique identifier for this entity */
		readonly id: number;

		/** Whether this entity is registered with the system */
		readonly registered: boolean;

		/** Whether this entity has been destroyed */
		readonly destroyed: boolean;

		/** The player who owns this entity (controls its movement) */
		readonly networkOwner: Player | undefined;

		/** Whether the current context (client/server) is the network owner */
		readonly isContextOwner: boolean;

		/** The model associated with this entity */
		readonly model: Model | BasePart | undefined;

		/** Whether replication is paused for this entity */
		readonly paused: boolean;

		/** The most recent CFrame value */
		readonly latestCFrame: CFrame | undefined;
	}

	export interface EntityConstructor {
		new (
			entityConfig?: string,
			model?: Model | BasePart | string,
			modelReplicationMode?: ModelReplicationMode,
			initCFrame?: CFrame,
		): Entity;

		/** Sets or changes the model for an entity */
		SetModel: (
			entity: Entity,
			model?: Model | BasePart | string,
			modelReplicationMode?: ModelReplicationMode,
			noDestroy?: boolean,
		) => void;

		/** Sets the entity configuration type */
		SetConfig: (entity: Entity, entityConfig: string) => void;

		/** Sets the broad phase collision bounds */
		SetBroadPhase: (entity: Entity, broadPhase?: Vector3) => void;

		/** Gets custom data associated with an entity */
		GetData: <T = unknown>(entity: Entity) => T;

		/** Gets the model associated with an entity */
		GetModel: (entity: Entity) => Model | BasePart | undefined;

		/** Sets custom data for an entity */
		SetData: (entity: Entity, data: unknown) => void;

		/** Clears the mount relationship */
		ClearMount: (entity: Entity) => void;

		/** Mounts an entity to a parent entity with optional offset */
		SetMount: (entity: Entity, parent?: Entity, offset?: CFrame) => void;

		/** Sets the network owner (player who controls this entity) */
		SetNetworkOwner: (entity: Entity, player?: Player) => void;

		/** Clears the entity's snapshot buffer */
		Clear: (entity: Entity) => void;

		/** Pauses replication for an entity */
		PauseReplication: (entity: Entity) => void;

		/** Resumes replication for an entity */
		ResumeReplication: (entity: Entity) => void;

		/** Pushes a new CFrame snapshot at the given time */
		Push: (entity: Entity, time: number, value: CFrame) => boolean;

		/** Gets the interpolated CFrame at a specific time */
		GetAt: (entity: Entity, time: number) => CFrame | undefined;

		/** Gets the target render time for interpolation */
		GetTargetRenderTime: (entity: Entity) => number;

		/** Sets whether position updates automatically */
		SetAutoUpdatePos: (entity: Entity, autoUpdate: boolean) => void;

		/** Gets the current CFrame */
		GetCFrame: (entity: Entity) => CFrame | undefined;

		/** Sets the current CFrame */
		SetCFrame: (entity: Entity, cframe: CFrame) => void;

		/** Gets the primary part of the model */
		GetPrimaryPart: (entity: Entity) => BasePart | undefined;

		/** Locks native server CFrame replication */
		LockNativeServerCFrameReplication: (entity: Entity) => void;

		/** Unlocks native server CFrame replication */
		UnlockNativeServerCFrameReplication: (entity: Entity) => void;

		/** Destroys an entity */
		Destroy: (entity: Entity) => void;

		/** Gets an event by name */
		GetEvent: ((entity: Entity, name: "Destroying") => ChronoEvent<(entity: Entity) => void>) &
			((
				entity: Entity,
				name: "NetworkOwnerChanged",
			) => ChronoEvent<(entity: Entity, newOwner: Player | undefined, prevOwner: Player | undefined) => void>) &
			((
				entity: Entity,
				name: "PushedSnapShot",
			) => ChronoEvent<(entity: Entity, time: number, value: CFrame, isNewest: boolean) => void>) &
			((
				entity: Entity,
				name: "TickChanged",
			) => ChronoEvent<(entity: Entity, newTickType: "NONE" | "HALF" | "NORMAL") => void>) &
			((entity: Entity, name: "DataChanged") => ChronoEvent<(entity: Entity, data: unknown) => void>) &
			((entity: Entity, name: "Ticked") => ChronoEvent<(entity: Entity, dt: number) => void>) &
			((
				entity: Entity,
				name: "ModelChanged",
			) => ChronoEvent<
				(entity: Entity, newModel: Model | BasePart | undefined, oldModel: Model | BasePart | undefined) => void
			>) &
			((entity: Entity, name: "LockChanged") => ChronoEvent<(entity: Entity, isLocked: boolean) => void>) &
			((entity: Entity, name: EntityEventName) => ChronoEvent);
	}

	export interface ReplicationRule {
		filterType: "include" | "exclude";
		filterPlayers?: Player[];
	}

	// ===== Functions and Values =====

	/** Starts the Chrono system */
	function Start(config?: ModuleScript): void;

	/** Entity constructor */
	const Entity: EntityConstructor;

	/** Entity holder/registry functions */
	namespace Holder {
		/** Registers an entity with the system */
		function RegisterEntity(entity: Entity): void;

		/** Unregisters an entity from the system */
		function UnregisterEntity(entity: Entity): void;

		/** Gets the storage instance for entities */
		function GetEntityStorageInstance(): Camera;

		/** Associates a player with an entity as their character */
		function SetAsCharacter(player: Player, entity: Entity): void;

		/** Removes a player's character association */
		function RemovePlayerCharacter(entity: Entity): void;

		/** Gets the entity associated with a player */
		function GetEntityFromPlayer(player: Player): Entity | undefined;

		/** Gets an entity by its ID */
		function GetEntityFromId(id: number): Entity | undefined;

		/** Gets the entity associated with a model */
		function GetEntityFromModel(model: Model): Entity | undefined;

		/** Map of entity IDs to entities (Lua table, use .get() to access) */
		const idMap: ReadonlyMap<number, Entity>;
	}

	/** Global events */
	namespace Events {
		/** Fires when an entity is added */
		const EntityAdded: ChronoEvent<(entity: Entity) => void>;

		/** Fires when an entity is removed */
		const EntityRemoved: ChronoEvent<(entity: Entity) => void>;

		/** Fires when a player character is registered */
		const PlayerCharacterRegistered: ChronoEvent<(player: Player, entity: Entity) => void>;

		/** Fires when a player character is unregistered */
		const PlayerCharacterUnregistered: ChronoEvent<(player: Player, entity: Entity) => void>;

		/** Fires when a player gains ownership of an entity */
		const PlayerOwnedAdded: ChronoEvent<(player: Player, entity: Entity) => void>;

		/** Fires when a player loses ownership of an entity */
		const PlayerOwnedRemoved: ChronoEvent<(player: Player, entity: Entity) => void>;
	}

	/** Configuration functions */
	namespace Config {
		/** Sets a configuration value (must be called before Start) */
		function SetConfig<K extends ConfigName>(name: K, value: ConfigValueMap[K]): void;

		/** Registers a custom entity type configuration */
		function RegisterEntityType(name: string, config: EntityConfigInput): void;

		/** Registers a model for an entity type */
		function RegisterEntityModel(name: string, model: Model | BasePart, broadPhase?: Vector3): void;
	}

	/** Replication rules for controlling entity visibility */
	namespace ReplicationRules {
		/** Sets a replication rule for a target. Pass undefined to clear the rule. */
		function SetReplicationRule(
			target: Player | Model | number | Entity,
			rule: ReplicationRule | RuleFn | undefined,
		): void;

		/** Checks if an entity should be replicated to a viewer */
		function Allows(entity: Entity, viewer: Player): boolean;

		/** Creates a rule that only includes specified players */
		function Include(players: Player[]): RuleFn;

		/** Creates a rule that excludes specified players */
		function Exclude(players: Player[]): RuleFn;
	}

	/** Statistics and metrics */
	namespace Stats {
		/** Client-side statistics */
		const CLIENT: ClientStats;

		/** Server-side statistics */
		const SERVER: ServerStats;

		/** Permission map for stat replication (user IDs to boolean) */
		let REPLICATE_PERMISSIONS: Map<number, boolean> | undefined;
	}

	/** Server-side receiver middleware (Server only) */
	namespace Receiver {
		/** Registers a middleware function to intercept entity updates */
		function RegisterMiddleMan(name: string, priority: number, func: MiddleManFn): void;

		/** Unregisters a middleware function */
		function UnregisterMiddleMan(name: string): void;
	}

	/** Server clock utilities (Server only) */
	namespace ServerClock {
		/** Stores clock synchronization data for a player */
		function Store(player: Player, clientClockTime: number): void;

		/** Converts a clock value between server and client time */
		function ConvertTo(player: Player, clock: number, environment: "Server" | "Client"): number;

		/** Removes clock data for a player */
		function Remove(player: Player): void;
	}

	/** Snapshot utilities */
	namespace Snapshots {
		/** Creates a new snapshot manager with a custom interpolation function */
		function New<Value, Velocity>(
			lerpFunction: (
				v1: Value,
				v2: Value,
				vel1: Velocity,
				vel2: Velocity,
				t: number,
				dt: number,
			) => Value,
		): Snapshot<Value, Velocity>;
	}
}

export = Chrono;
