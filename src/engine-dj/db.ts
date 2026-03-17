/**
 * Engine DJ database access.
 *
 * Engine DJ (Denon / Engine OS) stores its library in an unencrypted SQLite
 * database at `Engine Library/Database2/m.db` on each drive or USB stick.
 */

import Database from 'better-sqlite3-multiple-ciphers';
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Known Engine DJ database relative path within a volume.
 */
export const ENGINE_DJ_DB_RELATIVE_PATH = join(
  'Engine Library',
  'Database2',
  'm.db',
);

/**
 * Scan /Volumes for all mounted volumes that contain an Engine DJ database.
 * Returns an array of absolute paths to each m.db found.
 */
export function findEngineDjDb(): string[] {
  const volumesRoot = '/Volumes';
  const results: string[] = [];

  if (!existsSync(volumesRoot)) {
    return results;
  }

  let entries: string[];
  try {
    entries = readdirSync(volumesRoot);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const candidate = join(volumesRoot, entry, ENGINE_DJ_DB_RELATIVE_PATH);
    if (existsSync(candidate)) {
      results.push(candidate);
    }
  }

  return results;
}

/**
 * Open an Engine DJ database for reading.
 *
 * @param dbPath - Absolute path to the m.db file.
 */
export function openEngineDjDb(dbPath: string): DatabaseType {
  if (!existsSync(dbPath)) {
    throw new Error(`Engine DJ database not found at: ${dbPath}`);
  }

  const db = new Database(dbPath, { readonly: true });

  // Enable WAL mode for better concurrent read performance.
  db.pragma('journal_mode = WAL');

  return db;
}

/**
 * Close a previously opened Engine DJ database connection.
 */
export function closeEngineDjDb(db: DatabaseType): void {
  db.close();
}
