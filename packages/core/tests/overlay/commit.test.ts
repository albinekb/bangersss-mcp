import { describe, it, expect, afterEach } from 'vitest'
import { commitOperations } from '../../src/overlay/commit.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { tmpdir } from 'node:os'

describe('commitOperations', () => {
  const testDir = path.join(tmpdir(), `musicsorter-commit-test-${Date.now()}`)
  const cleanupPaths: string[] = []

  afterEach(async () => {
    for (const p of cleanupPaths) {
      await fs.rm(p, { recursive: true, force: true }).catch(() => {})
    }
    cleanupPaths.length = 0
  })

  it('commits a write operation to real fs', async () => {
    const filePath = path.join(testDir, 'committed.txt')
    cleanupPaths.push(testDir)

    const result = await commitOperations([
      {
        type: 'write',
        path: filePath,
        data: Buffer.from('committed!'),
        timestamp: new Date().toISOString(),
      },
    ])

    expect(result.success).toBe(true)
    expect(result.succeeded).toBe(1)
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('committed!')
  })

  it('commits mkdir operation', async () => {
    const dirPath = path.join(testDir, 'subdir', 'nested')
    cleanupPaths.push(testDir)

    const result = await commitOperations([
      { type: 'mkdir', path: dirPath, timestamp: new Date().toISOString() },
    ])

    expect(result.success).toBe(true)
    const stat = await fs.stat(dirPath)
    expect(stat.isDirectory()).toBe(true)
  })

  it('commits delete operation', async () => {
    const filePath = path.join(testDir, 'to-delete.txt')
    cleanupPaths.push(testDir)
    await fs.mkdir(testDir, { recursive: true })
    await fs.writeFile(filePath, 'delete me')

    const result = await commitOperations([
      { type: 'delete', path: filePath, timestamp: new Date().toISOString() },
    ])

    expect(result.success).toBe(true)
    await expect(fs.access(filePath)).rejects.toThrow()
  })

  it('commits rename operation', async () => {
    const fromPath = path.join(testDir, 'original.txt')
    const toPath = path.join(testDir, 'renamed.txt')
    cleanupPaths.push(testDir)
    await fs.mkdir(testDir, { recursive: true })
    await fs.writeFile(fromPath, 'rename me')

    const result = await commitOperations([
      {
        type: 'rename',
        path: fromPath,
        from: fromPath,
        to: toPath,
        timestamp: new Date().toISOString(),
      },
    ])

    expect(result.success).toBe(true)
    const content = await fs.readFile(toPath, 'utf-8')
    expect(content).toBe('rename me')
  })

  it('handles empty operations list', async () => {
    const result = await commitOperations([])
    expect(result.success).toBe(true)
    expect(result.total).toBe(0)
  })

  it('reports failures without aborting other ops', async () => {
    const goodPath = path.join(testDir, 'good.txt')
    cleanupPaths.push(testDir)

    const result = await commitOperations([
      {
        type: 'rename',
        path: '/nonexistent',
        from: '/nonexistent',
        to: '/also-nope',
        timestamp: new Date().toISOString(),
      },
      {
        type: 'write',
        path: goodPath,
        data: Buffer.from('still works'),
        timestamp: new Date().toISOString(),
      },
    ])

    expect(result.success).toBe(false)
    expect(result.failed).toBe(1)
    expect(result.succeeded).toBe(1)
    const content = await fs.readFile(goodPath, 'utf-8')
    expect(content).toBe('still works')
  })
})
