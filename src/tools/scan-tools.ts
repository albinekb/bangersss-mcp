import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import fg from 'fast-glob'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { SUPPORTED_FORMATS, isAudioFile } from '../util/audio-formats.js'
import {
  buildExtensionGlob,
  normalizeGlobPattern,
} from '../util/glob-patterns.js'
import type { ServerContext } from '../server.js'

export function registerScanTools(
  server: McpServer,
  _context: ServerContext,
): void {
  server.tool(
    'scan_directory',
    'Scan a directory for audio files using fast-glob. Returns a list of discovered audio file paths.',
    {
      path: z.string().describe('Absolute path to the directory to scan'),
      recursive: z
        .boolean()
        .optional()
        .default(true)
        .describe('Whether to scan subdirectories recursively'),
      extensions: z
        .array(z.string())
        .optional()
        .describe(
          'File extensions to include (e.g. [".mp3", ".flac"]). Defaults to all supported audio formats.',
        ),
    },
    async ({ path: dirPath, recursive, extensions }) => {
      try {
        const exts =
          extensions && extensions.length > 0
            ? extensions.map((e) => (e.startsWith('.') ? e : `.${e}`))
            : [...SUPPORTED_FORMATS]

        const pattern = buildExtensionGlob(exts)

        const files = await fg(recursive ? `**/${pattern}` : pattern, {
          cwd: dirPath,
          absolute: true,
          onlyFiles: true,
          followSymbolicLinks: false,
        })

        files.sort()

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  directory: dirPath,
                  recursive,
                  extensions: exts,
                  totalFiles: files.length,
                  files,
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
              text: `Error scanning directory: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'list_audio_files',
    'List audio files in a directory with optional filtering by glob pattern and sorting.',
    {
      path: z.string().describe('Absolute path to the directory'),
      pattern: z
        .string()
        .optional()
        .describe('Glob pattern to filter files (e.g. "*.mp3")'),
      sortBy: z
        .enum(['name', 'date', 'size'])
        .optional()
        .default('name')
        .describe('Sort order for results'),
    },
    async ({ path: dirPath, pattern, sortBy }) => {
      try {
        const files = await fg(pattern ? normalizeGlobPattern(pattern) : '*', {
          cwd: dirPath,
          absolute: true,
          onlyFiles: true,
          followSymbolicLinks: false,
        })

        // Filter to audio files only
        const audioFiles = files.filter(isAudioFile)

        // Gather stat info for sorting
        const fileInfos = await Promise.all(
          audioFiles.map(async (filePath) => {
            const stat = await fs.stat(filePath)
            return {
              path: filePath,
              name: path.basename(filePath),
              size: stat.size,
              modified: stat.mtimeMs,
            }
          }),
        )

        // Sort
        switch (sortBy) {
          case 'date':
            fileInfos.sort((a, b) => b.modified - a.modified)
            break
          case 'size':
            fileInfos.sort((a, b) => b.size - a.size)
            break
          case 'name':
          default:
            fileInfos.sort((a, b) => a.name.localeCompare(b.name))
            break
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  directory: dirPath,
                  pattern: pattern ?? '*',
                  sortBy,
                  totalFiles: fileInfos.length,
                  files: fileInfos,
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
            { type: 'text' as const, text: `Error listing files: ${message}` },
          ],
        }
      }
    },
  )
}
