import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readTags, batchReadTags } from '../tags/tag-reader.js';
import { writeTags } from '../tags/tag-writer.js';
import type { ServerContext } from '../server.js';

export function registerTagTools(server: McpServer, context: ServerContext): void {
  server.tool(
    'read_tags',
    'Read audio metadata tags (title, artist, album, genre, BPM, key, etc.) from a single audio file.',
    {
      path: z.string().describe('Absolute path to the audio file'),
    },
    async ({ path: filePath }) => {
      try {
        const tags = await readTags(filePath);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ path: filePath, tags }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error reading tags from ${filePath}: ${message}` }],
        };
      }
    },
  );

  server.tool(
    'batch_read_tags',
    'Read audio metadata tags from multiple files at once. Files that fail to parse are skipped.',
    {
      paths: z.array(z.string()).describe('Array of absolute paths to audio files'),
    },
    async ({ paths }) => {
      try {
        const results = await batchReadTags(paths);
        const output: Record<string, unknown> = {};
        for (const [fp, tags] of results) {
          output[fp] = tags;
        }

        const skipped = paths.filter((p) => !results.has(p));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              totalRequested: paths.length,
              totalRead: results.size,
              skipped,
              results: output,
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error batch reading tags: ${message}` }],
        };
      }
    },
  );

  server.tool(
    'write_tags',
    'Write metadata tags to an audio file via the overlay filesystem (non-destructive until committed).',
    {
      path: z.string().describe('Absolute path to the audio file'),
      tags: z.record(z.string(), z.unknown()).describe('Tag fields to write (e.g. { title: "...", artist: "...", bpm: 128 })'),
    },
    async ({ path: filePath, tags }) => {
      try {
        const overlayFs = {
          readFileSync(p: string): Buffer {
            const fs = context.overlay.getFs();
            return fs.readFileSync(p) as Buffer;
          },
          writeFileSync(p: string, data: Buffer): void {
            // Write to the overlay so the change is tracked
            context.overlay.writeFile(p, data);
          },
        };

        await writeTags(filePath, tags as Record<string, unknown>, overlayFs);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              path: filePath,
              tagsWritten: tags,
              note: 'Tags written to overlay. Use commit_changes to apply to disk.',
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error writing tags to ${filePath}: ${message}` }],
        };
      }
    },
  );

  server.tool(
    'suggest_tags',
    'Read current tags from a file and suggest which fields are empty and could be filled in.',
    {
      path: z.string().describe('Absolute path to the audio file'),
    },
    async ({ path: filePath }) => {
      try {
        const tags = await readTags(filePath);

        const allFields = ['title', 'artist', 'album', 'genre', 'year', 'bpm', 'key', 'comment'] as const;
        const present: string[] = [];
        const missing: string[] = [];

        for (const field of allFields) {
          if (tags[field] !== undefined && tags[field] !== null && tags[field] !== '') {
            present.push(field);
          } else {
            missing.push(field);
          }
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              path: filePath,
              currentTags: tags,
              presentFields: present,
              missingFields: missing,
              suggestions: missing.map((f) => `Field "${f}" is empty and could be populated.`),
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error analyzing tags for ${filePath}: ${message}` }],
        };
      }
    },
  );
}
