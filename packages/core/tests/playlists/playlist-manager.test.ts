import { describe, it, expect, beforeEach } from 'vitest'
import { PlaylistManager } from '../../src/playlists/playlist-manager.js'

describe('PlaylistManager', () => {
  let manager: PlaylistManager

  beforeEach(() => {
    manager = new PlaylistManager()
  })

  it('creates a playlist', () => {
    const pl = manager.createPlaylist('House Set', 'm3u')
    expect(pl.name).toBe('House Set')
    expect(pl.format).toBe('m3u')
    expect(pl.tracks).toHaveLength(0)
  })

  it('creates a playlist with initial tracks', () => {
    const tracks = [{ path: '/a.mp3' }, { path: '/b.mp3' }]
    const pl = manager.createPlaylist('Test', 'm3u8', tracks)
    expect(pl.tracks).toHaveLength(2)
  })

  it('throws on duplicate playlist name', () => {
    manager.createPlaylist('Unique', 'm3u')
    expect(() => manager.createPlaylist('Unique', 'm3u')).toThrow(
      'already exists',
    )
  })

  it('adds tracks', () => {
    manager.createPlaylist('Test', 'm3u')
    manager.addTracks('Test', [{ path: '/track.mp3', title: 'Track' }])
    const pl = manager.getPlaylist('Test')
    expect(pl.tracks).toHaveLength(1)
    expect(pl.tracks[0].title).toBe('Track')
  })

  it('removes tracks by path', () => {
    manager.createPlaylist('Test', 'm3u', [
      { path: '/a.mp3' },
      { path: '/b.mp3' },
      { path: '/c.mp3' },
    ])
    manager.removeTracks('Test', ['/a.mp3', '/c.mp3'])
    const pl = manager.getPlaylist('Test')
    expect(pl.tracks).toHaveLength(1)
    expect(pl.tracks[0].path).toBe('/b.mp3')
  })

  it('lists playlists', () => {
    manager.createPlaylist('A', 'm3u')
    manager.createPlaylist('B', 'm3u8')
    const list = manager.listPlaylists()
    expect(list).toHaveLength(2)
  })

  it('throws on unknown playlist', () => {
    expect(() => manager.getPlaylist('nope')).toThrow('not found')
  })
})
