import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Database } from 'better-sqlite3';
import { openRekordboxDb, closeRekordboxDb, findRekordboxDb } from '../rekordbox/db.js';
import { searchTracks } from '../rekordbox/tracks.js';
import type { RbPlaylist, RbCue, RbSongPlaylist } from '../rekordbox/schema.js';
import type { ServerContext } from '../server.js';

/** Module-level state for the Rekordbox database connection. */
let rbDb: Database | null = null;

function requireDb(): Database {
  if (!rbDb) {
    throw new Error('Rekordbox database is not connected. Call rb_connect first.');
  }
  return rbDb;
}

export function registerRekordboxTools(server: McpServer, _context: ServerContext): void {
  server.tool(
    'rb_connect',
    'Open a connection to the Rekordbox database. Auto-detects the default macOS location if no path is given.',
    {
      dbPath: z.string().optional().describe('Path to the Rekordbox master.db file. Auto-detected if omitted.'),
    },
    async ({ dbPath }) => {
      try {
        // Close any existing connection
        if (rbDb) {
          closeRekordboxDb(rbDb);
          rbDb = null;
        }

        const resolvedPath = dbPath ?? findRekordboxDb();
        if (!resolvedPath) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: Could not auto-detect Rekordbox database. Please provide the dbPath parameter.',
            }],
          };
        }

        rbDb = openRekordboxDb(resolvedPath);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              connected: true,
              dbPath: resolvedPath,
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error connecting to Rekordbox: ${message}` }],
        };
      }
    },
  );

  server.tool(
    'rb_search_tracks',
    'Search for tracks in the Rekordbox library by artist, title, genre, BPM range, key, or rating.',
    {
      artist: z.string().optional().describe('Artist name (partial match)'),
      title: z.string().optional().describe('Track title (partial match)'),
      genre: z.string().optional().describe('Genre name (partial match)'),
      bpmMin: z.number().optional().describe('Minimum BPM'),
      bpmMax: z.number().optional().describe('Maximum BPM'),
      key: z.number().optional().describe('Musical key as Rekordbox integer code'),
      rating: z.number().optional().describe('Track rating value'),
    },
    async ({ artist, title, genre, bpmMin, bpmMax, key, rating }) => {
      try {
        const db = requireDb();
        const bpmRange = bpmMin !== undefined && bpmMax !== undefined
          ? { min: bpmMin, max: bpmMax }
          : undefined;

        const tracks = searchTracks(db, { artist, title, genre, bpmRange, key, rating });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              totalResults: tracks.length,
              tracks: tracks.map((t) => ({
                id: t.ID,
                title: t.Title,
                artistId: t.ArtistID,
                genreId: t.GenreID,
                bpm: t.BPM,
                key: t.Key,
                rating: t.Rating,
                duration: t.Duration,
                filePath: t.FilePath,
              })),
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error searching Rekordbox tracks: ${message}` }],
        };
      }
    },
  );

  server.tool(
    'rb_list_playlists',
    'List all playlists in the Rekordbox library.',
    {},
    async () => {
      try {
        const db = requireDb();
        const playlists = db.prepare(
          'SELECT ID, Name, ParentID, Seq, Attribute FROM djmdPlaylist ORDER BY Seq',
        ).all() as RbPlaylist[];

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              totalPlaylists: playlists.length,
              playlists: playlists.map((p) => ({
                id: p.ID,
                name: p.Name,
                parentId: p.ParentID,
                seq: p.Seq,
                isFolder: p.Attribute === 0,
              })),
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error listing Rekordbox playlists: ${message}` }],
        };
      }
    },
  );

  server.tool(
    'rb_get_playlist_tracks',
    'Get all tracks in a Rekordbox playlist.',
    {
      playlistId: z.string().describe('Rekordbox playlist ID'),
    },
    async ({ playlistId }) => {
      try {
        const db = requireDb();
        const rows = db.prepare(`
          SELECT sp.ID, sp.ContentID, sp.PlaylistID, sp.TrackNo,
                 c.Title, c.FolderPath, c.FileNameL, c.BPM, c.Key, c.Rating, c.Duration
          FROM djmdSongPlaylist sp
          JOIN djmdContent c ON sp.ContentID = c.ID
          WHERE sp.PlaylistID = ?
          ORDER BY sp.TrackNo
        `).all(playlistId) as Array<RbSongPlaylist & Record<string, unknown>>;

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              playlistId,
              totalTracks: rows.length,
              tracks: rows.map((r) => ({
                trackNo: r.TrackNo,
                contentId: r.ContentID,
                title: r.Title,
                bpm: r.BPM,
                key: r.Key,
                rating: r.Rating,
                duration: r.Duration,
                filePath: r.FolderPath && r.FileNameL
                  ? `${r.FolderPath}${r.FileNameL}`
                  : null,
              })),
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error getting playlist tracks: ${message}` }],
        };
      }
    },
  );

  server.tool(
    'rb_add_to_playlist',
    'Add tracks to a Rekordbox playlist. Note: the database is opened read-only by default; this operation requires a writable connection.',
    {
      playlistId: z.string().describe('Rekordbox playlist ID'),
      trackIds: z.array(z.string()).describe('Array of Rekordbox content IDs to add'),
    },
    async ({ playlistId, trackIds }) => {
      try {
        const db = requireDb();

        // Get current max TrackNo
        const maxRow = db.prepare(
          'SELECT MAX(TrackNo) as maxNo FROM djmdSongPlaylist WHERE PlaylistID = ?',
        ).get(playlistId) as { maxNo: number | null } | undefined;
        let nextTrackNo = (maxRow?.maxNo ?? 0) + 1;

        const insert = db.prepare(
          'INSERT INTO djmdSongPlaylist (ContentID, PlaylistID, TrackNo) VALUES (?, ?, ?)',
        );

        for (const trackId of trackIds) {
          insert.run(trackId, playlistId, nextTrackNo++);
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              added: trackIds.length,
              playlistId,
              trackIds,
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error adding to Rekordbox playlist: ${message}` }],
        };
      }
    },
  );

  server.tool(
    'rb_create_playlist',
    'Create a new playlist in the Rekordbox library.',
    {
      name: z.string().describe('Playlist name'),
      parentId: z.string().optional().describe('Parent folder ID (for nested playlists)'),
    },
    async ({ name, parentId }) => {
      try {
        const db = requireDb();

        // Get next sequence number
        const seqRow = db.prepare(
          'SELECT MAX(Seq) as maxSeq FROM djmdPlaylist WHERE ParentID = ?',
        ).get(parentId ?? '0') as { maxSeq: number | null } | undefined;
        const nextSeq = (seqRow?.maxSeq ?? 0) + 1;

        const result = db.prepare(
          'INSERT INTO djmdPlaylist (Name, ParentID, Seq, Attribute) VALUES (?, ?, ?, 1)',
        ).run(name, parentId ?? '0', nextSeq);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              created: true,
              playlistId: String(result.lastInsertRowid),
              name,
              parentId: parentId ?? '0',
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error creating Rekordbox playlist: ${message}` }],
        };
      }
    },
  );

  server.tool(
    'rb_get_cue_points',
    'Get all cue points and hot cues for a track.',
    {
      trackId: z.string().describe('Rekordbox content ID'),
    },
    async ({ trackId }) => {
      try {
        const db = requireDb();
        const cues = db.prepare(
          'SELECT * FROM djmdCue WHERE ContentID = ? ORDER BY InMsec',
        ).all(trackId) as RbCue[];

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              trackId,
              totalCues: cues.length,
              cues: cues.map((c) => ({
                id: c.ID,
                inMsec: c.InMsec,
                outMsec: c.OutMsec,
                kind: c.Kind,
                color: c.Color,
                hotcue: c.Hotcue,
                comment: c.Comment,
                activeLoop: c.ActiveLoop,
                beatLoopSize: c.BeatLoopSize,
              })),
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error getting cue points: ${message}` }],
        };
      }
    },
  );

  server.tool(
    'rb_library_stats',
    'Get aggregate statistics about the Rekordbox library (total tracks, genres, BPM distribution, etc.).',
    {},
    async () => {
      try {
        const db = requireDb();

        const totalTracks = (db.prepare('SELECT COUNT(*) as count FROM djmdContent').get() as { count: number }).count;
        const totalPlaylists = (db.prepare('SELECT COUNT(*) as count FROM djmdPlaylist WHERE Attribute = 1').get() as { count: number }).count;
        const totalArtists = (db.prepare('SELECT COUNT(*) as count FROM djmdArtist').get() as { count: number }).count;
        const totalGenres = (db.prepare('SELECT COUNT(*) as count FROM djmdGenre').get() as { count: number }).count;

        const bpmStats = db.prepare(`
          SELECT MIN(BPM) as minBpm, MAX(BPM) as maxBpm, AVG(BPM) as avgBpm
          FROM djmdContent WHERE BPM IS NOT NULL AND BPM > 0
        `).get() as { minBpm: number; maxBpm: number; avgBpm: number };

        const ratingDistribution = db.prepare(`
          SELECT Rating, COUNT(*) as count
          FROM djmdContent WHERE Rating IS NOT NULL
          GROUP BY Rating ORDER BY Rating
        `).all() as Array<{ Rating: number; count: number }>;

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              totalTracks,
              totalPlaylists,
              totalArtists,
              totalGenres,
              bpm: {
                min: bpmStats.minBpm,
                max: bpmStats.maxBpm,
                avg: Math.round(bpmStats.avgBpm * 10) / 10,
              },
              ratingDistribution: ratingDistribution.map((r) => ({
                rating: r.Rating,
                count: r.count,
              })),
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error getting Rekordbox stats: ${message}` }],
        };
      }
    },
  );
}
