import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { nanoid } from 'nanoid'

import {
  SUPPORTED_ARCHIVE_EXTENSIONS,
  SUPPORTED_AUDIO_EXTENSIONS,
} from '../config/defaults.js'
import type {
  ArchiveEntryRecord,
  AudioProperties,
  AudioTags,
  DuplicateGroup,
  FileHash,
  InventoryDirectory,
  InventoryFile,
  InventoryQuery,
  MovePlan,
  MovePlanItem,
  ScanMode,
  ScanRun,
} from '../types/index.js'
import { DatabaseError } from '../util/errors.js'
import { walk } from '../util/walker/walker.js'
import { ArchiveIndexService } from './archive-index-service.js'
import { AudioMetadataService } from './audio-metadata-service.js'
import { HashService } from './hash-service.js'
import { SQLiteService } from './sqlite-service.js'

interface ScanInventoryOptions {
  roots: string[]
  mode?: ScanMode
  includeArchives?: boolean
  computeFullHashes?: boolean
  extractArtwork?: boolean
  followSymlinks?: boolean
  extensions?: string[]
  excludePatterns?: string[]
}

interface InventoryFileRow {
  id: string
  path: string
  directory_path: string
  root_path: string
  basename: string
  extension: string
  mime_type: string | null
  size_bytes: number
  created_at_fs: string | null
  modified_at_fs: string | null
  accessed_at_fs: string | null
  inode: string | null
  device_id: string | null
  mode_bits: number | null
  is_symlink: number
  symlink_target: string | null
  exists_now: number
  first_seen_at: string
  last_seen_at: string
  last_scan_run_id: string | null
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function normalizePath(input: string): string {
  return path.resolve(input)
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

function globToRegExp(pattern: string): RegExp {
  const doubleStar = '__DOUBLE_STAR__'
  const singleStar = '__SINGLE_STAR__'
  let source = pattern
    .replace(/\\/g, '/')
    .replace(/\*\*/g, doubleStar)
    .replace(/\*/g, singleStar)
  source = escapeRegExp(source)
  source = source.replace(new RegExp(doubleStar, 'g'), '.*')
  source = source.replace(new RegExp(singleStar, 'g'), '[^/]*')
  return new RegExp(`^${source}$`, 'i')
}

function matchAnyPattern(value: string, patterns: string[]): boolean {
  const normalized = value.replace(/\\/g, '/')
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized))
}

function inferMimeType(filePath: string): string | null {
  switch (path.extname(filePath).toLowerCase()) {
    case '.mp3':
      return 'audio/mpeg'
    case '.flac':
      return 'audio/flac'
    case '.wav':
      return 'audio/wav'
    case '.aiff':
    case '.aif':
      return 'audio/aiff'
    case '.m4a':
    case '.alac':
      return 'audio/mp4'
    case '.ogg':
      return 'audio/ogg'
    case '.wma':
      return 'audio/x-ms-wma'
    case '.zip':
      return 'application/zip'
    default:
      return null
  }
}

export class InventoryService {
  constructor(
    private readonly sqlite: SQLiteService,
    private readonly hashService: HashService,
    private readonly audioMetadata: AudioMetadataService,
    private readonly archiveIndex: ArchiveIndexService,
  ) {}

  initInventoryDb(dbPath?: string): { dbPath: string; schemaVersion: number } {
    return this.sqlite.initialize(dbPath)
  }

  close(): void {
    this.sqlite.close()
  }

  getInventoryStatus(): Record<string, unknown> {
    this.requireInitialized()
    const db = this.sqlite.getDb()

    const filesCount = Number(
      (db.prepare('SELECT COUNT(*) AS count FROM files').get() as { count: number })
        .count,
    )
    const directoriesCount = Number(
      (
        db.prepare('SELECT COUNT(*) AS count FROM directories').get() as {
          count: number
        }
      ).count,
    )
    const archivesCount = Number(
      (
        db.prepare('SELECT COUNT(*) AS count FROM archives').get() as {
          count: number
        }
      ).count,
    )
    const latestScan = db
      .prepare(
        `
          SELECT *
          FROM scan_runs
          ORDER BY started_at DESC
          LIMIT 1
        `,
      )
      .get() as
      | {
          id: string
          status: string
          scan_type: string
          started_at: string
          finished_at: string | null
          stats_json: string | null
        }
      | undefined

    return {
      dbPath: this.sqlite.getDatabasePath(),
      schemaVersion: this.sqlite.getSchemaVersion(),
      counts: {
        files: filesCount,
        directories: directoriesCount,
        archives: archivesCount,
      },
      latestScan: latestScan
        ? {
            id: latestScan.id,
            status: latestScan.status,
            scanType: latestScan.scan_type,
            startedAt: latestScan.started_at,
            finishedAt: latestScan.finished_at,
            stats: parseJson<Record<string, unknown> | null>(
              latestScan.stats_json,
              null,
            ),
          }
        : null,
    }
  }

  compactInventoryDb(): Record<string, unknown> {
    this.requireInitialized()
    this.sqlite.compact()
    return {
      compacted: true,
      dbPath: this.sqlite.getDatabasePath(),
    }
  }

