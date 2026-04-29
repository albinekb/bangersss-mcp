/**
 * Tests for Rekordbox track query functions.
 *
 * Uses a real in-memory SQLite database with mock Rekordbox schema to
 * exercise searchTracks, getTrack, and getTrackByPath.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'
import { searchTracks, getTrack, getTrackByPath } from '../../src/rekordbox/tracks.js'

describe('Rekordbox tracks', () => {
  let db: DatabaseType

  beforeAll(() => {
    db = new Database(':memory:')

    db.exec(`
      CREATE TABLE djmdContent (
        ID TEXT PRIMARY KEY,
        FolderPath TEXT,
        FileNameL TEXT,
        FileNameS TEXT,
        Title TEXT,
        ArtistID TEXT,
        AlbumID TEXT,
        GenreID TEXT,
        BPM REAL,
        Rating INTEGER,
        ReleaseYear INTEGER,
        ReleaseDate TEXT,
        ColorID INTEGER,
        Key INTEGER,
        StockDate TEXT,
        AnalysisDate TEXT,
        Duration REAL,
        BitRate INTEGER,
        BitDepth INTEGER,
        SampleRate INTEGER,
        Commnt TEXT,
        FileType INTEGER,
        TrackNo INTEGER
      );
      CREATE TABLE djmdArtist (ID TEXT PRIMARY KEY, Name TEXT);
      CREATE TABLE djmdAlbum (ID TEXT PRIMARY KEY, Name TEXT);
      CREATE TABLE djmdGenre (ID TEXT PRIMARY KEY, Name TEXT);
    `)

    // Seed artists
    const insertArtist = db.prepare('INSERT INTO djmdArtist (ID, Name) VALUES (?, ?)')
    insertArtist.run('a1', 'Disclosure')
    insertArtist.run('a2', 'Four Tet')
    insertArtist.run('a3', 'Bicep')

    // Seed genres
    const insertGenre = db.prepare('INSERT INTO djmdGenre (ID, Name) VALUES (?, ?)')
    insertGenre.run('g1', 'House')
    insertGenre.run('g2', 'Techno')
    insertGenre.run('g3', 'Electronica')

    // Seed tracks
    const insertTrack = db.prepare(`
      INSERT INTO djmdContent
        (ID, FolderPath, FileNameL, Title, ArtistID, GenreID, BPM, Rating, Key, Duration, TrackNo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insertTrack.run('t1', '/music/house/', 'latch.mp3', 'Latch', 'a1', 'g1', 122, 5, 8, 240, 1)
    insertTrack.run('t2', '/music/house/', 'white_noise.mp3', 'White Noise', 'a1', 'g1', 126, 4, 3, 210, 2)
    insertTrack.run('t3', '/music/techno/', 'baby.mp3', 'Baby', 'a2', 'g3', 130, 3, 5, 300, 1)
    insertTrack.run('t4', '/music/techno/', 'glue.mp3', 'Glue', 'a3', 'g2', 135, 5, 1, 280, 1)
    insertTrack.run('t5', null, null, 'No Path Track', 'a1', 'g1', 120, 2, 8, 180, 3)
  })

  afterAll(() => {
    db.close()
  })

  describe('searchTracks', () => {
    it('returns all tracks when no filters are specified', () => {
      const results = searchTracks(db, {})
      expect(results).toHaveLength(5)
      // Should be ordered by Title
      expect(results[0].Title).toBe('Baby')
      expect(results[4].Title).toBe('White Noise')
    })

    it('filters by title (case-insensitive LIKE)', () => {
      const results = searchTracks(db, { title: 'latch' })
      expect(results).toHaveLength(1)
      expect(results[0].ID).toBe('t1')
    })

    it('filters by artist name via join', () => {
      const results = searchTracks(db, { artist: 'Disclosure' })
      // t1, t2, and t5 all have ArtistID 'a1' -> 'Disclosure'
      expect(results).toHaveLength(3)
      expect(results.every((t) => t.ArtistID === 'a1')).toBe(true)
    })

    it('filters by genre name via join', () => {
      const results = searchTracks(db, { genre: 'Techno' })
      expect(results).toHaveLength(1)
      expect(results[0].Title).toBe('Glue')
    })

    it('filters by BPM range', () => {
      const results = searchTracks(db, { bpmRange: { min: 125, max: 132 } })
      expect(results).toHaveLength(2)
      const titles = results.map((t) => t.Title)
      expect(titles).toContain('White Noise')
      expect(titles).toContain('Baby')
    })

    it('filters by key', () => {
      const results = searchTracks(db, { key: 8 })
      expect(results).toHaveLength(2)
    })

    it('filters by rating', () => {
      const results = searchTracks(db, { rating: 5 })
      expect(results).toHaveLength(2)
      const titles = results.map((t) => t.Title)
      expect(titles).toContain('Latch')
      expect(titles).toContain('Glue')
    })

    it('combines multiple filters', () => {
      const results = searchTracks(db, {
        artist: 'Disclosure',
        bpmRange: { min: 120, max: 124 },
      })
      // t1 (Latch, BPM 122) and t5 (No Path Track, BPM 120) both match
      expect(results).toHaveLength(2)
      const titles = results.map((t) => t.Title)
      expect(titles).toContain('Latch')
      expect(titles).toContain('No Path Track')
    })

    it('returns empty array when nothing matches', () => {
      const results = searchTracks(db, { title: 'nonexistent' })
      expect(results).toHaveLength(0)
    })

    it('constructs FilePath from FolderPath + FileNameL', () => {
      const results = searchTracks(db, { title: 'Latch' })
      expect(results[0].FilePath).toBe('/music/house/latch.mp3')
    })

    it('FilePath is undefined when FolderPath or FileNameL is null', () => {
      const results = searchTracks(db, { title: 'No Path Track' })
      expect(results[0].FilePath).toBeUndefined()
    })
  })

  describe('getTrack', () => {
    it('returns a track by ID', () => {
      const track = getTrack(db, 't1')
      expect(track).not.toBeNull()
      expect(track!.Title).toBe('Latch')
      expect(track!.FilePath).toBe('/music/house/latch.mp3')
    })

    it('returns null for unknown ID', () => {
      const track = getTrack(db, 'nonexistent')
      expect(track).toBeNull()
    })

    it('handles track with null path fields', () => {
      const track = getTrack(db, 't5')
      expect(track).not.toBeNull()
      expect(track!.FilePath).toBeUndefined()
    })
  })

  describe('getTrackByPath', () => {
    it('returns a track by its full file path', () => {
      const track = getTrackByPath(db, '/music/house/latch.mp3')
      expect(track).not.toBeNull()
      expect(track!.ID).toBe('t1')
      expect(track!.FilePath).toBe('/music/house/latch.mp3')
    })

    it('returns null for unknown path', () => {
      const track = getTrackByPath(db, '/no/such/file.mp3')
      expect(track).toBeNull()
    })
  })
})
