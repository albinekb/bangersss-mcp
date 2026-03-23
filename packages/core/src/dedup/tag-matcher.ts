import * as path from 'node:path'
import fg from 'fast-glob'
import { readTags, batchReadTags, type TrackMetadata } from '../tags/tag-reader.js'
import { SUPPORTED_FORMATS } from '../util/audio-formats.js'

export type DuplicateType = 'exact_filename' | 'same_track' | 'similar' | 'none'

export interface DuplicateMatch {
  incomingPath: string
  duplicateType: DuplicateType
  matchedLibraryPath?: string
  details?: string
}

export interface DuplicateCheckResult {
  totalChecked: number
  librarySize: number
  duplicatesFound: number
  newFiles: number
  results: DuplicateMatch[]
}

/**
 * Normalize a filename for fuzzy matching.
 * Strips common copy suffixes like (1), _copy, - copy.
 */
function normalizeForMatch(basename: string): string {
  return basename
    .replace(/\s*\(\d+\)\s*/, '')
    .replace(/\s*_copy\s*/i, '')
    .replace(/\s*-\s*copy\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Build a library index for duplicate checking.
 * Returns filename-based and tag-based indexes.
 */
export async function buildLibraryIndex(
  libraryPath: string,
  options?: { concurrency?: number },
): Promise<{
  libraryFiles: string[]
  filenameIndex: Map<string, string[]>
  tagIndex: Map<string, string>
}> {
  const exts = [...SUPPORTED_FORMATS]
  const pattern = `*{${exts.join(',')}}`
  const normPath = libraryPath.replace(/\\/g, '/')
  const libraryFiles = await fg(`${normPath}/**/${pattern}`, {
    absolute: true,
    onlyFiles: true,
  })

  // Filename index: lowercase basename -> paths
  const filenameIndex = new Map<string, string[]>()
  for (const libFile of libraryFiles) {
    const basename = path.basename(libFile).toLowerCase()
    const existing = filenameIndex.get(basename) ?? []
    existing.push(libFile)
    filenameIndex.set(basename, existing)
  }

  // Tag index: "artist|title" -> path
  const tagIndex = new Map<string, string>()
  const libTagMap = await batchReadTags(libraryFiles, {
    concurrency: options?.concurrency ?? 8,
  })
  for (const [libFile, tags] of libTagMap) {
    if (tags.artist && tags.title) {
      const key = `${tags.artist.toLowerCase()}|${tags.title.toLowerCase()}`
      tagIndex.set(key, libFile)
    }
  }

  return { libraryFiles, filenameIndex, tagIndex }
}

/**
 * Check incoming files for duplicates against a library.
 * Uses three strategies: exact filename, artist+title tags, similar filename.
 */
export async function checkDuplicates(
  incomingPaths: string[],
  libraryPath: string,
  options?: { concurrency?: number },
): Promise<DuplicateCheckResult> {
  const { libraryFiles, filenameIndex, tagIndex } = await buildLibraryIndex(
    libraryPath,
    options,
  )

  const results: DuplicateMatch[] = []

  for (const incoming of incomingPaths) {
    const basename = path.basename(incoming).toLowerCase()
    let found = false

    // 1. Exact filename match
    const filenameMatches = filenameIndex.get(basename)
    if (filenameMatches && filenameMatches.length > 0) {
      results.push({
        incomingPath: incoming,
        duplicateType: 'exact_filename',
        matchedLibraryPath: filenameMatches[0],
        details: `Same filename found in library (${filenameMatches.length} match${filenameMatches.length > 1 ? 'es' : ''})`,
      })
      found = true
      continue
    }

    // 2. Same artist+title in tags
    try {
      const tags = await readTags(incoming)
      if (tags.artist && tags.title) {
        const key = `${tags.artist.toLowerCase()}|${tags.title.toLowerCase()}`
        const match = tagIndex.get(key)
        if (match) {
          results.push({
            incomingPath: incoming,
            duplicateType: 'same_track',
            matchedLibraryPath: match,
            details: `Same artist+title: ${tags.artist} - ${tags.title}`,
          })
          found = true
          continue
        }
      }
    } catch {
      // Can't read tags, skip tag-based check
    }

    // 3. Similar filename
    const normalized = normalizeForMatch(basename)
    for (const [libName, libPaths] of filenameIndex) {
      const libNormalized = normalizeForMatch(libName)
      if (libNormalized === normalized && libName !== basename) {
        results.push({
          incomingPath: incoming,
          duplicateType: 'similar',
          matchedLibraryPath: libPaths[0],
          details: `Similar filename: "${path.basename(incoming)}" ≈ "${path.basename(libPaths[0])}"`,
        })
        found = true
        break
      }
    }

    if (!found) {
      results.push({
        incomingPath: incoming,
        duplicateType: 'none',
      })
    }
  }

  const duplicates = results.filter((r) => r.duplicateType !== 'none')

  return {
    totalChecked: incomingPaths.length,
    librarySize: libraryFiles.length,
    duplicatesFound: duplicates.length,
    newFiles: results.filter((r) => r.duplicateType === 'none').length,
    results,
  }
}

/**
 * Quick duplicate check using only filename and tag indexes.
 * Returns the set of incoming paths that are duplicates.
 */
export async function findDuplicatePaths(
  incomingFiles: Array<{ path: string; tags: TrackMetadata | null }>,
  libraryPath: string,
  options?: { concurrency?: number },
): Promise<Set<string>> {
  const { filenameIndex, tagIndex } = await buildLibraryIndex(
    libraryPath,
    options,
  )

  const duplicates = new Set<string>()

  for (const track of incomingFiles) {
    const basename = path.basename(track.path).toLowerCase()
    if (filenameIndex.has(basename)) {
      duplicates.add(track.path)
      continue
    }
    if (track.tags?.artist && track.tags?.title) {
      const key = `${track.tags.artist.toLowerCase()}|${track.tags.title.toLowerCase()}`
      if (tagIndex.has(key)) {
        duplicates.add(track.path)
      }
    }
  }

  return duplicates
}
