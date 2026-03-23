import * as path from 'node:path'
import {
  walkFiles,
  isAudioFile,
  readTags,
  batchReadTags,
  createSamplePackFilter,
  createLogger,
} from '@bangersss/core'

const log = createLogger('cli:scan')

interface ScanOptions {
  recursive: boolean
  extensions?: string
  skipSamplePacks: boolean
  minSize?: string
  tags?: boolean
  summary?: boolean
  format: string
}

export async function scan(scanPath: string, options: ScanOptions): Promise<void> {
  const resolvedPath = path.resolve(scanPath)
  log.info(`Scanning ${resolvedPath}...`)

  const files: Array<{ path: string; size: number; tags?: Record<string, unknown> }> = []

  const filterResult = options.skipSamplePacks ? createSamplePackFilter() : undefined

  for await (const { path: filePath, file } of walkFiles(resolvedPath, {
    recursive: options.recursive,
    filterResult,
  })) {
    if (!isAudioFile(filePath)) continue
    files.push({ path: filePath, size: 0 })
  }

  if (options.summary) {
    console.log(`Found ${files.length} audio files`)
    return
  }

  if (options.format === 'json') {
    console.log(JSON.stringify(files, null, 2))
  } else if (options.format === 'paths') {
    for (const f of files) {
      console.log(f.path)
    }
  } else {
    console.log(`Found ${files.length} audio files in ${resolvedPath}`)
    for (const f of files) {
      console.log(`  ${f.path}`)
    }
  }
}
