/**
 * Musical key definitions and Camelot wheel mapping.
 *
 * The Camelot wheel is a visual tool DJs use for harmonic mixing.
 * Each key gets a number (1-12) and a letter (A for minor, B for major).
 * Adjacent keys on the wheel are harmonically compatible.
 */

export interface KeyInfo {
  /** Standard key notation, e.g. "C major", "A minor" */
  standard: string
  /** Open Key notation, e.g. "1d", "6m" */
  openKey: string
  /** Camelot notation, e.g. "8B", "1A" */
  camelot: string
  /** Short notation, e.g. "Cmaj", "Amin" */
  short: string
}

// Maps standard key names -> Camelot code
const KEY_TO_CAMELOT: Record<string, string> = {
  // Major keys
  'B major': '1B',
  'F# major': '2B',
  'Gb major': '2B',
  'Db major': '3B',
  'C# major': '3B',
  'Ab major': '4B',
  'G# major': '4B',
  'Eb major': '5B',
  'D# major': '5B',
  'Bb major': '6B',
  'A# major': '6B',
  'F major': '7B',
  'C major': '8B',
  'G major': '9B',
  'D major': '10B',
  'A major': '11B',
  'E major': '12B',
  // Minor keys
  'G# minor': '1A',
  'Ab minor': '1A',
  'Eb minor': '2A',
  'D# minor': '2A',
  'Bb minor': '3A',
  'A# minor': '3A',
  'F minor': '4A',
  'C minor': '5A',
  'G minor': '6A',
  'D minor': '7A',
  'A minor': '8A',
  'E minor': '9A',
  'B minor': '10A',
  'F# minor': '11A',
  'Gb minor': '11A',
  'C# minor': '12A',
  'Db minor': '12A',
}

// Maps Camelot code -> standard key name
const CAMELOT_TO_KEY: Record<string, string> = {
  '1B': 'B major',
  '2B': 'F# major',
  '3B': 'Db major',
  '4B': 'Ab major',
  '5B': 'Eb major',
  '6B': 'Bb major',
  '7B': 'F major',
  '8B': 'C major',
  '9B': 'G major',
  '10B': 'D major',
  '11B': 'A major',
  '12B': 'E major',
  '1A': 'Ab minor',
  '2A': 'Eb minor',
  '3A': 'Bb minor',
  '4A': 'F minor',
  '5A': 'C minor',
  '6A': 'G minor',
  '7A': 'D minor',
  '8A': 'A minor',
  '9A': 'E minor',
  '10A': 'B minor',
  '11A': 'F# minor',
  '12A': 'C# minor',
}

// Maps Camelot code -> Open Key notation
const CAMELOT_TO_OPEN_KEY: Record<string, string> = {
  '1B': '6d',
  '2B': '7d',
  '3B': '8d',
  '4B': '9d',
  '5B': '10d',
  '6B': '11d',
  '7B': '12d',
  '8B': '1d',
  '9B': '2d',
  '10B': '3d',
  '11B': '4d',
  '12B': '5d',
  '1A': '6m',
  '2A': '7m',
  '3A': '8m',
  '4A': '9m',
  '5A': '10m',
  '6A': '11m',
  '7A': '12m',
  '8A': '1m',
  '9A': '2m',
  '10A': '3m',
  '11A': '4m',
  '12A': '5m',
}

const SHORT_KEY_MAP: Record<string, string> = {
  // Major short forms
  Bmaj: 'B major',
  'F#maj': 'F# major',
  Gbmaj: 'Gb major',
  Dbmaj: 'Db major',
  'C#maj': 'C# major',
  Abmaj: 'Ab major',
  'G#maj': 'G# major',
  Ebmaj: 'Eb major',
  'D#maj': 'D# major',
  Bbmaj: 'Bb major',
  'A#maj': 'A# major',
  Fmaj: 'F major',
  Cmaj: 'C major',
  Gmaj: 'G major',
  Dmaj: 'D major',
  Amaj: 'A major',
  Emaj: 'E major',
  // Minor short forms
  'G#min': 'G# minor',
  Abmin: 'Ab minor',
  Ebmin: 'Eb minor',
  'D#min': 'D# minor',
  Bbmin: 'Bb minor',
  'A#min': 'A# minor',
  Fmin: 'F minor',
  Cmin: 'C minor',
  Gmin: 'G minor',
  Dmin: 'D minor',
  Amin: 'A minor',
  Emin: 'E minor',
  Bmin: 'B minor',
  'F#min': 'F# minor',
  Gbmin: 'Gb minor',
  'C#min': 'C# minor',
  Dbmin: 'Db minor',
}

