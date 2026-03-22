import path from "node:path";
import type { PlaylistTrack } from "./types.js";

const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[\\/]/

function usesWindowsPaths(value: string): boolean {
  return WINDOWS_DRIVE_PATH.test(value) || value.includes('\\')
}

function toPlaylistPath(value: string): string {
  return value.replace(/\\/g, '/')
}

function resolveTrackPath(basePath: string, trackPath: string): string {
  if (path.posix.isAbsolute(trackPath)) {
    return path.posix.normalize(trackPath)
  }

  if (path.win32.isAbsolute(trackPath)) {
    return path.win32.normalize(trackPath)
  }

  if (usesWindowsPaths(basePath)) {
    return path.win32.resolve(basePath, trackPath)
  }

  return path.posix.resolve(toPlaylistPath(basePath), toPlaylistPath(trackPath))
}

function getRelativeTrackPath(basePath: string, trackPath: string): string {
  if (usesWindowsPaths(basePath) || usesWindowsPaths(trackPath)) {
    return toPlaylistPath(
      path.win32.relative(
        path.win32.normalize(basePath),
        path.win32.normalize(trackPath),
      ),
    )
  }

  return path.posix.relative(
    toPlaylistPath(basePath),
    toPlaylistPath(trackPath),
  )
}

/**
 * Parse an M3U or M3U8 file's content into an array of PlaylistTrack entries.
 * Handles both simple M3U (one file path per line) and extended M3U
 * (#EXTM3U header with #EXTINF metadata lines).
 */
export function parseM3U(content: string, basePath: string): PlaylistTrack[] {
  const lines = content.split(/\r?\n/)
  const tracks: PlaylistTrack[] = []

  let pendingDuration: number | undefined
  let pendingTitle: string | undefined
  let pendingArtist: string | undefined

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (line === '' || line === '#EXTM3U') {
      continue
    }

    if (line.startsWith('#EXTINF:')) {
      // Format: #EXTINF:<duration>,<artist> - <title>
      // or:     #EXTINF:<duration>,<title>
      const afterTag = line.slice('#EXTINF:'.length)
      const commaIndex = afterTag.indexOf(',')

      if (commaIndex !== -1) {
        const durationStr = afterTag.slice(0, commaIndex).trim()
        const parsed = parseInt(durationStr, 10)
        pendingDuration = Number.isNaN(parsed) ? undefined : parsed

        const displayText = afterTag.slice(commaIndex + 1).trim()
        const separatorMatch = displayText.match(/\s+-\s+/)

        if (separatorMatch && separatorMatch.index !== undefined) {
          pendingArtist = displayText.slice(0, separatorMatch.index)
          pendingTitle = displayText.slice(
            separatorMatch.index + separatorMatch[0].length,
          )
        } else {
          pendingTitle = displayText || undefined
          pendingArtist = undefined
        }
      }
      continue
    }

    // Skip other comment/directive lines
    if (line.startsWith('#')) {
      continue
    }

    // This is a file path line
    const trackPath = resolveTrackPath(basePath, line)

    tracks.push({
      path: trackPath,
      duration: pendingDuration,
      title: pendingTitle,
      artist: pendingArtist,
    })

    pendingDuration = undefined
    pendingTitle = undefined
    pendingArtist = undefined
  }

  return tracks
}

export interface GenerateM3UOptions {
  /** Include #EXTM3U header and #EXTINF metadata lines. Defaults to true. */
  extended?: boolean
  /** Write paths relative to basePath instead of absolute. */
  relativePaths?: boolean
  /** Base directory used when computing relative paths. */
  basePath?: string
}

/**
 * Generate M3U file content from an array of tracks.
 */
export function generateM3U(
  tracks: PlaylistTrack[],
  options: GenerateM3UOptions = {},
): string {
  const { extended = true, relativePaths = false, basePath } = options
  const lines: string[] = []

  if (extended) {
    lines.push('#EXTM3U')
  }

  for (const track of tracks) {
    if (extended) {
      const duration = track.duration ?? -1
      let display = ''

      if (track.artist && track.title) {
        display = `${track.artist} - ${track.title}`
      } else if (track.title) {
        display = track.title
      } else {
        display = path.basename(track.path)
      }

      lines.push(`#EXTINF:${duration},${display}`)
    }

    let trackPath = track.path
    if (relativePaths && basePath) {
      trackPath = getRelativeTrackPath(basePath, track.path)
    }

    lines.push(toPlaylistPath(trackPath))
  }

  // Trailing newline for POSIX compatibility
  lines.push('')
  return lines.join('\n')
}
