import type { Dirent } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { FolderInspection, FolderResult, WalkOptions } from './types.js'

export type { FolderInspection, FolderResult, WalkOptions } from './types.js'

async function* emitFolder(
  dir: string,
  opts: WalkOptions,
  level: number,
): AsyncIterableIterator<FolderResult> {
  const resolvedDir = resolve(dir)
  const { recursive = true, maxLevel, filterFile, filterFolder, filterResult } = opts

  let dirents: Dirent[]
  try {
    dirents = await readdir(resolvedDir, { withFileTypes: true })
  } catch {
    // Permission denied, gone, etc. — skip silently.
    return
  }

  const files = dirents.filter((d) => {
    if (d.isDirectory()) return false
    if (!filterFile) return true
    return filterFile(d, resolve(resolvedDir, d.name), level)
  })

  const folders = dirents.filter((d) => d.isDirectory())

  if (filterResult) {
    const allFiles = dirents.filter((d) => !d.isDirectory())
    const keep = await filterResult({ dir: resolvedDir, files, folders, level, allFiles })
    if (!keep) return
  }

  yield { dir: resolvedDir, files, folders, level }

  if (!recursive) return

  for (const dirent of folders) {
    const childPath = resolve(resolvedDir, dirent.name)

    if (filterFolder && !filterFolder(dirent, childPath, level)) {
      continue
    }

    const nextLevel = level + 1
    if (typeof maxLevel === 'number' && nextLevel > maxLevel) {
      continue
    }

    yield* emitFolder(childPath, opts, nextLevel)
  }
}

/**
 * Walks a directory tree, yielding one {@link FolderResult} per directory.
 * Directories can be pruned early via `filterFolder`, so entire subtrees
 * (e.g. sample-pack folders) are never even listed.
 */
export async function* walk(
  dir: string,
  opts: WalkOptions = {},
): AsyncIterableIterator<FolderResult> {
  yield* emitFolder(dir, opts, 0)
}

/**
 * Walks a directory tree, yielding one file at a time.
 */
export async function* walkFiles(
  dir: string,
  opts: WalkOptions = {},
): AsyncIterableIterator<{ path: string; file: Dirent }> {
  for await (const { dir: folderDir, files } of walk(dir, opts)) {
    for (const file of files) {
      yield { path: resolve(folderDir, file.name), file }
    }
  }
}

/**
 * Counts files across the tree without collecting them all in memory.
 */
export async function countFiles(
  dir: string,
  opts: WalkOptions = {},
): Promise<number> {
  let count = 0
  for await (const { files } of walk(dir, opts)) {
    count += files.length
  }
  return count
}
