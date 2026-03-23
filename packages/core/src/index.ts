// Cache
export { CacheStore, type CacheEntry, type CacheStats } from './cache/cache-store.js'

// Organize
export {
  sanitizeFilename,
  formatBytes,
  buildTagReplacements,
  expandTemplate,
  buildLibraryPath,
} from './organize/library-path.js'

// Dedup (tag-based)
export {
  type DuplicateType,
  type DuplicateMatch,
  type DuplicateCheckResult,
  buildLibraryIndex,
  checkDuplicates,
  findDuplicatePaths,
} from './dedup/tag-matcher.js'

// Audio
export { type DecodedAudio, decodeToFloat32 } from './audio/audio-decoder.js'
export { type BpmResult, analyzeBpm, batchAnalyzeBpm } from './audio/bpm-analyzer.js'
export { type KeyResult, analyzeKey, batchAnalyzeKey } from './audio/key-analyzer.js'
export {
  type KeyInfo,
  normalizeKey,
  getKeyInfo,
  toCamelot,
  toOpenKey,
  getCompatibleKeys,
  areKeysCompatible,
  getAllKeys,
} from './audio/keys.js'

// Tags
export {
  type TrackMetadata,
  readTags,
  batchReadTags,
} from './tags/tag-reader.js'
export { writeTags, updateTags } from './tags/tag-writer.js'

// Overlay
export { OverlayFS } from './overlay/overlay-fs.js'
export { FileTracker, type TrackedOperation, type OperationSummary, type OperationType } from './overlay/file-tracker.js'
export { commitOperations, type OperationResult, type CommitResult } from './overlay/commit.js'

// Plans
export { PlanManager } from './plans/plan-manager.js'
export {
  createRenameOp,
  createMoveOp,
  createWriteTagsOp,
  createSetBpmOp,
  createPlaylistOp,
  createAddToPlaylistOp,
  createAddToRekordboxPlaylistOp,
  createAddToEngineCrateOp,
  createDeleteFileOp,
} from './plans/operations.js'
export {
  type Operation,
  type OperationStatus,
  type RenameFileOp,
  type MoveFileOp,
  type WriteTagsOp,
  type SetBpmOp,
  type CreatePlaylistOp,
  type AddToPlaylistOp,
  type AddToRekordboxPlaylistOp,
  type AddToEngineCrateOp,
  type DeleteFileOp,
  type PlanMetadata,
  type Plan,
  type ExecutionResult,
  OperationSchema,
  OperationStatusSchema,
  RenameFileOpSchema,
  MoveFileOpSchema,
  WriteTagsOpSchema,
  SetBpmOpSchema,
  CreatePlaylistOpSchema,
  AddToPlaylistOpSchema,
  AddToRekordboxPlaylistOpSchema,
  AddToEngineCrateOpSchema,
  DeleteFileOpSchema,
  PlanMetadataSchema,
  PlanSchema,
  ExecutionResultSchema,
} from './plans/types.js'

// Playlists
export { parseM3U, generateM3U, type GenerateM3UOptions } from './playlists/m3u.js'
export { PlaylistManager } from './playlists/playlist-manager.js'
export {
  type PlaylistTrack,
  type Playlist as PlaylistDef,
} from './playlists/types.js'

// Rekordbox (namespaced to avoid conflicts)
export * as rekordbox from './rekordbox/db.js'
export {
  type RbTrack,
  type RbPlaylist,
  type RbSongPlaylist,
  type RbCue,
  type RbArtist,
  type RbAlbum,
  type RbGenre,
} from './rekordbox/schema.js'
export {
  type RbTrackQuery,
  searchTracks as rbSearchTracks,
  getTrack as rbGetTrack,
  getTrackByPath as rbGetTrackByPath,
} from './rekordbox/tracks.js'
export {
  getPlaylists as rbGetPlaylists,
  getPlaylistTracks as rbGetPlaylistTracks,
  createPlaylist as rbCreatePlaylist,
  addToPlaylist as rbAddToPlaylist,
} from './rekordbox/playlists.js'
export { getCuePoints, getHotCues } from './rekordbox/cues.js'

// Engine DJ (namespaced to avoid conflicts)
export * as engineDj from './engine-dj/db.js'
export {
  type EdjTrack,
  type EdjCrate,
  type EdjCrateTrackList,
  type EdjPlaylist as EdjPlaylistDef,
} from './engine-dj/schema.js'
export {
  type EdjTrackQuery,
  searchTracks as edjSearchTracks,
  getTrack as edjGetTrack,
} from './engine-dj/tracks.js'
export {
  getCrates,
  getCrateTracks,
  createCrate,
  addToCrate,
} from './engine-dj/playlists.js'
export { decompressBlob, compressBlob } from './engine-dj/blobs.js'

// Util
export {
  SUPPORTED_FORMATS,
  type SupportedFormat,
  isAudioFile,
  getFormat,
} from './util/audio-formats.js'
export {
  BangersssError,
  OverlayError,
  PlanError,
  AudioAnalysisError,
  TagError,
  DatabaseError,
  FfmpegNotFoundError,
} from './util/errors.js'
export { normalizeGlobPattern, buildExtensionGlob } from './util/glob-patterns.js'
export { setLogLevel, createLogger } from './util/logger.js'

// Walker
export {
  walk,
  walkFiles,
  countFiles,
} from './util/walker/walker.js'
export {
  type WalkOptions,
  type FolderResult,
  type FolderInspection,
} from './util/walker/types.js'
export {
  detectSamplePack,
  createSamplePackFilter,
  type SamplePackSignal,
  type SamplePackFilterOptions,
  PRODUCTION_EXTENSIONS,
} from './util/walker/sample-pack-detector.js'
