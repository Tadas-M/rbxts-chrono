# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript type definitions package for [Chrono](https://github.com/Parihsz/Chrono), a custom character replication library for Roblox. It provides roblox-ts (rbxts) bindings so TypeScript developers can use Chrono with full type safety.

## Architecture

**Type-definitions-only package**: This package contains no implementation code. The runtime comes from the `chrono-lua` dependency.

- [src/index.d.ts](src/index.d.ts) - All TypeScript type definitions for the Chrono API
- [src/init.lua](src/init.lua) - Re-exports the `chrono-lua` package at runtime
- [default.project.json](default.project.json) - Rojo project configuration

## Development Commands

```bash
npm install    # Install dependencies (pulls chrono-lua from GitHub)
npm publish    # Publish to npm (requires authentication)
```

No build step required - TypeScript definitions are consumed directly.

## Type Definition Guidelines

When updating types to match new Chrono versions:

1. Reference the [Chrono documentation](https://parihsz.github.io/Chrono/) and source code
2. All types are declared in a single `index.d.ts` file using `declare namespace Chrono`
3. Use TypeScript function overloads for methods that accept different parameter combinations (see `Config.SetConfig` or `Entity.GetEvent`)
4. The package targets Chrono v2.0.0-experimental - version is tracked in both `package.json` and the JSDoc header in `index.d.ts`
