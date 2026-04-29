# bangersss

## What this is

Music organization tools for DJs — MCP server, CLI, and core library. Supports dry-mode file operations, exportable plans, BPM analysis, ID3 tags, playlists, Rekordbox, and Engine DJ.

## Tech stack

- TypeScript, ES modules ("type": "module")
- Node.js >= 22, pnpm workspaces
- `@modelcontextprotocol/sdk` for MCP server
- `memfs` + `unionfs` for overlay filesystem (dry mode)
- `music-metadata` for reading tags, `node-id3` for writing
- `better-sqlite3-multiple-ciphers` for database access (Rekordbox SQLCipher4)
- `fast-glob` for file scanning
- `zod` for schema validation
- `commander` for CLI
- `vitest` for testing

## Monorepo structure

```
packages/
  core/    @bangersss/core  — all business logic (audio, tags, overlay, plans, playlists, rekordbox, engine-dj, util)
  mcp/     @bangersss/mcp   — MCP server, thin tool wrappers over core
  cli/     @bangersss/cli   — CLI commands (scan, analyze, dedupe, organize, tag, cache)
```

## Commands

```sh
pnpm build          # Build all packages
pnpm test           # Run tests (vitest)
pnpm test:watch     # Watch mode tests
pnpm dev:mcp        # Run MCP server with tsx (development)
pnpm dev:cli        # Run CLI with tsx (development)
pnpm typecheck      # Type check all packages
```

## Code conventions

- ES module imports with `.js` extensions in relative paths (NodeNext resolution)
- MCP tools are registered in `packages/mcp/src/tools/*.ts`, each exporting a `registerXxxTools(server, context)` function
- MCP tools import logic from `@bangersss/core` — keep tool handlers thin
- All file mutations go through the OverlayFS (`packages/core/src/overlay/`) — never write directly to real fs from tool handlers
- Database mutations use SQL journals (array of SQL statements) committed in a transaction
- Errors use custom error classes from `packages/core/src/util/errors.ts`
- Logging via `createLogger(module)` from `packages/core/src/util/logger.ts` — logs to stderr

## Architecture

### @bangersss/core (`packages/core/src/`)
- `audio/` — BPM analysis, key detection (keyfinder-cli), audio decoding (requires ffmpeg)
- `tags/` — Tag reader (music-metadata) and writer (node-id3)
- `overlay/` — OverlayFS class (memfs over real fs), FileTracker, commit logic
- `plans/` — Plan types (Zod schemas), PlanManager, operation factories
- `playlists/` — M3U parser/generator, PlaylistManager
- `rekordbox/` — Rekordbox DB (SQLCipher4), schema types, track/playlist/cue queries
- `engine-dj/` — Engine DJ DB, schema types, track/crate queries, blob decompression
- `util/` — Audio format helpers, error classes, logger, walker/sample-pack-detector
- `index.ts` — barrel export of all public API

### @bangersss/mcp (`packages/mcp/src/`)
- `index.ts` — entry point, stdio transport
- `server.ts` — creates McpServer, registers all tools, holds ServerContext
- `tools/` — MCP tool definitions, one file per logical group

### @bangersss/cli (`packages/cli/src/`)
- `index.ts` — commander CLI entry point
- `commands/` — scan, analyze, dedupe, organize, tag, cache
