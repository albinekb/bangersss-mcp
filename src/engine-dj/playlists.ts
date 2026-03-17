/**
 * Engine DJ crate and playlist queries and mutation helpers.
 *
 * Write operations return journaled SQL rather than executing directly.
 */

import type { Database } from 'better-sqlite3-multiple-ciphers';
import type { EdjCrate, EdjTrack } from './schema.js';

/**
 * Return all crates in the Engine DJ library.
 */
export function getCrates(db: Database): EdjCrate[] {
  return db
    .prepare('SELECT id, title, path FROM Crate ORDER BY path')
    .all() as EdjCrate[];
}

/**
 * Return all tracks belonging to a given crate.
 */
export function getCrateTracks(db: Database, crateId: number): EdjTrack[] {
  return db
    .prepare(
      `SELECT t.*
       FROM CrateTrackList ctl
       JOIN Track t ON ctl.trackId = t.id
       WHERE ctl.crateId = ?
       ORDER BY t.title`,
    )
    .all(crateId) as EdjTrack[];
}

/**
 * Build the SQL statement to create a new crate.
 *
 * @param name - Display name for the crate.
 */
export function createCrate(
  _db: Database,
  name: string,
): { sql: string; params: unknown[] } {
  const sql = `INSERT INTO Crate (title, path) VALUES (?, ?)`;
  const params: unknown[] = [name, `Root;${name};`];

  return { sql, params };
}

/**
 * Build the SQL statements to add tracks to a crate.
 *
 * @param crateId - Target crate ID.
 * @param trackIds - Array of Track IDs to add.
 */
export function addToCrate(
  _db: Database,
  crateId: number,
  trackIds: number[],
): { sql: string[]; params: unknown[][] } {
  const sqls: string[] = [];
  const allParams: unknown[][] = [];

  for (const trackId of trackIds) {
    sqls.push('INSERT INTO CrateTrackList (crateId, trackId) VALUES (?, ?)');
    allParams.push([crateId, trackId]);
  }

  return { sql: sqls, params: allParams };
}
