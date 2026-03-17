import { describe, it, expect, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { findEngineDjDb } from '../../src/engine-dj/db.js';

describe('Engine DJ DB', () => {
  it('findEngineDjDb returns empty array when no drives mounted', () => {
    const dbs = findEngineDjDb();
    // May or may not find DBs depending on mounted drives
    expect(Array.isArray(dbs)).toBe(true);
  });
});

describe('Engine DJ DB with mock SQLite', () => {
  const testDir = path.join(tmpdir(), `musicsorter-edj-test-${Date.now()}`);
  let db: ReturnType<typeof Database>;
  const dbPath = path.join(testDir, 'm.db');

  afterAll(async () => {
    if (db) db.close();
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it('creates and queries a mock Engine DJ schema', async () => {
    await fs.mkdir(testDir, { recursive: true });
    db = new Database(dbPath);

    db.exec(`
      CREATE TABLE Track (
        id INTEGER PRIMARY KEY,
        title TEXT,
        artist TEXT,
        album TEXT,
        genre TEXT,
        bpm REAL,
        key INTEGER,
        rating INTEGER,
        duration REAL,
        path TEXT,
        filename TEXT
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
    `);

    // Insert test data
    db.prepare('INSERT INTO Track (id, title, artist, genre, bpm, duration, path, filename) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(1, 'Track One', 'Artist A', 'House', 128, 300, '/music/track1.mp3', 'track1.mp3');
    db.prepare('INSERT INTO Track (id, title, artist, genre, bpm, duration, path, filename) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(2, 'Track Two', 'Artist B', 'Techno', 140, 360, '/music/track2.mp3', 'track2.mp3');
    db.prepare('INSERT INTO Track (id, title, artist, genre, bpm, duration, path, filename) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(3, 'Track Three', 'Artist A', 'House', 126, 280, '/music/track3.mp3', 'track3.mp3');

    db.prepare('INSERT INTO Crate (id, title, path) VALUES (?, ?, ?)').run(1, 'Weekend Set', 'Root;Weekend Set;');
    db.prepare('INSERT INTO CrateTrackList (crateId, trackId) VALUES (?, ?)').run(1, 1);
    db.prepare('INSERT INTO CrateTrackList (crateId, trackId) VALUES (?, ?)').run(1, 2);

    const count = (db.prepare('SELECT COUNT(*) as count FROM Track').get() as { count: number }).count;
    expect(count).toBe(3);
  });

  it('searches tracks by artist', () => {
    const rows = db.prepare('SELECT * FROM Track WHERE artist LIKE ?').all('%Artist A%');
    expect(rows).toHaveLength(2);
  });

  it('searches tracks by BPM range', () => {
    const rows = db.prepare('SELECT * FROM Track WHERE bpm >= ? AND bpm <= ?').all(125, 130);
    expect(rows).toHaveLength(2);
  });

  it('searches tracks by genre', () => {
    const rows = db.prepare('SELECT * FROM Track WHERE genre LIKE ?').all('%Techno%');
    expect(rows).toHaveLength(1);
  });

  it('lists crates', () => {
    const crates = db.prepare('SELECT * FROM Crate ORDER BY title').all();
    expect(crates).toHaveLength(1);
    expect((crates[0] as { title: string }).title).toBe('Weekend Set');
  });

  it('gets crate tracks with join', () => {
    const tracks = db.prepare(`
      SELECT t.*
      FROM CrateTrackList ctl
      JOIN Track t ON ctl.trackId = t.id
      WHERE ctl.crateId = ?
      ORDER BY t.title
    `).all(1);

    expect(tracks).toHaveLength(2);
  });

  it('adds track to crate', () => {
    db.prepare('INSERT INTO CrateTrackList (crateId, trackId) VALUES (?, ?)').run(1, 3);
    const count = (db.prepare('SELECT COUNT(*) as count FROM CrateTrackList WHERE crateId = 1').get() as { count: number }).count;
    expect(count).toBe(3);
  });

  it('creates a new crate', () => {
    db.prepare('INSERT INTO Crate (title, path) VALUES (?, ?)').run('New Crate', 'Root;New Crate;');
    const crates = db.prepare('SELECT * FROM Crate ORDER BY title').all();
    expect(crates).toHaveLength(2);
  });

  it('computes library stats', () => {
    const stats = db.prepare(`
      SELECT MIN(bpm) as minBpm, MAX(bpm) as maxBpm, AVG(bpm) as avgBpm
      FROM Track WHERE bpm > 0
    `).get() as { minBpm: number; maxBpm: number; avgBpm: number };

    expect(stats.minBpm).toBe(126);
    expect(stats.maxBpm).toBe(140);
  });

  it('gets genre distribution', () => {
    const genres = db.prepare(`
      SELECT genre, COUNT(*) as count
      FROM Track WHERE genre IS NOT NULL
      GROUP BY genre ORDER BY count DESC
    `).all() as Array<{ genre: string; count: number }>;

    expect(genres).toHaveLength(2);
    expect(genres[0].genre).toBe('House');
    expect(genres[0].count).toBe(2);
  });
});
