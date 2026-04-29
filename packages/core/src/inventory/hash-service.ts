import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

export class HashService {
  async computeSha256(filePath: string): Promise<{ hash: string; byteCount: number }> {
    const hash = createHash('sha256')
    let byteCount = 0

    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(filePath)
      stream.on('data', (chunk: Buffer) => {
        hash.update(chunk)
        byteCount += chunk.length
      })
      stream.on('end', () => resolve())
      stream.on('error', reject)
    })

    return { hash: hash.digest('hex'), byteCount }
  }

  computeBufferSha256(buffer: Buffer): { hash: string; byteCount: number } {
    return {
      hash: createHash('sha256').update(buffer).digest('hex'),
      byteCount: buffer.length,
    }
  }
}
