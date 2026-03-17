/**
 * Overlay filesystem for "dry mode".
 *
 * Layers an in-memory filesystem (memfs) over the real Node.js fs using unionfs.
 * All mutations are captured in the memory layer and tracked by FileTracker.
 * Mutations can later be committed to the real filesystem or discarded.
 */

import * as realFs from 'node:fs';
import * as realFsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { memfs } from 'memfs';
import { Union } from 'unionfs';
import { FileTracker, type TrackedOperation, type OperationSummary } from './file-tracker.js';
import { commitOperations, type CommitResult } from './commit.js';

export type { CommitResult } from './commit.js';
export type { TrackedOperation, OperationSummary } from './file-tracker.js';

export class OverlayFS {
  private memVolume: ReturnType<typeof memfs>['vol'];
  private memFsInstance: ReturnType<typeof memfs>['fs'];
  private union: InstanceType<typeof Union>;
  private tracker: FileTracker;

  constructor() {
    const { fs: mfs, vol } = memfs();
    this.memVolume = vol;
    this.memFsInstance = mfs;
    this.union = new Union();

    // unionfs resolves reads bottom-to-top: real fs first, memfs on top.
    // Writes go only to the memfs layer via our wrapper methods.
    this.union.use(realFs as unknown as typeof import('fs'));
    this.union.use(mfs as unknown as typeof import('fs'));

    this.tracker = new FileTracker();
  }

  // ---------------------------------------------------------------------------
  // Unified FS accessor
  // ---------------------------------------------------------------------------

  /**
   * Return the union filesystem object.
   * Reads will see memfs overlaid on top of the real fs.
   * Callers should prefer the typed helper methods below for mutations.
   */
  getFs(): typeof import('fs') {
    return this.union as unknown as typeof import('fs');
  }

  // ---------------------------------------------------------------------------
  // Read operations (delegated to the union so memfs wins over real fs)
  // ---------------------------------------------------------------------------

  async readFile(filePath: string, encoding?: BufferEncoding): Promise<Buffer | string> {
    // Try memfs first, fall back to real fs
    try {
      const data = this.memVolume.readFileSync(filePath);
      if (encoding) {
        return typeof data === 'string' ? data : Buffer.from(data).toString(encoding);
      }
      return typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
    } catch {
      // Not in memfs -- read from real fs
      if (encoding) {
        return realFsPromises.readFile(filePath, { encoding });
      }
      return realFsPromises.readFile(filePath);
    }
  }

  async readdir(dirPath: string): Promise<string[]> {
    // Merge entries from both layers, deduplicate
    const entries = new Set<string>();
    try {
      const memEntries = this.memVolume.readdirSync(dirPath) as string[];
      for (const e of memEntries) entries.add(String(e));
    } catch {
      // directory may not exist in memfs
    }
    try {
      const realEntries = await realFsPromises.readdir(dirPath);
      for (const e of realEntries) entries.add(e);
    } catch {
      // directory may not exist on real fs
    }
    return [...entries].sort();
  }

  async stat(filePath: string): Promise<realFs.Stats> {
    try {
      return this.memVolume.statSync(filePath) as unknown as realFs.Stats;
    } catch {
      return realFsPromises.stat(filePath);
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      this.memVolume.statSync(filePath);
      return true;
    } catch {
      try {
        await realFsPromises.access(filePath);
        return true;
      } catch {
        return false;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Write operations (go to memfs only, tracked)
  // ---------------------------------------------------------------------------

  async writeFile(filePath: string, data: Buffer | string): Promise<void> {
    const buf = typeof data === 'string' ? Buffer.from(data) : data;

    // Ensure parent dirs exist in the mem volume
    this.ensureMemParentDirs(filePath);

    this.memVolume.writeFileSync(filePath, buf);
    this.tracker.track({ type: 'write', path: filePath, data: buf });
  }

  async rename(from: string, to: string): Promise<void> {
    // Read the file content from whichever layer has it
    const content = (await this.readFile(from)) as Buffer;

    this.ensureMemParentDirs(to);
    this.memVolume.writeFileSync(to, content);

    // Mark the source as deleted in our overlay by writing a tombstone
    // (We cannot truly delete from the union, but we track it for commit.)
    this.tracker.track({ type: 'rename', path: from, from, to, data: content });
  }

  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    if (options?.recursive) {
      this.memVolume.mkdirSync(dirPath, { recursive: true });
    } else {
      this.ensureMemParentDirs(dirPath);
      this.memVolume.mkdirSync(dirPath);
    }
    this.tracker.track({ type: 'mkdir', path: dirPath });
  }

  async unlink(filePath: string): Promise<void> {
    // We cannot actually remove a file from the real-fs view through unionfs.
    // We track the deletion; it will be applied on commit.
    try {
      this.memVolume.unlinkSync(filePath);
    } catch {
      // File may only exist on real fs, which is fine -- we just track the intent.
    }
    this.tracker.track({ type: 'delete', path: filePath });
  }

  async copyFile(src: string, dest: string): Promise<void> {
    const content = (await this.readFile(src)) as Buffer;
    await this.writeFile(dest, content);
  }

  // ---------------------------------------------------------------------------
  // Tracker access
  // ---------------------------------------------------------------------------

  /**
   * Return all tracked mutation operations.
   */
  getTrackedOperations(): ReadonlyArray<TrackedOperation> {
    return this.tracker.getOperations();
  }

  /**
   * Return a human-readable summary of tracked operations.
   */
  getSummary(): OperationSummary {
    return this.tracker.getSummary();
  }

  // ---------------------------------------------------------------------------
  // Commit / discard
  // ---------------------------------------------------------------------------

  /**
   * Commit all tracked operations to the real filesystem.
   */
  async commitAll(): Promise<CommitResult> {
    const ops = this.tracker.getOperations();
    const result = await commitOperations(ops);
    if (result.success) {
      this.tracker.clear();
    }
    return result;
  }

  /**
   * Commit only operations that affect the specified paths.
   */
  async commitSelective(paths: string[]): Promise<CommitResult> {
    const ops = this.tracker.getOperationsForPaths(paths);
    const result = await commitOperations(ops);
    // Only clear committed operations, keep the rest
    if (result.success) {
      const committedSet = new Set(ops.map((o) => o.timestamp));
      const remaining = this.tracker
        .getOperations()
        .filter((o) => !committedSet.has(o.timestamp));
      this.tracker.clear();
      for (const op of remaining) {
        this.tracker.track(op);
      }
    }
    return result;
  }

  /**
   * Discard all in-memory changes and reset the overlay.
   */
  reset(): void {
    this.tracker.clear();

    // Recreate the memfs volume
    const { fs: mfs, vol } = memfs();
    this.memVolume = vol;
    this.memFsInstance = mfs;

    // Rebuild the union
    this.union = new Union();
    this.union.use(realFs as unknown as typeof import('fs'));
    this.union.use(mfs as unknown as typeof import('fs'));
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Ensure all ancestor directories of `filePath` exist in the memfs volume.
   */
  private ensureMemParentDirs(filePath: string): void {
    const dir = path.dirname(filePath);
    try {
      this.memVolume.statSync(dir);
    } catch {
      this.memVolume.mkdirSync(dir, { recursive: true });
    }
  }
}
