import { extname } from 'node:path'

import type { FolderInspection } from './types.js'

export interface SamplePackSignal {
  isSamplePack: boolean
  signals: string[]
}

/**
 * File extensions that indicate production/DAW content rather than DJ tracks.
 * Presence of any of these in a folder is a near-certain sample pack indicator.
 */
export const PRODUCTION_EXTENSIONS = new Set([
  // Synth presets
  '.serumpreset',
  '.vital',
  '.vitallfo',
  '.nmsv',
  '.fst',
  '.fxb',
  // DAW projects / clips
  '.flp',
  '.als',
  '.adg',
  '.alc',
  // MIDI
  '.mid',
  '.midi',
  // Samplers
  '.sf2',
  '.sfz',
  '.spf2',
  '.nki',
  '.exs',
])

/** Minimum audio file count for structural heuristic */
const STRUCTURAL_MIN_FILES = 20
/** Minimum subdirectory count for structural heuristic */
const STRUCTURAL_MIN_FOLDERS = 5

/**
 * Heuristic detection of sample pack folders.
 *
 * **Tier 1** — Production file extensions: if the folder contains synth presets,
 * MIDI files, DAW projects, etc. it is almost certainly a sample/preset pack.
 *
 * **Tier 2** — Structural: many audio files (>20) combined with many subdirectories
 * (>5) indicates a sample pack with categorised content (kicks, snares, loops, …).
 */
export function detectSamplePack(inspection: FolderInspection): SamplePackSignal {
  const signals: string[] = []

  // Tier 1: production file extensions
  const prodExts = new Map<string, number>()
  for (const d of inspection.allFiles) {
    const ext = extname(d.name).toLowerCase()
    if (PRODUCTION_EXTENSIONS.has(ext)) {
      prodExts.set(ext, (prodExts.get(ext) ?? 0) + 1)
    }
  }

  if (prodExts.size > 0) {
    const details = [...prodExts.entries()]
      .map(([ext, count]) => `${ext} (${count})`)
      .join(', ')
    signals.push(`Contains production files: ${details}`)
    return { isSamplePack: true, signals }
  }

  // Tier 2: structural — many audio files + many subdirectories
  if (
    inspection.files.length > STRUCTURAL_MIN_FILES &&
    inspection.folders.length > STRUCTURAL_MIN_FOLDERS
  ) {
    signals.push(
      `${inspection.files.length} audio files with ${inspection.folders.length} subdirectories`,
    )
    return { isSamplePack: true, signals }
  }

  return { isSamplePack: false, signals }
}

export interface SamplePackFilterOptions {
  /** Called when a folder is detected as a sample pack and skipped */
  onSkip?: (dir: string, signals: string[]) => void
}

/**
 * Returns a `filterResult`-compatible callback for use with {@link walk}/{@link walkFiles}.
 */
export function createSamplePackFilter(
  opts?: SamplePackFilterOptions,
): (inspection: FolderInspection) => boolean {
  return (inspection) => {
    const result = detectSamplePack(inspection)
    if (result.isSamplePack) {
      opts?.onSkip?.(inspection.dir, result.signals)
      return false
    }
    return true
  }
}