  async scanInventory(
    options: ScanInventoryOptions,
  ): Promise<{ scanRunId: string; stats: Record<string, unknown> }> {
    this.requireInitialized()
    const db = this.sqlite.getDb()
    const roots = options.roots.map(normalizePath)
    const now = new Date().toISOString()
    const scanRunId = nanoid()
    const scanType = options.mode ?? 'full'

    db.prepare(
      `
        INSERT INTO scan_runs (
          id, started_at, status, scan_type, requested_roots_json, options_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(
      scanRunId,
      now,
      'running',
      scanType,
      JSON.stringify(roots),
      JSON.stringify(options),
    )

    this.recordChangeEvent('scan_started', 'scan', scanRunId, 'Inventory scan started', {
      roots,
      mode: scanType,
    })

    const stats = {
      rootsScanned: roots.length,
      directoriesSeen: 0,
      filesSeen: 0,
      audioFilesIndexed: 0,
      archivesIndexed: 0,
      fileHashesComputed: 0,
      metadataExtracted: 0,
      errors: 0,
    }

    const seenDirectories = new Set<string>()
    const seenFiles = new Set<string>()
    const supportedExtensions = new Set(
      (options.extensions ?? SUPPORTED_AUDIO_EXTENSIONS).map((extension) =>
        extension.toLowerCase(),
      ),
    )
    const excludePatterns = options.excludePatterns ?? []

    try {
      for (const rootPath of roots) {
        for await (const folder of walk(rootPath, { recursive: true })) {
          const relativeDir = path.relative(rootPath, folder.dir)
          if (relativeDir && matchAnyPattern(relativeDir, excludePatterns)) {
            continue
          }

          seenDirectories.add(folder.dir)
          stats.directoriesSeen++
          this.upsertDirectory({
            directoryPath: folder.dir,
            rootPath,
            scanRunId,
            observedAt: new Date().toISOString(),
          })

          for (const file of folder.files) {
            const filePath = path.resolve(folder.dir, file.name)
            const relativePath = path.relative(rootPath, filePath)
            if (matchAnyPattern(relativePath, excludePatterns)) {
              continue
            }

            let fileStat
            try {
              fileStat = options.followSymlinks
                ? await fs.stat(filePath)
                : await fs.lstat(filePath)
            } catch (error) {
              stats.errors++
              this.recordChangeEvent(
                'scan_error',
                'file',
                null,
                `Failed to stat file: ${filePath}`,
                { error: error instanceof Error ? error.message : String(error) },
              )
              continue
            }

            const extension = path.extname(filePath).toLowerCase()
            const isAudio = supportedExtensions.has(extension)
            const isArchive = SUPPORTED_ARCHIVE_EXTENSIONS.includes(extension as '.zip')

            if (!isAudio && !isArchive) {
              continue
            }

            const existing = this.getFileRowByPath(filePath)
            const isUnchanged =
              !!existing &&
              existing.size_bytes === fileStat.size &&
              existing.modified_at_fs === fileStat.mtime.toISOString()

            const fileId = this.upsertFile({
              existingId: existing?.id,
              filePath,
              rootPath,
              scanRunId,
              observedAt: new Date().toISOString(),
              stat: fileStat,
            })

            seenFiles.add(filePath)
            stats.filesSeen++

            let hashState = 'missing'
            let metadataState = 'missing'

            if (scanType !== 'metadata-only' && (options.computeFullHashes ?? true)) {
              if (!(scanType === 'incremental' && isUnchanged)) {
                const { hash, byteCount } = await this.hashService.computeSha256(filePath)
                this.upsertFileHash(fileId, {
                  hashType: 'sha256',
                  scope: 'full',
                  hashValue: hash,
                  byteCount,
                })
                stats.fileHashesComputed++
              }
              hashState = 'full'
            }

            if (isAudio && scanType !== 'hash-only' && scanType !== 'archive-only') {
              if (!(scanType === 'incremental' && isUnchanged)) {
                try {
                  const { properties, tags } =
                    await this.audioMetadata.readFileMetadata(filePath)
                  this.upsertAudioProperties(fileId, properties)
                  this.upsertAudioTags(fileId, tags)
                  stats.metadataExtracted++
                } catch (error) {
                  stats.errors++
                  this.recordChangeEvent(
                    'metadata_error',
                    'file',
                    fileId,
                    `Failed to extract metadata: ${filePath}`,
                    { error: error instanceof Error ? error.message : String(error) },
                  )
                }
              }

              metadataState = 'complete'
              stats.audioFilesIndexed++
            }

            if (isArchive && options.includeArchives !== false) {
              try {
                const archiveId = this.upsertArchive(fileId)
                const indexed = await this.archiveIndex.indexZipArchive(filePath)
                this.replaceArchiveEntries(archiveId, indexed.entries)
                db.prepare(
                  `
                    UPDATE archives
                    SET entry_count = ?, indexed_at = ?, raw_metadata_json = ?
                    WHERE id = ?
                  `,
                ).run(
                  indexed.entryCount,
                  new Date().toISOString(),
                  JSON.stringify({ path: filePath, entryCount: indexed.entryCount }),
                  archiveId,
                )
                stats.archivesIndexed++
              } catch (error) {
                stats.errors++
                this.recordChangeEvent(
                  'archive_error',
                  'archive',
                  fileId,
                  `Failed to index archive: ${filePath}`,
                  { error: error instanceof Error ? error.message : String(error) },
                )
              }
            }

            this.insertFileObservation({
              scanRunId,
              fileId,
              observedPath: filePath,
              sizeBytes: fileStat.size,
              modifiedAtFs: fileStat.mtime.toISOString(),
              existsNow: true,
              hashState,
              metadataState,
            })
          }
        }

        if (scanType === 'full') {
          this.markMissingPaths(rootPath, seenDirectories, seenFiles, scanRunId)
        }
      }

      const finishedAt = new Date().toISOString()
      db.prepare(
        `
          UPDATE scan_runs
          SET finished_at = ?, status = 'completed', stats_json = ?
          WHERE id = ?
        `,
      ).run(finishedAt, JSON.stringify(stats), scanRunId)

      this.recordChangeEvent(
        'scan_completed',
        'scan',
        scanRunId,
        'Inventory scan completed',
        stats,
      )

      return { scanRunId, stats }
    } catch (error) {
      const finishedAt = new Date().toISOString()
      const message = error instanceof Error ? error.message : String(error)
      db.prepare(
        `
          UPDATE scan_runs
          SET finished_at = ?, status = 'failed', stats_json = ?, error_text = ?
          WHERE id = ?
        `,
      ).run(finishedAt, JSON.stringify(stats), message, scanRunId)

      this.recordChangeEvent(
        'scan_failed',
        'scan',
        scanRunId,
        'Inventory scan failed',
        { error: message, stats },
      )
      throw error
    }
  }

  getScanRun(scanRunId: string): ScanRun | null {
    this.requireInitialized()
    const row = this.sqlite
      .getDb()
      .prepare('SELECT * FROM scan_runs WHERE id = ?')
      .get(scanRunId) as
      | {
          id: string
          started_at: string
          finished_at: string | null
          status: ScanRun['status']
          scan_type: ScanMode
          requested_roots_json: string
          options_json: string
          stats_json: string | null
          error_text: string | null
        }
      | undefined

    if (!row) {
      return null
    }

    return {
      id: row.id,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      status: row.status,
      scanType: row.scan_type,
      requestedRoots: parseJson<string[]>(row.requested_roots_json, []),
      options: parseJson<Record<string, unknown>>(row.options_json, {}),
      stats: parseJson<Record<string, unknown> | null>(row.stats_json, null),
      errorText: row.error_text,
    }
  }

  listScanRuns(): ScanRun[] {
    this.requireInitialized()
    const rows = this.sqlite
      .getDb()
      .prepare('SELECT * FROM scan_runs ORDER BY started_at DESC')
      .all() as Array<{
      id: string
      started_at: string
      finished_at: string | null
      status: ScanRun['status']
      scan_type: ScanMode
      requested_roots_json: string
      options_json: string
      stats_json: string | null
      error_text: string | null
    }>

    return rows.map((row) => ({
      id: row.id,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      status: row.status,
      scanType: row.scan_type,
      requestedRoots: parseJson<string[]>(row.requested_roots_json, []),
      options: parseJson<Record<string, unknown>>(row.options_json, {}),
      stats: parseJson<Record<string, unknown> | null>(row.stats_json, null),
      errorText: row.error_text,
    }))
  }

  queryInventoryFiles(query: InventoryQuery = {}): InventoryFile[] {
    this.requireInitialized()
    const db = this.sqlite.getDb()
    const conditions: string[] = []
    const params: unknown[] = []

    if (query.rootPath) {
      conditions.push('f.root_path = ?')
      params.push(normalizePath(query.rootPath))
    }
    if (query.path) {
      conditions.push('f.path LIKE ?')
      params.push(`%${query.path}%`)
    }
    if (query.extension) {
      conditions.push('f.extension = ?')
      params.push(query.extension.toLowerCase())
    }
    if (query.artist) {
      conditions.push('LOWER(t.artist) LIKE ?')
      params.push(`%${query.artist.toLowerCase()}%`)
    }
    if (query.title) {
      conditions.push('LOWER(t.title) LIKE ?')
      params.push(`%${query.title.toLowerCase()}%`)
    }
    if (query.album) {
      conditions.push('LOWER(t.album) LIKE ?')
      params.push(`%${query.album.toLowerCase()}%`)
    }
    if (query.genre) {
      conditions.push('LOWER(COALESCE(t.genre_json, "")) LIKE ?')
      params.push(`%${query.genre.toLowerCase()}%`)
    }
    if (query.missingFilesOnly) {
      conditions.push('f.exists_now = 0')
    }
    if (query.hasHash) {
      conditions.push(
        "EXISTS (SELECT 1 FROM file_hashes fh WHERE fh.file_id = f.id AND fh.hash_type = 'sha256' AND fh.scope = 'full')",
      )
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = db
      .prepare(
        `
          SELECT DISTINCT f.*
          FROM files f
          LEFT JOIN audio_tags t ON t.file_id = f.id
          ${whereClause}
          ORDER BY f.path
        `,
      )
      .all(...params) as InventoryFileRow[]

    let files = rows.map((row) => this.getInventoryFile(row.id)).filter(Boolean) as InventoryFile[]
    if (query.duplicatesOnly) {
      const duplicateIds = new Set(
        this.findDuplicateCandidates().flatMap((group) => group.fileIds),
      )
      files = files.filter((file) => duplicateIds.has(file.id))
    }
    return files
  }

  getInventoryFile(fileId: string): InventoryFile | null {
    this.requireInitialized()
    const db = this.sqlite.getDb()
    const row = db
      .prepare('SELECT * FROM files WHERE id = ?')
      .get(fileId) as InventoryFileRow | undefined

    if (!row) {
      return null
    }

    const hashes = db
      .prepare('SELECT * FROM file_hashes WHERE file_id = ? ORDER BY computed_at DESC')
      .all(fileId) as Array<{
      id: string
      file_id: string
      hash_type: FileHash['hashType']
      scope: FileHash['scope']
      hash_value: string
      byte_count: number | null
      computed_at: string
      algorithm_version: string | null
    }>

    const properties = db
      .prepare('SELECT * FROM audio_properties WHERE file_id = ?')
      .get(fileId) as
      | {
          file_id: string
          container_format: string | null
          codec: string | null
          duration_seconds: number | null
          bitrate: number | null
          sample_rate: number | null
          bits_per_sample: number | null
          channels: number | null
          channel_layout: string | null
          lossless: number | null
          vbr: number | null
          encoder: string | null
          metadata_source: AudioProperties['metadataSource']
          extracted_at: string
          raw_format_json: string | null
        }
      | undefined

    const tags = db
      .prepare('SELECT * FROM audio_tags WHERE file_id = ?')
      .get(fileId) as
      | {
          file_id: string
          title: string | null
          artist: string | null
          album: string | null
          album_artist: string | null
          track_number: number | null
          track_total: number | null
          disc_number: number | null
          disc_total: number | null
          year: number | null
          date_text: string | null
          genre_json: string | null
          composer_json: string | null
          comment_json: string | null
          bpm: number | null
          key_text: string | null
          label_json: string | null
          catalog_number_json: string | null
          isrc_json: string | null
          lyrics_json: string | null
          musicbrainz_recording_id: string | null
          musicbrainz_release_id: string | null
          raw_tags_json: string
          extracted_at: string
        }
      | undefined

    const observations = db
      .prepare(
        `
          SELECT *
          FROM file_observations
          WHERE file_id = ?
          ORDER BY observed_at DESC
        `,
      )
      .all(fileId) as Array<Record<string, unknown>>

    return {
      id: row.id,
      path: row.path,
      directoryPath: row.directory_path,
      rootPath: row.root_path,
      basename: row.basename,
      extension: row.extension,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      createdAtFs: row.created_at_fs,
      modifiedAtFs: row.modified_at_fs,
      accessedAtFs: row.accessed_at_fs,
      inode: row.inode,
      deviceId: row.device_id,
      modeBits: row.mode_bits,
      isSymlink: row.is_symlink === 1,
      symlinkTarget: row.symlink_target,
      existsNow: row.exists_now === 1,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      lastScanRunId: row.last_scan_run_id,
      hashes: hashes.map((hash) => ({
        id: hash.id,
        fileId: hash.file_id,
        hashType: hash.hash_type,
        scope: hash.scope,
        hashValue: hash.hash_value,
        byteCount: hash.byte_count,
        computedAt: hash.computed_at,
        algorithmVersion: hash.algorithm_version,
      })),
      audioProperties: properties
        ? {
            fileId: properties.file_id,
            containerFormat: properties.container_format,
            codec: properties.codec,
            durationSeconds: properties.duration_seconds,
            bitrate: properties.bitrate,
            sampleRate: properties.sample_rate,
            bitsPerSample: properties.bits_per_sample,
            channels: properties.channels,
            channelLayout: properties.channel_layout,
            lossless:
              properties.lossless === null ? null : properties.lossless === 1,
            vbr: properties.vbr === null ? null : properties.vbr === 1,
            encoder: properties.encoder,
            metadataSource: properties.metadata_source,
            extractedAt: properties.extracted_at,
            rawFormat: parseJson<Record<string, unknown> | null>(
              properties.raw_format_json,
              null,
            ),
          }
        : null,
      audioTags: tags
        ? {
            fileId: tags.file_id,
            title: tags.title,
            artist: tags.artist,
            album: tags.album,
            albumArtist: tags.album_artist,
            trackNumber: tags.track_number,
            trackTotal: tags.track_total,
            discNumber: tags.disc_number,
            discTotal: tags.disc_total,
            year: tags.year,
            dateText: tags.date_text,
            genre: parseJson<string[]>(tags.genre_json, []),
            composer: parseJson<string[]>(tags.composer_json, []),
            comment: parseJson<string[]>(tags.comment_json, []),
            bpm: tags.bpm,
            keyText: tags.key_text,
            label: parseJson<string[]>(tags.label_json, []),
            catalogNumber: parseJson<string[]>(tags.catalog_number_json, []),
            isrc: parseJson<string[]>(tags.isrc_json, []),
            lyrics: parseJson<string[]>(tags.lyrics_json, []),
            musicbrainzRecordingId: tags.musicbrainz_recording_id,
            musicbrainzReleaseId: tags.musicbrainz_release_id,
            rawTags: parseJson<Record<string, unknown>>(tags.raw_tags_json, {}),
            extractedAt: tags.extracted_at,
          }
        : null,
      observations,
    }
  }

  queryInventoryDirectories(filters: {
    rootPath?: string
    parentPath?: string
    existsNow?: boolean
  } = {}): InventoryDirectory[] {
    this.requireInitialized()
    const db = this.sqlite.getDb()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters.rootPath) {
      conditions.push('root_path = ?')
      params.push(normalizePath(filters.rootPath))
    }
    if (filters.parentPath) {
      conditions.push('parent_path = ?')
      params.push(normalizePath(filters.parentPath))
    }
    if (typeof filters.existsNow === 'boolean') {
      conditions.push('exists_now = ?')
      params.push(filters.existsNow ? 1 : 0)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = db
      .prepare(`SELECT * FROM directories ${whereClause} ORDER BY path`)
      .all(...params) as Array<{
      id: string
      path: string
      parent_path: string | null
      root_path: string
      depth: number
      exists_now: number
      first_seen_at: string
      last_seen_at: string
      last_scan_run_id: string | null
    }>

    return rows.map((row) => ({
      id: row.id,
      path: row.path,
      parentPath: row.parent_path,
      rootPath: row.root_path,
      depth: row.depth,
      existsNow: row.exists_now === 1,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      lastScanRunId: row.last_scan_run_id,
    }))
  }

  queryInventoryArchives(filters: { rootPath?: string } = {}): Array<Record<string, unknown>> {
    this.requireInitialized()
    const db = this.sqlite.getDb()
    const rows = db
      .prepare(
        `
          SELECT a.*, f.path, f.root_path
          FROM archives a
          JOIN files f ON f.id = a.file_id
          ${filters.rootPath ? 'WHERE f.root_path = ?' : ''}
          ORDER BY f.path
        `,
      )
      .all(...(filters.rootPath ? [normalizePath(filters.rootPath)] : [])) as Array<{
      id: string
      file_id: string
      archive_type: string
      entry_count: number | null
      indexed_at: string
      raw_metadata_json: string | null
      path: string
      root_path: string
    }>

    return rows.map((row) => ({
      id: row.id,
      fileId: row.file_id,
      archiveType: row.archive_type,
      entryCount: row.entry_count,
      indexedAt: row.indexed_at,
      path: row.path,
      rootPath: row.root_path,
      rawMetadata: parseJson<Record<string, unknown> | null>(
        row.raw_metadata_json,
        null,
      ),
    }))
  }

  getArchiveEntry(input: {
    archiveEntryId?: string
    archiveId?: string
    entryPath?: string
  }): ArchiveEntryRecord | null {
    this.requireInitialized()
    const db = this.sqlite.getDb()
    let row:
      | {
          id: string
          archive_id: string
          entry_path: string
          entry_basename: string
          entry_extension: string
          is_directory: number
          uncompressed_size_bytes: number | null
          compressed_size_bytes: number | null
          modified_at_archive: string | null
          crc32: string | null
          is_audio_candidate: number
          audio_metadata_json: string | null
          tag_metadata_json: string | null
          entry_hash_sha256: string | null
        }
      | undefined

    if (input.archiveEntryId) {
      row = db
        .prepare('SELECT * FROM archive_entries WHERE id = ?')
        .get(input.archiveEntryId) as typeof row
    } else if (input.archiveId && input.entryPath) {
      row = db
        .prepare(
          'SELECT * FROM archive_entries WHERE archive_id = ? AND entry_path = ?',
        )
        .get(input.archiveId, input.entryPath) as typeof row
    } else {
      return null
    }

    if (!row) {
      return null
    }

    return {
      id: row.id,
      archiveId: row.archive_id,
      entryPath: row.entry_path,
      entryBasename: row.entry_basename,
      entryExtension: row.entry_extension,
      isDirectory: row.is_directory === 1,
      uncompressedSizeBytes: row.uncompressed_size_bytes,
      compressedSizeBytes: row.compressed_size_bytes,
      modifiedAtArchive: row.modified_at_archive,
      crc32: row.crc32,
      isAudioCandidate: row.is_audio_candidate === 1,
      audioMetadata: parseJson<Record<string, unknown> | null>(
        row.audio_metadata_json,
        null,
      ),
      tagMetadata: parseJson<Record<string, unknown> | null>(
        row.tag_metadata_json,
        null,
      ),
      entryHashSha256: row.entry_hash_sha256,
    }
  }

  getArchiveEntries(archiveId: string): ArchiveEntryRecord[] {
    this.requireInitialized()
    const rows = this.sqlite
      .getDb()
      .prepare(
        `
          SELECT *
          FROM archive_entries
          WHERE archive_id = ?
          ORDER BY entry_path
        `,
      )
      .all(archiveId) as Array<{
      id: string
      archive_id: string
      entry_path: string
      entry_basename: string
      entry_extension: string
      is_directory: number
      uncompressed_size_bytes: number | null
      compressed_size_bytes: number | null
      modified_at_archive: string | null
      crc32: string | null
      is_audio_candidate: number
      audio_metadata_json: string | null
      tag_metadata_json: string | null
      entry_hash_sha256: string | null
    }>

    return rows.map((row) => ({
      id: row.id,
      archiveId: row.archive_id,
      entryPath: row.entry_path,
      entryBasename: row.entry_basename,
      entryExtension: row.entry_extension,
      isDirectory: row.is_directory === 1,
      uncompressedSizeBytes: row.uncompressed_size_bytes,
      compressedSizeBytes: row.compressed_size_bytes,
      modifiedAtArchive: row.modified_at_archive,
      crc32: row.crc32,
      isAudioCandidate: row.is_audio_candidate === 1,
      audioMetadata: parseJson<Record<string, unknown> | null>(
        row.audio_metadata_json,
        null,
      ),
      tagMetadata: parseJson<Record<string, unknown> | null>(
        row.tag_metadata_json,
        null,
      ),
      entryHashSha256: row.entry_hash_sha256,
    }))
  }

  findDuplicateCandidates(): DuplicateGroup[] {
    this.requireInitialized()
    const db = this.sqlite.getDb()
    const hashGroups = db
      .prepare(
        `
          SELECT fh.hash_value, GROUP_CONCAT(f.id) AS file_ids, GROUP_CONCAT(f.path) AS paths
          FROM file_hashes fh
          JOIN files f ON f.id = fh.file_id
          WHERE fh.hash_type = 'sha256' AND fh.scope = 'full'
          GROUP BY fh.hash_value
          HAVING COUNT(*) > 1
        `,
      )
      .all() as Array<{ hash_value: string; file_ids: string; paths: string }>

    const groups: DuplicateGroup[] = hashGroups.map((group) => ({
      key: group.hash_value,
      fileIds: group.file_ids.split(','),
      paths: group.paths.split(','),
      hashValue: group.hash_value,
      reason: 'hash',
    }))

    const fuzzyGroups = db
      .prepare(
        `
          SELECT
            f.size_bytes,
            COALESCE(t.artist, '') AS artist,
            COALESCE(t.title, '') AS title,
            GROUP_CONCAT(f.id) AS file_ids,
            GROUP_CONCAT(f.path) AS paths
          FROM files f
          LEFT JOIN audio_tags t ON t.file_id = f.id
          GROUP BY f.size_bytes, COALESCE(t.artist, ''), COALESCE(t.title, '')
          HAVING COUNT(*) > 1 AND artist != '' AND title != ''
        `,
      )
      .all() as Array<{
      size_bytes: number
      artist: string
      title: string
      file_ids: string
      paths: string
    }>

    for (const group of fuzzyGroups) {
      const key = `size:${group.size_bytes}|artist:${group.artist}|title:${group.title}`
      if (!groups.some((existing) => existing.key === key)) {
        groups.push({
          key,
          fileIds: group.file_ids.split(','),
          paths: group.paths.split(','),
          hashValue: null,
          reason: 'size-and-tags',
        })
      }
    }

    return groups
  }

  async exportInventory(args: {
    format: 'json' | 'csv'
    scope: 'files' | 'directories' | 'archives' | 'duplicates' | 'moves'
    outputPath?: string
  }): Promise<{ format: 'json' | 'csv'; scope: string; outputPath?: string; data: string }> {
    this.requireInitialized()

    let rows: Array<Record<string, unknown>>
    switch (args.scope) {
      case 'files':
        rows = this.queryInventoryFiles().map((file) => ({
          id: file.id,
          path: file.path,
          rootPath: file.rootPath,
          extension: file.extension,
          sizeBytes: file.sizeBytes,
          hash: file.hashes.find((hash) => hash.hashType === 'sha256')?.hashValue ?? null,
          artist: file.audioTags?.artist ?? null,
          title: file.audioTags?.title ?? null,
        }))
        break
      case 'directories':
        rows = this.queryInventoryDirectories().map((row) => ({ ...row }))
        break
      case 'archives':
        rows = this.queryInventoryArchives()
        break
      case 'duplicates':
        rows = this.findDuplicateCandidates().map((row) => ({ ...row }))
        break
      case 'moves':
        rows = this.listMovePlansWithItems()
        break
    }

    const data =
      args.format === 'json' ? JSON.stringify(rows, null, 2) : this.toCsv(rows)

    if (args.outputPath) {
      await fs.writeFile(args.outputPath, data, 'utf8')
    }

    return {
      format: args.format,
      scope: args.scope,
      outputPath: args.outputPath,
      data,
    }
  }

  createMovePlan(input: {
    fileIds?: string[]
    sourceQuery?: InventoryQuery
    destinationRoot: string
    strategy: 'preserve-relative' | 'artist-album-track' | 'flat'
    dryRun?: boolean
    overwrite?: boolean
    name?: string
    notes?: string
  }): { movePlan: MovePlan; items: MovePlanItem[] } {
    this.requireInitialized()
    const db = this.sqlite.getDb()
    const files = input.fileIds?.length
      ? input.fileIds
          .map((fileId) => this.getInventoryFile(fileId))
          .filter(Boolean) as InventoryFile[]
      : this.queryInventoryFiles(input.sourceQuery)

    const movePlan: MovePlan = {
      id: nanoid(),
      createdAt: new Date().toISOString(),
      status: 'draft',
      name: input.name ?? null,
      rules: {
        destinationRoot: normalizePath(input.destinationRoot),
        strategy: input.strategy,
        dryRun: input.dryRun ?? false,
        overwrite: input.overwrite ?? false,
      },
      notes: input.notes ?? null,
    }

    db.prepare(
      `
        INSERT INTO move_plans (id, created_at, status, name, rules_json, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(
      movePlan.id,
      movePlan.createdAt,
      movePlan.status,
      movePlan.name,
      JSON.stringify(movePlan.rules),
      movePlan.notes,
    )

    const items: MovePlanItem[] = files.map((file) => {
      const destination = this.buildDestinationPath(
        file,
        normalizePath(input.destinationRoot),
        input.strategy,
      )
      const sha256 =
        file.hashes.find((hash) => hash.hashType === 'sha256')?.hashValue ?? null

      const item: MovePlanItem = {
        id: nanoid(),
        movePlanId: movePlan.id,
        fileId: file.id,
        sourcePath: file.path,
        proposedDestinationPath: destination,
        status: 'planned',
        preMoveSha256: sha256,
        postMoveSha256: null,
        movedAt: null,
        verifiedAt: null,
        errorText: null,
      }

      db.prepare(
        `
          INSERT INTO move_plan_items (
            id, move_plan_id, file_id, source_path, proposed_destination_path, status,
            pre_move_sha256, post_move_sha256, moved_at, verified_at, error_text
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        item.id,
        item.movePlanId,
        item.fileId,
        item.sourcePath,
        item.proposedDestinationPath,
        item.status,
        item.preMoveSha256,
        item.postMoveSha256,
        item.movedAt,
        item.verifiedAt,
        item.errorText,
      )

      return item
    })

    this.recordChangeEvent('move_plan_created', 'move_plan', movePlan.id, 'Move plan created', {
      itemCount: items.length,
      rules: movePlan.rules,
    })

    return { movePlan, items }
  }

  getMovePlan(movePlanId: string): { movePlan: MovePlan; items: MovePlanItem[] } | null {
    this.requireInitialized()
    const db = this.sqlite.getDb()
    const planRow = db
      .prepare('SELECT * FROM move_plans WHERE id = ?')
      .get(movePlanId) as
      | {
          id: string
          created_at: string
          status: MovePlan['status']
          name: string | null
          rules_json: string | null
          notes: string | null
        }
      | undefined

    if (!planRow) {
      return null
    }

    const itemRows = db
      .prepare(
        `
          SELECT *
          FROM move_plan_items
          WHERE move_plan_id = ?
          ORDER BY source_path
        `,
      )
      .all(movePlanId) as Array<{
      id: string
      move_plan_id: string
      file_id: string
      source_path: string
      proposed_destination_path: string
      status: MovePlanItem['status']
      pre_move_sha256: string | null
      post_move_sha256: string | null
      moved_at: string | null
      verified_at: string | null
      error_text: string | null
    }>

    return {
      movePlan: {
        id: planRow.id,
        createdAt: planRow.created_at,
        status: planRow.status,
        name: planRow.name,
        rules: parseJson<Record<string, unknown> | null>(planRow.rules_json, null),
        notes: planRow.notes,
      },
      items: itemRows.map((item) => ({
        id: item.id,
        movePlanId: item.move_plan_id,
        fileId: item.file_id,
        sourcePath: item.source_path,
        proposedDestinationPath: item.proposed_destination_path,
        status: item.status,
        preMoveSha256: item.pre_move_sha256,
        postMoveSha256: item.post_move_sha256,
        movedAt: item.moved_at,
        verifiedAt: item.verified_at,
        errorText: item.error_text,
      })),
    }
  }

  listMovePlansWithItems(): Array<Record<string, unknown>> {
    this.requireInitialized()
    const db = this.sqlite.getDb()
    const plans = db.prepare('SELECT * FROM move_plans ORDER BY created_at DESC').all() as Array<{
      id: string
      created_at: string
      status: string
      name: string | null
      rules_json: string | null
      notes: string | null
    }>

    return plans.map((plan) => {
      const details = this.getMovePlan(plan.id)
      return {
        id: plan.id,
        createdAt: plan.created_at,
        status: plan.status,
        name: plan.name,
        rules: parseJson<Record<string, unknown> | null>(plan.rules_json, null),
        notes: plan.notes,
        items: details?.items ?? [],
      }
    })
  }

  updateMovePlanStatus(movePlanId: string, status: MovePlan['status']): void {
    this.requireInitialized()
    this.sqlite
      .getDb()
      .prepare('UPDATE move_plans SET status = ? WHERE id = ?')
      .run(status, movePlanId)
  }

  updateMovePlanItem(item: MovePlanItem): void {
    this.requireInitialized()
    this.sqlite
      .getDb()
      .prepare(
        `
          UPDATE move_plan_items
          SET status = ?, post_move_sha256 = ?, moved_at = ?, verified_at = ?, error_text = ?
          WHERE id = ?
        `,
      )
      .run(
        item.status,
        item.postMoveSha256,
        item.movedAt,
        item.verifiedAt,
        item.errorText,
        item.id,
      )
  }

  updateFilePath(fileId: string, newPath: string): void {
    this.requireInitialized()
    const normalizedPath = normalizePath(newPath)
    this.sqlite
      .getDb()
      .prepare(
        `
          UPDATE files
          SET path = ?, directory_path = ?, basename = ?, extension = ?, root_path = ?, exists_now = 1
          WHERE id = ?
        `,
      )
      .run(
        normalizedPath,
        path.dirname(normalizedPath),
        path.basename(normalizedPath),
        path.extname(normalizedPath).toLowerCase(),
        this.findBestRootPath(normalizedPath),
        fileId,
      )
  }

  async recordExternalMove(
    fileId: string,
    newPath: string,
    verifyByHash = true,
  ): Promise<InventoryFile | null> {
    this.requireInitialized()
    const current = this.getInventoryFile(fileId)
    if (!current) {
      return null
    }

    const normalizedPath = normalizePath(newPath)
    if (verifyByHash) {
      const knownHash =
        current.hashes.find((hash) => hash.hashType === 'sha256')?.hashValue ?? null
      if (knownHash) {
        const computed = await this.hashService.computeSha256(normalizedPath)
        if (computed.hash !== knownHash) {
          throw new DatabaseError(
            `External move hash mismatch for ${normalizedPath}: expected ${knownHash}, got ${computed.hash}`,
          )
        }
      }
    }

    this.insertFileObservation({
      scanRunId: nanoid(),
      fileId,
      observedPath: current.path,
      sizeBytes: current.sizeBytes,
      modifiedAtFs: current.modifiedAtFs,
      existsNow: false,
      hashState: current.hashes.length > 0 ? 'full' : 'missing',
      metadataState: current.audioTags || current.audioProperties ? 'complete' : 'missing',
    })

    this.updateFilePath(fileId, normalizedPath)
    this.recordChangeEvent(
      'external_move_recorded',
      'file',
      fileId,
      'External move recorded',
      { from: current.path, to: normalizedPath },
    )

    return this.getInventoryFile(fileId)
  }

  getInventoryChanges(filters: {
    eventType?: string
    entityType?: string
    limit?: number
  } = {}): Array<Record<string, unknown>> {
    this.requireInitialized()
    const db = this.sqlite.getDb()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters.eventType) {
      conditions.push('event_type = ?')
      params.push(filters.eventType)
    }
    if (filters.entityType) {
      conditions.push('entity_type = ?')
      params.push(filters.entityType)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limitClause = `LIMIT ${filters.limit ?? 100}`
    const rows = db
      .prepare(
        `
          SELECT *
          FROM change_events
          ${whereClause}
          ORDER BY event_time DESC
          ${limitClause}
        `,
      )
      .all(...params) as Array<{
      id: string
      event_time: string
      event_type: string
      entity_type: string
      entity_id: string | null
      description: string
      details_json: string | null
    }>

    return rows.map((row) => ({
      id: row.id,
      eventTime: row.event_time,
      eventType: row.event_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      description: row.description,
      details: parseJson<Record<string, unknown> | null>(row.details_json, null),
    }))
  }

  clearInventoryChanges(filters: { eventType?: string; entityType?: string } = {}): number {
    this.requireInitialized()
    const db = this.sqlite.getDb()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters.eventType) {
      conditions.push('event_type = ?')
      params.push(filters.eventType)
    }
    if (filters.entityType) {
      conditions.push('entity_type = ?')
      params.push(filters.entityType)
    }

    const result =
      conditions.length > 0
        ? db
            .prepare(`DELETE FROM change_events WHERE ${conditions.join(' AND ')}`)
            .run(...params)
        : db.prepare('DELETE FROM change_events').run()

    return result.changes
  }

  addChangeEvent(input: {
    eventType: string
    entityType: string
    entityId: string | null
    description: string
    details?: Record<string, unknown>
  }): void {
    this.recordChangeEvent(
      input.eventType,
      input.entityType,
      input.entityId,
      input.description,
      input.details,
    )
  }

  getSummaryResource(): Record<string, unknown> {
    return {
      ...this.getInventoryStatus(),
      duplicateGroups: this.findDuplicateCandidates().length,
      movePlans: this.listMovePlansWithItems().length,
    }
  }

  private requireInitialized(): void {
    if (!this.sqlite.isInitialized()) {
      throw new DatabaseError(
        'Inventory database is not initialized. Run init_inventory_db first.',
      )
    }
    this.sqlite.getDb()
  }

  private upsertDirectory(input: {
    directoryPath: string
    rootPath: string
    scanRunId: string
    observedAt: string
  }): string {
    const db = this.sqlite.getDb()
    const existing = db
      .prepare('SELECT id, first_seen_at FROM directories WHERE path = ?')
      .get(input.directoryPath) as { id: string; first_seen_at: string } | undefined

    const directoryId = existing?.id ?? nanoid()
    db.prepare(
      `
        INSERT INTO directories (
          id, path, parent_path, root_path, depth, exists_now, first_seen_at, last_seen_at, last_scan_run_id
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
          parent_path = excluded.parent_path,
          root_path = excluded.root_path,
          depth = excluded.depth,
          exists_now = 1,
          last_seen_at = excluded.last_seen_at,
          last_scan_run_id = excluded.last_scan_run_id
      `,
    ).run(
      directoryId,
      input.directoryPath,
      input.directoryPath === input.rootPath ? null : path.dirname(input.directoryPath),
      input.rootPath,
      path.relative(input.rootPath, input.directoryPath)
        ? path.relative(input.rootPath, input.directoryPath).split(path.sep).length
        : 0,
      existing?.first_seen_at ?? input.observedAt,
      input.observedAt,
      input.scanRunId,
    )

    return directoryId
  }

  private upsertFile(input: {
    existingId?: string
    filePath: string
    rootPath: string
    scanRunId: string
    observedAt: string
    stat: Awaited<ReturnType<typeof fs.lstat>>
  }): string {
    const db = this.sqlite.getDb()
    const existing = input.existingId
      ? (db
          .prepare('SELECT first_seen_at FROM files WHERE id = ?')
          .get(input.existingId) as { first_seen_at: string } | undefined)
      : undefined

    const fileId = input.existingId ?? nanoid()
    db.prepare(
      `
        INSERT INTO files (
          id, path, directory_path, root_path, basename, extension, mime_type, size_bytes,
          created_at_fs, modified_at_fs, accessed_at_fs, inode, device_id, mode_bits,
          is_symlink, symlink_target, exists_now, first_seen_at, last_seen_at, last_scan_run_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
          directory_path = excluded.directory_path,
          root_path = excluded.root_path,
          basename = excluded.basename,
          extension = excluded.extension,
          mime_type = excluded.mime_type,
          size_bytes = excluded.size_bytes,
          created_at_fs = excluded.created_at_fs,
          modified_at_fs = excluded.modified_at_fs,
          accessed_at_fs = excluded.accessed_at_fs,
          inode = excluded.inode,
          device_id = excluded.device_id,
          mode_bits = excluded.mode_bits,
          is_symlink = excluded.is_symlink,
          symlink_target = excluded.symlink_target,
          exists_now = 1,
          last_seen_at = excluded.last_seen_at,
          last_scan_run_id = excluded.last_scan_run_id
      `,
    ).run(
      fileId,
      input.filePath,
      path.dirname(input.filePath),
      input.rootPath,
      path.basename(input.filePath),
      path.extname(input.filePath).toLowerCase(),
      inferMimeType(input.filePath),
      input.stat.size,
      input.stat.birthtime?.toISOString?.() ?? null,
      input.stat.mtime.toISOString(),
      input.stat.atime?.toISOString?.() ?? null,
      input.stat.ino ? String(input.stat.ino) : null,
      input.stat.dev ? String(input.stat.dev) : null,
      input.stat.mode ?? null,
      input.stat.isSymbolicLink() ? 1 : 0,
      null,
      existing?.first_seen_at ?? input.observedAt,
      input.observedAt,
      input.scanRunId,
    )

    return fileId
  }

  private upsertFileHash(
    fileId: string,
    input: {
      hashType: FileHash['hashType']
      scope: FileHash['scope']
      hashValue: string
      byteCount: number
    },
  ): void {
    this.sqlite
      .getDb()
      .prepare(
        `
          INSERT INTO file_hashes (
            id, file_id, hash_type, scope, hash_value, byte_count, computed_at, algorithm_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(file_id, hash_type, scope) DO UPDATE SET
            hash_value = excluded.hash_value,
            byte_count = excluded.byte_count,
            computed_at = excluded.computed_at,
            algorithm_version = excluded.algorithm_version
        `,
      )
      .run(
        nanoid(),
        fileId,
        input.hashType,
        input.scope,
        input.hashValue,
        input.byteCount,
        new Date().toISOString(),
        '1',
      )
  }

  private upsertAudioProperties(fileId: string, properties: AudioProperties): void {
    this.sqlite
      .getDb()
      .prepare(
        `
          INSERT INTO audio_properties (
            file_id, container_format, codec, duration_seconds, bitrate, sample_rate,
            bits_per_sample, channels, channel_layout, lossless, vbr, encoder,
            metadata_source, extracted_at, raw_format_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(file_id) DO UPDATE SET
            container_format = excluded.container_format,
            codec = excluded.codec,
            duration_seconds = excluded.duration_seconds,
            bitrate = excluded.bitrate,
            sample_rate = excluded.sample_rate,
            bits_per_sample = excluded.bits_per_sample,
            channels = excluded.channels,
            channel_layout = excluded.channel_layout,
            lossless = excluded.lossless,
            vbr = excluded.vbr,
            encoder = excluded.encoder,
            metadata_source = excluded.metadata_source,
            extracted_at = excluded.extracted_at,
            raw_format_json = excluded.raw_format_json
        `,
      )
      .run(
        fileId,
        properties.containerFormat,
        properties.codec,
        properties.durationSeconds,
        properties.bitrate,
        properties.sampleRate,
        properties.bitsPerSample,
        properties.channels,
        properties.channelLayout,
        properties.lossless === null ? null : properties.lossless ? 1 : 0,
        properties.vbr === null ? null : properties.vbr ? 1 : 0,
        properties.encoder,
        properties.metadataSource,
        properties.extractedAt,
        JSON.stringify(properties.rawFormat),
      )
  }

  private upsertAudioTags(fileId: string, tags: AudioTags): void {
    this.sqlite
      .getDb()
      .prepare(
        `
          INSERT INTO audio_tags (
            file_id, title, artist, album, album_artist, track_number, track_total,
            disc_number, disc_total, year, date_text, genre_json, composer_json,
            comment_json, bpm, key_text, label_json, catalog_number_json, isrc_json,
            lyrics_json, musicbrainz_recording_id, musicbrainz_release_id, raw_tags_json, extracted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(file_id) DO UPDATE SET
            title = excluded.title,
            artist = excluded.artist,
            album = excluded.album,
            album_artist = excluded.album_artist,
            track_number = excluded.track_number,
            track_total = excluded.track_total,
            disc_number = excluded.disc_number,
            disc_total = excluded.disc_total,
            year = excluded.year,
            date_text = excluded.date_text,
            genre_json = excluded.genre_json,
            composer_json = excluded.composer_json,
            comment_json = excluded.comment_json,
            bpm = excluded.bpm,
            key_text = excluded.key_text,
            label_json = excluded.label_json,
            catalog_number_json = excluded.catalog_number_json,
            isrc_json = excluded.isrc_json,
            lyrics_json = excluded.lyrics_json,
            musicbrainz_recording_id = excluded.musicbrainz_recording_id,
            musicbrainz_release_id = excluded.musicbrainz_release_id,
            raw_tags_json = excluded.raw_tags_json,
            extracted_at = excluded.extracted_at
        `,
      )
      .run(
        fileId,
        tags.title,
        tags.artist,
        tags.album,
        tags.albumArtist,
        tags.trackNumber,
        tags.trackTotal,
        tags.discNumber,
        tags.discTotal,
        tags.year,
        tags.dateText,
        JSON.stringify(tags.genre),
        JSON.stringify(tags.composer),
        JSON.stringify(tags.comment),
        tags.bpm,
        tags.keyText,
        JSON.stringify(tags.label),
        JSON.stringify(tags.catalogNumber),
        JSON.stringify(tags.isrc),
        JSON.stringify(tags.lyrics),
        tags.musicbrainzRecordingId,
        tags.musicbrainzReleaseId,
        JSON.stringify(tags.rawTags),
        tags.extractedAt,
      )
  }

  private insertFileObservation(input: {
    scanRunId: string
    fileId: string
    observedPath: string
    sizeBytes: number
    modifiedAtFs: string | null
    existsNow: boolean
    hashState: string
    metadataState: string
  }): void {
    this.sqlite
      .getDb()
      .prepare(
        `
          INSERT INTO file_observations (
            id, scan_run_id, file_id, observed_path, size_bytes, modified_at_fs,
            exists_now, hash_state, metadata_state, observed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        nanoid(),
        input.scanRunId,
        input.fileId,
        input.observedPath,
        input.sizeBytes,
        input.modifiedAtFs,
        input.existsNow ? 1 : 0,
        input.hashState,
        input.metadataState,
        new Date().toISOString(),
      )
  }

  private upsertArchive(fileId: string): string {
    const db = this.sqlite.getDb()
    const existing = db
      .prepare('SELECT id FROM archives WHERE file_id = ?')
      .get(fileId) as { id: string } | undefined
    const archiveId = existing?.id ?? nanoid()
    db.prepare(
      `
        INSERT INTO archives (id, file_id, archive_type, entry_count, indexed_at, raw_metadata_json)
        VALUES (?, ?, 'zip', NULL, ?, NULL)
        ON CONFLICT(file_id) DO UPDATE SET indexed_at = excluded.indexed_at
      `,
    ).run(archiveId, fileId, new Date().toISOString())
    return archiveId
  }

  private replaceArchiveEntries(archiveId: string, entries: ArchiveEntryRecord[]): void {
    const db = this.sqlite.getDb()
    const clear = db.prepare('DELETE FROM archive_entries WHERE archive_id = ?')
    const insert = db.prepare(
      `
        INSERT INTO archive_entries (
          id, archive_id, entry_path, entry_basename, entry_extension, is_directory,
          uncompressed_size_bytes, compressed_size_bytes, modified_at_archive, crc32,
          is_audio_candidate, audio_metadata_json, tag_metadata_json, entry_hash_sha256
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )

    const transaction = db.transaction((archiveEntries: ArchiveEntryRecord[]) => {
      clear.run(archiveId)
      for (const entry of archiveEntries) {
        insert.run(
          nanoid(),
          archiveId,
          entry.entryPath,
          entry.entryBasename,
          entry.entryExtension,
          entry.isDirectory ? 1 : 0,
          entry.uncompressedSizeBytes,
          entry.compressedSizeBytes,
          entry.modifiedAtArchive,
          entry.crc32,
          entry.isAudioCandidate ? 1 : 0,
          JSON.stringify(entry.audioMetadata),
          JSON.stringify(entry.tagMetadata),
          entry.entryHashSha256,
        )
      }
    })

    transaction(entries)
  }

  private recordChangeEvent(
    eventType: string,
    entityType: string,
    entityId: string | null,
    description: string,
    details?: Record<string, unknown>,
  ): void {
    try {
      this.sqlite
        .getDb()
        .prepare(
          `
            INSERT INTO change_events (
              id, event_time, event_type, entity_type, entity_id, description, details_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          nanoid(),
          new Date().toISOString(),
          eventType,
          entityType,
          entityId,
          description,
          details ? JSON.stringify(details) : null,
        )
    } catch (error) {
      throw new DatabaseError(
        `Failed to record change event: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private markMissingPaths(
    rootPath: string,
    seenDirectories: Set<string>,
    seenFiles: Set<string>,
    scanRunId: string,
  ): void {
    const db = this.sqlite.getDb()

    const directoryRows = db
      .prepare('SELECT path FROM directories WHERE root_path = ?')
      .all(rootPath) as Array<{ path: string }>
    for (const row of directoryRows) {
      if (!seenDirectories.has(row.path)) {
        db.prepare(
          'UPDATE directories SET exists_now = 0, last_scan_run_id = ? WHERE path = ?',
        ).run(scanRunId, row.path)
      }
    }

    const fileRows = db
      .prepare('SELECT id, path, size_bytes, modified_at_fs FROM files WHERE root_path = ?')
      .all(rootPath) as Array<{
      id: string
      path: string
      size_bytes: number
      modified_at_fs: string | null
    }>
    for (const row of fileRows) {
      if (!seenFiles.has(row.path)) {
        db.prepare(
          'UPDATE files SET exists_now = 0, last_scan_run_id = ? WHERE id = ?',
        ).run(scanRunId, row.id)
        this.insertFileObservation({
          scanRunId,
          fileId: row.id,
          observedPath: row.path,
          sizeBytes: row.size_bytes,
          modifiedAtFs: row.modified_at_fs,
          existsNow: false,
          hashState: 'missing',
          metadataState: 'missing',
        })
      }
    }
  }

  private getFileRowByPath(filePath: string): InventoryFileRow | null {
    const row = this.sqlite
      .getDb()
      .prepare('SELECT * FROM files WHERE path = ?')
      .get(filePath) as InventoryFileRow | undefined
    return row ?? null
  }

  private findBestRootPath(filePath: string): string {
    const roots = this.listScanRuns()
      .flatMap((run) => run.requestedRoots)
      .sort((a, b) => b.length - a.length)

    return roots.find((root) => filePath.startsWith(root)) ?? path.dirname(filePath)
  }

  private buildDestinationPath(
    file: InventoryFile,
    destinationRoot: string,
    strategy: 'preserve-relative' | 'artist-album-track' | 'flat',
  ): string {
    switch (strategy) {
      case 'preserve-relative': {
        const relative = path.relative(file.rootPath, file.path)
        return path.join(destinationRoot, relative)
      }
      case 'artist-album-track': {
        const artist = file.audioTags?.artist ?? 'Unknown Artist'
        const album = file.audioTags?.album ?? 'Unknown Album'
        const title = file.audioTags?.title ?? path.parse(file.basename).name
        return path.join(destinationRoot, artist, album, `${title}${file.extension}`)
      }
      case 'flat':
      default:
        return path.join(destinationRoot, file.basename)
    }
  }

  private toCsv(rows: Array<Record<string, unknown>>): string {
    if (rows.length === 0) {
      return ''
    }

    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))]
    const escapeCell = (value: unknown): string => {
      if (value === null || value === undefined) {
        return ''
      }
      const text =
        typeof value === 'string' ? value : JSON.stringify(value)
      return `"${text.replace(/"/g, '""')}"`
    }

    return [
      headers.join(','),
      ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(',')),
    ].join('\n')
  }
}
