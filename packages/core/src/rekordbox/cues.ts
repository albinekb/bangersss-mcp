/**
 * Rekordbox cue point queries.
 */

import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { RbCue } from './schema.js'

/**
 * Return all cue points for a given track (content ID).
 */
export function getCuePoints(db: Database, contentId: string): RbCue[] {
  return db
    .prepare(
      `SELECT ID, ContentID, InMsec, OutMsec, Kind, Color,
              ColorTableIndex, ActiveLoop, Comment, BeatLoopSize,
              CueLoopType, Hotcue
       FROM djmdCue
       WHERE ContentID = ?
       ORDER BY InMsec`,
    )
    .all(contentId) as RbCue[]
}

/**
 * Return only the hot cues (Kind > 0 and Hotcue is set) for a given track.
 */
export function getHotCues(db: Database, contentId: string): RbCue[] {
  return db
    .prepare(
      `SELECT ID, ContentID, InMsec, OutMsec, Kind, Color,
              ColorTableIndex, ActiveLoop, Comment, BeatLoopSize,
              CueLoopType, Hotcue
       FROM djmdCue
       WHERE ContentID = ? AND Hotcue IS NOT NULL AND Hotcue > 0
       ORDER BY Hotcue`,
    )
    .all(contentId) as RbCue[]
}
