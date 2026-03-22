/**
 * Ingest tools — the "scanner mode" workflow.
 *
 * Designed for a typical DJ workflow:
 *   1. Point at a downloads/incoming folder
 *   2. Scan & analyze everything (tags, BPM, key)
 *   3. Deduplicate against existing library
 *   4. Stage moves into organized library structure
 *   5. Review & commit
 *
 * All mutations go through overlay (dry mode) until committed.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import fg from 'fast-glob';
import { readTags, batchReadTags, type TrackMetadata } from '../tags/tag-reader.js';
import { analyzeBpm } from '../audio/bpm-analyzer.js';
import { getKeyInfo } from '../audio/keys.js';
import { isAudioFile, SUPPORTED_FORMATS } from '../util/audio-formats.js';
import { createRenameOp, createWriteTagsOp, createSetBpmOp } from '../plans/operations.js';
import type { ServerContext } from '../server.js';

interface ScannedTrack {
  path: string;
  filename: string;
  size: number;
  modified: string;
  tags: TrackMetadata | null;
  tagErrors?: string;
}

interface IngestAnalysis {
  path: string;
  filename: string;
  size: number;
  tags: TrackMetadata | null;
  bpm?: { value: number; confidence: number } | null;
  keyInfo?: { standard: string; camelot: string; openKey: string } | null;
  issues: string[];
  suggestedPath?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildLibraryPath(
  libraryRoot: string,
  tags: TrackMetadata,
  template: string,
  ext: string,
): string {
  const replacements: Record<string, string> = {
    artist: tags.artist ?? 'Unknown Artist',
    title: tags.title ?? 'Unknown Title',
    album: tags.album ?? 'Unknown Album',
    genre: tags.genre ?? 'Unknown Genre',
    year: tags.year !== undefined ? String(tags.year) : 'Unknown Year',
    bpm: tags.bpm !== undefined ? String(Math.round(tags.bpm)) : 'Unknown BPM',
    key: tags.key ?? 'Unknown Key',
  };

  // Also add camelot key if available
  if (tags.key) {
    const keyInfo = getKeyInfo(tags.key);
    if (keyInfo) {
      replacements.camelot = keyInfo.camelot;
      replacements.openkey = keyInfo.openKey;
    }
  }

  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'gi'), sanitizeFilename(value));
  }

  return path.join(libraryRoot, `${result}${ext}`);
}

export function registerIngestTools(server: McpServer, context: ServerContext): void {
  server.tool(
    'scan_incoming',
    'Scan a folder for new audio files and read their tags. Returns summary stats ' +
    'and optionally paginated/grouped file listings. Use summaryOnly=true for a quick ' +
    'overview, then drill down with groupBy or limit/offset.',
    {
      path: z.string().describe('Absolute path to the incoming/downloads folder to scan'),
      recursive: z.boolean().optional().default(true).describe('Scan subdirectories'),
      summaryOnly: z.boolean().optional().default(false)
        .describe('Only return aggregate stats (format counts, tag coverage, date ranges) — no file list'),
      skipTags: z.boolean().optional().default(false)
        .describe('Skip tag reading for faster scanning — returns file info without tag data or tag coverage stats'),
      groupBy: z.enum(['artist', 'genre', 'date', 'format', 'folder']).optional()
        .describe('Group results by a field. Returns counts per group instead of individual files'),
      limit: z.number().optional().default(50)
        .describe('Max number of files to return in the tracks list (default 50)'),
      offset: z.number().optional().default(0)
        .describe('Skip this many files before returning (for pagination)'),
      sortBy: z.enum(['name', 'date', 'size', 'artist', 'bpm']).optional().default('date')
        .describe('Sort order for file list (default: date, newest first)'),
      filter: z.object({
        artist: z.string().optional().describe('Filter by artist (partial match, case-insensitive)'),
        genre: z.string().optional().describe('Filter by genre (partial match, case-insensitive)'),
        format: z.string().optional().describe('Filter by extension, e.g. ".mp3" or ".wav"'),
        hasTag: z.enum(['title', 'artist', 'genre', 'bpm', 'key']).optional()
          .describe('Only include files that have this tag'),
        missingTag: z.enum(['title', 'artist', 'genre', 'bpm', 'key']).optional()
          .describe('Only include files missing this tag'),
        dateAfter: z.string().optional().describe('Only files modified after this ISO date'),
        dateBefore: z.string().optional().describe('Only files modified before this ISO date'),
      }).optional().describe('Filter the results'),
    },
    async ({ path: dirPath, recursive, summaryOnly, skipTags, groupBy, limit, offset, sortBy, filter }) => {
      try {
        const exts = [...SUPPORTED_FORMATS];
        const pattern = `*{${exts.join(',')}}`;
        const fullPattern = recursive
          ? `${dirPath}/**/${pattern}`
          : `${dirPath}/${pattern}`;

        const files = await fg(fullPattern, {
          absolute: true,
          onlyFiles: true,
          followSymbolicLinks: false,
          stats: true,
        });

        // Phase 1: Fast stat-based pass (no tag reading)
        const filePaths: string[] = [];
        const formatCounts: Record<string, number> = {};
        let totalSize = 0;
        const dateRange = { earliest: '', latest: '' };
        const fileInfos: Array<{ path: string; filename: string; size: number; modified: string }> = [];

        for (const entry of files) {
          const filePath = typeof entry === 'string' ? entry : entry.path;
          const stat = (typeof entry !== 'string' && entry.stats)
            ? entry.stats
            : await fs.stat(filePath);
          const ext = path.extname(filePath).toLowerCase();
          formatCounts[ext] = (formatCounts[ext] ?? 0) + 1;
          totalSize += stat.size;

          const modified = stat.mtime.toISOString();
          if (!dateRange.earliest || modified < dateRange.earliest) dateRange.earliest = modified;
          if (!dateRange.latest || modified > dateRange.latest) dateRange.latest = modified;

          filePaths.push(filePath);
          fileInfos.push({
            path: filePath,
            filename: path.basename(filePath),
            size: stat.size,
            modified,
          });
        }

        // Phase 2: Batch tag reading (parallel, concurrency-limited)
        let tagMap: Map<string, TrackMetadata> | null = null;
        let missingTitle = 0;
        let missingArtist = 0;
        let missingGenre = 0;
        let missingBpm = 0;
        let missingKey = 0;

        if (!skipTags) {
          tagMap = await batchReadTags(filePaths, { concurrency: 8 });

          for (const fp of filePaths) {
            const tags = tagMap.get(fp);
            if (tags) {
              if (!tags.title) missingTitle++;
              if (!tags.artist) missingArtist++;
              if (!tags.genre) missingGenre++;
              if (!tags.bpm) missingBpm++;
              if (!tags.key) missingKey++;
            } else {
              missingTitle++;
              missingArtist++;
              missingGenre++;
              missingBpm++;
              missingKey++;
            }
          }
        }

        // Build tracks array
        const tracks: ScannedTrack[] = fileInfos.map((info) => ({
          ...info,
          tags: tagMap?.get(info.path) ?? null,
          tagErrors: tagMap && !tagMap.has(info.path) ? 'Failed to read tags' : undefined,
        }));

        const summary: Record<string, unknown> = {
          sourceDirectory: dirPath,
          totalFiles: tracks.length,
          totalSize,
          totalSizeHuman: formatBytes(totalSize),
          formats: formatCounts,
          dateRange,
        };

        if (!skipTags) {
          summary.tagCoverage = {
            missingTitle,
            missingArtist,
            missingGenre,
            missingBpm,
            missingKey,
          };
        }

        // Summary only — return just stats
        if (summaryOnly) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(summary, null, 2),
            }],
          };
        }

        // Apply filters
        let filtered = tracks;
        if (filter) {
          filtered = tracks.filter((t) => {
            if (filter.format) {
              const ext = path.extname(t.path).toLowerCase();
              if (ext !== filter.format.toLowerCase()) return false;
            }
            if (filter.artist && t.tags?.artist) {
              if (!t.tags.artist.toLowerCase().includes(filter.artist.toLowerCase())) return false;
            } else if (filter.artist && !t.tags?.artist) {
              return false;
            }
            if (filter.genre && t.tags?.genre) {
              if (!t.tags.genre.toLowerCase().includes(filter.genre.toLowerCase())) return false;
            } else if (filter.genre && !t.tags?.genre) {
              return false;
            }
            if (filter.hasTag) {
              const val = t.tags?.[filter.hasTag as keyof TrackMetadata];
              if (val === undefined || val === null) return false;
            }
            if (filter.missingTag) {
              const val = t.tags?.[filter.missingTag as keyof TrackMetadata];
              if (val !== undefined && val !== null) return false;
            }
            if (filter.dateAfter && t.modified < filter.dateAfter) return false;
            if (filter.dateBefore && t.modified > filter.dateBefore) return false;
            return true;
          });
        }

        // Group by mode — return counts per group
        if (groupBy) {
          const groups: Record<string, { count: number; totalSize: number; files: string[] }> = {};

          for (const t of filtered) {
            let key: string;
            switch (groupBy) {
              case 'artist':
                key = t.tags?.artist ?? '(no artist tag)';
                break;
              case 'genre':
                key = t.tags?.genre ?? '(no genre tag)';
                break;
              case 'date':
                key = t.modified.slice(0, 10); // YYYY-MM-DD
                break;
              case 'format':
                key = path.extname(t.path).toLowerCase();
                break;
              case 'folder':
                key = path.dirname(t.path).replace(dirPath, '.') || '.';
                break;
              default:
                key = '(unknown)';
            }

            if (!groups[key]) groups[key] = { count: 0, totalSize: 0, files: [] };
            groups[key].count++;
            groups[key].totalSize += t.size;
            // Keep max 5 example filenames per group
            if (groups[key].files.length < 5) {
              groups[key].files.push(t.filename);
            }
          }

          // Sort groups by count descending
          const sorted = Object.entries(groups)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([name, data]) => ({
              [groupBy]: name,
              count: data.count,
              totalSize: formatBytes(data.totalSize),
              examples: data.files,
            }));

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                ...summary,
                groupBy,
                filteredTotal: filtered.length,
                groupCount: sorted.length,
                groups: sorted,
              }, null, 2),
            }],
          };
        }

        // Sort
        switch (sortBy) {
          case 'date':
            filtered.sort((a, b) => b.modified.localeCompare(a.modified));
            break;
          case 'size':
            filtered.sort((a, b) => b.size - a.size);
            break;
          case 'artist':
            filtered.sort((a, b) =>
              (a.tags?.artist ?? 'zzz').localeCompare(b.tags?.artist ?? 'zzz'));
            break;
          case 'bpm':
            filtered.sort((a, b) => (a.tags?.bpm ?? 0) - (b.tags?.bpm ?? 0));
            break;
          case 'name':
          default:
            filtered.sort((a, b) => a.filename.localeCompare(b.filename));
            break;
        }

        // Paginate
        const page = filtered.slice(offset, offset + limit);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              ...summary,
              filtered: filtered.length,
              showing: { offset, limit, count: page.length },
              hasMore: offset + limit < filtered.length,
              nextOffset: offset + limit < filtered.length ? offset + limit : null,
              tracks: page,
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error scanning incoming folder: ${message}` }],
        };
      }
    },
  );

  server.tool(
    'analyze_incoming',
    'Deep-analyze incoming audio files: read tags, detect BPM, identify musical key. ' +
    'Flags issues like missing tags, untagged BPM, low confidence BPM. ' +
    'Optionally suggests where each file should go in the library.',
    {
      paths: z.array(z.string()).describe('Absolute paths to audio files to analyze'),
      detectBpm: z.boolean().optional().default(false).describe('Run BPM detection (requires ffmpeg, slower)'),
      libraryRoot: z.string().optional().describe('Library root path — if set, suggests destination paths'),
      organizationTemplate: z.string().optional().default('{genre}/{artist}/{title}')
        .describe('Template for library organization, e.g. "{genre}/{artist}/{title}"'),
    },
    async ({ paths: filePaths, detectBpm, libraryRoot, organizationTemplate }) => {
      try {
        // Batch read tags upfront (parallel, concurrency-limited)
        const tagMap = await batchReadTags(filePaths, { concurrency: 8 });

        const results: IngestAnalysis[] = [];

        for (const filePath of filePaths) {
          const stat = await fs.stat(filePath);
          const ext = path.extname(filePath);
          const issues: string[] = [];

          // Use pre-read tags
          const tags = tagMap.get(filePath) ?? null;
          if (!tags) {
            issues.push('Failed to read tags');
          }

          // Check tag completeness
          if (tags) {
            if (!tags.title) issues.push('Missing title tag');
            if (!tags.artist) issues.push('Missing artist tag');
            if (!tags.genre) issues.push('Missing genre tag');
            if (!tags.album) issues.push('Missing album tag');
            if (!tags.year) issues.push('Missing year tag');
          }

          // BPM detection
          let bpm: { value: number; confidence: number } | null = null;
          if (detectBpm) {
            try {
              const result = await analyzeBpm(filePath);
              bpm = { value: result.bpm, confidence: result.confidence };
              if (result.confidence < 0.5) {
                issues.push(`Low BPM confidence (${Math.round(result.confidence * 100)}%)`);
              }
              if (!tags?.bpm && result.bpm > 0) {
                issues.push(`BPM not in tags but detected as ${result.bpm}`);
              } else if (tags?.bpm && Math.abs(tags.bpm - result.bpm) > 2) {
                issues.push(`BPM mismatch: tag says ${tags.bpm}, detected ${result.bpm}`);
              }
            } catch (err) {
              issues.push(`BPM detection failed: ${err instanceof Error ? err.message : String(err)}`);
            }
          } else if (!tags?.bpm) {
            issues.push('No BPM in tags (use detectBpm to analyze)');
          }

          // Key info
          let keyInfo: { standard: string; camelot: string; openKey: string } | null = null;
          if (tags?.key) {
            const info = getKeyInfo(tags.key);
            if (info) {
              keyInfo = { standard: info.standard, camelot: info.camelot, openKey: info.openKey };
            }
          } else {
            issues.push('No musical key in tags');
          }

          // Suggest library path
          let suggestedPath: string | undefined;
          if (libraryRoot && tags) {
            suggestedPath = buildLibraryPath(libraryRoot, tags, organizationTemplate, ext);
          }

          results.push({
            path: filePath,
            filename: path.basename(filePath),
            size: stat.size,
            tags,
            bpm,
            keyInfo,
            issues,
            suggestedPath,
          });
        }

        const totalIssues = results.reduce((n, r) => n + r.issues.length, 0);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              totalFiles: results.length,
              totalIssues,
              filesWithIssues: results.filter((r) => r.issues.length > 0).length,
              cleanFiles: results.filter((r) => r.issues.length === 0).length,
              results,
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error analyzing files: ${message}` }],
        };
      }
    },
  );

  server.tool(
    'check_duplicates',
    'Check if incoming files already exist in the library by comparing artist+title tags, ' +
    'filename similarity, and file size. Returns matches and near-matches.',
    {
      incomingPaths: z.array(z.string()).describe('Paths to incoming files to check'),
      libraryPath: z.string().describe('Absolute path to the existing music library'),
    },
    async ({ incomingPaths, libraryPath }) => {
      try {
        // Scan library
        const exts = [...SUPPORTED_FORMATS];
        const pattern = `*{${exts.join(',')}}`;
        const libraryFiles = await fg(`${libraryPath}/**/${pattern}`, {
          absolute: true,
          onlyFiles: true,
        });

        // Build library index: filename -> path, and tag index
        const libraryIndex = new Map<string, string[]>();
        const libraryTagIndex = new Map<string, string>(); // "artist|title" -> path

        for (const libFile of libraryFiles) {
          const basename = path.basename(libFile).toLowerCase();
          const existing = libraryIndex.get(basename) ?? [];
          existing.push(libFile);
          libraryIndex.set(basename, existing);
        }

        // Batch read library tags for tag-based dedup
        const libTagMap = await batchReadTags(libraryFiles, { concurrency: 8 });
        for (const [libFile, tags] of libTagMap) {
          if (tags.artist && tags.title) {
            const key = `${tags.artist.toLowerCase()}|${tags.title.toLowerCase()}`;
            libraryTagIndex.set(key, libFile);
          }
        }

        // Check each incoming file
        const results: Array<{
          incomingPath: string;
          duplicateType: 'exact_filename' | 'same_track' | 'similar' | 'none';
          matchedLibraryPath?: string;
          details?: string;
        }> = [];

        for (const incoming of incomingPaths) {
          const basename = path.basename(incoming).toLowerCase();
          let found = false;

          // 1. Exact filename match
          const filenameMatches = libraryIndex.get(basename);
          if (filenameMatches && filenameMatches.length > 0) {
            results.push({
              incomingPath: incoming,
              duplicateType: 'exact_filename',
              matchedLibraryPath: filenameMatches[0],
              details: `Same filename found in library (${filenameMatches.length} match${filenameMatches.length > 1 ? 'es' : ''})`,
            });
            found = true;
            continue;
          }

          // 2. Same artist+title in tags
          try {
            const tags = await readTags(incoming);
            if (tags.artist && tags.title) {
              const key = `${tags.artist.toLowerCase()}|${tags.title.toLowerCase()}`;
              const match = libraryTagIndex.get(key);
              if (match) {
                results.push({
                  incomingPath: incoming,
                  duplicateType: 'same_track',
                  matchedLibraryPath: match,
                  details: `Same artist+title: ${tags.artist} - ${tags.title}`,
                });
                found = true;
                continue;
              }
            }
          } catch {
            // Can't read tags, skip tag-based check
          }

          // 3. Similar filename (strip common suffixes like (1), _copy, etc.)
          const normalized = basename
            .replace(/\s*\(\d+\)\s*/, '')
            .replace(/\s*_copy\s*/i, '')
            .replace(/\s*-\s*copy\s*/i, '')
            .replace(/\s+/g, ' ')
            .trim();

          for (const [libName, libPaths] of libraryIndex) {
            const libNormalized = libName
              .replace(/\s*\(\d+\)\s*/, '')
              .replace(/\s+/g, ' ')
              .trim();

            if (libNormalized === normalized && libName !== basename) {
              results.push({
                incomingPath: incoming,
                duplicateType: 'similar',
                matchedLibraryPath: libPaths[0],
                details: `Similar filename: "${path.basename(incoming)}" ≈ "${path.basename(libPaths[0])}"`,
              });
              found = true;
              break;
            }
          }

          if (!found) {
            results.push({
              incomingPath: incoming,
              duplicateType: 'none',
            });
          }
        }

        const duplicates = results.filter((r) => r.duplicateType !== 'none');

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              totalChecked: incomingPaths.length,
              librarySize: libraryFiles.length,
              duplicatesFound: duplicates.length,
              newFiles: results.filter((r) => r.duplicateType === 'none').length,
              results,
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error checking duplicates: ${message}` }],
        };
      }
    },
  );

  server.tool(
    'stage_ingest',
    'Stage files for ingest into the library. Moves files from incoming folder to library ' +
    'using a folder template based on tags. All moves go through the overlay — nothing ' +
    'is written until you commit. Creates a Plan for the ingest that can be exported/resumed.',
    {
      files: z.array(z.object({
        sourcePath: z.string().describe('Current path of the file'),
        destinationPath: z.string().optional().describe('Override destination path (if not using template)'),
        tagsToWrite: z.record(z.string(), z.unknown()).optional().describe('Tags to write before moving'),
        bpm: z.number().optional().describe('BPM to set in tags'),
      })).describe('Files to ingest with optional overrides'),
      libraryRoot: z.string().describe('Root directory of the music library'),
      organizationTemplate: z.string().optional().default('{genre}/{artist}/{title}')
        .describe('Template for library organization'),
      planName: z.string().optional().default('Ingest').describe('Name for the ingest plan'),
    },
    async ({ files, libraryRoot, organizationTemplate, planName }) => {
      try {
        const plan = context.planManager.createPlan(
          planName,
          libraryRoot,
          `Ingest of ${files.length} files into ${libraryRoot}`,
        );

        const staged: Array<{ source: string; destination: string; operations: string[] }> = [];

        for (const file of files) {
          const operations: string[] = [];

          // Write tags if provided
          if (file.tagsToWrite && Object.keys(file.tagsToWrite).length > 0) {
            context.planManager.addOperation(plan.id, createWriteTagsOp(file.sourcePath, file.tagsToWrite));
            operations.push(`write tags: ${Object.keys(file.tagsToWrite).join(', ')}`);
          }

          // Set BPM if provided
          if (file.bpm !== undefined) {
            context.planManager.addOperation(plan.id, createSetBpmOp(file.sourcePath, file.bpm));
            operations.push(`set BPM: ${file.bpm}`);
          }

          // Determine destination
          let dest = file.destinationPath;
          if (!dest) {
            // Read tags (possibly updated) to build path
            let tags: TrackMetadata | null = null;
            try {
              tags = await readTags(file.sourcePath);
            } catch {
              // Use empty tags
            }

            // Merge with tags to write
            const mergedTags: TrackMetadata = {
              ...(tags ?? { format: 'unknown' }),
              ...file.tagsToWrite as Partial<TrackMetadata>,
            };
            if (file.bpm !== undefined) mergedTags.bpm = file.bpm;

            const ext = path.extname(file.sourcePath);
            dest = buildLibraryPath(libraryRoot, mergedTags, organizationTemplate, ext);
          }

          // Stage the move in overlay
          const destDir = path.dirname(dest);
          await context.overlay.mkdir(destDir, { recursive: true });
          await context.overlay.rename(file.sourcePath, dest);
          context.planManager.addOperation(plan.id, createRenameOp(file.sourcePath, dest));
          operations.push(`move to: ${dest}`);

          staged.push({ source: file.sourcePath, destination: dest, operations });
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              planId: plan.id,
              planName: plan.name,
              totalFiles: files.length,
              staged,
              nextSteps: [
                `Use view_plan with planId "${plan.id}" to review all operations`,
                'Use get_pending_changes to see the overlay diff',
                'Use commit_changes to apply all moves to disk',
                `Use export_plan with planId "${plan.id}" to save the plan for later`,
                'Use discard_changes to cancel everything',
              ],
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error staging ingest: ${message}` }],
        };
      }
    },
  );

  server.tool(
    'quick_ingest',
    'One-shot ingest: scan a folder, read tags, check for duplicates against library, ' +
    'and stage all non-duplicate files for organized import. Combines scan_incoming, ' +
    'check_duplicates, and stage_ingest into a single call.',
    {
      incomingPath: z.string().describe('Folder with new music to ingest (e.g. ~/Downloads)'),
      libraryPath: z.string().describe('Root of the organized music library'),
      organizationTemplate: z.string().optional().default('{genre}/{artist}/{title}')
        .describe('How to organize files in the library'),
      skipDuplicates: z.boolean().optional().default(true)
        .describe('Skip files that already exist in the library'),
      recursive: z.boolean().optional().default(true)
        .describe('Scan incoming folder recursively'),
    },
    async ({ incomingPath, libraryPath, organizationTemplate, skipDuplicates, recursive }) => {
      try {
        // 1. Scan incoming
        const exts = [...SUPPORTED_FORMATS];
        const pattern = `*{${exts.join(',')}}`;
        const fullPattern = recursive
          ? `${incomingPath}/**/${pattern}`
          : `${incomingPath}/${pattern}`;

        const incomingFiles = await fg(fullPattern, {
          absolute: true,
          onlyFiles: true,
        });

        if (incomingFiles.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                message: 'No audio files found in incoming folder.',
                incomingPath,
              }, null, 2),
            }],
          };
        }

        // 2. Batch read tags for all incoming files (parallel, concurrency-limited)
        const incomingTagMap = await batchReadTags(incomingFiles, { concurrency: 8 });
        const trackData: Array<{ path: string; tags: TrackMetadata | null; issues: string[] }> = [];
        for (const filePath of incomingFiles) {
          const tags = incomingTagMap.get(filePath) ?? null;
          const issues: string[] = [];
          if (tags) {
            if (!tags.title) issues.push('missing title');
            if (!tags.artist) issues.push('missing artist');
            if (!tags.genre) issues.push('missing genre');
            if (!tags.bpm) issues.push('missing bpm');
          } else {
            issues.push('unreadable tags');
          }
          trackData.push({ path: filePath, tags, issues });
        }

        // 3. Check for duplicates
        let duplicatePaths = new Set<string>();
        if (skipDuplicates) {
          const libraryExts = [...SUPPORTED_FORMATS];
          const libPattern = `*{${libraryExts.join(',')}}`;
          const libraryFiles = await fg(`${libraryPath}/**/${libPattern}`, {
            absolute: true,
            onlyFiles: true,
          });

          // Build indexes: filename-based (fast) + tag-based (batch parallel)
          const filenameIndex = new Map<string, string>();
          for (const libFile of libraryFiles) {
            filenameIndex.set(path.basename(libFile).toLowerCase(), libFile);
          }

          const tagIndex = new Map<string, string>();
          const libTagMap = await batchReadTags(libraryFiles, { concurrency: 8 });
          for (const [libFile, libTags] of libTagMap) {
            if (libTags.artist && libTags.title) {
              tagIndex.set(`${libTags.artist.toLowerCase()}|${libTags.title.toLowerCase()}`, libFile);
            }
          }

          for (const track of trackData) {
            const basename = path.basename(track.path).toLowerCase();
            if (filenameIndex.has(basename)) {
              duplicatePaths.add(track.path);
              continue;
            }
            if (track.tags?.artist && track.tags?.title) {
              const key = `${track.tags.artist.toLowerCase()}|${track.tags.title.toLowerCase()}`;
              if (tagIndex.has(key)) {
                duplicatePaths.add(track.path);
              }
            }
          }
        }

        // 4. Stage non-duplicate files
        const toIngest = trackData.filter((t) => !duplicatePaths.has(t.path));
        const plan = context.planManager.createPlan(
          `Ingest ${new Date().toISOString().slice(0, 10)}`,
          libraryPath,
          `Quick ingest from ${incomingPath}: ${toIngest.length} files`,
        );

        const staged: Array<{ source: string; destination: string; issues: string[] }> = [];

        for (const track of toIngest) {
          const ext = path.extname(track.path);
          const tags = track.tags ?? { format: 'unknown' } as TrackMetadata;
          const dest = buildLibraryPath(libraryPath, tags, organizationTemplate, ext);

          const destDir = path.dirname(dest);
          await context.overlay.mkdir(destDir, { recursive: true });
          await context.overlay.rename(track.path, dest);
          context.planManager.addOperation(plan.id, createRenameOp(track.path, dest));

          staged.push({ source: track.path, destination: dest, issues: track.issues });
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              summary: {
                scanned: incomingFiles.length,
                duplicatesSkipped: duplicatePaths.size,
                stagedForIngest: staged.length,
                filesWithIssues: staged.filter((s) => s.issues.length > 0).length,
              },
              planId: plan.id,
              planName: plan.name,
              duplicates: [...duplicatePaths].map((p) => path.basename(p)),
              staged,
              nextSteps: [
                `Review: view_plan planId="${plan.id}"`,
                'Preview: get_pending_changes',
                'Apply: commit_changes',
                `Save for later: export_plan planId="${plan.id}"`,
                'Cancel: discard_changes',
              ],
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error in quick ingest: ${message}` }],
        };
      }
    },
  );
}
