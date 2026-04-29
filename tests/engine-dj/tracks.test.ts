/**
 * Tests for Engine DJ track query functions.
 *
 * Uses an in-memory SQLite database with mock Engine DJ schema.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'
import { searchTracks, getTrack } from '../../src/engine-dj/tracks.js'

describe('Engine DJ tracks', () => {
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
    `)

    const insert = db.prepare(`
      INSERT INTO Track
        (id, path, filename, title, artist, album, genre, bpm, rating, key, duration, year)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insert.run(1, '/music/house/latch.mp3', 'latch.mp3', 'Latch', 'Disclosure', 'Settle', 'House', 122, 5, 8, 240, 2013)
    insert.run(2, '/music/house/white_noise.mp3', 'white_noise.mp3', 'White Noise', 'Disclosure', 'Settle', 'House', 126, 4, 3, 210, 2013)
    insert.run(3, '/music/techno/baby.mp3', 'baby.mp3', 'Baby', 'Four Tet', 'Sixteen Oceans', 'Electronica', 130, 3, 5, 300, 2020)
    insert.run(4, '/music/techno/glue.mp3', 'glue.mp3', 'Glue', 'Bicep', 'Bicep', 'Techno', 135, 5, 1, 280, 2017)
    insert.run(5, '/music/misc/ambient.mp3', 'ambient.mp3', 'Ambient Track', 'Artist X', null, 'Ambient', 90, 2, 10, 600, 2022)
  })

  afterAll(() => {
    db.close()
  })

  describe('searchTracks', () => {
    it('returns all tracks when no filters given', () => {
      const results = searchTracks(db, {})
      expect(results).toHaveLength(5)
      // Should be ordered by title
      expect(results[0].title).toBe('Ambient Track')
    })

    it('filters by title', () => {
      const results = searchTracks(db, { title: 'Latch' })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe(1)
    })

    it('filters by artist', () => {
      const results = searchTracks(db, { artist: 'Disclosure' })
      expect(results).toHaveLength(2)
    })

    it('filters by genre', () => {
      const results = searchTracks(db, { genre: 'Techno' })
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Glue')
    })

    it('filters by BPM range', () => {
      const results = searchTracks(db, { bpmRange: { min: 125, max: 132 } })
      expect(results).toHaveLength(2)
      const titles = results.map((t) => t.title)
      expect(titles).toContain('White Noise')
      expect(titles).toContain('Baby')
    })

    it('filters by key', () => {
      const results = searchTracks(db, { key: 8 })
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Latch')
    })

    it('filters by rating', () => {
      const results = searchTracks(db, { rating: 5 })
      expect(results).toHaveLength(2)
    })

    it('combines multiple filters', () => {
      const results = searchTracks(db, {
        artist: 'Disclosure',
        bpmRange: { min: 120, max: 124 },
        rating: 5,
      })
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Latch')
    })

    it('returns empty array when nothing matches', () => {
      const results = searchTracks(db, { title: 'does not exist' })
      expect(results).toHaveLength(0)
    })

    it('partial title match works with LIKE', () => {
      const results = searchTracks(db, { title: 'White' })
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('White Noise')
    })
  })

  describe('getTrack', () => {
    it('returns a track by ID', () => {
      const track = getTrack(db, 1)
      expect(track).not.toBeNull()
      expect(track!.title).toBe('Latch')
      expect(track!.artist).toBe('Disclosure')
      expect(track!.bpm).toBe(122)
    })

    it('returns null for unknown ID', () => {
      const track = getTrack(db, 999)
      expect(track).toBeNull()
    })

    it('includes all expected fields', () => {
      const track = getTrack(db, 3)
      expect(track).not.toBeNull()
      expect(track!.path).toBe('/music/techno/baby.mp3')
      expect(track!.filename).toBe('baby.mp3')
      expect(track!.genre).toBe('Electronica')
      expect(track!.year).toBe(2020)
    })
  })
})
