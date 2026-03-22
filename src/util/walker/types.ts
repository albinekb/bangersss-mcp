import type { Dirent } from 'node:fs'

export interface WalkOptions {
  /** Recurse into subdirectories (default: true) */
  recursive?: boolean
  /** Maximum directory depth (0 = root only) */
  maxLevel?: number
  /** Filter individual files — return false to skip */
  filterFile?: (dirent: Dirent, fullPath: string, level: number) => boolean
  /** Filter directories before descending — return false to skip entire subtree */
  filterFolder?: (dirent: Dirent, fullPath: string, level: number) => boolean
  /**
   * Filter entire folder results after readdir.
   * Receives a {@link FolderInspection} with all dirents (including non-audio files
   * that filterFile would normally strip). Return false to skip this folder
   * entirely — it will not be yielded and its children will not be visited.
   */
  filterResult?: (inspection: FolderInspection) => boolean | Promise<boolean>
}

export interface FolderResult {
  /** Absolute path of this directory */
  dir: string
  /** Audio files in this directory (post-filter) */
  files: Dirent[]
  /** Subdirectories in this directory */
  folders: Dirent[]
  /** Depth level (0 = root) */
  level: number
}

/** Extended folder info passed to filterResult, includes all non-directory dirents. */
export interface FolderInspection extends FolderResult {
  /** All non-directory dirents BEFORE filterFile is applied. */
  allFiles: Dirent[]
}
