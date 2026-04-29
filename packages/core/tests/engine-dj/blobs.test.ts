import { describe, it, expect } from 'vitest'
import { decompressBlob, compressBlob } from '../../src/engine-dj/blobs.js'

describe('Engine DJ blob compression', () => {
  it('roundtrips compress and decompress', () => {
    const original = Buffer.from('Hello, Engine DJ! This is some track data.')
    const compressed = compressBlob(original)
    const decompressed = decompressBlob(compressed)
    expect(decompressed.toString()).toBe(original.toString())
  })

  it('compress prepends 4-byte size header', () => {
    const data = Buffer.from('test data')
    const blob = compressBlob(data)
    const storedSize = blob.readUInt32LE(0)
    expect(storedSize).toBe(data.length)
  })

  it('throws on blobs smaller than 4 bytes', () => {
    expect(() => decompressBlob(Buffer.from([0x01, 0x02]))).toThrow('too small')
  })

  it('handles empty data', () => {
    const empty = Buffer.alloc(0)
    const compressed = compressBlob(empty)
    const decompressed = decompressBlob(compressed)
    expect(decompressed.length).toBe(0)
  })

  it('handles large data', () => {
    const large = Buffer.alloc(100_000, 0x42)
    const compressed = compressBlob(large)
    // Compressed should be significantly smaller for repetitive data
    expect(compressed.length).toBeLessThan(large.length)
    const decompressed = decompressBlob(compressed)
    expect(decompressed.equals(large)).toBe(true)
  })
})
