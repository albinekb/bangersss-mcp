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
 * Path segments (case-insensitive) that indicate sample packs, loops, or
 * DAW content rather than full DJ tracks.
 */
const SAMPLE_PACK_KEYWORDS = [
  'samples',
  'sample pack',
  'sample packs',
  'samplepack',
  'samplepacks',
  'loops',
  'loop pack',
  'one shots',
  'one-shots',
  'oneshots',
  'one shot',
  'one-shot',
  'oneshot',
  'drum kit',
  'drum kits',
  'drumkit',
  'drumkits',
  'sound design',
  'sound effects',
  'sfx',
  'foley',
  'risers',
  'fills',
  'fx',
  'kicks',
  'snares',
  'hihats',
  'hi-hats',
  'claps',
  'percs',
  'percussion',
  'cymbal',
  'cymbals',
  'tops',
  'stabs',
  'textures',
  'atmospheres',
  'atmos',
  'vocals',
  'vocal chops',
  'acapella',
  'stems',
  'midi',
  // DAW / vendor content
  'ableton',
  'live packs',
  'packs',
  'splice',
  'cymatics',
  'vengeance',
  'loopmasters',
  'native instruments',
  'kontakt',
  'maschine',
  'battery',
  'serato sample',
  'logic pro',
  'garageband',
  'fl studio',
  'preset',
  'presets',
]

const samplePackPattern = new RegExp(
  SAMPLE_PACK_KEYWORDS.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'i',
)

/**
 * Returns true if the file path looks like it belongs to a sample pack,
 * loop library, or DAW content folder rather than being a full DJ track.
 *
 * Checks path segments (folder names) against known keywords.
 */
export function isSamplePackPath(filePath: string): boolean {
  // Normalize separators and check directory parts only (not the filename
  // itself, since a track called "Samples of Funk.mp3" is probably legit).
  const normalized = filePath.replace(/\\/g, '/')
  const dirPart = normalized.slice(0, normalized.lastIndexOf('/'))
  return samplePackPattern.test(dirPart)
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
