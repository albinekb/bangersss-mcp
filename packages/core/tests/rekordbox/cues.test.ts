/**
 * Tests for Rekordbox cue point query functions.
 *
 * Uses an in-memory SQLite database with mock Rekordbox schema.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'
import { getCuePoints, getHotCues } from '../../src/rekordbox/cues.js'

describe('Rekordbox cues', () => {
  let db: DatabaseType

  beforeAll(() => {
    db = new Database(':memory:')

    db.exec(`
      CREATE TABLE djmdCue (
        ID TEXT PRIMARY KEY,
        ContentID TEXT,
        InMsec REAL,
        OutMsec REAL,
        Kind INTEGER,
        Color INTEGER,
        ColorTableIndex INTEGER,
        ActiveLoop INTEGER,
        Comment TEXT,
        BeatLoopSize INTEGER,
        CueLoopType INTEGER,
        Hotcue INTEGER
      );
    `)

    const insertCue = db.prepare(`
      INSERT INTO djmdCue
        (ID, ContentID, InMsec, OutMsec, Kind, Color, ColorTableIndex, ActiveLoop, Comment, BeatLoopSize, CueLoopType, Hotcue)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    // Track t1: memory cue (no hotcue), two hot cues, a loop
    insertCue.run('cue1', 't1', 0, null, 0, null, null, 0, 'Intro', null, 0, null)
    insertCue.run('cue2', 't1', 30000, null, 1, 1, 0, 0, 'Drop', null, 0, 1)
    insertCue.run('cue3', 't1', 60000, null, 2, 2, 1, 0, 'Buildup', null, 0, 2)
    insertCue.run('cue4', 't1', 90000, 98000, 0, null, null, 1, 'Loop', 4, 1, null)

    // Track t2: one hot cue
    insertCue.run('cue5', 't2', 5000, null, 1, 3, 2, 0, 'Start', null, 0, 1)

    // Track t3: no cues (nothing inserted)
  })

  afterAll(() => {
    db.close()
  })

  describe('getCuePoints', () => {
    it('returns all cue points for a track ordered by InMsec', () => {
      const cues = getCuePoints(db, 't1')
      expect(cues).toHaveLength(4)
      expect(cues[0].InMsec).toBe(0)
      expect(cues[1].InMsec).toBe(30000)
      expect(cues[2].InMsec).toBe(60000)
      expect(cues[3].InMsec).toBe(90000)
    })

    it('returns correct fields for each cue', () => {
      const cues = getCuePoints(db, 't1')
      const drop = cues[1]
      expect(drop.ID).toBe('cue2')
      expect(drop.ContentID).toBe('t1')
      expect(drop.Comment).toBe('Drop')
      expect(drop.Hotcue).toBe(1)
      expect(drop.Color).toBe(1)
    })

    it('returns empty array for track with no cues', () => {
      const cues = getCuePoints(db, 't3')
      expect(cues).toHaveLength(0)
    })

    it('returns empty array for nonexistent track', () => {
      const cues = getCuePoints(db, 'nonexistent')
      expect(cues).toHaveLength(0)
    })

    it('includes loop cues', () => {
      const cues = getCuePoints(db, 't1')
      const loop = cues.find((c) => c.ActiveLoop === 1)
      expect(loop).toBeDefined()
      expect(loop!.OutMsec).toBe(98000)
      expect(loop!.BeatLoopSize).toBe(4)
    })
  })

  describe('getHotCues', () => {
    it('returns only hot cues (Hotcue > 0)', () => {
      const hotCues = getHotCues(db, 't1')
      expect(hotCues).toHaveLength(2)
      expect(hotCues.every((c) => c.Hotcue !== null && c.Hotcue > 0)).toBe(true)
    })

    it('returns hot cues ordered by Hotcue number', () => {
      const hotCues = getHotCues(db, 't1')
      expect(hotCues[0].Hotcue).toBe(1)
      expect(hotCues[1].Hotcue).toBe(2)
    })

    it('returns single hot cue for track t2', () => {
      const hotCues = getHotCues(db, 't2')
      expect(hotCues).toHaveLength(1)
      expect(hotCues[0].Comment).toBe('Start')
    })

    it('returns empty array for track with no hot cues', () => {
      const hotCues = getHotCues(db, 't3')
      expect(hotCues).toHaveLength(0)
    })
  })
})
