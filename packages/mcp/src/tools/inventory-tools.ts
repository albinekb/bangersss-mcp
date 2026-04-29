import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import type { ServerContext } from '../server.js'

export function registerInventoryTools(
  server: McpServer,
  context: ServerContext,
): void {
  server.tool(
    'init_inventory_db',
    'Create or migrate the inventory SQLite database.',
    {
      dbPath: z.string().optional().describe('Optional absolute path to the inventory database'),
    },
    async ({ dbPath }) => {
      try {
        const result = context.inventory.initInventoryDb(dbPath)
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  initialized: true,
                  ...result,
                },
                null,
                2,
              ),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error initializing inventory DB: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'get_inventory_status',
    'Return inventory DB path, schema version, counts, and latest scan summary.',
    {},
    async () => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(context.inventory.getInventoryStatus(), null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error getting inventory status: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'compact_inventory_db',
    'Run VACUUM and ANALYZE on the inventory database.',
    {},
    async () => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(context.inventory.compactInventoryDb(), null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error compacting inventory DB: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'scan_inventory',
    'Scan one or more roots into the persistent inventory.',
    {
      roots: z.array(z.string()).describe('Absolute root paths to scan'),
      mode: z
        .enum(['full', 'incremental', 'hash-only', 'metadata-only', 'archive-only'])
        .optional()
        .default('full'),
      includeArchives: z.boolean().optional().default(true),
      computeFullHashes: z.boolean().optional().default(true),
      extractArtwork: z.boolean().optional().default(false),
      followSymlinks: z.boolean().optional().default(false),
      extensions: z.array(z.string()).optional(),
      excludePatterns: z.array(z.string()).optional(),
    },
    async (args) => {
      try {
        const result = await context.inventory.scanInventory(args)
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error scanning inventory: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'get_scan_run',
    'Get a scan run by ID.',
    {
      scanRunId: z.string().describe('Scan run identifier'),
    },
    async ({ scanRunId }) => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(context.inventory.getScanRun(scanRunId), null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error getting scan run: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'list_scan_runs',
    'List historical inventory scan runs.',
    {},
    async () => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(context.inventory.listScanRuns(), null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error listing scan runs: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'query_inventory_files',
    'Query stored inventory files with path, tag, hash, duplicate, and missing-file filters.',
    {
      rootPath: z.string().optional(),
      path: z.string().optional(),
      extension: z.string().optional(),
      artist: z.string().optional(),
      title: z.string().optional(),
      album: z.string().optional(),
      genre: z.string().optional(),
      duplicatesOnly: z.boolean().optional().default(false),
      missingFilesOnly: z.boolean().optional().default(false),
      hasHash: z.boolean().optional().default(false),
    },
    async (query) => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(context.inventory.queryInventoryFiles(query), null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error querying inventory files: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'get_inventory_file',
    'Get a single inventory file including hashes, metadata, and observation history.',
    {
      fileId: z.string().describe('Inventory file identifier'),
    },
    async ({ fileId }) => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(context.inventory.getInventoryFile(fileId), null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error getting inventory file: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'query_inventory_directories',
    'Query the stored inventory directory tree.',
    {
      rootPath: z.string().optional(),
      parentPath: z.string().optional(),
      existsNow: z.boolean().optional(),
    },
    async (query) => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                context.inventory.queryInventoryDirectories(query),
                null,
                2,
              ),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error querying inventory directories: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'query_inventory_archives',
    'List tracked archives in the inventory database.',
    {
      rootPath: z.string().optional(),
    },
    async (query) => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(context.inventory.queryInventoryArchives(query), null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error querying inventory archives: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'get_archive_entry',
    'Get metadata for one archive entry by entry ID or archive ID + entry path.',
    {
      archiveEntryId: z.string().optional(),
      archiveId: z.string().optional(),
      entryPath: z.string().optional(),
    },
    async (input) => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(context.inventory.getArchiveEntry(input), null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error getting archive entry: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'find_duplicate_candidates',
    'Group likely duplicate files by full hash or size+tags.',
    {},
    async () => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(context.inventory.findDuplicateCandidates(), null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error finding duplicate candidates: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'export_inventory',
    'Export inventory data as JSON or CSV and optionally write it to disk.',
    {
      format: z.enum(['json', 'csv']),
      scope: z.enum(['files', 'directories', 'archives', 'duplicates', 'moves']),
      outputPath: z.string().optional(),
    },
    async (input) => {
      try {
        const result = await context.inventory.exportInventory(input)
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  format: result.format,
                  scope: result.scope,
                  outputPath: result.outputPath,
                  data: result.data,
                },
                null,
                2,
              ),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error exporting inventory: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'create_move_plan',
    'Create a move plan without touching files on disk.',
    {
      fileIds: z.array(z.string()).optional(),
      sourceQuery: z
        .object({
          rootPath: z.string().optional(),
          path: z.string().optional(),
          extension: z.string().optional(),
          artist: z.string().optional(),
          title: z.string().optional(),
          album: z.string().optional(),
          genre: z.string().optional(),
          duplicatesOnly: z.boolean().optional(),
          missingFilesOnly: z.boolean().optional(),
          hasHash: z.boolean().optional(),
        })
        .optional(),
      destinationRoot: z.string(),
      strategy: z.enum(['preserve-relative', 'artist-album-track', 'flat']),
      dryRun: z.boolean().optional().default(true),
      overwrite: z.boolean().optional().default(false),
      name: z.string().optional(),
      notes: z.string().optional(),
    },
    async (input) => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(context.inventory.createMovePlan(input), null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error creating move plan: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'get_move_plan',
    'Inspect a stored move plan and its items.',
    {
      movePlanId: z.string(),
    },
    async ({ movePlanId }) => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(context.inventory.getMovePlan(movePlanId), null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error getting move plan: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'execute_move_plan',
    'Stage moves for a plan through the overlay filesystem and update the inventory ledger.',
    {
      movePlanId: z.string(),
    },
    async ({ movePlanId }) => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                await context.movePlans.executeMovePlan(movePlanId),
                null,
                2,
              ),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error executing move plan: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'verify_move_plan',
    'Verify moved items by hashing their overlay destination content.',
    {
      movePlanId: z.string(),
    },
    async ({ movePlanId }) => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                await context.movePlans.verifyMovePlan(movePlanId),
                null,
                2,
              ),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error verifying move plan: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'record_external_move',
    'Link an existing inventory file ID to a new path after a move outside MCP.',
    {
      fileId: z.string(),
      newPath: z.string(),
      verifyByHash: z.boolean().optional().default(true),
    },
    async ({ fileId, newPath, verifyByHash }) => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                await context.inventory.recordExternalMove(
                  fileId,
                  newPath,
                  verifyByHash,
                ),
                null,
                2,
              ),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error recording external move: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'get_inventory_changes',
    'Read inventory change events from the SQLite-backed change log.',
    {
      eventType: z.string().optional(),
      entityType: z.string().optional(),
      limit: z.number().optional().default(100),
    },
    async (filters) => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                context.inventory.getInventoryChanges(filters),
                null,
                2,
              ),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error getting inventory changes: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'get_changes',
    'Compatibility alias for get_inventory_changes backed by SQLite change events.',
    {
      eventType: z.string().optional(),
      entityType: z.string().optional(),
      limit: z.number().optional().default(100),
    },
    async (filters) => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                context.inventory.getInventoryChanges(filters),
                null,
                2,
              ),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error getting changes: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'clear_inventory_changes',
    'Delete inventory change events, optionally filtered by event/entity type.',
    {
      eventType: z.string().optional(),
      entityType: z.string().optional(),
    },
    async (filters) => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  deleted: context.inventory.clearInventoryChanges(filters),
                },
                null,
                2,
              ),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error clearing inventory changes: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  server.tool(
    'clear_changes',
    'Compatibility alias for clear_inventory_changes backed by SQLite change events.',
    {
      eventType: z.string().optional(),
      entityType: z.string().optional(),
    },
    async (filters) => {
      try {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  deleted: context.inventory.clearInventoryChanges(filters),
                },
                null,
                2,
              ),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error clearing changes: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )
}
