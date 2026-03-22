import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Database } from 'better-sqlite3-multiple-ciphers'
import { openEngineDjDb, closeEngineDjDb } from '../engine-dj/db.js'
import type {
  EdjTrack,
  EdjCrate,
  EdjCrateTrackList,
} from '../engine-dj/schema.js'
import type { ServerContext } from '../server.js'

/** Module-level state for the Engine DJ database connection. */
let edjDb: Database | null = null

function requireDb(): Database {
  if (!edjDb) {
    throw new Error(
      'Engine DJ database is not connected. Call edj_connect first.',
    )
  }
  return edjDb
}

export function registerEngineDjTools(
  server: McpServer,
  _context: ServerContext,
): void {
  server.tool(
    'edj_connect',
    'Open a connection to an Engine DJ database (m.db).',
    {
      dbPath: z.string().describe('Absolute path to the Engine DJ m.db file'),
    },
    async ({ dbPath }) => {
      try {
        // Close any existing connection
        if (edjDb) {
          closeEngineDjDb(edjDb)
          edjDb = null
        }

        edjDb = openEngineDjDb(dbPath)

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  connected: true,
                  dbPath,
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
              text: `Error connecting to Engine DJ: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'edj_search_tracks',
    'Search for tracks in the Engine DJ library by artist, title, genre, or BPM range.',
    {
      artist: z.string().optional().describe('Artist name (partial match)'),
      title: z.string().optional().describe('Track title (partial match)'),
      genre: z.string().optional().describe('Genre name (partial match)'),
      bpmMin: z.number().optional().describe('Minimum BPM'),
      bpmMax: z.number().optional().describe('Maximum BPM'),
    },
    async ({ artist, title, genre, bpmMin, bpmMax }) => {
      try {
        const db = requireDb()
        const conditions: string[] = []
        const params: Record<string, unknown> = {}

        if (title) {
          conditions.push('title LIKE :title')
          params.title = `%${title}%`
        }
        if (artist) {
          conditions.push('artist LIKE :artist')
          params.artist = `%${artist}%`
        }
        if (genre) {
          conditions.push('genre LIKE :genre')
          params.genre = `%${genre}%`
        }
        if (bpmMin !== undefined) {
          conditions.push('bpm >= :bpmMin')
          params.bpmMin = bpmMin
        }
        if (bpmMax !== undefined) {
          conditions.push('bpm <= :bpmMax')
          params.bpmMax = bpmMax
        }

        const where =
          conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
        const sql = `SELECT * FROM Track ${where} ORDER BY title LIMIT 500`

        const tracks = db.prepare(sql).all(params) as EdjTrack[]

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  totalResults: tracks.length,
                  tracks: tracks.map((t) => ({
                    id: t.id,
                    title: t.title,
                    artist: t.artist,
                    album: t.album,
                    genre: t.genre,
                    bpm: t.bpm,
                    key: t.key,
                    rating: t.rating,
                    duration: t.duration,
                    path: t.path,
                    filename: t.filename,
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
              text: `Error searching Engine DJ tracks: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'edj_list_crates',
    'List all crates in the Engine DJ library.',
    {},
    async () => {
      try {
        const db = requireDb()
        const crates = db
          .prepare('SELECT * FROM Crate ORDER BY title')
          .all() as EdjCrate[]

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  totalCrates: crates.length,
                  crates: crates.map((c) => ({
                    id: c.id,
                    title: c.title,
                    path: c.path,
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
              text: `Error listing Engine DJ crates: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'edj_get_crate_tracks',
    'Get all tracks in an Engine DJ crate.',
    {
      crateId: z.number().describe('Crate ID'),
    },
    async ({ crateId }) => {
      try {
        const db = requireDb()
        const rows = db
          .prepare(
            `
          SELECT t.*
          FROM CrateTrackList ctl
          JOIN Track t ON ctl.trackId = t.id
          WHERE ctl.crateId = ?
          ORDER BY t.title
        `,
          )
          .all(crateId) as EdjTrack[]

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  crateId,
                  totalTracks: rows.length,
                  tracks: rows.map((t) => ({
                    id: t.id,
                    title: t.title,
                    artist: t.artist,
                    album: t.album,
                    genre: t.genre,
                    bpm: t.bpm,
                    key: t.key,
                    duration: t.duration,
                    path: t.path,
                    filename: t.filename,
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
              text: `Error getting crate tracks: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'edj_add_to_crate',
    'Add tracks to an Engine DJ crate.',
    {
      crateId: z.number().describe('Crate ID'),
      trackIds: z.array(z.number()).describe('Array of track IDs to add'),
    },
    async ({ crateId, trackIds }) => {
      try {
        const db = requireDb()

        const insert = db.prepare(
          'INSERT INTO CrateTrackList (crateId, trackId) VALUES (?, ?)',
        )

        for (const trackId of trackIds) {
          insert.run(crateId, trackId)
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  added: trackIds.length,
                  crateId,
                  trackIds,
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
              text: `Error adding to Engine DJ crate: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'edj_create_crate',
    'Create a new crate in the Engine DJ library.',
    {
      name: z.string().describe('Crate name'),
    },
    async ({ name }) => {
      try {
        const db = requireDb()

        const result = db
          .prepare('INSERT INTO Crate (title, path) VALUES (?, ?)')
          .run(name, `Root;${name};`)

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  created: true,
                  crateId: Number(result.lastInsertRowid),
                  name,
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
              text: `Error creating Engine DJ crate: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'edj_library_stats',
    'Get aggregate statistics about the Engine DJ library.',
    {},
    async () => {
      try {
        const db = requireDb()

        const totalTracks = (
          db.prepare('SELECT COUNT(*) as count FROM Track').get() as {
            count: number
          }
        ).count
        const totalCrates = (
          db.prepare('SELECT COUNT(*) as count FROM Crate').get() as {
            count: number
          }
        ).count

        const bpmStats = db
          .prepare(
            `
          SELECT MIN(bpm) as minBpm, MAX(bpm) as maxBpm, AVG(bpm) as avgBpm
          FROM Track WHERE bpm IS NOT NULL AND bpm > 0
        `,
          )
          .get() as { minBpm: number; maxBpm: number; avgBpm: number }

        const genreDistribution = db
          .prepare(
            `
          SELECT genre, COUNT(*) as count
          FROM Track WHERE genre IS NOT NULL AND genre != ''
          GROUP BY genre ORDER BY count DESC LIMIT 20
        `,
          )
          .all() as Array<{ genre: string; count: number }>

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  totalTracks,
                  totalCrates,
                  bpm: {
                    min: bpmStats.minBpm,
                    max: bpmStats.maxBpm,
                    avg: bpmStats.avgBpm
                      ? Math.round(bpmStats.avgBpm * 10) / 10
                      : null,
                  },
                  topGenres: genreDistribution,
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
              text: `Error getting Engine DJ stats: ${message}`,
            },
          ],
        }
      }
    },
  )
}
