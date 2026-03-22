import { describe, it, expect } from 'vitest'
import {
  createRenameOp,
  createMoveOp,
  createWriteTagsOp,
  createSetBpmOp,
  createPlaylistOp,
  createAddToPlaylistOp,
  createDeleteFileOp,
} from '../../src/plans/operations.js'

describe('Operation factory functions', () => {
  it('creates rename operation', () => {
    const op = createRenameOp('/old.mp3', '/new.mp3')
    expect(op.type).toBe('rename_file')
    expect(op.status).toBe('pending')
    expect(op.from).toBe('/old.mp3')
    expect(op.to).toBe('/new.mp3')
  })

  it('creates move operation', () => {
    const op = createMoveOp('/music/track.mp3', '/sorted/house/track.mp3')
    expect(op.type).toBe('move_file')
    expect(op.status).toBe('pending')
  })

  it('creates write tags operation', () => {
    const op = createWriteTagsOp('/track.mp3', { artist: 'DJ Test', bpm: 128 })
    expect(op.type).toBe('write_tags')
    expect(op.tags).toEqual({ artist: 'DJ Test', bpm: 128 })
  })

  it('creates set BPM operation', () => {
    const op = createSetBpmOp('/track.mp3', 140)
    expect(op.type).toBe('set_bpm')
    expect(op.bpm).toBe(140)
  })

  it('creates playlist operation', () => {
    const op = createPlaylistOp('House Set', ['/a.mp3', '/b.mp3'])
    expect(op.type).toBe('create_playlist')
    expect(op.tracks).toHaveLength(2)
  })

  it('creates add to playlist operation', () => {
    const op = createAddToPlaylistOp('House Set', ['/c.mp3'])
    expect(op.type).toBe('add_to_playlist')
  })

  it('creates delete file operation', () => {
    const op = createDeleteFileOp('/trash.mp3')
    expect(op.type).toBe('delete_file')
    expect(op.path).toBe('/trash.mp3')
  })
})
