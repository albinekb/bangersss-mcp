import * as path from 'node:path'
import { getKeyInfo } from '../audio/keys.js'
import type { TrackMetadata } from '../tags/tag-reader.js'

/**
 * Sanitize a string for use as a filename component.
 * Replaces invalid characters and collapses whitespace.
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Format bytes into a human-readable string (e.g. "1.5 MB").
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  )
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/**
 * Build tag replacement map for template expansion.
 * Used by buildLibraryPath and batch_rename/organize_files.
 */
export function buildTagReplacements(tags: TrackMetadata): Record<string, string> {
  const replacements: Record<string, string> = {
    artist: tags.artist ?? 'Unknown Artist',
    title: tags.title ?? 'Unknown Title',
    album: tags.album ?? 'Unknown Album',
    genre: tags.genre ?? 'Unknown Genre',
    year: tags.year !== undefined ? String(tags.year) : 'Unknown Year',
    bpm: tags.bpm !== undefined ? String(Math.round(tags.bpm)) : 'Unknown BPM',
    key: tags.key ?? 'Unknown Key',
  }

  if (tags.key) {
    const keyInfo = getKeyInfo(tags.key)
    if (keyInfo) {
      replacements.camelot = keyInfo.camelot
      replacements.openkey = keyInfo.openKey
    }
  }

  return replacements
}

/**
 * Expand a template string with tag placeholders.
 * Replaces {artist}, {title}, {genre}, etc. with sanitized tag values.
 */
export function expandTemplate(template: string, tags: TrackMetadata): string {
  const replacements = buildTagReplacements(tags)
  let result = template
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(
      new RegExp(`\\{${key}\\}`, 'gi'),
      sanitizeFilename(value),
    )
  }
  return result
}

/**
 * Build the full library destination path for a track based on its tags and a template.
 *
 * @param libraryRoot - Root directory of the organized library
 * @param tags - Track metadata
 * @param template - Path template with placeholders, e.g. "{genre}/{artist}/{title}"
 * @param ext - File extension including dot, e.g. ".mp3"
 */
export function buildLibraryPath(
  libraryRoot: string,
  tags: TrackMetadata,
  template: string,
  ext: string,
): string {
  const expanded = expandTemplate(template, tags)
  return path.join(libraryRoot, `${expanded}${ext}`)
}
