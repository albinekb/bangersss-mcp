/**
 * Read audio metadata tags using the music-metadata package.
 */

import { parseFile } from 'music-metadata';

export interface TrackMetadata {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: number;
  bpm?: number;
  key?: string;
  comment?: string;
  duration?: number;
  format: string;
  bitrate?: number;
  sampleRate?: number;
}

/**
 * Read metadata tags from a single audio file.
 *
 * @param filePath  Absolute path to the audio file.
 * @returns Parsed metadata.
 */
export async function readTags(filePath: string): Promise<TrackMetadata> {
  const metadata = await parseFile(filePath);

  const { common, format } = metadata;

  const genre = common.genre?.[0];
  const comment = common.comment?.[0]?.text ?? common.comment?.[0] as string | undefined;

  return {
    title: common.title,
    artist: common.artist,
    album: common.album,
    genre,
    year: common.year,
    bpm: common.bpm,
    key: (common as unknown as Record<string, unknown>).key as string | undefined,
    comment: typeof comment === 'string' ? comment : undefined,
    duration: format.duration,
    format: format.codec ?? format.container ?? 'unknown',
    bitrate: format.bitrate,
    sampleRate: format.sampleRate,
  };
}

/**
 * Read tags for multiple files. Failures for individual files are silently
 * skipped (the file will be absent from the returned map).
 *
 * @param filePaths  Absolute paths to audio files.
 * @returns Map from file path to parsed metadata.
 */
export async function batchReadTags(
  filePaths: string[],
): Promise<Map<string, TrackMetadata>> {
  const results = new Map<string, TrackMetadata>();

  const tasks = filePaths.map(async (fp) => {
    try {
      const tags = await readTags(fp);
      results.set(fp, tags);
    } catch {
      // Skip files that fail to parse.
    }
  });

  await Promise.all(tasks);
  return results;
}
