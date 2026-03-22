import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as path from 'node:path';
import fg from 'fast-glob';
import { readTags } from '../tags/tag-reader.js';
import { isAudioFile } from '../util/audio-formats.js';
import { normalizeGlobPattern } from '../util/glob-patterns.js'
import type { ServerContext } from '../server.js'

export function registerFileTools(
  server: McpServer,
  context: ServerContext,
): void {
  server.tool(
    'rename_file',
    'Rename a file via the overlay filesystem (non-destructive until committed).',
    {
      from: z.string().describe('Current absolute file path'),
      to: z.string().describe('New absolute file path'),
    },
    async ({ from, to }) => {
      try {
        await context.overlay.rename(from, to)

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  renamed: true,
                  from,
                  to,
                  note: 'Rename staged in overlay. Use commit_changes to apply to disk.',
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
            { type: 'text' as const, text: `Error renaming file: ${message}` },
          ],
        }
      }
    },
  )

  server.tool(
    'move_file',
    'Move a file to a different directory via the overlay filesystem.',
    {
      from: z.string().describe('Current absolute file path'),
      to: z.string().describe('Destination absolute file path'),
    },
    async ({ from, to }) => {
      try {
        // Ensure destination directory exists in overlay
        const destDir = path.dirname(to)
        await context.overlay.mkdir(destDir, { recursive: true })
        await context.overlay.rename(from, to)

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  moved: true,
                  from,
                  to,
                  note: 'Move staged in overlay. Use commit_changes to apply to disk.',
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
            { type: 'text' as const, text: `Error moving file: ${message}` },
          ],
        }
      }
    },
  )

  server.tool(
    'batch_rename',
    'Rename multiple audio files matching a glob pattern using a template with tag placeholders like {artist}, {title}, {album}, {genre}, {year}, {bpm}.',
    {
      directory: z
        .string()
        .describe('Absolute path to the directory containing files'),
      pattern: z
        .string()
        .describe('Glob pattern to match files (e.g. "*.mp3")'),
      template: z
        .string()
        .describe(
          'Rename template using tag placeholders, e.g. "{artist} - {title}"',
        ),
    },
    async ({ directory, pattern, template }) => {
      try {
        const files = await fg(normalizeGlobPattern(pattern), {
          cwd: directory,
          absolute: true,
          onlyFiles: true,
        })

        const audioFiles = files.filter(isAudioFile)
        const results: Array<{
          from: string
          to: string
          success: boolean
          error?: string
        }> = []

        for (const filePath of audioFiles) {
          try {
            const tags = await readTags(filePath)
            const ext = path.extname(filePath)

            // Replace template placeholders with tag values
            let newName = template
            const replacements: Record<string, string> = {
              artist: tags.artist ?? 'Unknown Artist',
              title: tags.title ?? 'Unknown Title',
              album: tags.album ?? 'Unknown Album',
              genre: tags.genre ?? 'Unknown Genre',
              year:
                tags.year !== undefined ? String(tags.year) : 'Unknown Year',
              bpm: tags.bpm !== undefined ? String(tags.bpm) : 'Unknown BPM',
              key: tags.key ?? 'Unknown Key',
            }

            for (const [key, value] of Object.entries(replacements)) {
              newName = newName.replace(
                new RegExp(`\\{${key}\\}`, 'gi'),
                sanitizeFilename(value),
              )
            }

            const newPath = path.join(directory, `${newName}${ext}`)

            if (newPath !== filePath) {
              await context.overlay.rename(filePath, newPath)
              results.push({ from: filePath, to: newPath, success: true })
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            results.push({
              from: filePath,
              to: '',
              success: false,
              error: message,
            })
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  directory,
                  pattern,
                  template,
                  totalFiles: audioFiles.length,
                  renamed: results.filter((r) => r.success).length,
                  failed: results.filter((r) => !r.success).length,
                  results,
                  note: 'Renames staged in overlay. Use commit_changes to apply to disk.',
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
              text: `Error in batch rename: ${message}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'organize_files',
    'Move audio files into a folder structure based on their tags. Template uses placeholders like {genre}/{artist}/{title}.',
    {
      directory: z
        .string()
        .describe(
          'Absolute path to the directory containing files to organize',
        ),
      template: z
        .string()
        .describe('Folder structure template, e.g. "{genre}/{artist}/{title}"'),
    },
    async ({ directory, template }) => {
      try {
        const files = await fg('**/*', {
          cwd: directory,
          absolute: true,
          onlyFiles: true,
        })

        const audioFiles = files.filter(isAudioFile)
        const results: Array<{
          from: string
          to: string
          success: boolean
          error?: string
        }> = []

        for (const filePath of audioFiles) {
          try {
            const tags = await readTags(filePath)
            const ext = path.extname(filePath)

            // Replace template placeholders
            let newRelativePath = template
            const replacements: Record<string, string> = {
              artist: tags.artist ?? 'Unknown Artist',
              title: tags.title ?? 'Unknown Title',
              album: tags.album ?? 'Unknown Album',
              genre: tags.genre ?? 'Unknown Genre',
              year:
                tags.year !== undefined ? String(tags.year) : 'Unknown Year',
              bpm: tags.bpm !== undefined ? String(tags.bpm) : 'Unknown BPM',
              key: tags.key ?? 'Unknown Key',
            }

            for (const [key, value] of Object.entries(replacements)) {
              newRelativePath = newRelativePath.replace(
                new RegExp(`\\{${key}\\}`, 'gi'),
                sanitizeFilename(value),
              )
            }

            // If the template ends with a filename placeholder, use that;
            // otherwise append the original filename
            const lastSegment = path.basename(newRelativePath)
            let newPath: string
            if (lastSegment.includes('.') || template.includes('{title}')) {
              newPath = path.join(directory, `${newRelativePath}${ext}`)
            } else {
              newPath = path.join(
                directory,
                newRelativePath,
                path.basename(filePath),
              )
            }

            if (newPath !== filePath) {
              const destDir = path.dirname(newPath)
              await context.overlay.mkdir(destDir, { recursive: true })
              await context.overlay.rename(filePath, newPath)
              results.push({ from: filePath, to: newPath, success: true })
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            results.push({
              from: filePath,
              to: '',
              success: false,
              error: message,
            })
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  directory,
                  template,
                  totalFiles: audioFiles.length,
                  organized: results.filter((r) => r.success).length,
                  failed: results.filter((r) => !r.success).length,
                  results,
                  note: 'File moves staged in overlay. Use commit_changes to apply to disk.',
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
              text: `Error organizing files: ${message}`,
            },
          ],
        }
      }
    },
  )
}

/**
 * Remove characters that are not safe in filenames.
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}
