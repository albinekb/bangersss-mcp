/**
 * Tests for Engine DJ crate/playlist query and mutation functions.
 *
 * Uses an in-memory SQLite database with mock Engine DJ schema.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'
import {
  getCrates,
  getCrateTracks,
  createCrate,
  addToCrate,
} from '../../src/engine-dj/playlists.js'

describe('Engine DJ playlists (crates)', () => {
  let db: DatabaseType

  beforeAll(() => {
    db = new Database(':memory:')

    db.exec(`
      CREATE TABLE Track (
        id INTEGER PRIMARY KEY,
        path TEXT,
        filename TEXT,
        title TEXT,
        artist TEXT,
        album TEXT,
        genre TEXT,
        comment TEXT,
        bpm REAL,
        rating INTEGER,
        key INTEGER,
        year INTEGER,
        duration REAL,
        bitrate INTEGER,
        bpmAnalyzed REAL,
        trackType INTEGER,
        isExternalTrack INTEGER,
        uuid TEXT,
        lastPlayedAt INTEGER,
        isPlayed INTEGER,
        playOrder INTEGER,
        fileBytes INTEGER
      );
      CREATE TABLE Crate (
        id INTEGER PRIMARY KEY,
        title TEXT,
        path TEXT
      );
      CREATE TABLE CrateTrackList (
        crateId INTEGER,
        trackId INTEGER,
        PRIMARY KEY (crateId, trackId)
      );
    `)

    // Seed tracks
    const insertTrack = db.prepare(`
      INSERT INTO Track (id, path, filename, title, artist, genre, bpm, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insertTrack.run(1, '/music/track1.mp3', 'track1.mp3', 'Alpha', 'Artist A', 'House', 128, 300)
    insertTrack.run(2, '/music/track2.mp3', 'track2.mp3', 'Beta', 'Artist B', 'Techno', 140, 360)
    insertTrack.run(3, '/music/track3.mp3', 'track3.mp3', 'Gamma', 'Artist A', 'House', 126, 280)

    // Seed crates
    db.prepare('INSERT INTO Crate (id, title, path) VALUES (?, ?, ?)').run(1, 'Weekend Set', 'Root;Weekend Set;')
    db.prepare('INSERT INTO Crate (id, title, path) VALUES (?, ?, ?)').run(2, 'After Hours', 'Root;After Hours;')

    // Seed crate-track links
    db.prepare('INSERT INTO CrateTrackList (crateId, trackId) VALUES (?, ?)').run(1, 1)
    db.prepare('INSERT INTO CrateTrackList (crateId, trackId) VALUES (?, ?)').run(1, 2)
    db.prepare('INSERT INTO CrateTrackList (crateId, trackId) VALUES (?, ?)').run(2, 3)
  })

  afterAll(() => {
    db.close()
  })

  describe('getCrates', () => {
    it('returns all crates ordered by path', () => {
      const crates = getCrates(db)
      expect(crates).toHaveLength(2)
      expect(crates[0].title).toBe('After Hours')
      expect(crates[1].title).toBe('Weekend Set')
    })

    it('returns correct crate fields', () => {
      const crates = getCrates(db)
      const wknd = crates.find((c) => c.title === 'Weekend Set')!
      expect(wknd.id).toBe(1)
      expect(wknd.path).toBe('Root;Weekend Set;')
    })
  })

  describe('getCrateTracks', () => {
    it('returns tracks for a crate ordered by title', () => {
      const tracks = getCrateTracks(db, 1)
      expect(tracks).toHaveLength(2)
      expect(tracks[0].title).toBe('Alpha')
      expect(tracks[1].title).toBe('Beta')
    })

    it('returns tracks with full fields', () => {
      const tracks = getCrateTracks(db, 1)
      expect(tracks[0].path).toBe('/music/track1.mp3')
      expect(tracks[0].bpm).toBe(128)
    })

    it('returns empty array for empty crate', () => {
      // Insert a new empty crate
      db.prepare('INSERT INTO Crate (id, title, path) VALUES (?, ?, ?)').run(
        99,
        'Empty',
        'Root;Empty;',
      )
      const tracks = getCrateTracks(db, 99)
      expect(tracks).toHaveLength(0)
    })

    it('returns empty array for nonexistent crate', () => {
      const tracks = getCrateTracks(db, 9999)
      expect(tracks).toHaveLength(0)
    })
  })

  describe('createCrate', () => {
    it('returns SQL and params for creating a crate', () => {
      const result = createCrate(db, 'New Crate')
      expect(result.sql).toContain('INSERT INTO Crate')
      expect(result.params).toHaveLength(2)
      expect(result.params[0]).toBe('New Crate')
      expect(result.params[1]).toBe('Root;New Crate;')
    })

    it('can be executed to insert a real crate', () => {
      const result = createCrate(db, 'Executable Crate')
      db.prepare(result.sql).run(...result.params)

      const crate = db
        .prepare('SELECT * FROM Crate WHERE title = ?')
        .get('Executable Crate') as { title: string; path: string }
      expect(crate).toBeDefined()
      expect(crate.path).toBe('Root;Executable Crate;')
    })
  })

  describe('addToCrate', () => {
    it('returns SQL statements for adding tracks to a crate', () => {
      const result = addToCrate(db, 2, [1, 2])
      expect(result.sql).toHaveLength(2)
      expect(result.params).toHaveLength(2)
      expect(result.params[0]).toEqual([2, 1]) // [crateId, trackId]
      expect(result.params[1]).toEqual([2, 2])
    })

    it('returns empty arrays when no track IDs given', () => {
      const result = addToCrate(db, 2, [])
      expect(result.sql).toHaveLength(0)
      expect(result.params).toHaveLength(0)
    })

    it('can be executed to insert crate-track links', () => {
      const result = addToCrate(db, 2, [2])
      for (let i = 0; i < result.sql.length; i++) {
        db.prepare(result.sql[i]).run(...result.params[i])
      }

      const count = (
        db
          .prepare('SELECT COUNT(*) as count FROM CrateTrackList WHERE crateId = ?')
          .get(2) as { count: number }
      ).count
      expect(count).toBe(2) // was 1, now 2
    })
  })
})
