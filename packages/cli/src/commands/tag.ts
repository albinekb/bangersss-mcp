import * as path from 'node:path'
import { readTags, createLogger } from '@bangersss/core'

const log = createLogger('cli:tag')

interface TagReadOptions {
  format: string
}

export async function tagRead(tagPath: string, options: TagReadOptions): Promise<void> {
  const resolvedPath = path.resolve(tagPath)
  const tags = await readTags(resolvedPath)

  if (options.format === 'json') {
    console.log(JSON.stringify(tags, null, 2))
  } else {
    if (!tags) {
      console.log('No tags found.')
      return
    }
    const entries = Object.entries(tags).filter(([, v]) => v != null)
    for (const [key, value] of entries) {
      console.log(`  ${key}: ${value}`)
    }
  }
}

interface TagWriteOptions {
  artist?: string
  title?: string
  album?: string
  genre?: string
  year?: string
  bpm?: string
  key?: string
}

export async function tagWrite(tagPath: string, options: TagWriteOptions): Promise<void> {
  // TODO: Implement tag writing via core writeTags
  console.log('Tag write command not yet fully implemented.')
  console.log(`Path: ${tagPath}`)
  console.log(`Options: ${JSON.stringify(options)}`)
}
