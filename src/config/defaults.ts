import { homedir } from 'node:os'
import { join } from 'node:path'

import { SUPPORTED_FORMATS } from '../util/audio-formats.js'

export const DEFAULT_INVENTORY_DB_PATH = join(
  homedir(),
  '.bangersss-mcp',
  'music-inventory.sqlite',
)

export const DEFAULT_ARTWORK_CACHE_PATH = join(
  homedir(),
  '.bangersss-mcp',
  'artwork',
)

export const SUPPORTED_AUDIO_EXTENSIONS = [...SUPPORTED_FORMATS]

export const SUPPORTED_ARCHIVE_EXTENSIONS = ['.zip'] as const

export const DEFAULT_SCAN_BATCH_SIZE = 100
export const DEFAULT_HASH_CONCURRENCY = 4
export const DEFAULT_METADATA_CONCURRENCY = 4
export const DEFAULT_ARCHIVE_ENTRY_READ_LIMIT = 32

export function getDefaultInventoryDbPath(): string {
  return DEFAULT_INVENTORY_DB_PATH
}

export function getDefaultArtworkCachePath(): string {
  return DEFAULT_ARTWORK_CACHE_PATH
}
