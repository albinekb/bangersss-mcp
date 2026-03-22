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
