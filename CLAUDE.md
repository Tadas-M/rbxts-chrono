# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript type definitions package for [Chrono](https://github.com/Parihsz/Chrono), a custom character replication library for Roblox. It provides roblox-ts (rbxts) bindings so TypeScript developers can use Chrono with full type safety.

## Architecture

**Self-contained package**: the Chrono Luau runtime is vendored into the package, so consumers need no extra Rojo mappings and there is no git dependency.

- [src/index.d.ts](src/index.d.ts) - All TypeScript type definitions for the Chrono API
- [src/init.lua](src/init.lua) - Builds the export table from `script.Chrono`; new top-level upstream exports must be added here as well as in `index.d.ts`
- `src/Chrono/` - Upstream Chrono `src/`, copied verbatim by the sync script. Never edit by hand
- [LICENSE-chrono](LICENSE-chrono) - Upstream MIT license, shipped with the vendored code
- [default.project.json](default.project.json) - Rojo project configuration

## Development Commands

```bash
npm run sync -- v2.2.0                    # Replace src/Chrono with upstream tag v2.2.0
rojo sourcemap default.project.json -o sourcemap.json   # Refresh after a sync (Rojo pinned in rokit.toml)
npm publish                               # Publish to npm (requires authentication)
```

No build step required - TypeScript definitions are consumed directly. In the sandbox, prefix the sync with `TMPDIR=<scratchpad>`.

## Type Definition Guidelines

When updating types to match new Chrono versions:

1. Run the sync script for the new tag and review `git diff src/Chrono` - that diff is the full list of upstream changes
2. Reference the [Chrono documentation](https://parihsz.github.io/Chrono/) and source code
3. All types are declared in a single `index.d.ts` file using `declare namespace Chrono`
4. Use TypeScript function overloads for methods that accept different parameter combinations (see `Config.SetConfig` or `Entity.GetEvent`)
5. The package targets Chrono v2.1.6 - version is tracked in both `package.json` and the JSDoc header in `index.d.ts`
6. [docs/chrono-documentation.md](docs/chrono-documentation.md) is the canonical Chrono reference for all consuming projects (the user's global `chrono` skill points at it) - update it alongside version bumps, including its "Migrating" section
