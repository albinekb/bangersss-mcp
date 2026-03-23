/**
 * Tracks filesystem mutations as structured operations.
 * Used by OverlayFS to record all writes so they can be committed or discarded.
 */

export type OperationType = 'write' | 'rename' | 'delete' | 'mkdir'

export interface TrackedOperation {
  type: OperationType
  /** The primary path affected by this operation. */
  path: string
  /** Source path for rename operations. */
  from?: string
  /** Destination path for rename operations. */
  to?: string
  /** File content for write operations. */
  data?: Buffer
  /** ISO timestamp of when the operation was tracked. */
  timestamp: string
}

export interface OperationSummary {
  total: number
  writes: number
  renames: number
  deletes: number
  mkdirs: number
  affectedPaths: string[]
}

export class FileTracker {
  private operations: TrackedOperation[] = []

  /**
   * Record a filesystem mutation.
   */
  track(op: Omit<TrackedOperation, 'timestamp'>): void {
    this.operations.push({
      ...op,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Return all tracked operations in order.
   */
  getOperations(): ReadonlyArray<TrackedOperation> {
    return this.operations
  }

  /**
   * Return only operations that touch any of the given paths.
   */
  getOperationsForPaths(paths: string[]): TrackedOperation[] {
    const pathSet = new Set(paths)
    return this.operations.filter((op) => {
      if (pathSet.has(op.path)) return true
      if (op.from && pathSet.has(op.from)) return true
      if (op.to && pathSet.has(op.to)) return true
      return false
    })
  }

  /**
   * Return the deduplicated set of all paths touched by tracked operations.
   */
  getAffectedPaths(): string[] {
    const paths = new Set<string>()
    for (const op of this.operations) {
      paths.add(op.path)
      if (op.from) paths.add(op.from)
      if (op.to) paths.add(op.to)
    }
    return [...paths]
  }

  /**
   * Return a human-readable summary of all tracked operations.
   */
  getSummary(): OperationSummary {
    const summary: OperationSummary = {
      total: this.operations.length,
      writes: 0,
      renames: 0,
      deletes: 0,
      mkdirs: 0,
      affectedPaths: this.getAffectedPaths(),
    }

    for (const op of this.operations) {
      switch (op.type) {
        case 'write':
          summary.writes++
          break
        case 'rename':
          summary.renames++
          break
        case 'delete':
          summary.deletes++
          break
        case 'mkdir':
          summary.mkdirs++
          break
      }
    }

    return summary
  }

  /**
   * Discard all tracked operations.
   */
  clear(): void {
    this.operations = []
  }
}
