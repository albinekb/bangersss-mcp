import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { tmpdir } from 'node:os'

import NodeID3 from 'node-id3'

import { createServer } from '../src/server.js'

function createMinimalMp3(tags: NodeID3.Tags): Buffer {
  const frameData = Buffer.alloc(417)
  frameData[0] = 0xff
  frameData[1] = 0xfb
  frameData[2] = 0x90
  frameData[3] = 0x00

  const tagBuffer = NodeID3.create(tags)
  if (tagBuffer instanceof Error) throw tagBuffer
  return Buffer.concat([tagBuffer as Buffer, frameData])
}

describe('Inventory service', () => {
  const testDir = path.join(tmpdir(), `bangersss-inventory-${Date.now()}`)
  const sourceDir = path.join(testDir, 'incoming')
  const libraryDir = path.join(testDir, 'library')
  const dbPath = path.join(testDir, 'inventory.sqlite')

  beforeAll(async () => {
    await fs.mkdir(sourceDir, { recursive: true })
    await fs.mkdir(libraryDir, { recursive: true })

    await fs.writeFile(
      path.join(sourceDir, 'Charlotte de Witte - Overdrive.mp3'),
      createMinimalMp3({
        title: 'Overdrive',
        artist: 'Charlotte de Witte',
        album: 'Overdrive EP',
        genre: 'Techno',
        bpm: '140',
      }),
    )
  })

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {})
  })

  it('initializes, scans, queries, and verifies move plans', async () => {
    const { context } = createServer()
    context.inventory.initInventoryDb(dbPath)

    const scan = await context.inventory.scanInventory({
      roots: [sourceDir],
      mode: 'full',
      includeArchives: true,
      computeFullHashes: true,
    })

    expect(scan.scanRunId).toBeTruthy()

    const status = context.inventory.getInventoryStatus()
    expect(status.schemaVersion).toBe(1)
    expect((status.counts as { files: number }).files).toBe(1)

    const files = context.inventory.queryInventoryFiles({
      artist: 'Charlotte',
      hasHash: true,
    })
    expect(files).toHaveLength(1)
    expect(files[0].audioTags?.title).toBe('Overdrive')
    expect(files[0].hashes.some((hash) => hash.hashType === 'sha256')).toBe(true)

    const movePlan = context.inventory.createMovePlan({
      fileIds: [files[0].id],
      destinationRoot: libraryDir,
      strategy: 'artist-album-track',
      dryRun: true,
      overwrite: false,
      name: 'Test move plan',
    })

    expect(movePlan.items).toHaveLength(1)
    expect(movePlan.items[0].proposedDestinationPath).toContain(
      path.join('Charlotte de Witte', 'Overdrive EP'),
    )

    const executed = await context.movePlans.executeMovePlan(movePlan.movePlan.id)
    expect(executed.moved).toBe(1)
    expect(context.overlay.getTrackedOperations()).toHaveLength(2)

    const verified = await context.movePlans.verifyMovePlan(movePlan.movePlan.id)
    expect(verified.verified).toBe(1)

    const updatedFile = context.inventory.getInventoryFile(files[0].id)
    expect(updatedFile?.path).toBe(movePlan.items[0].proposedDestinationPath)

    context.inventory.close()
  })
})
