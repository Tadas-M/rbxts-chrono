-- Hand-built so the exported names match index.d.ts (Receiver, Snapshots.New).

local RunService = game:GetService("RunService")
local IS_SERVER = RunService:IsServer()

local ChronoSrc = script.Chrono
local Shared = ChronoSrc.Shared

local Main = require(ChronoSrc)

local Entity = require(Shared.Entity)
local Holder = require(Shared.Holder)
local Events = require(Shared.Events)
local Config = require(Shared.Config)
local ReplicationRules = require(Shared.ReplicationRules)
local Stats = require(Shared.Stats)
local Snapshots = require(Shared.Snapshots)

local Chrono = {
	Start = Main.Start,
	Entity = Entity,
	Holder = Holder,
	Events = Events,
	Config = Config,
	ReplicationRules = ReplicationRules,
	Stats = Stats,
	Snapshots = { New = Snapshots },
}

if IS_SERVER then
	local Server = ChronoSrc.Server
	Chrono.Receiver = require(Server.Receiver)
	Chrono.ServerClock = require(Server.ServerClock)
	Chrono.EntityGrid = require(Server.EntityGrid)
end

return Chrono
