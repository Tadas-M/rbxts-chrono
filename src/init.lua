-- rbxts-chrono: TypeScript types for Chrono
-- Re-exports the chrono-lua dependency with all sub-modules

local RunService = game:GetService("RunService")
local IS_SERVER = RunService:IsServer()

local Packages = script.Parent.Parent.Parent
local ChronoSrc = Packages["chrono-lua"].src
local Shared = ChronoSrc.Shared

-- Main module (contains Start)
local Main = require(ChronoSrc)

-- Shared modules (available on both client and server)
local Entity = require(Shared.Entity)
local Holder = require(Shared.Holder)
local Events = require(Shared.Events)
local Config = require(Shared.Config)
local ReplicationRules = require(Shared.ReplicationRules)
local Stats = require(Shared.Stats)
local Snapshots = require(Shared.Snapshots)

-- Build the export table
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

-- Server-only modules
if IS_SERVER then
	local Server = ChronoSrc.Server
	Chrono.Receiver = require(Server.Receiver)
	Chrono.ServerClock = require(Server.ServerClock)
end

return Chrono
