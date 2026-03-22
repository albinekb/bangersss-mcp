import { describe, it, expect, beforeEach } from 'vitest'
import { FileTracker } from '../../src/overlay/file-tracker.js'

describe('FileTracker', () => {
  let tracker: FileTracker

  beforeEach(() => {
    tracker = new FileTracker()
  })

  it('starts empty', () => {
    expect(tracker.getOperations()).toHaveLength(0)
    expect(tracker.getAffectedPaths()).toHaveLength(0)
  })

  it('tracks write operations', () => {
    tracker.track({
      type: 'write',
      path: '/music/track.mp3',
      data: Buffer.from('hello'),
    })
    const ops = tracker.getOperations()
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('write')
    expect(ops[0].path).toBe('/music/track.mp3')
    expect(ops[0].timestamp).toBeTruthy()
  })

  it('tracks rename operations', () => {
    tracker.track({
      type: 'rename',
      path: '/old.mp3',
      from: '/old.mp3',
      to: '/new.mp3',
    })
    const ops = tracker.getOperations()
    expect(ops).toHaveLength(1)
    expect(ops[0].from).toBe('/old.mp3')
    expect(ops[0].to).toBe('/new.mp3')
  })

  it('tracks delete operations', () => {
    tracker.track({ type: 'delete', path: '/trash.mp3' })
    expect(tracker.getOperations()).toHaveLength(1)
  })

  it('tracks mkdir operations', () => {
    tracker.track({ type: 'mkdir', path: '/music/house' })
    expect(tracker.getOperations()).toHaveLength(1)
  })

  it('returns affected paths deduplicated', () => {
    tracker.track({ type: 'write', path: '/a.mp3' })
    tracker.track({
      type: 'write',
      path: '/a.mp3',
      data: Buffer.from('updated'),
    })
    tracker.track({
      type: 'rename',
      path: '/b.mp3',
      from: '/b.mp3',
      to: '/c.mp3',
    })

    const paths = tracker.getAffectedPaths()
    expect(paths).toContain('/a.mp3')
    expect(paths).toContain('/b.mp3')
    expect(paths).toContain('/c.mp3')
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('filters operations by paths', () => {
    tracker.track({ type: 'write', path: '/a.mp3' })
    tracker.track({ type: 'write', path: '/b.mp3' })
    tracker.track({
      type: 'rename',
      path: '/c.mp3',
      from: '/c.mp3',
      to: '/d.mp3',
    })

    const filtered = tracker.getOperationsForPaths(['/b.mp3', '/d.mp3'])
    expect(filtered).toHaveLength(2)
  })

  it('generates summary', () => {
    tracker.track({ type: 'write', path: '/a.mp3' })
    tracker.track({ type: 'write', path: '/b.mp3' })
    tracker.track({
      type: 'rename',
      path: '/c.mp3',
      from: '/c.mp3',
      to: '/d.mp3',
    })
    tracker.track({ type: 'delete', path: '/e.mp3' })
    tracker.track({ type: 'mkdir', path: '/newdir' })

    const summary = tracker.getSummary()
    expect(summary.total).toBe(5)
    expect(summary.writes).toBe(2)
    expect(summary.renames).toBe(1)
    expect(summary.deletes).toBe(1)
    expect(summary.mkdirs).toBe(1)
  })

  it('clears all operations', () => {
    tracker.track({ type: 'write', path: '/a.mp3' })
    tracker.track({ type: 'delete', path: '/b.mp3' })
    tracker.clear()
    expect(tracker.getOperations()).toHaveLength(0)
    expect(tracker.getSummary().total).toBe(0)
  })
})
