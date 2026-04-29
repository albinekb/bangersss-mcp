import * as path from 'node:path'

import type { MovePlanItem } from '../types/index.js'
import { OverlayFS } from '../overlay/overlay-fs.js'
import { HashService } from './hash-service.js'
import { InventoryService } from './inventory-service.js'

export class MovePlanService {
  constructor(
    private readonly inventory: InventoryService,
    private readonly overlay: OverlayFS,
    private readonly hashService: HashService,
  ) {}

  async executeMovePlan(movePlanId: string): Promise<{
    movePlanId: string
    moved: number
    failed: number
    items: MovePlanItem[]
  }> {
    const plan = this.inventory.getMovePlan(movePlanId)
    if (!plan) {
      throw new Error(`Move plan not found: ${movePlanId}`)
    }
    const overwrite = Boolean(plan.movePlan.rules?.overwrite)

    this.inventory.updateMovePlanStatus(movePlanId, 'executing')

    let moved = 0
    let failed = 0
    const items: MovePlanItem[] = []

    for (const item of plan.items) {
      const current = this.inventory.getInventoryFile(item.fileId)
      if (!current) {
        const failedItem = { ...item, status: 'failed' as const, errorText: 'File not found in inventory' }
        this.inventory.updateMovePlanItem(failedItem)
        items.push(failedItem)
        failed++
        continue
      }

      try {
        if (
          !overwrite &&
          item.sourcePath !== item.proposedDestinationPath &&
          (await this.overlay.exists(item.proposedDestinationPath))
        ) {
          throw new Error(
            `Destination already exists: ${item.proposedDestinationPath}`,
          )
        }

        await this.overlay.mkdir(path.dirname(item.proposedDestinationPath), {
          recursive: true,
        })
        await this.overlay.rename(item.sourcePath, item.proposedDestinationPath)

        const updated: MovePlanItem = {
          ...item,
          status: 'moved',
          movedAt: new Date().toISOString(),
          errorText: null,
        }
        this.inventory.updateMovePlanItem(updated)
        this.inventory.updateFilePath(item.fileId, item.proposedDestinationPath)
        this.inventory.addChangeEvent({
          eventType: 'move_executed',
          entityType: 'move_plan',
          entityId: movePlanId,
          description: 'Move plan item executed in overlay',
          details: {
            fileId: item.fileId,
            from: item.sourcePath,
            to: item.proposedDestinationPath,
          },
        })
        items.push(updated)
        moved++
      } catch (error) {
        const failedItem: MovePlanItem = {
          ...item,
          status: 'failed',
          errorText: error instanceof Error ? error.message : String(error),
        }
        this.inventory.updateMovePlanItem(failedItem)
        this.inventory.addChangeEvent({
          eventType: 'move_failed',
          entityType: 'move_plan',
          entityId: movePlanId,
          description: 'Move plan item failed',
          details: {
            fileId: item.fileId,
            from: item.sourcePath,
            to: item.proposedDestinationPath,
            error: failedItem.errorText,
          },
        })
        items.push(failedItem)
        failed++
      }
    }

    this.inventory.updateMovePlanStatus(
      movePlanId,
      failed === 0 ? 'completed' : 'executing',
    )

    return { movePlanId, moved, failed, items }
  }

  async verifyMovePlan(movePlanId: string): Promise<{
    movePlanId: string
    verified: number
    failed: number
    items: MovePlanItem[]
  }> {
    const plan = this.inventory.getMovePlan(movePlanId)
    if (!plan) {
      throw new Error(`Move plan not found: ${movePlanId}`)
    }

    let verified = 0
    let failed = 0
    const items: MovePlanItem[] = []

    for (const item of plan.items) {
      if (item.status !== 'moved' && item.status !== 'verified') {
        items.push(item)
        continue
      }

      try {
        const buffer = (await this.overlay.readFile(
          item.proposedDestinationPath,
        )) as Buffer
        const { hash } = this.hashService.computeBufferSha256(buffer)
        const matches = !item.preMoveSha256 || item.preMoveSha256 === hash

        const updated: MovePlanItem = {
          ...item,
          status: matches ? 'verified' : 'failed',
          postMoveSha256: hash,
          verifiedAt: new Date().toISOString(),
          errorText: matches ? null : 'Post-move hash did not match pre-move SHA-256',
        }

        this.inventory.updateMovePlanItem(updated)
        this.inventory.addChangeEvent({
          eventType: matches ? 'move_verified' : 'move_verification_failed',
          entityType: 'move_plan',
          entityId: movePlanId,
          description: matches
            ? 'Move plan item verified'
            : 'Move plan item verification failed',
          details: {
            fileId: item.fileId,
            destination: item.proposedDestinationPath,
            preMoveSha256: item.preMoveSha256,
            postMoveSha256: hash,
          },
        })

        items.push(updated)
        if (matches) {
          verified++
        } else {
          failed++
        }
      } catch (error) {
        const failedItem: MovePlanItem = {
          ...item,
          status: 'failed',
          verifiedAt: new Date().toISOString(),
          errorText: error instanceof Error ? error.message : String(error),
        }
        this.inventory.updateMovePlanItem(failedItem)
        items.push(failedItem)
        failed++
      }
    }

    if (failed === 0) {
      this.inventory.updateMovePlanStatus(movePlanId, 'completed')
    }

    return { movePlanId, verified, failed, items }
  }
}
