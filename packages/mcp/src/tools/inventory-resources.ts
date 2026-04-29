import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { ServerContext } from '../server.js'

function asJsonResource(uri: string, data: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(data, null, 2),
      },
    ],
  }
}

export function registerInventoryResources(
  server: McpServer,
  context: ServerContext,
): void {
  server.resource(
    'inventory-summary',
    'inventory://summary',
    {
      mimeType: 'application/json',
      description: 'Inventory summary including counts and latest scan information.',
    },
    async (uri) => asJsonResource(uri.toString(), context.inventory.getSummaryResource()),
  )

  server.resource(
    'inventory-scan',
    new ResourceTemplate('inventory://scan/{scanRunId}', { list: undefined }),
    {
      mimeType: 'application/json',
      description: 'Scan run details for one inventory scan.',
    },
    async (uri, variables) =>
      asJsonResource(
        uri.toString(),
        context.inventory.getScanRun(String(variables.scanRunId)) ?? {
          error: 'Scan run not found',
          scanRunId: String(variables.scanRunId),
        },
      ),
  )

  server.resource(
    'inventory-file',
    new ResourceTemplate('inventory://file/{fileId}', { list: undefined }),
    {
      mimeType: 'application/json',
      description: 'Complete inventory file record.',
    },
    async (uri, variables) =>
      asJsonResource(
        uri.toString(),
        context.inventory.getInventoryFile(String(variables.fileId)) ?? {
          error: 'Inventory file not found',
          fileId: String(variables.fileId),
        },
      ),
  )

  server.resource(
    'inventory-directory',
    new ResourceTemplate('inventory://directory/{directoryId}', {
      list: undefined,
    }),
    {
      mimeType: 'application/json',
      description: 'Stored inventory directory record.',
    },
    async (uri, variables) =>
      asJsonResource(
        uri.toString(),
        context.inventory
          .queryInventoryDirectories()
          .find((directory) => directory.id === String(variables.directoryId)) ?? {
          error: 'Inventory directory not found',
          directoryId: String(variables.directoryId),
        },
      ),
  )

  server.resource(
    'inventory-archive',
    new ResourceTemplate('inventory://archive/{archiveId}', { list: undefined }),
    {
      mimeType: 'application/json',
      description: 'Tracked archive record with entry details.',
    },
    async (uri, variables) => {
      const archiveId = String(variables.archiveId)
      const archive =
        context.inventory
          .queryInventoryArchives()
          .find((record) => record.id === archiveId) ?? null

      return asJsonResource(uri.toString(), {
        archive,
        entries: archive ? context.inventory.getArchiveEntries(archiveId) : [],
      })
    },
  )

  server.resource(
    'inventory-move-plan',
    new ResourceTemplate('inventory://move-plan/{movePlanId}', {
      list: undefined,
    }),
    {
      mimeType: 'application/json',
      description: 'Stored move plan and item ledger.',
    },
    async (uri, variables) =>
      asJsonResource(
        uri.toString(),
        context.inventory.getMovePlan(String(variables.movePlanId)) ?? {
          error: 'Move plan not found',
          movePlanId: String(variables.movePlanId),
        },
      ),
  )

  server.resource(
    'inventory-duplicates',
    'inventory://duplicates',
    {
      mimeType: 'application/json',
      description: 'Current duplicate candidate groups.',
    },
    async (uri) =>
      asJsonResource(uri.toString(), context.inventory.findDuplicateCandidates()),
  )
}
