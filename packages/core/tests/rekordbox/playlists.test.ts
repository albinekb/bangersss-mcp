/**
 * Tests for Rekordbox playlist query and mutation functions.
 *
 * Uses an in-memory SQLite database with mock Rekordbox schema.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'
import {
  getPlaylists,
  getPlaylistTracks,
  createPlaylist,
  addToPlaylist,
} from '../../src/rekordbox/playlists.js'

describe('Rekordbox playlists', () => {
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
      CREATE TABLE djmdPlaylist (
        ID TEXT PRIMARY KEY,
        Name TEXT,
        ParentID TEXT,
        Seq INTEGER,
        Attribute INTEGER
      );
      CREATE TABLE djmdSongPlaylist (
        ID TEXT PRIMARY KEY,
        ContentID TEXT,
        PlaylistID TEXT,
        TrackNo INTEGER
      );
    `)

    // Seed tracks
    const insertTrack = db.prepare(`
      INSERT INTO djmdContent (ID, FolderPath, FileNameL, Title, BPM, Duration)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    insertTrack.run('c1', '/music/', 'track1.mp3', 'First Track', 128, 240)
    insertTrack.run('c2', '/music/', 'track2.mp3', 'Second Track', 130, 210)
    insertTrack.run('c3', '/music/', 'track3.mp3', 'Third Track', 126, 300)

    // Seed playlists: a folder and two playlists
    const insertPlaylist = db.prepare(
      'INSERT INTO djmdPlaylist (ID, Name, ParentID, Seq, Attribute) VALUES (?, ?, ?, ?, ?)',
    )
    insertPlaylist.run('folder1', 'DJ Sets', '0', 1, 0) // folder
    insertPlaylist.run('pl1', 'Friday Night', 'folder1', 1, 1) // playlist
    insertPlaylist.run('pl2', 'Chill', '0', 2, 1) // root-level playlist

    // Seed playlist-track links
    const insertSong = db.prepare(
      'INSERT INTO djmdSongPlaylist (ID, ContentID, PlaylistID, TrackNo) VALUES (?, ?, ?, ?)',
    )
    insertSong.run('sp1', 'c1', 'pl1', 1)
    insertSong.run('sp2', 'c3', 'pl1', 2)
    insertSong.run('sp3', 'c2', 'pl2', 1)
  })

  afterAll(() => {
    db.close()
  })

  describe('getPlaylists', () => {
    it('returns all playlists and folders ordered by Seq', () => {
      const playlists = getPlaylists(db)
      expect(playlists).toHaveLength(3)
      // Seq order: DJ Sets (1), Friday Night (1), Chill (2)
      expect(playlists[0].Name).toBe('DJ Sets')
      expect(playlists[0].Attribute).toBe(0) // folder
    })

    it('includes both folders (Attribute=0) and playlists (Attribute=1)', () => {
      const playlists = getPlaylists(db)
      const folders = playlists.filter((p) => p.Attribute === 0)
      const lists = playlists.filter((p) => p.Attribute === 1)
      expect(folders).toHaveLength(1)
      expect(lists).toHaveLength(2)
    })
  })

  describe('getPlaylistTracks', () => {
    it('returns tracks for a playlist ordered by TrackNo', () => {
      const tracks = getPlaylistTracks(db, 'pl1')
      expect(tracks).toHaveLength(2)
      expect(tracks[0].Title).toBe('First Track')
      expect(tracks[1].Title).toBe('Third Track')
    })

    it('constructs FilePath from FolderPath + FileNameL', () => {
      const tracks = getPlaylistTracks(db, 'pl1')
      expect(tracks[0].FilePath).toBe('/music/track1.mp3')
    })

    it('returns empty array for playlist with no tracks', () => {
      // Insert an empty playlist
      db.prepare(
        'INSERT INTO djmdPlaylist (ID, Name, ParentID, Seq, Attribute) VALUES (?, ?, ?, ?, ?)',
      ).run('pl_empty', 'Empty Playlist', '0', 99, 1)

      const tracks = getPlaylistTracks(db, 'pl_empty')
      expect(tracks).toHaveLength(0)
    })

    it('returns empty array for nonexistent playlist', () => {
      const tracks = getPlaylistTracks(db, 'nonexistent')
      expect(tracks).toHaveLength(0)
    })
  })

  describe('createPlaylist', () => {
    it('returns SQL and params for a root-level playlist', () => {
      const result = createPlaylist(db, 'New Playlist')
      expect(result.sql).toContain('INSERT INTO djmdPlaylist')
      expect(result.params).toHaveLength(4)
      // params: [uuid, name, parentId, seq]
      expect(result.params[1]).toBe('New Playlist')
      expect(result.params[2]).toBe('0') // root
    })

    it('computes correct sequence number for root-level playlist', () => {
      const result = createPlaylist(db, 'Another Root')
      // Existing root-level playlists: DJ Sets (seq 1), Chill (seq 2), pl_empty (seq 99)
      const seq = result.params[3] as number
      expect(seq).toBe(100) // max seq under root is 99, so next is 100
    })

    it('returns SQL for a playlist under a parent folder', () => {
      const result = createPlaylist(db, 'Sub Playlist', 'folder1')
      expect(result.params[2]).toBe('folder1')
      // Only one child under folder1 (Friday Night, seq 1)
      expect(result.params[3]).toBe(2)
    })

    it('generates a UUID for the playlist ID', () => {
      const result = createPlaylist(db, 'UUID Test')
      const id = result.params[0] as string
      // UUID v4 format
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )
    })

    it('can be executed to insert a real playlist', () => {
      const result = createPlaylist(db, 'Executable Playlist')
      db.prepare(result.sql).run(...result.params)

      const inserted = db
        .prepare('SELECT * FROM djmdPlaylist WHERE Name = ?')
        .get('Executable Playlist') as { Name: string; Attribute: number }
      expect(inserted).toBeDefined()
      expect(inserted.Attribute).toBe(1)
    })
  })

  describe('addToPlaylist', () => {
    it('returns SQL statements for adding tracks', () => {
      const result = addToPlaylist(db, 'pl2', ['c1', 'c3'])
      expect(result.sql).toHaveLength(2)
      expect(result.params).toHaveLength(2)
      // Each params array: [uuid, contentId, playlistId, trackNo]
      expect(result.params[0][1]).toBe('c1')
      expect(result.params[0][2]).toBe('pl2')
    })

    it('computes correct starting TrackNo', () => {
      // pl2 already has one track (c2, TrackNo 1)
      const result = addToPlaylist(db, 'pl2', ['c1', 'c3'])
      expect(result.params[0][3]).toBe(2) // next after existing 1
      expect(result.params[1][3]).toBe(3)
    })

    it('starts at TrackNo 1 for empty playlist', () => {
      const result = addToPlaylist(db, 'pl_empty', ['c1'])
      expect(result.params[0][3]).toBe(1)
    })

    it('can be executed to insert playlist-track links', () => {
      const result = addToPlaylist(db, 'pl2', ['c3'])
      for (let i = 0; i < result.sql.length; i++) {
        db.prepare(result.sql[i]).run(...result.params[i])
      }

      const count = (
        db
          .prepare('SELECT COUNT(*) as count FROM djmdSongPlaylist WHERE PlaylistID = ?')
          .get('pl2') as { count: number }
      ).count
      expect(count).toBe(2) // was 1, now 2
    })
  })
})