/**
 * Normalize a key string to standard form ("X major" or "X minor").
 * Accepts: "8B", "1A", "Cmaj", "Amin", "C major", "A minor", "Cm", "Am", "1d", "6m"
 */
export function normalizeKey(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Already standard form?
  if (KEY_TO_CAMELOT[trimmed]) return trimmed

  // Camelot notation: "8B", "1A", "10B" etc.
  const camelotMatch = trimmed.match(/^(\d{1,2})([AB])$/i)
  if (camelotMatch) {
    const code = `${camelotMatch[1]}${camelotMatch[2].toUpperCase()}`
    return CAMELOT_TO_KEY[code] ?? null
  }

  // Open Key notation: "1d", "6m", "10d" etc.
  const openKeyMatch = trimmed.match(/^(\d{1,2})([dm])$/i)
  if (openKeyMatch) {
    const num = parseInt(openKeyMatch[1], 10)
    const letter = openKeyMatch[2].toLowerCase()
    // Convert Open Key to Camelot first
    for (const [camelot, ok] of Object.entries(CAMELOT_TO_OPEN_KEY)) {
      if (ok === `${num}${letter}`) {
        return CAMELOT_TO_KEY[camelot] ?? null
      }
    }
    return null
  }

  // Short form: "Cmaj", "Amin", "F#min" etc.
  if (SHORT_KEY_MAP[trimmed]) {
    return SHORT_KEY_MAP[trimmed]
  }

  // Try "Xm" for minor (e.g. "Am", "F#m")
  const minorShortMatch = trimmed.match(/^([A-G][#b]?)m$/i)
  if (minorShortMatch) {
    const note =
      minorShortMatch[1].charAt(0).toUpperCase() + minorShortMatch[1].slice(1)
    const standard = `${note} minor`
    if (KEY_TO_CAMELOT[standard]) return standard
  }

  return null
}

/**
 * Get full key information from any key notation.
 */
export function getKeyInfo(input: string): KeyInfo | null {
  const standard = normalizeKey(input)
  if (!standard) return null

  const camelot = KEY_TO_CAMELOT[standard]
  if (!camelot) return null

  const openKey = CAMELOT_TO_OPEN_KEY[camelot]
  const isMinor = standard.includes('minor')
  const note = standard.replace(/ (major|minor)$/, '')
  const short = `${note}${isMinor ? 'min' : 'maj'}`

  return { standard, openKey, camelot, short }
}

/**
 * Convert any key notation to Camelot.
 */
export function toCamelot(input: string): string | null {
  return getKeyInfo(input)?.camelot ?? null
}

/**
 * Convert any key notation to Open Key.
 */
export function toOpenKey(input: string): string | null {
  return getKeyInfo(input)?.openKey ?? null
}

/**
 * Get harmonically compatible keys (for mixing) from a Camelot code.
 *
 * Compatible keys:
 * - Same position (same key)
 * - +1 on the wheel (one semitone up in the circle of fifths)
 * - -1 on the wheel (one semitone down)
 * - Relative major/minor (same number, switch A/B)
 */
export function getCompatibleKeys(input: string): KeyInfo[] {
  const info = getKeyInfo(input)
  if (!info) return []

  const match = info.camelot.match(/^(\d{1,2})([AB])$/)
  if (!match) return []

  const num = parseInt(match[1], 10)
  const letter = match[2]

  const compatible: string[] = []

  // Same key
  compatible.push(info.camelot)

  // +1 on wheel
  const plus1 = (num % 12) + 1 || 12
  compatible.push(`${plus1}${letter}`)

  // -1 on wheel
  const minus1 = ((num - 2 + 12) % 12) + 1
  compatible.push(`${minus1}${letter}`)

  // Relative major/minor
  const otherLetter = letter === 'A' ? 'B' : 'A'
  compatible.push(`${num}${otherLetter}`)

  return compatible
    .map((code) => {
      const std = CAMELOT_TO_KEY[code]
      if (!std) return null
      return getKeyInfo(std)
    })
    .filter((k): k is KeyInfo => k !== null)
}

/**
 * Check if two keys are harmonically compatible for mixing.
 */
export function areKeysCompatible(key1: string, key2: string): boolean {
  const info1 = getKeyInfo(key1)
  const info2 = getKeyInfo(key2)
  if (!info1 || !info2) return false

  const compatible = getCompatibleKeys(key1)
  return compatible.some((k) => k.camelot === info2.camelot)
}

/**
 * Get all 24 keys with their Camelot and Open Key codes.
 */
export function getAllKeys(): KeyInfo[] {
  return Object.keys(CAMELOT_TO_KEY)
    .map((code) => getKeyInfo(code))
    .filter((k): k is KeyInfo => k !== null)
}
