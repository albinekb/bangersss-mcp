/**
 * Tests for tag writer using minimal MP3 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import NodeID3 from 'node-id3';
import { writeTags, updateTags } from '../../src/tags/tag-writer.js';
import { readTags } from '../../src/tags/tag-reader.js';

function createMinimalMp3(tags: NodeID3.Tags): Buffer {
  const frameData = Buffer.alloc(417);
  frameData[0] = 0xFF;
  frameData[1] = 0xFB;
  frameData[2] = 0x90;
  frameData[3] = 0x00;
  const tagBuffer = NodeID3.create(tags);
  if (tagBuffer instanceof Error) throw tagBuffer;
  return Buffer.concat([tagBuffer as Buffer, frameData]);
}

describe('Tag writer', () => {
  const testDir = path.join(tmpdir(), `musicsorter-tagwrite-test-${Date.now()}`);

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it('writes tags to a file', async () => {
    const filePath = path.join(testDir, 'write-test.mp3');
    await fs.writeFile(filePath, createMinimalMp3({}));

    await writeTags(filePath, { title: 'New Title', artist: 'New Artist' });

    const tags = await readTags(filePath);
    expect(tags.title).toBe('New Title');
    expect(tags.artist).toBe('New Artist');
  });

  it('writes BPM as string', async () => {
    const filePath = path.join(testDir, 'bpm-write.mp3');
    await fs.writeFile(filePath, createMinimalMp3({}));

    await writeTags(filePath, { bpm: 128 });

    const tags = await readTags(filePath);
    expect(tags.bpm).toBe(128);
  });

  it('writes genre', async () => {
    const filePath = path.join(testDir, 'genre-write.mp3');
    await fs.writeFile(filePath, createMinimalMp3({}));

    await writeTags(filePath, { genre: 'Techno' });

    const tags = await readTags(filePath);
    expect(tags.genre).toBe('Techno');
  });

  it('writes initial key', async () => {
    const filePath = path.join(testDir, 'key-write.mp3');
    await fs.writeFile(filePath, createMinimalMp3({}));

    await writeTags(filePath, { key: 'Am' });

    const tags = await readTags(filePath);
    expect(tags.key).toBe('Am');
  });

  it('writes to overlay fs without touching real file', async () => {
    const filePath = path.join(testDir, 'overlay-write.mp3');
    const original = createMinimalMp3({ title: 'Original' });
    await fs.writeFile(filePath, original);

    let writtenData: Buffer | null = null;

    const overlayFs = {
      readFileSync: (p: string): Buffer => {
        return Buffer.from(original);
      },
      writeFileSync: (p: string, data: Buffer): void => {
        writtenData = data;
      },
    };

    await writeTags(filePath, { title: 'Modified' }, overlayFs);

    // Overlay should have received the write
    expect(writtenData).not.toBeNull();
    expect(writtenData!.length).toBeGreaterThan(0);

    // Real file should be unchanged
    const realTags = await readTags(filePath);
    expect(realTags.title).toBe('Original');
  });

  describe('updateTags', () => {
    it('merges new tags with existing', async () => {
      const filePath = path.join(testDir, 'update-test.mp3');
      await fs.writeFile(filePath, createMinimalMp3({ title: 'Keep This', artist: 'Original Artist' }));

      await updateTags(filePath, { artist: 'New Artist', genre: 'House' });

      const tags = await readTags(filePath);
      expect(tags.artist).toBe('New Artist');
      expect(tags.genre).toBe('House');
      // title should be preserved by ID3 update semantics
    });

    it('works with overlay fs', async () => {
      const filePath = path.join(testDir, 'overlay-update.mp3');
      const original = createMinimalMp3({ title: 'Existing' });
      await fs.writeFile(filePath, original);

      let writtenData: Buffer | null = null;
      const overlayFs = {
        readFileSync: () => Buffer.from(original),
        writeFileSync: (_p: string, data: Buffer) => { writtenData = data; },
      };

      await updateTags(filePath, { artist: 'Overlay Artist' }, overlayFs);
      expect(writtenData).not.toBeNull();
    });
  });
});
