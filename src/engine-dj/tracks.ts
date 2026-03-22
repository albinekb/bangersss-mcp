/**
 * Engine DJ track queries.
 */

import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { EdjTrack } from './schema.js'

export interface EdjTrackQuery {
  artist?: string
  title?: string
  genre?: string
  bpmRange?: { min: number; max: number }
  key?: number
  rating?: number
}

/**
 * Search for tracks in the Engine DJ library.
 */
export function searchTracks(db: Database, query: EdjTrackQuery): EdjTrack[] {
  const conditions: string[] = []
  const params: Record<string, unknown> = {}

  if (query.title) {
    conditions.push('t.title LIKE :title')
    params.title = `%${query.title}%`
  }

  if (query.artist) {
    conditions.push('t.artist LIKE :artist')
    params.artist = `%${query.artist}%`
  }

  if (query.genre) {
    conditions.push('t.genre LIKE :genre')
    params.genre = `%${query.genre}%`
  }

  if (query.bpmRange) {
    conditions.push('t.bpm >= :bpmMin AND t.bpm <= :bpmMax')
    params.bpmMin = query.bpmRange.min
    params.bpmMax = query.bpmRange.max
  }

  if (query.key !== undefined) {
    conditions.push('t.key = :key')
    params.key = query.key
  }

  if (query.rating !== undefined) {
    conditions.push('t.rating = :rating')
    params.rating = query.rating
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const sql = `
    SELECT
      t.id, t.path, t.filename, t.title, t.artist, t.album,
      t.genre, t.comment, t.bpm, t.rating, t.key, t.year,
      t.duration, t.bitrate, t.bpmAnalyzed, t.trackType,
      t.isExternalTrack, t.uuid, t.lastPlayedAt, t.isPlayed,
      t.playOrder, t.fileBytes
    FROM Track t
    ${where}
    ORDER BY t.title
  `

  return db.prepare(sql).all(params) as EdjTrack[]
}

/**
 * Retrieve a single track by its Engine DJ track ID.
 */
export function getTrack(db: Database, id: number): EdjTrack | null {
  const row = db.prepare('SELECT * FROM Track WHERE id = ?').get(id) as
    | EdjTrack
    | undefined

  return row ?? null
}
