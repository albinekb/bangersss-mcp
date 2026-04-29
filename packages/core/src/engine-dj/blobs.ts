/**
 * Engine DJ blob compression utilities.
 *
 * Several columns in the Engine DJ database store binary data as
 * zlib-compressed blobs with a 4-byte uint32 little-endian prefix
 * indicating the uncompressed size.
 */

import { inflateSync, deflateSync } from 'node:zlib'

/**
 * Decompress an Engine DJ blob.
 *
 * Format: [4 bytes uint32-LE uncompressed size] [zlib compressed data]
 *
 * @param buf - The raw blob from the database.
 * @returns The decompressed data.
 */
export function decompressBlob(buf: Buffer): Buffer {
  if (buf.length < 4) {
    throw new Error(
      `Blob too small: expected at least 4 bytes, got ${buf.length}`,
    )
  }

  const _uncompressedSize = buf.readUInt32LE(0)
  const compressedData = buf.subarray(4)

  return Buffer.from(inflateSync(compressedData))
}

/**
 * Compress data into the Engine DJ blob format.
 *
 * Prepends a 4-byte uint32-LE header with the uncompressed size,
 * followed by the zlib-compressed payload.
 *
 * @param data - The raw data to compress.
 * @returns A buffer in Engine DJ blob format.
 */
export function compressBlob(data: Buffer): Buffer {
  const header = Buffer.alloc(4)
  header.writeUInt32LE(data.length, 0)

  const compressed = deflateSync(data)

  return Buffer.concat([header, compressed])
}
