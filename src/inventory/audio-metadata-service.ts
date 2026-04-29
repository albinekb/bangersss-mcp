import { parseBuffer, parseFile } from 'music-metadata'

import type { AudioProperties, AudioTags } from '../types/index.js'

function arrayValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) =>
      typeof entry === 'string'
        ? [entry]
        : entry && typeof entry === 'object' && 'text' in entry
          ? [String((entry as { text: unknown }).text)]
          : [],
    )
  }
  return []
}

function normalizeMetadata(
  metadata: Awaited<ReturnType<typeof parseFile>>,
  extractedAt: string,
): { properties: AudioProperties; tags: AudioTags } {
  const { common, format } = metadata
  const properties: AudioProperties = {
    fileId: '',
    containerFormat: format.container ?? null,
    codec: format.codec ?? null,
    durationSeconds: format.duration ?? null,
    bitrate: format.bitrate ?? null,
    sampleRate: format.sampleRate ?? null,
    bitsPerSample: format.bitsPerSample ?? null,
    channels: format.numberOfChannels ?? null,
    channelLayout: null,
    lossless: format.lossless ?? null,
    vbr: format.codecProfile?.toLowerCase().includes('vbr') ?? null,
    encoder:
      ((format as unknown as Record<string, unknown>).encoder as string | undefined) ??
      null,
    metadataSource: 'music-metadata',
    extractedAt,
    rawFormat: JSON.parse(JSON.stringify(format)) as Record<string, unknown>,
  }

  const tags: AudioTags = {
    fileId: '',
    title: common.title ?? null,
    artist: common.artist ?? null,
    album: common.album ?? null,
    albumArtist: common.albumartist ?? null,
    trackNumber: common.track.no ?? null,
    trackTotal: common.track.of ?? null,
    discNumber: common.disk.no ?? null,
    discTotal: common.disk.of ?? null,
    year: common.year ?? null,
    dateText: common.date ?? null,
    genre: common.genre ?? [],
    composer: common.composer ?? [],
    comment: arrayValue(common.comment),
    bpm: common.bpm ?? null,
    keyText:
      (common as unknown as Record<string, unknown>).initialKey?.toString() ??
      (common as unknown as Record<string, unknown>).key?.toString() ??
      null,
    label: common.label ?? [],
    catalogNumber: common.catalognumber ?? [],
    isrc: common.isrc ?? [],
    lyrics: arrayValue(common.lyrics),
    musicbrainzRecordingId: common.musicbrainz_recordingid ?? null,
    musicbrainzReleaseId:
      ((common as unknown as Record<string, unknown>).musicbrainz_releaseid as
        | string
        | undefined) ?? null,
    rawTags: JSON.parse(JSON.stringify(common)) as Record<string, unknown>,
    extractedAt,
  }

  return { properties, tags }
}

export class AudioMetadataService {
  async readFileMetadata(
    filePath: string,
  ): Promise<{ properties: AudioProperties; tags: AudioTags }> {
    const extractedAt = new Date().toISOString()
    const metadata = await parseFile(filePath, {
      includeChapters: false,
      skipCovers: true,
    })
    return normalizeMetadata(metadata, extractedAt)
  }

  async readBufferMetadata(
    buffer: Buffer,
    mimeType?: string,
  ): Promise<{ properties: AudioProperties; tags: AudioTags }> {
    const extractedAt = new Date().toISOString()
    const metadata = await parseBuffer(buffer, mimeType, {
      includeChapters: false,
      skipCovers: true,
    })
    return normalizeMetadata(metadata, extractedAt)
  }
}
