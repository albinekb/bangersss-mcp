import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'
import { CacheStore } from '../../src/cache/cache-store.js'

describe('CacheStore', () => {
  let cache: CacheStore
  let dbPath: string

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `bangersss-test-cache-${Date.now()}.db`)
    cache = new CacheStore(dbPath)
  })

  afterEach(() => {
    cache.close()
    try { fs.unlinkSync(dbPath) } catch {}
    try { fs.unlinkSync(dbPath + '-wal') } catch {}
    try { fs.unlinkSync(dbPath + '-shm') } catch {}
  })

  it('returns null for missing entries', () => {
    const result = cache.get('/nonexistent.mp3', { mtimeMs: 1000, size: 500 })
    expect(result).toBeNull()
  })

  it('stores and retrieves entries', () => {
    const filePath = '/music/track.mp3'
    const stat = { mtimeMs: 1700000000000, size: 5000000 }

    cache.set(filePath, stat, {
      tagsJson: JSON.stringify({ artist: 'Test', title: 'Song' }),
      bpm: 128,
      bpmConfidence: 0.95,
      keyStandard: 'A minor',
      keyCamelot: '8A',
      keyOpenkey: '1m',
    })

    const entry = cache.get(filePath, stat)
    expect(entry).not.toBeNull()
    expect(entry!.bpm).toBe(128)
    expect(entry!.bpmConfidence).toBe(0.95)
    expect(entry!.keyStandard).toBe('A minor')
    expect(entry!.keyCamelot).toBe('8A')
    expect(JSON.parse(entry!.tagsJson!)).toEqual({ artist: 'Test', title: 'Song' })
  })

  it('invalidates on mtime change', () => {
    const filePath = '/music/track.mp3'
    cache.set(filePath, { mtimeMs: 1000, size: 500 }, { bpm: 128 })

    // Different mtime -> cache miss
    const result = cache.get(filePath, { mtimeMs: 2000, size: 500 })
    expect(result).toBeNull()
  })

  it('invalidates on size change', () => {
    const filePath = '/music/track.mp3'
    cache.set(filePath, { mtimeMs: 1000, size: 500 }, { bpm: 128 })

    // Different size -> cache miss
    const result = cache.get(filePath, { mtimeMs: 1000, size: 600 })
    expect(result).toBeNull()
  })

  it('upserts existing entries', () => {
    const filePath = '/music/track.mp3'
    const stat = { mtimeMs: 1000, size: 500 }

    cache.set(filePath, stat, { bpm: 120 })
    cache.set(filePath, stat, { bpm: 128, keyStandard: 'C major' })

    const entry = cache.get(filePath, stat)
    expect(entry!.bpm).toBe(128)
    expect(entry!.keyStandard).toBe('C major')
  })

  it('deletes entries', () => {
    const filePath = '/music/track.mp3'
    const stat = { mtimeMs: 1000, size: 500 }

    cache.set(filePath, stat, { bpm: 128 })
    cache.delete(filePath)

    const result = cache.get(filePath, stat)
    expect(result).toBeNull()
  })

  it('clears all entries', () => {
    cache.set('/a.mp3', { mtimeMs: 1000, size: 100 }, { bpm: 120 })
    cache.set('/b.mp3', { mtimeMs: 2000, size: 200 }, { bpm: 128 })

    expect(cache.getStats().entries).toBe(2)
    cache.clear()
    expect(cache.getStats().entries).toBe(0)
  })

  it('returns stats', () => {
    cache.set('/a.mp3', { mtimeMs: 1000, size: 100 }, { bpm: 120 })
    cache.set('/b.mp3', { mtimeMs: 2000, size: 200 }, { bpm: 128 })

    const stats = cache.getStats()
    expect(stats.entries).toBe(2)
    expect(stats.dbPath).toBe(dbPath)
    expect(stats.sizeBytes).toBeGreaterThan(0)
  })
})
