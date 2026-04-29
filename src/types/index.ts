export type ScanRunStatus = 'running' | 'completed' | 'failed' | 'cancelled'
export type ScanMode =
  | 'full'
  | 'incremental'
  | 'hash-only'
  | 'metadata-only'
  | 'archive-only'

export interface ScanRun {
  id: string
  startedAt: string
  finishedAt: string | null
  status: ScanRunStatus
  scanType: ScanMode
  requestedRoots: string[]
  options: Record<string, unknown>
  stats: Record<string, unknown> | null
  errorText: string | null
}

export interface InventoryDirectory {
  id: string
  path: string
  parentPath: string | null
  rootPath: string
  depth: number
  existsNow: boolean
  firstSeenAt: string
  lastSeenAt: string
  lastScanRunId: string | null
}

export interface FileHash {
  id: string
  fileId: string
  hashType: 'sha256' | 'quick_xxh64' | 'md5_compat' | 'zip_entry_sha256'
  scope: 'full' | 'head_tail' | 'archive_entry'
  hashValue: string
  byteCount: number | null
  computedAt: string
  algorithmVersion: string | null
}

export interface AudioProperties {
  fileId: string
  containerFormat: string | null
  codec: string | null
  durationSeconds: number | null
  bitrate: number | null
  sampleRate: number | null
  bitsPerSample: number | null
  channels: number | null
  channelLayout: string | null
  lossless: boolean | null
  vbr: boolean | null
  encoder: string | null
  metadataSource: 'music-metadata' | 'ffprobe'
  extractedAt: string
  rawFormat: Record<string, unknown> | null
}

export interface AudioTags {
  fileId: string
  title: string | null
  artist: string | null
  album: string | null
  albumArtist: string | null
  trackNumber: number | null
  trackTotal: number | null
  discNumber: number | null
  discTotal: number | null
  year: number | null
  dateText: string | null
  genre: string[]
  composer: string[]
  comment: string[]
  bpm: number | null
  keyText: string | null
  label: string[]
  catalogNumber: string[]
  isrc: string[]
  lyrics: string[]
  musicbrainzRecordingId: string | null
  musicbrainzReleaseId: string | null
  rawTags: Record<string, unknown>
  extractedAt: string
}

export interface InventoryFile {
  id: string
  path: string
  directoryPath: string
  rootPath: string
  basename: string
  extension: string
  mimeType: string | null
  sizeBytes: number
  createdAtFs: string | null
  modifiedAtFs: string | null
  accessedAtFs: string | null
  inode: string | null
  deviceId: string | null
  modeBits: number | null
  isSymlink: boolean
  symlinkTarget: string | null
  existsNow: boolean
  firstSeenAt: string
  lastSeenAt: string
  lastScanRunId: string | null
  hashes: FileHash[]
  audioProperties: AudioProperties | null
  audioTags: AudioTags | null
  observations: Array<Record<string, unknown>>
}

export interface ArchiveRecord {
  id: string
  fileId: string
  archiveType: 'zip'
  entryCount: number | null
  indexedAt: string
  rawMetadata: Record<string, unknown> | null
}

export interface ArchiveEntryRecord {
  id: string
  archiveId: string
  entryPath: string
  entryBasename: string
  entryExtension: string
  isDirectory: boolean
  uncompressedSizeBytes: number | null
  compressedSizeBytes: number | null
  modifiedAtArchive: string | null
  crc32: string | null
  isAudioCandidate: boolean
  audioMetadata: Record<string, unknown> | null
  tagMetadata: Record<string, unknown> | null
  entryHashSha256: string | null
}

export type MovePlanStatus = 'draft' | 'executing' | 'completed' | 'cancelled'
export type MovePlanItemStatus =
  | 'planned'
  | 'moved'
  | 'verified'
  | 'failed'
  | 'skipped'

export interface MovePlan {
  id: string
  createdAt: string
  status: MovePlanStatus
  name: string | null
  rules: Record<string, unknown> | null
  notes: string | null
}

export interface MovePlanItem {
  id: string
  movePlanId: string
  fileId: string
  sourcePath: string
  proposedDestinationPath: string
  status: MovePlanItemStatus
  preMoveSha256: string | null
  postMoveSha256: string | null
  movedAt: string | null
  verifiedAt: string | null
  errorText: string | null
}

export interface InventoryQuery {
  rootPath?: string
  path?: string
  extension?: string
  artist?: string
  title?: string
  album?: string
  genre?: string
  duplicatesOnly?: boolean
  missingFilesOnly?: boolean
  hasHash?: boolean
}

export interface DuplicateGroup {
  key: string
  fileIds: string[]
  paths: string[]
  hashValue: string | null
  reason: 'hash' | 'size-and-tags'
}
