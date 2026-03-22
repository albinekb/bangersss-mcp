/**
 * Rekordbox playlist queries and mutation helpers.
 *
 * Write operations return journaled SQL (the query string and parameters)
 * rather than executing directly, so callers can review, batch, and
 * transact the mutations themselves.
 */

import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { RbPlaylist, RbTrack } from './schema.js'

/**
 * Return all playlists (including playlist folders).
 */
export function getPlaylists(db: Database): RbPlaylist[] {
  return db
    .prepare(
      'SELECT ID, Name, ParentID, Seq, Attribute FROM djmdPlaylist ORDER BY Seq',
    )
    .all() as RbPlaylist[]
}

/**
 * Return all tracks belonging to a given playlist, ordered by TrackNo.
 */
export function getPlaylistTracks(db: Database, playlistId: string): RbTrack[] {
  const rows = db
    .prepare(
      `SELECT c.*
       FROM djmdSongPlaylist sp
       JOIN djmdContent c ON sp.ContentID = c.ID
       WHERE sp.PlaylistID = ?
       ORDER BY sp.TrackNo`,
    )
    .all(playlistId) as RbTrack[]

  return rows.map((row) => ({
    ...row,
    FilePath:
      row.FolderPath && row.FileNameL
        ? row.FolderPath + row.FileNameL
        : undefined,
  }))
}

/**
 * Build the SQL statement to create a new playlist.
 *
 * Returns the parameterised query so the caller can execute it within a
 * transaction or queue it for later application.
 *
 * @param name - Display name for the playlist.
 * @param parentId - Parent playlist/folder ID. Omit for a root-level playlist.
 */
export function createPlaylist(
  db: Database,
  name: string,
  parentId?: string,
): { sql: string; params: unknown[] } {
  // Determine the next sequence number under the parent.
  const maxSeqRow = db
    .prepare(`SELECT MAX(Seq) AS maxSeq FROM djmdPlaylist WHERE ParentID = ?`)
    .get(parentId ?? '0') as { maxSeq: number | null } | undefined

  const nextSeq = (maxSeqRow?.maxSeq ?? 0) + 1

  const sql = `INSERT INTO djmdPlaylist (ID, Name, ParentID, Seq, Attribute)
               VALUES (?, ?, ?, ?, 1)`
  const params: unknown[] = [randomUUID(), name, parentId ?? '0', nextSeq]

  return { sql, params }
}

/**
 * Build the SQL statements to add tracks to a playlist.
 *
 * @param playlistId - Target playlist ID.
 * @param contentIds - Array of djmdContent IDs to add.
 */
export function addToPlaylist(
  db: Database,
  playlistId: string,
  contentIds: string[],
): { sql: string[]; params: unknown[][] } {
  // Determine the current maximum TrackNo in the playlist.
  const maxRow = db
    .prepare(
      `SELECT MAX(TrackNo) AS maxNo FROM djmdSongPlaylist WHERE PlaylistID = ?`,
    )
    .get(playlistId) as { maxNo: number | null } | undefined

  let nextNo = (maxRow?.maxNo ?? 0) + 1

  const sqls: string[] = []
  const allParams: unknown[][] = []

  for (const contentId of contentIds) {
    sqls.push(
      `INSERT INTO djmdSongPlaylist (ID, ContentID, PlaylistID, TrackNo)
       VALUES (?, ?, ?, ?)`,
    )
    allParams.push([randomUUID(), contentId, playlistId, nextNo])
    nextNo++
  }

  return { sql: sqls, params: allParams }
}
