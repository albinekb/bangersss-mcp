import * as path from 'node:path'
import * as os from 'node:os'
import * as fs from 'node:fs'
import Database from 'better-sqlite3-multiple-ciphers'

export interface CacheEntry {
  path: string
  mtimeMs: number
  size: number
  tagsJson: string | null
  bpm: number | null
  bpmConfidence: number | null
  keyStandard: string | null
  keyCamelot: string | null
  keyOpenkey: string | null
  contentHash: string | null
  prefixHash: string | null
  scannedAt: string
}

export interface CacheStats {
  entries: number
  sizeBytes: number
  dbPath: string
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS file_cache (
  path         TEXT PRIMARY KEY,
  mtime_ms     REAL NOT NULL,
  size         INTEGER NOT NULL,
  tags_json    TEXT,
  bpm          REAL,
  bpm_confidence REAL,
  key_standard TEXT,
  key_camelot  TEXT,
  key_openkey  TEXT,
  content_hash TEXT,
  prefix_hash  TEXT,
  scanned_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_file_cache_size ON file_cache(size);
CREATE INDEX IF NOT EXISTS idx_file_cache_content_hash ON file_cache(content_hash);
CREATE INDEX IF NOT EXISTS idx_file_cache_prefix_hash ON file_cache(prefix_hash);
`

function getDefaultCachePath(): string {
  const cacheDir = process.env.XDG_CACHE_HOME
    ?? (process.platform === 'win32'
      ? path.join(os.homedir(), 'AppData', 'Local', 'bangersss')
      : path.join(os.homedir(), '.cache', 'bangersss'))
  return path.join(cacheDir, 'cache.db')
}

/**
 * Persistent analysis cache backed by SQLite.
 * Stores BPM, key, tags, and content hashes keyed by file path.
 * Entries are invalidated when file mtime or size changes (fclones-inspired).
 */
export class CacheStore {
  private db: InstanceType<typeof Database>
  private dbPath: string

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- better-sqlite3 Statement types are complex
  private stmtGet!: any
  private stmtUpsert!: any
  private stmtDelete!: any
  private stmtClear!: any
  private stmtCount!: any

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? getDefaultCachePath()

    // Ensure directory exists
    const dir = path.dirname(this.dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.exec(SCHEMA_SQL)
    this.prepareStatements()
  }

  private prepareStatements(): void {
    this.stmtGet = this.db.prepare(
      'SELECT * FROM file_cache WHERE path = ? AND mtime_ms = ? AND size = ?',
    )

    this.stmtUpsert = this.db.prepare(`
      INSERT OR REPLACE INTO file_cache
        (path, mtime_ms, size, tags_json, bpm, bpm_confidence,
         key_standard, key_camelot, key_openkey,
         content_hash, prefix_hash, scanned_at)
      VALUES
        (@path, @mtimeMs, @size, @tagsJson, @bpm, @bpmConfidence,
         @keyStandard, @keyCamelot, @keyOpenkey,
         @contentHash, @prefixHash, @scannedAt)
    `)

    this.stmtDelete = this.db.prepare('DELETE FROM file_cache WHERE path = ?')
    this.stmtClear = this.db.prepare('DELETE FROM file_cache')
    this.stmtCount = this.db.prepare('SELECT COUNT(*) as count FROM file_cache')
  }

  /**
   * Get a cached entry if it exists and the file hasn't changed.
   * Returns null if not cached or if (mtime, size) don't match.
   */
  get(filePath: string, stat: { mtimeMs: number; size: number }): CacheEntry | null {
    const row = this.stmtGet.get(filePath, stat.mtimeMs, stat.size) as Record<string, unknown> | undefined
    if (!row) return null

    return {
      path: row.path as string,
      mtimeMs: row.mtime_ms as number,
      size: row.size as number,
      tagsJson: row.tags_json as string | null,
      bpm: row.bpm as number | null,
      bpmConfidence: row.bpm_confidence as number | null,
      keyStandard: row.key_standard as string | null,
      keyCamelot: row.key_camelot as string | null,
      keyOpenkey: row.key_openkey as string | null,
      contentHash: row.content_hash as string | null,
      prefixHash: row.prefix_hash as string | null,
      scannedAt: row.scanned_at as string,
    }
  }

  /**
   * Store or update a cache entry.
   */
  set(filePath: string, stat: { mtimeMs: number; size: number }, data: Partial<CacheEntry>): void {
    this.stmtUpsert.run({
      path: filePath,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      tagsJson: data.tagsJson ?? null,
      bpm: data.bpm ?? null,
      bpmConfidence: data.bpmConfidence ?? null,
      keyStandard: data.keyStandard ?? null,
      keyCamelot: data.keyCamelot ?? null,
      keyOpenkey: data.keyOpenkey ?? null,
      contentHash: data.contentHash ?? null,
      prefixHash: data.prefixHash ?? null,
      scannedAt: data.scannedAt ?? new Date().toISOString(),
    })
  }

  /**
   * Remove a specific entry from the cache.
   */
  delete(filePath: string): void {
    this.stmtDelete.run(filePath)
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.stmtClear.run()
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const row = this.stmtCount.get() as { count: number }
    let sizeBytes = 0
    try {
      const stat = fs.statSync(this.dbPath)
      sizeBytes = stat.size
    } catch {
      // File might not exist yet
    }

    return {
      entries: row.count,
      sizeBytes,
      dbPath: this.dbPath,
    }
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close()
  }
}
