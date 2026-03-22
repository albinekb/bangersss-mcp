import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { walk, walkFiles } from '../../../src/util/walker/walker.js'
import type { FolderInspection } from '../../../src/util/walker/types.js'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'walker-test-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

async function touch(filePath: string): Promise<void> {
  await writeFile(filePath, '')
}

describe('walker filterResult hook', () => {
  it('prunes a folder when filterResult returns false', async () => {
    // Create a subfolder with a .mid file (sample pack indicator)
    const sub = join(tempDir, 'samples')
    await mkdir(sub)
    await touch(join(sub, 'kick.wav'))
    await touch(join(sub, 'melody.mid'))

    // Also create a clean subfolder
    const clean = join(tempDir, 'tracks')
    await mkdir(clean)
    await touch(join(clean, 'dj-track.mp3'))

    const yielded: string[] = []

    for await (const result of walk(tempDir, {
      filterResult: (inspection: FolderInspection) => {
        // Skip folders that contain .mid files
        return !inspection.allFiles.some((f) => f.name.endsWith('.mid'))
      },
    })) {
      yielded.push(result.dir)
    }

    // Root and clean folder should be yielded; samples folder should be pruned
    expect(yielded).toContain(tempDir)
    expect(yielded).toContain(clean)
    expect(yielded).not.toContain(sub)
  })

  it('provides allFiles including non-audio files', async () => {
    await touch(join(tempDir, 'track.wav'))
    await touch(join(tempDir, 'preset.vital'))
    await touch(join(tempDir, 'notes.txt'))

    let receivedAllFiles: string[] = []

    for await (const _result of walk(tempDir, {
      filterFile: (d) => d.name.endsWith('.wav'),
      filterResult: (inspection: FolderInspection) => {
        receivedAllFiles = inspection.allFiles.map((d) => d.name)
        return true
      },
    })) {
      // consume
    }

    // allFiles should include everything (unfiltered), files should only have .wav
    expect(receivedAllFiles).toContain('track.wav')
    expect(receivedAllFiles).toContain('preset.vital')
    expect(receivedAllFiles).toContain('notes.txt')
  })

  it('does not compute allFiles when filterResult is not provided', async () => {
    await touch(join(tempDir, 'track.mp3'))

    const results = []
    for await (const result of walk(tempDir)) {
      results.push(result)
    }

    // FolderResult should not have allFiles property
    expect(results[0]).not.toHaveProperty('allFiles')
  })

  it('prunes recursively — children of pruned folders are never visited', async () => {
    const parent = join(tempDir, 'pack')
    const child = join(parent, 'kicks')
    const grandchild = join(child, 'processed')
    await mkdir(parent)
    await mkdir(child)
    await mkdir(grandchild)
    await touch(join(parent, 'info.mid'))
    await touch(join(child, 'kick01.wav'))
    await touch(join(grandchild, 'kick01_processed.wav'))

    const visited: string[] = []

    for await (const result of walk(tempDir, {
      filterResult: (inspection: FolderInspection) => {
        visited.push(inspection.dir)
        return !inspection.allFiles.some((f) => f.name.endsWith('.mid'))
      },
    })) {
      // consume
    }

    // filterResult should only be called for root (where it recurses) and parent (where it prunes)
    // child and grandchild should never be visited
    expect(visited).toContain(tempDir)
    expect(visited).toContain(parent)
    expect(visited).not.toContain(child)
    expect(visited).not.toContain(grandchild)
  })

  it('works through walkFiles', async () => {
    const sub = join(tempDir, 'presets')
    await mkdir(sub)
    await touch(join(sub, 'bass.wav'))
    await touch(join(sub, 'Bass.SerumPreset'))
    await touch(join(tempDir, 'dj-track.wav'))

    const filePaths: string[] = []

    for await (const { path } of walkFiles(tempDir, {
      filterResult: (inspection: FolderInspection) => {
        return !inspection.allFiles.some((f) =>
          f.name.toLowerCase().endsWith('.serumpreset'),
        )
      },
    })) {
      filePaths.push(path)
    }

    expect(filePaths).toHaveLength(1)
    expect(filePaths[0]).toContain('dj-track.wav')
  })

  it('supports async filterResult', async () => {
    await touch(join(tempDir, 'track.mp3'))

    const results = []
    for await (const result of walk(tempDir, {
      filterResult: async (_inspection: FolderInspection) => {
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 1))
        return true
      },
    })) {
      results.push(result)
    }

    expect(results).toHaveLength(1)
  })
})
