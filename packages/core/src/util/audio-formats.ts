/**
 * Supported audio format definitions and helpers.
 */

export const SUPPORTED_FORMATS = [
  '.mp3',
  '.flac',
  '.wav',
  '.aiff',
  '.aif',
  '.m4a',
  '.ogg',
  '.wma',
  '.alac',
] as const

export type SupportedFormat = (typeof SUPPORTED_FORMATS)[number]

const formatSet = new Set<string>(SUPPORTED_FORMATS)

/**
 * Returns true if the file path ends with a supported audio extension.
 */
export function isAudioFile(path: string): boolean {
  const ext = getFormat(path)
  return ext !== null
}


/**
 * Returns the lowercase extension (including the dot) if it is a supported
 * audio format, or `null` otherwise.
 */
export function getFormat(path: string): string | null {
  const dot = path.lastIndexOf('.')
  if (dot === -1) return null
  const ext = path.slice(dot).toLowerCase()
  return formatSet.has(ext) ? ext : null
}
