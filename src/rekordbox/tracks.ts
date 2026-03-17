/**
 * Rekordbox track queries.
 */

import type { Database } from 'better-sqlite3';
import type { RbTrack } from './schema.js';

export interface RbTrackQuery {
  artist?: string;
  title?: string;
  genre?: string;
  bpmRange?: { min: number; max: number };
  key?: number;
  rating?: number;
}

/**
 * Search for tracks in the Rekordbox library.
 *
 * Joins against djmdArtist, djmdAlbum, and djmdGenre so that text searches
 * work against resolved names rather than opaque IDs.
 */
export function searchTracks(db: Database, query: RbTrackQuery): RbTrack[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (query.title) {
    conditions.push('c.Title LIKE :title');
    params.title = `%${query.title}%`;
  }

  if (query.artist) {
    conditions.push('a.Name LIKE :artist');
    params.artist = `%${query.artist}%`;
  }

  if (query.genre) {
    conditions.push('g.Name LIKE :genre');
    params.genre = `%${query.genre}%`;
  }

  if (query.bpmRange) {
    conditions.push('c.BPM >= :bpmMin AND c.BPM <= :bpmMax');
    params.bpmMin = query.bpmRange.min;
    params.bpmMax = query.bpmRange.max;
  }

  if (query.key !== undefined) {
    conditions.push('c.Key = :key');
    params.key = query.key;
  }

  if (query.rating !== undefined) {
    conditions.push('c.Rating = :rating');
    params.rating = query.rating;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      c.ID, c.FolderPath, c.FileNameL, c.FileNameS,
      c.Title, c.ArtistID, c.AlbumID, c.GenreID,
      c.BPM, c.Rating, c.ReleaseYear, c.ReleaseDate,
      c.ColorID, c.Key, c.StockDate, c.AnalysisDate,
      c.Duration, c.BitRate, c.BitDepth, c.SampleRate,
      c.Commnt, c.FileType, c.TrackNo
    FROM djmdContent c
    LEFT JOIN djmdArtist a ON c.ArtistID = a.ID
    LEFT JOIN djmdGenre g ON c.GenreID = g.ID
    ${where}
    ORDER BY c.Title
  `;

  const rows = db.prepare(sql).all(params) as RbTrack[];

  return rows.map((row) => ({
    ...row,
    FilePath:
      row.FolderPath && row.FileNameL
        ? row.FolderPath + row.FileNameL
        : undefined,
  }));
}

/**
 * Retrieve a single track by its Rekordbox content ID.
 */
export function getTrack(db: Database, id: string): RbTrack | null {
  const row = db
    .prepare(
      `SELECT * FROM djmdContent WHERE ID = ?`,
    )
    .get(id) as RbTrack | undefined;

  if (!row) return null;

  return {
    ...row,
    FilePath:
      row.FolderPath && row.FileNameL
        ? row.FolderPath + row.FileNameL
        : undefined,
  };
}

/**
 * Retrieve a track by its file path.
 *
 * Rekordbox stores the folder and filename separately, so we match on
 * FolderPath || FileNameL.
 */
export function getTrackByPath(db: Database, path: string): RbTrack | null {
  const row = db
    .prepare(
      `SELECT * FROM djmdContent WHERE (FolderPath || FileNameL) = ?`,
    )
    .get(path) as RbTrack | undefined;

  if (!row) return null;

  return {
    ...row,
    FilePath:
      row.FolderPath && row.FileNameL
        ? row.FolderPath + row.FileNameL
        : undefined,
  };
}
