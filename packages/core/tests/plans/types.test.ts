import { describe, it, expect } from 'vitest'
import { OperationSchema, PlanSchema } from '../../src/plans/types.js'

describe('Plan Zod schemas', () => {
  it('validates a rename_file operation', () => {
    const op = {
      type: 'rename_file',
      status: 'pending',
      from: '/a.mp3',
      to: '/b.mp3',
    }
    expect(OperationSchema.parse(op)).toEqual(op)
  })

  it('validates a write_tags operation', () => {
    const op = {
      type: 'write_tags',
      status: 'done',
      path: '/a.mp3',
      tags: { artist: 'Test' },
    }
    expect(OperationSchema.parse(op)).toEqual(op)
  })

  it('validates a set_bpm operation', () => {
    const op = { type: 'set_bpm', status: 'pending', path: '/a.mp3', bpm: 128 }
    expect(OperationSchema.parse(op)).toEqual(op)
  })

  it('rejects invalid operation type', () => {
    const op = { type: 'invalid_op', status: 'pending' }
    expect(() => OperationSchema.parse(op)).toThrow()
  })

  it('rejects invalid status', () => {
    const op = {
      type: 'rename_file',
      status: 'invalid',
      from: '/a.mp3',
      to: '/b.mp3',
    }
    expect(() => OperationSchema.parse(op)).toThrow()
  })

  it('validates a full plan', () => {
    const plan = {
      id: 'test-123',
      name: 'Test Plan',
      version: 1 as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      baseDirectory: '/music',
      operations: [
        {
          type: 'rename_file',
          status: 'pending',
          from: '/a.mp3',
          to: '/b.mp3',
        },
        { type: 'set_bpm', status: 'done', path: '/c.mp3', bpm: 140 },
      ],
      metadata: { totalFiles: 2, completedOps: 1, failedOps: 0 },
    }
    expect(PlanSchema.parse(plan)).toEqual(plan)
  })

  it('rejects plan with wrong version', () => {
    const plan = {
      id: 'test',
      name: 'Test',
      version: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      baseDirectory: '/',
      operations: [],
      metadata: { totalFiles: 0, completedOps: 0, failedOps: 0 },
    }
    expect(() => PlanSchema.parse(plan)).toThrow()
  })
})
