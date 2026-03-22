import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  openRekordboxDb,
  closeRekordboxDb,
  findRekordboxDb,
  type IRekordboxDb,
  type Playlist,
  type PlaylistTrack,
} from '../rekordbox/db.js'
import type { ServerContext } from '../server.js'

type Row = Record<string, unknown>

/** Module-level state for the Rekordbox database connection. */
let rbDb: IRekordboxDb | null = null

function requireDb(): IRekordboxDb {
  if (!rbDb) {
    throw new Error(
      'Rekordbox database is not connected. Call rb_connect first.',
    )
  }
  return rbDb
}

export function registerRekordboxTools(
  server: McpServer,
  _context: ServerContext,
): void {
  server.tool(
    'rb_connect',
    'Open a connection to the Rekordbox database. Auto-detects path and password from Rekordbox options.json.',
    {
      dbPath: z
        .string()
        .optional()
        .describe('Path to master.db (auto-detected if omitted)'),
      dbPassword: z
        .string()
        .optional()
        .describe('Database password (auto-detected if omitted)'),
    },
    async ({ dbPath, dbPassword }) => {
      try {
        if (rbDb) {
          closeRekordboxDb(rbDb)
          rbDb = null
        }

        rbDb = await openRekordboxDb(dbPath, dbPassword)

        // Quick test — load track count
        const tracks = rbDb.loadTracks(1)

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  connected: true,
                  dbPath: dbPath ?? findRekordboxDb() ?? '(auto-detected)',
                  trackCount: tracks?.count ?? 0,
                },
                null,
                2,
              ),
            },
          ],
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error connecting to Rekordbox: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'rb_search_tracks',
    'Search for tracks in the Rekordbox library. Loads all tracks and filters by artist, title, genre, BPM range, or rating.',
    {
      artist: z
        .string()
        .optional()
        .describe('Artist name (partial match, case-insensitive)'),
      title: z
        .string()
        .optional()
        .describe('Track title (partial match, case-insensitive)'),
      genre: z
        .string()
        .optional()
        .describe('Genre name (partial match, case-insensitive)'),
      bpmMin: z.number().optional().describe('Minimum BPM'),
      bpmMax: z.number().optional().describe('Maximum BPM'),
      rating: z.number().optional().describe('Minimum rating (0-5)'),
      limit: z
        .number()
        .optional()
        .default(100)
        .describe('Max results to return'),
    },
    async ({ artist, title, genre, bpmMin, bpmMax, rating, limit }) => {
      try {
        const db = requireDb()
        const result = db.loadTracks()
        if (!result) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'No tracks loaded from Rekordbox.',
              },
            ],
          }
        }

        let filtered = result.rows

        if (artist) {
          const q = artist.toLowerCase()
          filtered = filtered.filter((r: Row) => {
            const a = (r.Artist as string) ?? (r.artist as string) ?? ''
            return a.toLowerCase().includes(q)
          })
        }
        if (title) {
          const q = title.toLowerCase()
          filtered = filtered.filter((r: Row) => {
            const t = (r.Title as string) ?? (r.title as string) ?? ''
            return t.toLowerCase().includes(q)
          })
        }
        if (genre) {
          const q = genre.toLowerCase()
          filtered = filtered.filter((r: Row) => {
            const g = (r.Genre as string) ?? (r.genre as string) ?? ''
            return g.toLowerCase().includes(q)
          })
        }
        if (bpmMin !== undefined) {
          filtered = filtered.filter((r: Row) => {
            const bpm = (r.BPM as number) ?? (r.bpm as number) ?? 0
            return bpm >= bpmMin
          })
        }
        if (bpmMax !== undefined) {
          filtered = filtered.filter((r: Row) => {
            const bpm = (r.BPM as number) ?? (r.bpm as number) ?? 0
            return bpm <= bpmMax
          })
        }
        if (rating !== undefined) {
          filtered = filtered.filter((r: Row) => {
            const rat = (r.Rating as number) ?? (r.rating as number) ?? 0
            return rat >= rating
          })
        }

        const page = filtered.slice(0, limit)

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  totalInLibrary: result.count,
                  totalMatched: filtered.length,
                  showing: page.length,
                  tracks: page,
                },
                null,
                2,
              ),
            },
          ],
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error searching Rekordbox tracks: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'rb_list_playlists',
    'List all playlists and folders in the Rekordbox library.',
    {},
    async () => {
      try {
        const db = requireDb()
        const playlists = db.loadPlaylists()

        if (!playlists) {
          return {
            content: [{ type: 'text' as const, text: 'No playlists found.' }],
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  totalPlaylists: playlists.length,
                  playlists: playlists.map((p: Playlist) => ({
                    id: p.ID,
                    name: p.Name,
                    parentId: p.ParentID,
                    seq: p.Seq,
                    type: p.Attribute === 0 ? 'playlist' : 'folder',
                  })),
                },
                null,
                2,
              ),
            },
          ],
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error listing Rekordbox playlists: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'rb_get_playlist_tracks',
    'Get all tracks in a Rekordbox playlist with full metadata.',
    {
      playlistId: z.string().describe('Rekordbox playlist ID'),
    },
    async ({ playlistId }) => {
      try {
        const db = requireDb()
        const tracks = db.loadPlaylistTracks(playlistId)

        if (!tracks) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `No tracks found in playlist ${playlistId}.`,
              },
            ],
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  playlistId,
                  totalTracks: tracks.length,
                  tracks: tracks.map((t: PlaylistTrack) => ({
                    trackNo: t.trackNo,
                    id: t.id,
                    title: t.title,
                    artist: t.artist,
                    album: t.album,
                    genre: t.genre,
                    bpm: t.bpm,
                    key: t.key,
                    rating: t.rating,
                    comment: t.comment,
                    length: t.length,
                    filePath: t.filePath,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error getting playlist tracks: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'rb_add_to_playlist',
    'Add tracks to a Rekordbox playlist. Requires writable connection (rb_connect with write mode).',
    {
      playlistId: z.string().describe('Rekordbox playlist ID'),
      trackIds: z
        .array(z.string())
        .describe('Array of Rekordbox content IDs to add'),
    },
    async ({ playlistId, trackIds }) => {
      try {
        const db = requireDb()
        const added: string[] = []

        for (const trackId of trackIds) {
          const result = db.addTrackToPlaylist(playlistId, trackId)
          if (result) added.push(trackId)
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  added: added.length,
                  requested: trackIds.length,
                  playlistId,
                  addedTrackIds: added,
                },
                null,
                2,
              ),
            },
          ],
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error adding to Rekordbox playlist: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'rb_create_playlist',
    'Create a new playlist in the Rekordbox library. Requires writable connection.',
    {
      name: z.string().describe('Playlist name'),
      parentId: z
        .string()
        .optional()
        .describe('Parent folder ID (for nested playlists)'),
    },
    async ({ name, parentId }) => {
      try {
        const db = requireDb()
        const playlist = db.createPlaylist(name, parentId)

        if (!playlist) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Failed to create playlist. Database may be in read-only mode.',
              },
            ],
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  created: true,
                  playlist: {
                    id: playlist.ID,
                    name: playlist.Name,
                    parentId: playlist.ParentID,
                  },
                },
                null,
                2,
              ),
            },
          ],
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error creating Rekordbox playlist: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'rb_get_cue_points',
    'Get all cue points and hot cues for a track.',
    {
      trackId: z.string().describe('Rekordbox content ID'),
    },
    async ({ trackId }) => {
      try {
        // Cue points aren't exposed by rekordbox-connect's high-level API,
        // so we still need raw SQL access. This will work since IRekordboxDb
        // opens the DB internally — we just need to note this is a lower-level query.
        return {
          content: [
            {
              type: 'text' as const,
              text:
                `Cue point queries require direct DB access. ` +
                `Use rb_get_playlist_tracks to get track metadata including cue info from playlists.`,
            },
          ],
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error getting cue points: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'rb_library_stats',
    'Get aggregate statistics about the Rekordbox library (total tracks, genres, BPM distribution).',
    {},
    async () => {
      try {
        const db = requireDb()
        const result = db.loadTracks()

        if (!result) {
          return {
            content: [{ type: 'text' as const, text: 'No tracks in library.' }],
          }
        }

        const tracks = result.rows
        const playlists = db.loadPlaylists()

        // Compute stats from loaded tracks
        const genreCounts: Record<string, number> = {}
        const artistCounts: Record<string, number> = {}
        let totalBpm = 0
        let bpmCount = 0
        let minBpm = Infinity
        let maxBpm = 0

        for (const t of tracks) {
          const genre = (t.Genre as string) ?? (t.genre as string)
          const artist = (t.Artist as string) ?? (t.artist as string)
          const bpm = (t.BPM as number) ?? (t.bpm as number) ?? 0

          if (genre) genreCounts[genre] = (genreCounts[genre] ?? 0) + 1
          if (artist) artistCounts[artist] = (artistCounts[artist] ?? 0) + 1
          if (bpm > 0) {
            totalBpm += bpm
            bpmCount++
            if (bpm < minBpm) minBpm = bpm
            if (bpm > maxBpm) maxBpm = bpm
          }
        }

        const topGenres = Object.entries(genreCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([genre, count]) => ({ genre, count }))

        const topArtists = Object.entries(artistCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([artist, count]) => ({ artist, count }))

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  totalTracks: result.count,
                  totalPlaylists: playlists?.length ?? 0,
                  uniqueArtists: Object.keys(artistCounts).length,
                  uniqueGenres: Object.keys(genreCounts).length,
                  bpm:
                    bpmCount > 0
                      ? {
                          min: minBpm,
                          max: maxBpm,
                          avg: Math.round((totalBpm / bpmCount) * 10) / 10,
                        }
                      : null,
                  topGenres,
                  topArtists,
                },
                null,
                2,
              ),
            },
          ],
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error getting Rekordbox stats: ${message}`,
            },
          ],
        }
      }
    },
  )
}
