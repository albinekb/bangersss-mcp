import { describe, it, expect } from 'vitest'
import { parseM3U, generateM3U } from '../../src/playlists/m3u.js'

describe('parseM3U', () => {
  it('parses simple M3U', () => {
    const content = '/music/track1.mp3\n/music/track2.mp3\n'
    const tracks = parseM3U(content, '/')
    expect(tracks).toHaveLength(2)
    expect(tracks[0].path).toBe('/music/track1.mp3')
    expect(tracks[1].path).toBe('/music/track2.mp3')
  })

  it('parses extended M3U', () => {
    const content = [
      '#EXTM3U',
      '#EXTINF:180,Artist One - Track Title',
      '/music/track1.mp3',
      '#EXTINF:240,Another Track',
      '/music/track2.mp3',
    ].join('\n')

    const tracks = parseM3U(content, '/')
    expect(tracks).toHaveLength(2)
    expect(tracks[0].artist).toBe('Artist One')
    expect(tracks[0].title).toBe('Track Title')
    expect(tracks[0].duration).toBe(180)
    expect(tracks[1].title).toBe('Another Track')
    expect(tracks[1].artist).toBeUndefined()
  })

  it('resolves relative paths against basePath', () => {
    const content = 'subfolder/track.mp3\n'
    const tracks = parseM3U(content, '/music')
    expect(tracks[0].path).toBe('/music/subfolder/track.mp3')
  })

  it('handles empty lines and comments', () => {
    const content = '#EXTM3U\n\n# a comment\n/track.mp3\n\n'
    const tracks = parseM3U(content, '/')
    expect(tracks).toHaveLength(1)
  })

  it('handles Windows-style line endings', () => {
    const content = '/track1.mp3\r\n/track2.mp3\r\n'
    const tracks = parseM3U(content, '/')
    expect(tracks).toHaveLength(2)
  })
})

describe('generateM3U', () => {
  it('generates extended M3U', () => {
    const tracks = [
      {
        path: '/music/track1.mp3',
        duration: 180,
        artist: 'DJ Test',
        title: 'Banger',
      },
      { path: '/music/track2.mp3' },
    ]

    const content = generateM3U(tracks)
    expect(content).toContain('#EXTM3U')
    expect(content).toContain('#EXTINF:180,DJ Test - Banger')
    expect(content).toContain('/music/track1.mp3')
    expect(content).toContain('#EXTINF:-1,track2.mp3')
  })

  it('generates simple M3U without extended info', () => {
    const tracks = [{ path: '/music/track.mp3' }]
    const content = generateM3U(tracks, { extended: false })
    expect(content).not.toContain('#EXTM3U')
    expect(content).not.toContain('#EXTINF')
    expect(content).toContain('/music/track.mp3')
  })

  it('generates relative paths', () => {
    const tracks = [{ path: '/music/house/track.mp3' }]
    const content = generateM3U(tracks, {
      relativePaths: true,
      basePath: '/music',
    })
    expect(content).toContain('house/track.mp3')
    expect(content).not.toContain('/music/house/track.mp3')
  })

  it('roundtrips through parse and generate', () => {
    const original = [
      { path: '/music/a.mp3', duration: 120, artist: 'Artist', title: 'Title' },
      { path: '/music/b.mp3', duration: 200, title: 'Just Title' },
    ]

    const m3uContent = generateM3U(original)
    const parsed = parseM3U(m3uContent, '/')

    expect(parsed).toHaveLength(2)
    expect(parsed[0].artist).toBe('Artist')
    expect(parsed[0].title).toBe('Title')
    expect(parsed[0].duration).toBe(120)
    expect(parsed[1].title).toBe('Just Title')
  })
})
