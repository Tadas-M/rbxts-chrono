# rbxts-chrono

TypeScript type definitions for [Chrono](https://github.com/Parihsz/Chrono) - a custom character replication library for Roblox.

## Installation

```bash
npm install rbxts-chrono
```

## Usage

```typescript
import Chrono from "rbxts-chrono";

// Start Chrono
Chrono.Start();

// Create an entity
const entity = new Chrono.Entity("default", model);

// Set entity CFrame
entity.SetCFrame(new CFrame(0, 10, 0));

// Listen for events
Chrono.Events.EntityAdded.Connect((entity) => {
    print("Entity added:", entity.GetModel());
});
```

## Links

- [Chrono Repository](https://github.com/Parihsz/Chrono)
- [Chrono Documentation](https://parihsz.github.io/Chrono/)

## License

MIT
