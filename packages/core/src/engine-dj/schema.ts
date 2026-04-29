/**
 * TypeScript interfaces mapping to key Engine DJ database tables.
 *
 * Engine DJ (Database2/m.db) uses integer primary keys and stores
 * some metadata as zlib-compressed blobs.
 */

/** Maps to the `Track` table. */
export interface EdjTrack {
  id: number
  /** Relative path from the Engine Library root. */
  path: string | null
  filename: string | null
  title: string | null
  artist: string | null
  album: string | null
  genre: string | null
  comment: string | null
  bpm: number | null
  rating: number | null
  key: number | null
  year: number | null
  duration: number | null
  bitrate: number | null
  bpmAnalyzed: number | null
  trackType: number | null
  isExternalTrack: number | null
  /** UUID string used as a portable identifier. */
  uuid: string | null
  /** Last time the track was played (Unix epoch seconds). */
  lastPlayedAt: number | null
  isPlayed: number | null
  playOrder: number | null
  /** File size in bytes. */
  fileBytes: number | null
}

/** Maps to the `Crate` table (Engine DJ's equivalent of folders/crates). */
export interface EdjCrate {
  id: number
  title: string | null
  /** Path string that encodes the crate hierarchy (e.g. "Root;MyCrate;"). */
  path: string | null
}

/** Maps to the `CrateTrackList` table (junction between Crate and Track). */
export interface EdjCrateTrackList {
  id: number
  crateId: number
  trackId: number
}

/** Maps to the `Playlist` table. */
export interface EdjPlaylist {
  id: number
  title: string | null
  /** Path string encoding the playlist hierarchy. */
  path: string | null
  /** Whether this is a persistent or session playlist. */
  isPersisted: number | null
}
