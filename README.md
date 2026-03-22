# bangersss-mcp

**[albinekb.github.io/bangersss-mcp](https://albinekb.github.io/bangersss-mcp/)**

An MCP (Model Context Protocol) server for organizing music libraries with LLM assistance. Built for DJs — supports Rekordbox, Engine DJ, BPM analysis, key detection, ID3 tags, playlists, and safe dry-mode operation.

Point it at your downloads folder, and your AI assistant will scan, tag, deduplicate, detect BPM and key, and organize tracks into your library — all through a safe dry-mode overlay that doesn't touch your files until you say "commit".

## Features

- **Dry Mode** — All file operations go through an in-memory overlay filesystem. Nothing touches your real files until you explicitly commit. Think `git add` + `git commit` for your music library.
- **Plans** — Create, export, import, and resume operation plans. Organize 10,000 tracks? Export the plan, review it, share it, resume it later.
- **BPM Analysis** — Detect BPM from audio files using ffmpeg + autocorrelation analysis.
- **Key Detection** — Detect musical keys using [keyfinder-cli](https://github.com/evanpurkhiser/keyfinder-cli) (libKeyFinder). Returns standard, Camelot, and Open Key notations.
- **ID3 Tag Management** — Read and write ID3/metadata tags on MP3, FLAC, WAV, AIFF, M4A, OGG files.
- **Playlist Management** — Create, edit, and export M3U/M3U8 playlists.
- **Rekordbox Integration** — Read/write to Rekordbox's database: search tracks, manage playlists, read cue points and hot cues.
- **Engine DJ Integration** — Read/write Engine DJ databases: search tracks, manage crates.
- **File Organization** — Rename, move, and organize files by tag metadata (e.g., `{genre}/{artist}/{title}.mp3`).

## Prerequisites

- **Node.js** >= 20
- **ffmpeg** — Required for BPM analysis and audio decoding
  ```sh
  # macOS
  brew install ffmpeg

  # Ubuntu/Debian
  sudo apt install ffmpeg
  ```

### Optional

- **[keyfinder-cli](https://github.com/evanpurkhiser/keyfinder-cli)** — Required for musical key detection (`analyze_key`, `batch_analyze_key`). Uses libKeyFinder for high-quality key estimation.
  ```sh
  # macOS
  brew install evanpurkhiser/personal/keyfinder-cli

  # Linux — build from source
  # See: https://github.com/evanpurkhiser/keyfinder-cli#building
  ```
- **Rekordbox** — For Rekordbox integration, you need Rekordbox installed. The server reads `~/Library/Pioneer/rekordbox/master.db` by default (macOS). The database is encrypted with SQLCipher4. You'll need `better-sqlite3-multiple-ciphers` instead of `better-sqlite3` for full Rekordbox support — see [Rekordbox Setup](#rekordbox-setup).
- **Engine DJ** — For Engine DJ integration, connect a drive with an Engine Library, or point to a local Engine Library database.

## Installation

```sh
npm install -g bangersss-mcp
```

Or use directly with `npx` — no install needed:

```sh
npx -y bangersss-mcp
```

### From source

```sh
git clone https://github.com/albinekb/bangersss-mcp.git
cd bangersss-mcp
npm install
npm run build
```

## Setup

### Claude Code

Add to your Claude Code MCP settings (`~/.claude/settings.json` or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "bangersss-mcp": {
      "command": "npx",
      "args": ["-y", "bangersss-mcp"]
    }
  }
}
```

Or if installed globally / from source:

```json
{
  "mcpServers": {
    "bangersss-mcp": {
      "command": "bangersss-mcp"
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bangersss-mcp": {
      "command": "npx",
      "args": ["-y", "bangersss-mcp"]
    }
  }
}
```

### VS Code / GitHub Copilot

Add to `.vscode/mcp.json` in your project (requires VS Code 1.99+):

```json
{
  "servers": {
    "bangersss-mcp": {
      "command": "npx",
      "args": ["-y", "bangersss-mcp"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project, or `~/.cursor/mcp.json` for global access:

```json
{
  "mcpServers": {
    "bangersss-mcp": {
      "command": "npx",
      "args": ["-y", "bangersss-mcp"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "bangersss-mcp": {
      "command": "npx",
      "args": ["-y", "bangersss-mcp"]
    }
  }
}
```

## Available Tools

### Ingest / Scanner Mode

The main workflow — point at a downloads folder, ingest into your library.

| Tool | Description |
|---|---|
| `quick_ingest` | One-shot: scan folder, dedupe, stage organized import into library |
| `scan_incoming` | Scan a folder for new audio files, read all their tags |
| `analyze_incoming` | Deep analysis: tags + BPM detection + key identification + issues |
| `check_duplicates` | Check incoming files against library (filename + artist/title matching) |
| `stage_ingest` | Stage files for organized import with a reusable Plan |

### Key & Harmonic Mixing

| Tool | Description |
|---|---|
| `get_key_info` | Get key in all notations (standard, Camelot, Open Key) |
| `convert_key` | Convert between key notations |
| `get_compatible_keys` | Camelot wheel neighbors for harmonic mixing |
| `check_key_compatibility` | Check if two keys mix well |
| `list_all_keys` | Reference table of all 24 keys |

### Scanning & Discovery

| Tool | Description |
|---|---|
| `scan_directory` | Recursively scan a directory for audio files |
| `list_audio_files` | List audio files with optional filtering and sorting |

### Tag Management

| Tool | Description |
|---|---|
| `read_tags` | Read all metadata tags from a file |
| `batch_read_tags` | Read tags from multiple files |
| `write_tags` | Write/update tags (goes to overlay in dry mode) |
| `suggest_tags` | Show current tags and suggest empty fields to fill |

### BPM & Key Analysis

| Tool | Description |
|---|---|
| `analyze_bpm` | Detect BPM of a single audio file |
| `batch_analyze_bpm` | Batch BPM analysis with concurrency control |
| `analyze_key` | Detect musical key of a single audio file (requires [keyfinder-cli](https://github.com/evanpurkhiser/keyfinder-cli)) |
| `batch_analyze_key` | Batch key detection with concurrency control |

### File Operations

| Tool | Description |
|---|---|
| `rename_file` | Rename a file (overlay-aware) |
| `move_file` | Move a file to a new location (overlay-aware) |
| `batch_rename` | Rename files matching a pattern using a template |
| `organize_files` | Organize files into folders by tag metadata |

### Playlists

| Tool | Description |
|---|---|
| `create_playlist` | Create a new M3U/M3U8 playlist |
| `add_to_playlist` | Add tracks to a playlist |
| `remove_from_playlist` | Remove tracks from a playlist |
| `read_playlist` | Parse an existing playlist file |
| `list_playlists` | List all managed playlists |
| `export_playlist` | Export a playlist to disk |

### Plans (Export/Import/Resume)

| Tool | Description |
|---|---|
| `create_plan` | Start a new operation plan |
| `add_to_plan` | Add an operation to a plan |
| `view_plan` | Inspect a plan's operations and status |
| `execute_plan` | Execute all pending operations |
| `export_plan` | Save plan to a `.bangersss-mcp-plan.json` file |
| `import_plan` | Load a plan from file |
| `resume_plan` | Continue a partially-completed plan |
| `list_plans` | List all plans |

### Dry Mode / Overlay

| Tool | Description |
|---|---|
| `get_pending_changes` | List all uncommitted changes (like `git status`) |
| `preview_change` | Preview what a specific change will do |
| `commit_changes` | Apply all pending changes to real filesystem |
| `discard_changes` | Throw away all pending changes |
| `commit_selective` | Commit only specific changes |

### Rekordbox

| Tool | Description |
|---|---|
| `rb_connect` | Open Rekordbox database |
| `rb_search_tracks` | Search by artist, title, genre, BPM, key, rating |
| `rb_list_playlists` | List all playlists and folders |
| `rb_get_playlist_tracks` | Get tracks in a playlist |
| `rb_add_to_playlist` | Add tracks to a playlist |
| `rb_create_playlist` | Create a new playlist |
| `rb_get_cue_points` | Read cue points for a track |
| `rb_library_stats` | Library statistics (genre distribution, BPM histogram) |

### Engine DJ

| Tool | Description |
|---|---|
| `edj_connect` | Open Engine DJ database |
| `edj_search_tracks` | Search tracks |
| `edj_list_crates` | List all crates |
| `edj_get_crate_tracks` | Get tracks in a crate |
| `edj_add_to_crate` | Add tracks to a crate |
| `edj_create_crate` | Create a new crate |
| `edj_library_stats` | Library statistics |

## Ingest Workflow (Scanner Mode)

The main use case: tell Claude to ingest your latest downloads into your organized library.

### Quick ingest (one command)

```
You: "Ingest everything in ~/Downloads/music into my library at ~/Music/DJ Library, organize by genre and artist"

Claude: [calls quick_ingest]
  - Scanned 23 files
  - 2 duplicates skipped (already in library)
  - 21 files staged for import
  - 4 files have missing tags (will use "Unknown Artist" etc.)
  - Plan created: "Ingest 2026-03-17"

You: "Show me what it'll do"

Claude: [calls get_pending_changes]
  - ~/Downloads/music/track1.mp3 → ~/Music/DJ Library/House/DJ Snake/Turn Down for What.mp3
  - ~/Downloads/music/track2.flac → ~/Music/DJ Library/Techno/Charlotte de Witte/Overdrive.flac
  - ... 19 more

You: "Fix the 4 files with missing tags first"

Claude: [calls write_tags for each, then updates the staged moves]

You: "Good, commit it"

Claude: [calls commit_changes]
  - 21 files moved to library
```

### Step-by-step ingest

For more control, use the individual tools:

1. **`scan_incoming`** — Scan downloads folder, see what's there, check tag quality
2. **`analyze_incoming`** — Deep analysis with optional BPM detection, key identification
3. **`check_duplicates`** — Compare against existing library
4. **`stage_ingest`** — Stage the non-duplicate files into your library structure
5. **`get_pending_changes`** — Review what will happen
6. **`commit_changes`** — Apply it

Each step produces structured data so the LLM can make decisions about tagging, organization, and duplicates.

### Organization templates

Templates use tag placeholders:

| Placeholder | Value |
|---|---|
| `{artist}` | Track artist |
| `{title}` | Track title |
| `{album}` | Album name |
| `{genre}` | Genre |
| `{year}` | Release year |
| `{bpm}` | BPM (rounded) |
| `{key}` | Musical key |
| `{camelot}` | Camelot notation (e.g. "8B") |
| `{openkey}` | Open Key notation (e.g. "1d") |

Examples:
- `{genre}/{artist}/{title}` → `House/DJ Snake/Turn Down for What.mp3`
- `{genre}/{artist} - {title} [{bpm}bpm]` → `Techno/Charlotte de Witte - Overdrive [140bpm].flac`
- `{camelot}/{artist} - {title}` → `8B/Artist - Track.mp3` (great for harmonic mixing prep)

## Dry Mode

All file mutations (renames, moves, tag writes) go through an overlay filesystem by default. This means:

1. **Nothing is written to disk** until you call `commit_changes`
2. You can **preview** all pending changes with `get_pending_changes`
3. You can **discard** everything with `discard_changes`
4. You can **selectively commit** specific files with `commit_selective`

Database mutations (Rekordbox, Engine DJ) use a SQL journal — the same commit/discard workflow applies.

### Example workflow

```
You: "Organize my DJ set folder by genre and BPM range"

Claude: [scans directory, reads tags, proposes renames]
  - All changes go to overlay (dry mode)

You: "Show me what would change"

Claude: [calls get_pending_changes]
  - 47 files would be moved
  - Shows before/after paths

You: "Looks good, but skip the Unknown genre files"

Claude: [calls commit_selective with filtered paths]
  - 39 files committed to disk
  - 8 Unknown genre files left unchanged
```

## Plans

Plans are portable, resumable operation sequences. Use them to:

- **Review before executing** — Create a plan, export it, review the JSON
- **Share** — Send a `.bangersss-mcp-plan.json` to another DJ
- **Resume** — If execution is interrupted, import the plan and resume from where it left off
- **Reuse** — Import a plan template and apply it to a different folder

### Plan format

Plans are stored as JSON with a `.bangersss-mcp-plan.json` extension:

```json
{
  "id": "plan_abc123",
  "name": "Organize Summer Set",
  "version": 1,
  "createdAt": "2025-01-15T10:00:00Z",
  "updatedAt": "2025-01-15T10:05:00Z",
  "baseDirectory": "/Users/dj/Music/Summer Set",
  "operations": [
    {
      "type": "rename_file",
      "from": "/Users/dj/Music/track01.mp3",
      "to": "/Users/dj/Music/House/Artist - Track.mp3",
      "status": "pending"
    },
    {
      "type": "write_tags",
      "path": "/Users/dj/Music/House/Artist - Track.mp3",
      "tags": { "genre": "House", "bpm": "128" },
      "status": "pending"
    }
  ],
  "metadata": {
    "totalFiles": 47,
    "completedOps": 0,
    "failedOps": 0
  }
}
```

## Rekordbox Setup

Rekordbox encrypts its database with SQLCipher4. To enable full read/write access:

1. Replace `better-sqlite3` with `better-sqlite3-multiple-ciphers`:
   ```sh
   npm uninstall better-sqlite3
   npm install better-sqlite3-multiple-ciphers
   ```

2. The server auto-detects the Rekordbox database at:
   - **macOS**: `~/Library/Pioneer/rekordbox/master.db`
   - **Windows**: `%APPDATA%/Pioneer/rekordbox/master.db`

3. **Important**: Close Rekordbox before writing to its database. The server will back up the database before any commits.

4. The decryption key and cipher parameters are well-documented. The server handles decryption automatically.

## Engine DJ Setup

Engine DJ databases are not encrypted. The server looks for databases at:

- **External drives**: `/Volumes/*/Engine Library/Database2/m.db` (macOS)
- **Local**: Wherever your Engine Library folder is

Connect your USB drive or SD card, then use `edj_connect` with the database path.

## Development

```sh
# Run in development mode
npm run dev

# Type check
npm run typecheck

# Run tests
npm test

# Build for production
npm run build
```

## Supported Audio Formats

MP3, FLAC, WAV, AIFF, M4A, OGG, WMA, AAC, ALAC

## Architecture

```
src/
├── index.ts              # Entry point (stdio transport)
├── server.ts             # McpServer setup, tool registration
├── overlay/              # Dry-mode overlay filesystem (memfs + unionfs)
├── plans/                # Plan create/export/import/resume
├── audio/                # BPM analysis, key detection, audio decoding
├── tags/                 # ID3 tag read/write
├── playlists/            # M3U/M3U8 management
├── rekordbox/            # Rekordbox database integration
├── engine-dj/            # Engine DJ database integration
├── tools/                # MCP tool definitions (one file per group)
└── util/                 # Audio formats, errors, logging
```

## License

MIT
