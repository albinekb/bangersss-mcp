/**
 * Rekordbox database access.
 *
 * Rekordbox 6+ stores its library in a SQLCipher4-encrypted SQLite database
 * at ~/Library/Pioneer/rekordbox/master.db on macOS.
 *
 * NOTE: The standard `better-sqlite3` package cannot open SQLCipher-encrypted
 * databases. For production use, replace it with `better-sqlite3-multiple-ciphers`
 * which is a drop-in replacement that supports SQLCipher4. The API is identical.
 */

import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Known SQLCipher4 parameters used by Rekordbox 6+.
 * These must be applied via PRAGMA statements immediately after opening.
 */
export const SQLCIPHER4_PARAMS = {
  /** The cipher used by Rekordbox. */
  cipher: 'sqlcipher',
  /** SQLCipher compatibility mode. */
  cipherCompatibility: 4,
  /** KDF iterations used by Rekordbox. */
  kdfIter: 256000,
  /** HMAC algorithm. */
  hmacAlgorithm: 'HMAC_SHA512',
  /** KDF algorithm. */
  kdfAlgorithm: 'PBKDF2_HMAC_SHA512',
  /** Page size used by Rekordbox. */
  pageSize: 4096,
  /** Plaintext header size (Rekordbox does not use a plaintext header). */
  plaintextHeaderSize: 0,
} as const;

/**
 * Default Rekordbox database path on macOS.
 */
export const DEFAULT_REKORDBOX_DB_PATH = join(
  homedir(),
  'Library',
  'Pioneer',
  'rekordbox',
  'master.db',
);

/**
 * Attempt to auto-detect the Rekordbox master.db on the current system.
 * Returns the path if found, or null otherwise.
 */
export function findRekordboxDb(): string | null {
  if (existsSync(DEFAULT_REKORDBOX_DB_PATH)) {
    return DEFAULT_REKORDBOX_DB_PATH;
  }
  return null;
}

/**
 * Open the Rekordbox master.db database.
 *
 * When using `better-sqlite3-multiple-ciphers`, pass a `key` to unlock
 * the encrypted database. With plain `better-sqlite3` the database must
 * be unencrypted or pre-decrypted.
 *
 * @param dbPath - Path to master.db. Defaults to the standard macOS location.
 */
export function openRekordboxDb(dbPath?: string): DatabaseType {
  const resolvedPath = dbPath ?? DEFAULT_REKORDBOX_DB_PATH;

  if (!existsSync(resolvedPath)) {
    throw new Error(`Rekordbox database not found at: ${resolvedPath}`);
  }

  const db = new Database(resolvedPath, { readonly: true });

  // Enable WAL mode for better concurrent read performance.
  db.pragma('journal_mode = WAL');

  return db;
}

/**
 * Close a previously opened Rekordbox database connection.
 */
export function closeRekordboxDb(db: DatabaseType): void {
  db.close();
}
