/**
 * Rekordbox database access using rekordbox-connect.
 *
 * Handles automatic detection of the Rekordbox DB path, password extraction
 * from options.json, Blowfish decryption, and SQLCipher4 opening.
 */

import {
  getRekordboxConfig,
  detectRekordboxDbPath,
  type Playlist,
  type PlaylistTrack,
  type RekordboxTracksPayload,
} from 'rekordbox-connect'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createLogger } from '../util/logger.js'

const log = createLogger('rekordbox')

/**
 * Interface matching the RekordboxDb class from rekordbox-connect.
 */
export interface IRekordboxDb {
  open(): void
  close(): void
  loadTracks(maxRows?: number): RekordboxTracksPayload | undefined
  loadPlaylists(): Playlist[] | undefined
  loadPlaylistTracks(playlistId: string): PlaylistTrack[] | undefined
  createPlaylist(name: string, parentId?: string): Playlist | undefined
  addTrackToPlaylist(playlistId: string, contentId: string): unknown
}

export type { Playlist, PlaylistTrack } from 'rekordbox-connect'

// Lazily resolved RekordboxDb constructor
let _RekordboxDbClass:
  | (new (dbPath: string, password: string, readonly?: boolean) => IRekordboxDb)
  | null = null

const require = createRequire(import.meta.url)

async function getRekordboxDbClass() {
  if (_RekordboxDbClass) return _RekordboxDbClass
  // Resolve the main entry then navigate to db.js in the same directory,
  // bypassing the exports map which doesn't expose this subpath.
  const mainPath = require.resolve('rekordbox-connect')
  const mod = require(join(dirname(mainPath), 'db.js'))
  _RekordboxDbClass = mod.RekordboxDb
  return _RekordboxDbClass!
}

/**
 * Default Rekordbox database path on macOS.
 */
export const DEFAULT_REKORDBOX_DB_PATH = join(
  homedir(),
  'Library',
  'Pioneer',
  'rekordbox',
  'master.db',
)

/**
 * Attempt to auto-detect the Rekordbox master.db on the current system.
 */
export function findRekordboxDb(): string | null {
  const detected = detectRekordboxDbPath()
  if (detected) return detected
  if (existsSync(DEFAULT_REKORDBOX_DB_PATH)) return DEFAULT_REKORDBOX_DB_PATH
  return null
}

/**
 * Open the Rekordbox database with automatic decryption.
 */
export async function openRekordboxDb(
  dbPath?: string,
  dbPassword?: string,
  readonly = true,
): Promise<IRekordboxDb> {
  let resolvedPath: string
  let resolvedPassword: string

  try {
    const config = getRekordboxConfig(dbPath, dbPassword)
    resolvedPath = config.dbPath
    resolvedPassword = config.password
  } catch (err) {
    resolvedPath = dbPath ?? DEFAULT_REKORDBOX_DB_PATH
    if (!existsSync(resolvedPath)) {
      throw new Error(
        `Rekordbox database not found. Tried auto-detection and path: ${resolvedPath}. ` +
          `Make sure Rekordbox is installed and has been opened at least once.`,
      )
    }
    if (!dbPassword) {
      throw new Error(
        'Could not auto-detect Rekordbox database password from options.json. ' +
          `Original error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    resolvedPassword = dbPassword
  }

  log.info(`Opening Rekordbox DB: ${resolvedPath} (readonly: ${readonly})`)
  const DbClass = await getRekordboxDbClass()
  const db = new DbClass(resolvedPath, resolvedPassword, readonly)
  db.open()
  return db
}

/**
 * Close a Rekordbox database connection.
 */
export function closeRekordboxDb(db: IRekordboxDb): void {
  db.close()
}
