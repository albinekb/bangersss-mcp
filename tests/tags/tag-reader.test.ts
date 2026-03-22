/**
 * Tests for tag reader using minimal MP3 files with ID3 tags.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { tmpdir } from 'node:os'
import NodeID3 from 'node-id3'
import { readTags, batchReadTags } from '../../src/tags/tag-reader.js'

function createMinimalMp3(tags: NodeID3.Tags): Buffer {
  const frameData = Buffer.alloc(417)
  // MPEG1 Layer3 frame header
  frameData[0] = 0xff
  frameData[1] = 0xfb
  frameData[2] = 0x90
  frameData[3] = 0x00

  const tagBuffer = NodeID3.create(tags)
  if (tagBuffer instanceof Error) throw tagBuffer
  return Buffer.concat([tagBuffer as Buffer, frameData])
}

describe('Tag reader', () => {
  const testDir = path.join(tmpdir(), `musicsorter-tag-test-${Date.now()}`)

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true })
  })

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {})
  })

  it('reads title and artist', async () => {
    const mp3 = createMinimalMp3({
      title: 'Test Track',
      artist: 'Test Artist',
    })
    const filePath = path.join(testDir, 'basic.mp3')
    await fs.writeFile(filePath, mp3)

    const tags = await readTags(filePath)
    expect(tags.title).toBe('Test Track')
    expect(tags.artist).toBe('Test Artist')
  })

  it('reads genre and album', async () => {
    const mp3 = createMinimalMp3({
      title: 'T',
      artist: 'A',
      genre: 'House',
      album: 'Summer Mix',
    })
    const filePath = path.join(testDir, 'genre.mp3')
    await fs.writeFile(filePath, mp3)

    const tags = await readTags(filePath)
    expect(tags.genre).toBe('House')
    expect(tags.album).toBe('Summer Mix')
  })

  it('reads BPM', async () => {
    const mp3 = createMinimalMp3({ title: 'Fast', bpm: '140' })
    const filePath = path.join(testDir, 'bpm.mp3')
    await fs.writeFile(filePath, mp3)

    const tags = await readTags(filePath)
    expect(tags.bpm).toBe(140)
  })

  it('reads year', async () => {
    const mp3 = createMinimalMp3({ title: 'Classic', year: '2020' })
    const filePath = path.join(testDir, 'year.mp3')
    await fs.writeFile(filePath, mp3)

    const tags = await readTags(filePath)
    expect(tags.year).toBe(2020)
  })

  it('reads initial key', async () => {
    const mp3 = createMinimalMp3({ title: 'Keyed', initialKey: 'Am' })
    const filePath = path.join(testDir, 'key.mp3')
    await fs.writeFile(filePath, mp3)

    const tags = await readTags(filePath)
    expect(tags.key).toBe('Am')
  })

  it('handles file with no tags', async () => {
    const mp3 = createMinimalMp3({})
    const filePath = path.join(testDir, 'empty.mp3')
    await fs.writeFile(filePath, mp3)

    const tags = await readTags(filePath)
    expect(tags.title).toBeUndefined()
    expect(tags.artist).toBeUndefined()
    expect(tags.format).toBeTruthy() // should still detect format
  })

  it('throws on non-existent file', async () => {
    await expect(readTags('/nonexistent/file.mp3')).rejects.toThrow()
  })

  it('throws on non-audio file', async () => {
    const textFile = path.join(testDir, 'not-audio.txt')
    await fs.writeFile(textFile, 'not audio')
    await expect(readTags(textFile)).rejects.toThrow()
  })

  describe('batchReadTags', () => {
    it('reads multiple files', async () => {
      const file1 = path.join(testDir, 'batch1.mp3')
      const file2 = path.join(testDir, 'batch2.mp3')
      await fs.writeFile(
        file1,
        createMinimalMp3({ title: 'Batch One', artist: 'Artist A' }),
      )
      await fs.writeFile(
        file2,
        createMinimalMp3({ title: 'Batch Two', artist: 'Artist B' }),
      )

      const results = await batchReadTags([file1, file2])
      expect(results.size).toBe(2)
      expect(results.get(file1)?.title).toBe('Batch One')
      expect(results.get(file2)?.title).toBe('Batch Two')
    })

    it('skips files that fail to parse', async () => {
      const good = path.join(testDir, 'batch-good.mp3')
      await fs.writeFile(good, createMinimalMp3({ title: 'Good' }))

      const results = await batchReadTags([good, '/nonexistent/bad.mp3'])
      expect(results.size).toBe(1)
      expect(results.has(good)).toBe(true)
    })

    it('handles empty input', async () => {
      const results = await batchReadTags([])
      expect(results.size).toBe(0)
    })
  })
})
