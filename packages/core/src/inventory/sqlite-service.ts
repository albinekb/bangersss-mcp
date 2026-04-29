import * as fs from 'node:fs'
import * as path from 'node:path'

import Database from 'better-sqlite3-multiple-ciphers'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'

import { getDefaultInventoryDbPath } from '../config/defaults.js'
import { DatabaseError } from '../util/errors.js'

function createSchemaSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS inventory_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scan_runs (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      scan_type TEXT NOT NULL,
      requested_roots_json TEXT NOT NULL,
      options_json TEXT NOT NULL,
      stats_json TEXT,
      error_text TEXT
    );

    CREATE TABLE IF NOT EXISTS directories (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      parent_path TEXT,
      root_path TEXT NOT NULL,
      depth INTEGER NOT NULL,
      exists_now INTEGER NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_scan_run_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_directories_root_path ON directories(root_path);
    CREATE INDEX IF NOT EXISTS idx_directories_parent_path ON directories(parent_path);
    CREATE INDEX IF NOT EXISTS idx_directories_exists_now ON directories(exists_now);

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      directory_path TEXT NOT NULL,
      root_path TEXT NOT NULL,
      basename TEXT NOT NULL,
      extension TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER NOT NULL,
      created_at_fs TEXT,
      modified_at_fs TEXT,
      accessed_at_fs TEXT,
      inode TEXT,
      device_id TEXT,
      mode_bits INTEGER,
      is_symlink INTEGER NOT NULL DEFAULT 0,
      symlink_target TEXT,
      exists_now INTEGER NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_scan_run_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_files_directory_path ON files(directory_path);
    CREATE INDEX IF NOT EXISTS idx_files_root_path ON files(root_path);
    CREATE INDEX IF NOT EXISTS idx_files_extension ON files(extension);
    CREATE INDEX IF NOT EXISTS idx_files_size_bytes ON files(size_bytes);
    CREATE INDEX IF NOT EXISTS idx_files_exists_now ON files(exists_now);
    CREATE INDEX IF NOT EXISTS idx_files_device_inode ON files(device_id, inode);

    CREATE TABLE IF NOT EXISTS file_hashes (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      hash_type TEXT NOT NULL,
      scope TEXT NOT NULL,
      hash_value TEXT NOT NULL,
      byte_count INTEGER,
      computed_at TEXT NOT NULL,
      algorithm_version TEXT,
      UNIQUE(file_id, hash_type, scope)
    );
    CREATE INDEX IF NOT EXISTS idx_file_hashes_hash_value ON file_hashes(hash_value);
    CREATE INDEX IF NOT EXISTS idx_file_hashes_file_id ON file_hashes(file_id);

    CREATE TABLE IF NOT EXISTS audio_properties (
      file_id TEXT PRIMARY KEY,
      container_format TEXT,
      codec TEXT,
      duration_seconds REAL,
      bitrate INTEGER,
      sample_rate INTEGER,
      bits_per_sample INTEGER,
      channels INTEGER,
      channel_layout TEXT,
      lossless INTEGER,
      vbr INTEGER,
      encoder TEXT,
      metadata_source TEXT NOT NULL,
      extracted_at TEXT NOT NULL,
      raw_format_json TEXT
    );

    CREATE TABLE IF NOT EXISTS audio_tags (
      file_id TEXT PRIMARY KEY,
      title TEXT,
      artist TEXT,
      album TEXT,
      album_artist TEXT,
      track_number INTEGER,
      track_total INTEGER,
      disc_number INTEGER,
      disc_total INTEGER,
      year INTEGER,
      date_text TEXT,
      genre_json TEXT,
      composer_json TEXT,
      comment_json TEXT,
      bpm REAL,
      key_text TEXT,
      label_json TEXT,
      catalog_number_json TEXT,
      isrc_json TEXT,
      lyrics_json TEXT,
      musicbrainz_recording_id TEXT,
      musicbrainz_release_id TEXT,
      raw_tags_json TEXT NOT NULL,
      extracted_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS embedded_artwork (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      picture_index INTEGER NOT NULL,
      mime_type TEXT,
      description TEXT,
      width INTEGER,
      height INTEGER,
      color_depth INTEGER,
      size_bytes INTEGER,
      sha256 TEXT,
      storage_path TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_embedded_artwork_file_id ON embedded_artwork(file_id);
    CREATE INDEX IF NOT EXISTS idx_embedded_artwork_sha256 ON embedded_artwork(sha256);

    CREATE TABLE IF NOT EXISTS archives (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL UNIQUE,
      archive_type TEXT NOT NULL,
      entry_count INTEGER,
      indexed_at TEXT NOT NULL,
      raw_metadata_json TEXT
    );

    CREATE TABLE IF NOT EXISTS archive_entries (
      id TEXT PRIMARY KEY,
      archive_id TEXT NOT NULL,
      entry_path TEXT NOT NULL,
      entry_basename TEXT NOT NULL,
      entry_extension TEXT NOT NULL,
      is_directory INTEGER NOT NULL,
      uncompressed_size_bytes INTEGER,
      compressed_size_bytes INTEGER,
      modified_at_archive TEXT,
      crc32 TEXT,
      is_audio_candidate INTEGER NOT NULL,
      audio_metadata_json TEXT,
      tag_metadata_json TEXT,
      entry_hash_sha256 TEXT,
      UNIQUE(archive_id, entry_path)
    );
    CREATE INDEX IF NOT EXISTS idx_archive_entries_archive_id ON archive_entries(archive_id);
    CREATE INDEX IF NOT EXISTS idx_archive_entries_entry_extension ON archive_entries(entry_extension);
    CREATE INDEX IF NOT EXISTS idx_archive_entries_is_audio_candidate ON archive_entries(is_audio_candidate);
    CREATE INDEX IF NOT EXISTS idx_archive_entries_entry_hash_sha256 ON archive_entries(entry_hash_sha256);

    CREATE TABLE IF NOT EXISTS file_observations (
      id TEXT PRIMARY KEY,
      scan_run_id TEXT NOT NULL,
      file_id TEXT NOT NULL,
      observed_path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      modified_at_fs TEXT,
      exists_now INTEGER NOT NULL,
      hash_state TEXT NOT NULL,
      metadata_state TEXT NOT NULL,
      observed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_file_observations_scan_run_id ON file_observations(scan_run_id);
    CREATE INDEX IF NOT EXISTS idx_file_observations_file_id ON file_observations(file_id);

    CREATE TABLE IF NOT EXISTS move_plans (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      name TEXT,
      rules_json TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS move_plan_items (
      id TEXT PRIMARY KEY,
      move_plan_id TEXT NOT NULL,
      file_id TEXT NOT NULL,
      source_path TEXT NOT NULL,
      proposed_destination_path TEXT NOT NULL,
      status TEXT NOT NULL,
      pre_move_sha256 TEXT,
      post_move_sha256 TEXT,
      moved_at TEXT,
      verified_at TEXT,
      error_text TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_move_plan_items_move_plan_id ON move_plan_items(move_plan_id);
    CREATE INDEX IF NOT EXISTS idx_move_plan_items_file_id ON move_plan_items(file_id);
    CREATE INDEX IF NOT EXISTS idx_move_plan_items_status ON move_plan_items(status);

    CREATE TABLE IF NOT EXISTS change_events (
      id TEXT PRIMARY KEY,
      event_time TEXT NOT NULL,
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      description TEXT NOT NULL,
      details_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_change_events_event_time ON change_events(event_time DESC);
    CREATE INDEX IF NOT EXISTS idx_change_events_event_type ON change_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_change_events_entity ON change_events(entity_type, entity_id);
  `
}

export class SQLiteService {
  private dbPath: string
  private db: DatabaseType | null = null

  constructor(dbPath = getDefaultInventoryDbPath()) {
    this.dbPath = dbPath
  }

  getDatabasePath(): string {
    return this.dbPath
  }

  setDatabasePath(dbPath: string): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
    this.dbPath = dbPath
  }

  isInitialized(): boolean {
    return fs.existsSync(this.dbPath)
  }

  getDb(): DatabaseType {
    if (!this.db) {
      this.ensureDirectory()
      this.db = new Database(this.dbPath)
      this.db.pragma('journal_mode = WAL')
      this.db.pragma('foreign_keys = ON')
      this.db.pragma('synchronous = NORMAL')
    }
    return this.db
  }

  initialize(dbPath?: string): { dbPath: string; schemaVersion: number } {
    if (dbPath) {
      this.setDatabasePath(dbPath)
    }

    const db = this.getDb()
    const schemaSql = createSchemaSql()
    db.exec(schemaSql)

    const schemaVersion = 1
    db.prepare(
      `
        INSERT INTO inventory_settings (key, value)
        VALUES ('schema_version', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
    ).run(String(schemaVersion))

    db.prepare(
      `
        INSERT INTO inventory_settings (key, value)
        VALUES ('db_path', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
    ).run(this.dbPath)

    return { dbPath: this.dbPath, schemaVersion }
  }

  getSchemaVersion(): number {
    const db = this.getDb()
    const row = db
      .prepare(
        `SELECT value FROM inventory_settings WHERE key = 'schema_version'`,
      )
      .get() as { value?: string } | undefined
    return row?.value ? Number(row.value) : 0
  }

  compact(): void {
    const db = this.getDb()
    try {
      db.exec('VACUUM; ANALYZE;')
    } catch (error) {
      throw new DatabaseError(
        `Failed to compact inventory database: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  close(): void {
    this.db?.close()
    this.db = null
  }

  private ensureDirectory(): void {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true })
  }
}
