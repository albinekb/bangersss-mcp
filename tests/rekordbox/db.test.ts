import { describe, it, expect, afterAll } from 'vitest';
import { findRekordboxDb, DEFAULT_REKORDBOX_DB_PATH, openRekordboxDb, closeRekordboxDb } from '../../src/rekordbox/db.js';
import Database from 'better-sqlite3';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

describe('Rekordbox DB', () => {
  it('findRekordboxDb detects the real DB on this machine', () => {
    const dbPath = findRekordboxDb();
    // This machine has Rekordbox installed
    expect(dbPath).toBe(DEFAULT_REKORDBOX_DB_PATH);
  });

  it('openRekordboxDb throws on encrypted DB with plain better-sqlite3', () => {
    // The real Rekordbox DB is SQLCipher-encrypted, so plain better-sqlite3 will
    // fail to read it (it's not a valid unencrypted SQLite file)
    expect(() => {
      const db = openRekordboxDb();
      // If it somehow opens, try to query — it'll fail on encrypted data
      db.prepare('SELECT COUNT(*) FROM djmdContent').get();
    }).toThrow();
  });

  it('throws on non-existent path', () => {
    expect(() => openRekordboxDb('/nonexistent/master.db')).toThrow('not found');
  });
});

describe('Rekordbox DB with mock unencrypted SQLite', () => {
  const testDir = path.join(tmpdir(), `musicsorter-rb-test-${Date.now()}`);
  let db: ReturnType<typeof Database>;
  const dbPath = path.join(testDir, 'mock-master.db');

  afterAll(async () => {
    if (db) db.close();
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it('creates and queries a mock Rekordbox DB schema', async () => {
    await fs.mkdir(testDir, { recursive: true });

    db = new Database(dbPath);

    // Create minimal Rekordbox schema
    db.exec(`
      CREATE TABLE djmdContent (
        ID TEXT PRIMARY KEY,
        Title TEXT,
        ArtistID TEXT,
        AlbumID TEXT,
        GenreID TEXT,
        BPM REAL,
        Rating INTEGER,
        Key INTEGER,
        Duration REAL,
        FolderPath TEXT,
        FileNameL TEXT,
        FilePath TEXT
      );
      CREATE TABLE djmdArtist (ID TEXT PRIMARY KEY, Name TEXT);
      CREATE TABLE djmdAlbum (ID TEXT PRIMARY KEY, Name TEXT);
      CREATE TABLE djmdGenre (ID TEXT PRIMARY KEY, Name TEXT);
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
      CREATE TABLE djmdCue (
        ID TEXT PRIMARY KEY,
        ContentID TEXT,
        InMsec REAL,
        OutMsec REAL,
        Kind INTEGER,
        Color INTEGER,
        Hotcue INTEGER,
        Comment TEXT,
        ActiveLoop INTEGER,
        BeatLoopSize INTEGER
      );
    `);

    // Insert test data
    db.prepare(`INSERT INTO djmdArtist (ID, Name) VALUES (?, ?)`).run('a1', 'DJ Snake');
    db.prepare(`INSERT INTO djmdArtist (ID, Name) VALUES (?, ?)`).run('a2', 'Avicii');
    db.prepare(`INSERT INTO djmdGenre (ID, Name) VALUES (?, ?)`).run('g1', 'House');
    db.prepare(`INSERT INTO djmdGenre (ID, Name) VALUES (?, ?)`).run('g2', 'EDM');

    db.prepare(`INSERT INTO djmdContent (ID, Title, ArtistID, GenreID, BPM, Rating, Duration, FilePath) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('c1', 'Turn Down', 'a1', 'g1', 128, 5, 210, '/music/turn_down.mp3');
    db.prepare(`INSERT INTO djmdContent (ID, Title, ArtistID, GenreID, BPM, Rating, Duration, FilePath) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('c2', 'Levels', 'a2', 'g2', 126, 4, 195, '/music/levels.mp3');
    db.prepare(`INSERT INTO djmdContent (ID, Title, ArtistID, GenreID, BPM, Rating, Duration, FilePath) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('c3', 'Fade Into Darkness', 'a2', 'g2', 128, 3, 240, '/music/fade.mp3');

    db.prepare(`INSERT INTO djmdPlaylist (ID, Name, ParentID, Seq, Attribute) VALUES (?, ?, ?, ?, ?)`)
      .run('p1', 'My Set', '0', 1, 1);
    db.prepare(`INSERT INTO djmdSongPlaylist (ID, ContentID, PlaylistID, TrackNo) VALUES (?, ?, ?, ?)`)
      .run('sp1', 'c1', 'p1', 1);
    db.prepare(`INSERT INTO djmdSongPlaylist (ID, ContentID, PlaylistID, TrackNo) VALUES (?, ?, ?, ?)`)
      .run('sp2', 'c2', 'p1', 2);

    db.prepare(`INSERT INTO djmdCue (ID, ContentID, InMsec, Kind, Hotcue, Comment) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('cue1', 'c1', 15000, 0, 1, 'Drop');

    db.close();
    // Reopen readonly like the module does
    db = new Database(dbPath, { readonly: true });

    // Test queries (same as our rekordbox modules would run)
    const trackCount = (db.prepare('SELECT COUNT(*) as count FROM djmdContent').get() as { count: number }).count;
    expect(trackCount).toBe(3);
  });

  it('searches tracks by genre join', () => {
    const rows = db.prepare(`
      SELECT c.*, g.Name as GenreName
      FROM djmdContent c
      LEFT JOIN djmdGenre g ON c.GenreID = g.ID
      WHERE g.Name LIKE ?
    `).all('%EDM%');

    expect(rows).toHaveLength(2);
  });

  it('searches tracks by BPM range', () => {
    const rows = db.prepare(`
      SELECT * FROM djmdContent WHERE BPM >= ? AND BPM <= ?
    `).all(125, 128);

    expect(rows).toHaveLength(3);
  });

  it('lists playlists', () => {
    const playlists = db.prepare('SELECT * FROM djmdPlaylist WHERE Attribute = 1').all();
    expect(playlists).toHaveLength(1);
  });

  it('gets playlist tracks with join', () => {
    const tracks = db.prepare(`
      SELECT sp.TrackNo, c.Title, c.BPM
      FROM djmdSongPlaylist sp
      JOIN djmdContent c ON sp.ContentID = c.ID
      WHERE sp.PlaylistID = ?
      ORDER BY sp.TrackNo
    `).all('p1');

    expect(tracks).toHaveLength(2);
    expect((tracks[0] as { Title: string }).Title).toBe('Turn Down');
  });

  it('gets cue points', () => {
    const cues = db.prepare('SELECT * FROM djmdCue WHERE ContentID = ?').all('c1');
    expect(cues).toHaveLength(1);
    expect((cues[0] as { Comment: string }).Comment).toBe('Drop');
  });

  it('computes library stats', () => {
    const stats = db.prepare(`
      SELECT MIN(BPM) as minBpm, MAX(BPM) as maxBpm, AVG(BPM) as avgBpm
      FROM djmdContent WHERE BPM > 0
    `).get() as { minBpm: number; maxBpm: number; avgBpm: number };

    expect(stats.minBpm).toBe(126);
    expect(stats.maxBpm).toBe(128);
    expect(stats.avgBpm).toBeCloseTo(127.33, 1);
  });
});
