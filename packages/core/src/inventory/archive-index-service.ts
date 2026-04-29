import * as path from 'node:path'

import yauzl from 'yauzl'

import { isAudioFile } from '../util/audio-formats.js'
import type { ArchiveEntryRecord } from '../types/index.js'
import { AudioMetadataService } from './audio-metadata-service.js'

function openZip(filePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (error, zipfile) => {
      if (error || !zipfile) {
        reject(error ?? new Error(`Could not open zip archive: ${filePath}`))
        return
      }
      resolve(zipfile)
    })
  })
}

function readEntryBuffer(
  zipfile: yauzl.ZipFile,
  entry: yauzl.Entry,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error(`Could not read archive entry: ${entry.fileName}`))
        return
      }

      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
    })
  })
}

export class ArchiveIndexService {
  constructor(private readonly audioMetadata: AudioMetadataService) {}

  async indexZipArchive(filePath: string): Promise<{
    entryCount: number
    entries: ArchiveEntryRecord[]
  }> {
    const zipfile = await openZip(filePath)
    const entries: ArchiveEntryRecord[] = []

    return await new Promise((resolve, reject) => {
      zipfile.on('entry', (entry) => {
        void (async () => {
          try {
            const entryPath = entry.fileName
            const entryExtension = path.extname(entryPath).toLowerCase()
            const isDirectory = /\/$/.test(entryPath)
            const isAudioCandidate = !isDirectory && isAudioFile(entryPath)

            let audioMetadata: Record<string, unknown> | null = null
            let tagMetadata: Record<string, unknown> | null = null

            if (isAudioCandidate) {
              try {
                const buffer = await readEntryBuffer(zipfile, entry)
                const parsed = await this.audioMetadata.readBufferMetadata(buffer)
                audioMetadata = parsed.properties.rawFormat
                tagMetadata = parsed.tags.rawTags
              } catch {
                audioMetadata = null
                tagMetadata = null
              }
            }

            entries.push({
              id: '',
              archiveId: '',
              entryPath,
              entryBasename: path.basename(entryPath),
              entryExtension,
              isDirectory,
              uncompressedSizeBytes: entry.uncompressedSize ?? null,
              compressedSizeBytes: entry.compressedSize ?? null,
              modifiedAtArchive:
                entry.getLastModDate()?.toISOString?.() ?? null,
              crc32:
                typeof entry.crc32 === 'number'
                  ? entry.crc32.toString(16).padStart(8, '0')
                  : null,
              isAudioCandidate,
              audioMetadata,
              tagMetadata,
              entryHashSha256: null,
            })

            zipfile.readEntry()
          } catch (error) {
            zipfile.close()
            reject(error)
          }
        })()
      })

      zipfile.once('end', () => {
        zipfile.close()
        resolve({ entryCount: entries.length, entries })
      })

      zipfile.once('error', (error) => {
        zipfile.close()
        reject(error)
      })

      zipfile.readEntry()
    })
  }
}
