import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { OperationSchema } from '../plans/types.js'
import type { ServerContext } from '../server.js'

export function registerPlanTools(
  server: McpServer,
  context: ServerContext,
): void {
  server.tool(
    'create_plan',
    'Create a new execution plan for batch file operations.',
    {
      name: z.string().describe('Plan name'),
      description: z
        .string()
        .optional()
        .describe('Optional description of what this plan does'),
      baseDirectory: z.string().describe('Base directory the plan operates on'),
    },
    async ({ name, description, baseDirectory }) => {
      try {
        const plan = context.planManager.createPlan(
          name,
          baseDirectory,
          description,
        )

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  created: true,
                  plan: {
                    id: plan.id,
                    name: plan.name,
                    description: plan.description,
                    baseDirectory: plan.baseDirectory,
                    createdAt: plan.createdAt,
                  },
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
            { type: 'text' as const, text: `Error creating plan: ${message}` },
          ],
        }
      }
    },
  )

  server.tool(
    'add_to_plan',
    'Add an operation to an existing plan. Operations include rename_file, move_file, write_tags, set_bpm, create_playlist, add_to_playlist, delete_file, etc.',
    {
      planId: z.string().describe('Plan ID'),
      operation: OperationSchema.describe('The operation to add'),
    },
    async ({ planId, operation }) => {
      try {
        context.planManager.addOperation(planId, operation)
        const plan = context.planManager.getPlan(planId)

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  added: true,
                  planId,
                  totalOperations: plan.operations.length,
                  operation,
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
            { type: 'text' as const, text: `Error adding to plan: ${message}` },
          ],
        }
      }
    },
  )

  server.tool(
    'view_plan',
    'View the details and all operations in a plan.',
    {
      planId: z.string().describe('Plan ID'),
    },
    async ({ planId }) => {
      try {
        const plan = context.planManager.getPlan(planId)

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  id: plan.id,
                  name: plan.name,
                  description: plan.description,
                  baseDirectory: plan.baseDirectory,
                  createdAt: plan.createdAt,
                  updatedAt: plan.updatedAt,
                  metadata: plan.metadata,
                  operations: plan.operations,
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
            { type: 'text' as const, text: `Error viewing plan: ${message}` },
          ],
        }
      }
    },
  )

  server.tool(
    'execute_plan',
    'Execute all pending operations in a plan. Use dryMode to preview without making changes.',
    {
      planId: z.string().describe('Plan ID'),
      dryMode: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, simulate execution without making changes'),
    },
    async ({ planId, dryMode }) => {
      try {
        const result = await context.planManager.executePlan(planId, {
          dryMode,
        })

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  planId: result.planId,
                  dryMode: result.dryMode,
                  executed: result.executed,
                  succeeded: result.succeeded,
                  failed: result.failed,
                  skipped: result.skipped,
                  errors: result.errors,
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
            { type: 'text' as const, text: `Error executing plan: ${message}` },
          ],
        }
      }
    },
  )

  server.tool(
    'export_plan',
    'Export a plan to a JSON file on disk.',
    {
      planId: z.string().describe('Plan ID'),
      outputPath: z.string().describe('Absolute path for the output JSON file'),
    },
    async ({ planId, outputPath }) => {
      try {
        await context.planManager.exportPlan(planId, outputPath)

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  exported: true,
                  planId,
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
            { type: 'text' as const, text: `Error exporting plan: ${message}` },
          ],
        }
      }
    },
  )

  server.tool(
    'import_plan',
    'Import a plan from a JSON file on disk.',
    {
      path: z.string().describe('Absolute path to the plan JSON file'),
    },
    async ({ path: filePath }) => {
      try {
        const plan = await context.planManager.importPlan(filePath)

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  imported: true,
                  plan: {
                    id: plan.id,
                    name: plan.name,
                    description: plan.description,
                    baseDirectory: plan.baseDirectory,
                    totalOperations: plan.operations.length,
                  },
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
            { type: 'text' as const, text: `Error importing plan: ${message}` },
          ],
        }
      }
    },
  )

  server.tool(
    'resume_plan',
    'Resume executing a plan from where it left off (only pending operations are run).',
    {
      planId: z.string().describe('Plan ID'),
    },
    async ({ planId }) => {
      try {
        const result = await context.planManager.resumePlan(planId)

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  planId: result.planId,
                  dryMode: result.dryMode,
                  executed: result.executed,
                  succeeded: result.succeeded,
                  failed: result.failed,
                  skipped: result.skipped,
                  errors: result.errors,
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
            { type: 'text' as const, text: `Error resuming plan: ${message}` },
          ],
        }
      }
    },
  )

  server.tool(
    'list_plans',
    'List all plans currently managed by the server.',
    {},
    async () => {
      try {
        const plans = context.planManager.listPlans()

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  totalPlans: plans.length,
                  plans: plans.map((p) => ({
                    id: p.id,
                    name: p.name,
                    description: p.description,
                    baseDirectory: p.baseDirectory,
                    totalOperations: p.operations.length,
                    metadata: p.metadata,
                    createdAt: p.createdAt,
                    updatedAt: p.updatedAt,
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
            { type: 'text' as const, text: `Error listing plans: ${message}` },
          ],
        }
      }
    },
  )
}
