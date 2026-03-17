import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from '../server.js';

export function registerOverlayTools(server: McpServer, context: ServerContext): void {
  server.tool(
    'get_pending_changes',
    'List all pending changes in the overlay filesystem that have not yet been committed to disk.',
    {},
    async () => {
      try {
        const summary = context.overlay.getSummary();
        const operations = context.overlay.getTrackedOperations();

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              summary: {
                total: summary.total,
                writes: summary.writes,
                renames: summary.renames,
                deletes: summary.deletes,
                mkdirs: summary.mkdirs,
              },
              affectedPaths: summary.affectedPaths,
              operations: operations.map((op) => ({
                type: op.type,
                path: op.path,
                from: op.from,
                to: op.to,
                timestamp: op.timestamp,
                hasData: op.data !== undefined,
              })),
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error getting pending changes: ${message}` }],
        };
      }
    },
  );

  server.tool(
    'preview_change',
    'Show what would change for a specific file path in the overlay.',
    {
      path: z.string().describe('Absolute path to preview changes for'),
    },
    async ({ path: filePath }) => {
      try {
        const operations = context.overlay.getTrackedOperations();
        const relevant = operations.filter(
          (op) => op.path === filePath || op.from === filePath || op.to === filePath,
        );

        if (relevant.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                path: filePath,
                hasChanges: false,
                message: 'No pending changes for this file.',
              }, null, 2),
            }],
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              path: filePath,
              hasChanges: true,
              operations: relevant.map((op) => ({
                type: op.type,
                path: op.path,
                from: op.from,
                to: op.to,
                timestamp: op.timestamp,
                dataSize: op.data ? op.data.length : undefined,
              })),
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error previewing change: ${message}` }],
        };
      }
    },
  );

  server.tool(
    'commit_changes',
    'Apply all pending overlay changes to the real filesystem. Creates backups before overwriting.',
    {},
    async () => {
      try {
        const result = await context.overlay.commitAll();

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: result.success,
              total: result.total,
              succeeded: result.succeeded,
              failed: result.failed,
              results: result.results.map((r) => ({
                type: r.operation.type,
                path: r.operation.path,
                success: r.success,
                error: r.error,
                backupPath: r.backupPath,
              })),
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error committing changes: ${message}` }],
        };
      }
    },
  );

  server.tool(
    'discard_changes',
    'Discard all pending overlay changes and reset the in-memory filesystem.',
    {},
    async () => {
      try {
        context.overlay.reset();

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              discarded: true,
              message: 'All pending overlay changes have been discarded.',
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error discarding changes: ${message}` }],
        };
      }
    },
  );

  server.tool(
    'commit_selective',
    'Commit only overlay changes that affect the specified file paths.',
    {
      paths: z.array(z.string()).describe('Array of absolute file paths to commit'),
    },
    async ({ paths }) => {
      try {
        const result = await context.overlay.commitSelective(paths);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: result.success,
              total: result.total,
              succeeded: result.succeeded,
              failed: result.failed,
              requestedPaths: paths,
              results: result.results.map((r) => ({
                type: r.operation.type,
                path: r.operation.path,
                success: r.success,
                error: r.error,
                backupPath: r.backupPath,
              })),
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error committing selective changes: ${message}` }],
        };
      }
    },
  );
}
