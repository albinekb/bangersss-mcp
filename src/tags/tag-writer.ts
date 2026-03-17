/**
 * Write / update ID3 tags using the node-id3 package.
 *
 * Supports an optional overlay filesystem for non-destructive editing.
 */

import NodeID3 from 'node-id3';
import { readFile, writeFile } from 'node:fs/promises';
import { readTags } from './tag-reader.js';
import type { TrackMetadata } from './tag-reader.js';

export type { TrackMetadata } from './tag-reader.js';

/**
 * Minimal filesystem interface used when writing to an overlay.
 * Compatible with memfs / unionfs.
 */
export interface OverlayFs {
  readFileSync(path: string): Buffer;
  writeFileSync(path: string, data: Buffer): void;
}

/**
 * Map our TrackMetadata fields to node-id3 tag names.
 */
function toId3Tags(tags: Partial<TrackMetadata>): NodeID3.Tags {
  const id3: NodeID3.Tags = {};

  if (tags.title !== undefined) id3.title = tags.title;
  if (tags.artist !== undefined) id3.artist = tags.artist;
  if (tags.album !== undefined) id3.album = tags.album;
  if (tags.genre !== undefined) id3.genre = tags.genre;
  if (tags.year !== undefined) id3.year = String(tags.year);
  if (tags.bpm !== undefined) id3.bpm = String(tags.bpm);
  if (tags.key !== undefined) id3.initialKey = tags.key;
  if (tags.comment !== undefined) {
    id3.comment = {
      language: 'eng',
      text: tags.comment,
    };
  }

  return id3;
}

/**
 * Write tags to an audio file, **replacing** all existing ID3 tags.
 *
 * @param filePath   Absolute path to the audio file.
 * @param tags       Tag values to write.
 * @param overlayFs  Optional overlay filesystem — when provided the file is
 *                   read from / written to the overlay instead of the real fs.
 */
export async function writeTags(
  filePath: string,
  tags: Partial<TrackMetadata>,
  overlayFs?: OverlayFs,
): Promise<void> {
  const id3 = toId3Tags(tags);

  if (overlayFs) {
    const buffer = overlayFs.readFileSync(filePath);
    const updated = NodeID3.update(id3, buffer);
    if (updated instanceof Error) throw updated;
    overlayFs.writeFileSync(filePath, updated as Buffer);
  } else {
    const success = NodeID3.write(id3, filePath);
    if (success instanceof Error) throw success;
  }
}

/**
 * Update tags on an audio file, **merging** the supplied values with
 * existing tags (existing values not present in `tags` are preserved).
 *
 * @param filePath   Absolute path to the audio file.
 * @param tags       Tag values to merge in.
 * @param overlayFs  Optional overlay filesystem.
 */
export async function updateTags(
  filePath: string,
  tags: Partial<TrackMetadata>,
  overlayFs?: OverlayFs,
): Promise<void> {
  const id3 = toId3Tags(tags);

  if (overlayFs) {
    const buffer = overlayFs.readFileSync(filePath);
    const updated = NodeID3.update(id3, buffer);
    if (updated instanceof Error) throw updated;
    overlayFs.writeFileSync(filePath, updated as Buffer);
  } else {
    const buffer = await readFile(filePath);
    const updated = NodeID3.update(id3, buffer);
    if (updated instanceof Error) throw updated;
    await writeFile(filePath, updated as Buffer);
  }
}
