/**
 * Commits tracked overlay operations to the real filesystem.
 * Creates backups before overwriting and ensures parent directories exist.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { TrackedOperation } from './file-tracker.js'

export interface OperationResult {
  operation: TrackedOperation
  success: boolean
  error?: string
  /** Path to backup file if one was created before overwriting. */
  backupPath?: string
}

export interface CommitResult {
  success: boolean
  total: number
  succeeded: number
  failed: number
  results: OperationResult[]
}

/**
 * Create a backup of a file before overwriting it.
 * Returns the backup path, or undefined if the file did not exist.
 */
async function backupFile(filePath: string): Promise<string | undefined> {
  try {
    await fs.access(filePath)
  } catch {
    // File does not exist, nothing to back up.
    return undefined
  }

  const dir = path.dirname(filePath)
  const ext = path.extname(filePath)
  const base = path.basename(filePath, ext)
  const timestamp = Date.now()
  const backupPath = path.join(dir, `${base}.${timestamp}.bak${ext}`)

  await fs.copyFile(filePath, backupPath)
  return backupPath
}

/**
 * Ensure all parent directories for a path exist.
 */
async function ensureParentDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
}

/**
 * Apply a single tracked operation to the real filesystem.
 */
async function applyOperation(op: TrackedOperation): Promise<OperationResult> {
  try {
    switch (op.type) {
      case 'mkdir': {
        await fs.mkdir(op.path, { recursive: true })
        return { operation: op, success: true }
      }

      case 'write': {
        await ensureParentDir(op.path)
        const backupPath = await backupFile(op.path)
        if (op.data) {
          await fs.writeFile(op.path, op.data)
        } else {
          await fs.writeFile(op.path, Buffer.alloc(0))
        }
        return { operation: op, success: true, backupPath }
      }

      case 'rename': {
        const from = op.from ?? op.path
        const to = op.to ?? op.path
        await ensureParentDir(to)
        const backupPath = await backupFile(to)
        await fs.rename(from, to)
        return { operation: op, success: true, backupPath }
      }

      case 'delete': {
        const backupPath = await backupFile(op.path)
        await fs.rm(op.path, { force: true, recursive: true })
        return { operation: op, success: true, backupPath }
      }

      default: {
        return {
          operation: op,
          success: false,
          error: `Unknown operation type: ${(op as TrackedOperation).type}`,
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { operation: op, success: false, error: message }
  }
}

/**
 * Apply an array of tracked operations to the real filesystem, in order.
 * Each operation is attempted independently -- a failure does not abort later operations.
 */
export async function commitOperations(
  operations: ReadonlyArray<TrackedOperation>,
): Promise<CommitResult> {
  const results: OperationResult[] = []

  for (const op of operations) {
    const result = await applyOperation(op)
    results.push(result)
  }

  const succeeded = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length

  return {
    success: failed === 0,
    total: results.length,
    succeeded,
    failed,
    results,
  }
}
