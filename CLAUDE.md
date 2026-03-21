# bangersss-mcp

## What this is

An MCP server for organizing music with LLM assistance, built for DJs. Supports dry-mode file operations, exportable plans, BPM analysis, ID3 tags, playlists, Rekordbox, and Engine DJ.

## Tech stack

- TypeScript, ES modules ("type": "module")
- Node.js >= 20
- `@modelcontextprotocol/sdk` for MCP server
- `memfs` + `unionfs` for overlay filesystem (dry mode)
- `music-metadata` for reading tags, `node-id3` for writing
- `better-sqlite3` for database access (Rekordbox needs `better-sqlite3-multiple-ciphers`)
- `fast-glob` for file scanning
- `zod` for schema validation
- `vitest` for testing

## Commands

```sh
npm run dev        # Run with tsx (development)
npm run build      # Compile TypeScript
npm start          # Run compiled output
npm run typecheck  # Type check without emitting
npm test           # Run tests (vitest)
npm run test:watch # Watch mode tests
```

## Code conventions

- ES module imports with `.js` extensions in relative paths (Node16 resolution)
- Tools are registered in `src/tools/*.ts`, each exporting a `registerXxxTools(server, context)` function
- All file mutations go through the OverlayFS (`src/overlay/`) — never write directly to real fs from tool handlers
- Database mutations use SQL journals (array of SQL statements) committed in a transaction
- Errors use custom error classes from `src/util/errors.ts`
- Logging via `createLogger(module)` from `src/util/logger.ts` — logs to stderr (stdout is MCP transport)

## Architecture

- `src/index.ts` — entry point, stdio transport
- `src/server.ts` — creates McpServer, registers all tools, holds ServerContext
- `src/overlay/` — OverlayFS class (memfs over real fs), FileTracker, commit logic
- `src/plans/` — Plan types (Zod schemas), PlanManager, operation factories
- `src/audio/` — BPM analysis, audio decoding (requires ffmpeg)
- `src/tags/` — Tag reader (music-metadata) and writer (node-id3)
- `src/playlists/` — M3U parser/generator, PlaylistManager
- `src/rekordbox/` — Rekordbox DB (SQLCipher4), schema types, track/playlist/cue queries
- `src/engine-dj/` — Engine DJ DB, schema types, track/crate queries, blob decompression
- `src/tools/` — MCP tool definitions, one file per logical group
- `src/util/` — Audio format helpers, error classes, logger
