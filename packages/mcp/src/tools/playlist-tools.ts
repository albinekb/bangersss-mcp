import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { parseM3U, type PlaylistTrack } from '@bangersss/core'
import type { ServerContext } from '../server.js'

function formatPlaylist(playlist: {
  name: string
  format: string
  tracks: PlaylistTrack[]
  createdAt: Date
  updatedAt: Date
}) {
  return {
    name: playlist.name,
    format: playlist.format,
    trackCount: playlist.tracks.length,
    tracks: playlist.tracks.map((t) => ({
      path: t.path,
      title: t.title,
      artist: t.artist,
      duration: t.duration,
    })),
    createdAt: playlist.createdAt.toISOString(),
    updatedAt: playlist.updatedAt.toISOString(),
  }
}

export function registerPlaylistTools(
  server: McpServer,
  context: ServerContext,
): void {
  server.tool(
    'create_playlist',
    'Create a new in-memory playlist, optionally pre-populated with tracks.',
    {
      name: z.string().describe('Playlist name'),
      format: z
        .enum(['m3u', 'm3u8'])
        .optional()
        .default('m3u8')
        .describe('Playlist format'),
      tracks: z
        .array(z.string())
        .optional()
        .default([])
        .describe('Initial track file paths'),
    },
    async ({ name, format, tracks }) => {
      try {
        const trackEntries: PlaylistTrack[] = tracks.map((p) => ({
          path: p,
          title: path.basename(p, path.extname(p)),
        }))

        const playlist = context.playlistManager.createPlaylist(
          name,
          format,
          trackEntries,
        )

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  created: true,
                  playlist: formatPlaylist(playlist),
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
              text: `Error creating playlist: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'add_to_playlist',
    'Add tracks to an existing playlist.',
    {
      name: z.string().describe('Playlist name'),
      tracks: z.array(z.string()).describe('Track file paths to add'),
    },
    async ({ name, tracks }) => {
      try {
        const trackEntries: PlaylistTrack[] = tracks.map((p) => ({
          path: p,
          title: path.basename(p, path.extname(p)),
        }))

        context.playlistManager.addTracks(name, trackEntries)
        const playlist = context.playlistManager.getPlaylist(name)

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  added: tracks.length,
                  playlist: formatPlaylist(playlist),
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
              text: `Error adding to playlist: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'remove_from_playlist',
    'Remove tracks from a playlist by their file paths.',
    {
      name: z.string().describe('Playlist name'),
      tracks: z.array(z.string()).describe('Track file paths to remove'),
    },
    async ({ name, tracks }) => {
      try {
        context.playlistManager.removeTracks(name, tracks)
        const playlist = context.playlistManager.getPlaylist(name)

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  removed: tracks.length,
                  playlist: formatPlaylist(playlist),
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
              text: `Error removing from playlist: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'read_playlist',
    'Parse a playlist file (M3U/M3U8) from disk and return its contents.',
    {
      path: z.string().describe('Absolute path to the playlist file'),
    },
    async ({ path: filePath }) => {
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        const basePath = path.dirname(filePath)
        const tracks = parseM3U(content, basePath)

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  path: filePath,
                  trackCount: tracks.length,
                  tracks: tracks.map((t) => ({
                    path: t.path,
                    title: t.title,
                    artist: t.artist,
                    duration: t.duration,
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
              text: `Error reading playlist: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'list_playlists',
    'List all in-memory playlists managed by the server.',
    {},
    async () => {
      try {
        const playlists = context.playlistManager.listPlaylists()

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  totalPlaylists: playlists.length,
                  playlists: playlists.map(formatPlaylist),
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
              text: `Error listing playlists: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'export_playlist',
    'Export an in-memory playlist to a file on disk.',
    {
      name: z.string().describe('Playlist name'),
      outputPath: z.string().describe('Absolute path for the output file'),
    },
    async ({ name, outputPath }) => {
      try {
        await context.playlistManager.exportPlaylist(name, outputPath)

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  exported: true,
                  playlistName: name,
                  outputPath,
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
              text: `Error exporting playlist: ${message}`,
            },
          ],
        }
      }
    },
  )
}
