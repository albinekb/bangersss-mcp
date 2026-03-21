/**
 * Musical key detection using keyfinder-cli (wrapper around libKeyFinder).
 *
 * Requires `keyfinder-cli` to be installed and on PATH.
 * Install via: brew install evanpurkhiser/personal/keyfinder-cli
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, constants } from 'node:fs/promises';
import { getKeyInfo, type KeyInfo } from './keys.js';

const execFileAsync = promisify(execFile);

export interface KeyResult {
  /** Full key info (standard, camelot, openKey, short) or null if undetected. */
  key: KeyInfo | null;
  /** Raw output from keyfinder-cli. */
  raw: string;
}

/**
 * Verify that keyfinder-cli is reachable on the system PATH.
 */
async function assertKeyfinderAvailable(): Promise<void> {
  try {
    await execFileAsync('keyfinder-cli', [], { timeout: 5_000 });
  } catch (err: unknown) {
    // keyfinder-cli prints usage to stderr and exits 1 when called with no args,
    // but that still means it's installed. Only fail if it's not found at all.
    const isNotFound =
      err instanceof Error &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === 'ENOENT';

    const isDylibError =
      err instanceof Error &&
      err.message.includes('Library not loaded');

    if (isNotFound) {
      throw new Error(
        'keyfinder-cli is not installed or not found in PATH.\n\n' +
          'Install it:\n' +
          '  macOS:  brew install evanpurkhiser/personal/keyfinder-cli\n' +
          '  Linux:  build from source — https://github.com/evanpurkhiser/keyfinder-cli\n\n' +
          'See: https://github.com/evanpurkhiser/keyfinder-cli#building',
      );
    }

    if (isDylibError) {
      throw new Error(
        'keyfinder-cli is installed but has broken library links (likely an ffmpeg upgrade).\n\n' +
          'Fix it by rebuilding:\n' +
          '  brew upgrade evanpurkhiser/personal/keyfinder-cli\n\n' +
          'See: https://github.com/evanpurkhiser/keyfinder-cli',
      );
    }
  }
}

let keyfinderChecked = false;

/**
 * Analyze the musical key of an audio file.
 *
 * Spawns keyfinder-cli which uses libKeyFinder for high-quality key detection.
 * Output is normalized through the project's key notation system.
 *
 * @param filePath  Absolute path to an audio file.
 * @returns Detected key info and raw output.
 */
export async function analyzeKey(filePath: string): Promise<KeyResult> {
  if (!keyfinderChecked) {
    await assertKeyfinderAvailable();
    keyfinderChecked = true;
  }

  await access(filePath, constants.R_OK);

  // Use standard notation — keyfinder-cli outputs e.g. "Eb" for Eb major, "Dm" for D minor.
  const { stdout } = await execFileAsync('keyfinder-cli', [filePath], {
    timeout: 120_000,
  });

  const raw = stdout.trim();

  if (!raw) {
    // Silence or no detectable key
    return { key: null, raw: '' };
  }

  // keyfinder-cli outputs short forms like "A", "Eb", "Dm", "F#m"
  // "A" = A major, "Am" = A minor, "Eb" = Eb major, "Ebm" = Eb minor
  const key = getKeyInfo(raw) ?? getKeyInfo(raw + 'maj');

  return { key, raw };
}

/**
 * Analyze keys for multiple files with limited concurrency.
 *
 * @param filePaths    Absolute paths to audio files.
 * @param concurrency  Maximum number of parallel analyses (default 4).
 */
export async function batchAnalyzeKey(
  filePaths: string[],
  concurrency = 4,
): Promise<Map<string, KeyResult>> {
  const results = new Map<string, KeyResult>();
  const queue = [...filePaths];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const fp = queue.shift();
      if (!fp) break;
      try {
        const result = await analyzeKey(fp);
        results.set(fp, result);
      } catch {
        results.set(fp, { key: null, raw: '' });
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, filePaths.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return results;
}
