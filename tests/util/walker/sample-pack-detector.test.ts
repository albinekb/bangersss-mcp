import type { Dirent } from 'node:fs'
import { describe, it, expect, vi } from 'vitest'

import type { FolderInspection } from '../../../src/util/walker/types.js'
import {
  detectSamplePack,
  createSamplePackFilter,
  PRODUCTION_EXTENSIONS,
} from '../../../src/util/walker/sample-pack-detector.js'

function mockDirent(name: string, isDir = false): Dirent {
  return {
    name,
    parentPath: '/test',
    path: '/test',
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
  } as Dirent
}

function makeInspection(
  opts: {
    audioFiles?: string[]
    allFileNames?: string[]
    folderNames?: string[]
  } = {},
): FolderInspection {
  const audioFiles = (opts.audioFiles ?? []).map((n) => mockDirent(n))
  const allFiles = (opts.allFileNames ?? opts.audioFiles ?? []).map((n) => mockDirent(n))
  const folders = (opts.folderNames ?? []).map((n) => mockDirent(n, true))
  return {
    dir: '/test/dir',
    files: audioFiles,
    folders,
    level: 0,
    allFiles,
  }
}

describe('sample-pack-detector', () => {
  describe('detectSamplePack', () => {
    describe('Tier 1: production file extensions', () => {
      it('detects .SerumPreset files', () => {
        const result = detectSamplePack(
          makeInspection({
            audioFiles: ['kick.wav'],
            allFileNames: ['kick.wav', 'Bass.SerumPreset'],
          }),
        )
        expect(result.isSamplePack).toBe(true)
        expect(result.signals[0]).toContain('.serumpreset')
      })

      it('detects .mid files', () => {
        const result = detectSamplePack(
          makeInspection({
            audioFiles: ['loop.wav'],
            allFileNames: ['loop.wav', 'melody.mid'],
          }),
        )
        expect(result.isSamplePack).toBe(true)
        expect(result.signals[0]).toContain('.mid')
      })

      it('detects .flp (FL Studio) files', () => {
        const result = detectSamplePack(
          makeInspection({
            allFileNames: ['project.flp', 'track.wav'],
          }),
        )
        expect(result.isSamplePack).toBe(true)
        expect(result.signals[0]).toContain('.flp')
      })

      it('detects .vital preset files', () => {
        const result = detectSamplePack(
          makeInspection({
            allFileNames: ['Bass Monster.vital', 'render.wav'],
          }),
        )
        expect(result.isSamplePack).toBe(true)
      })

      it('detects .als (Ableton Live Set) files', () => {
        const result = detectSamplePack(
          makeInspection({
            allFileNames: ['Set.als', 'audio.wav'],
          }),
        )
        expect(result.isSamplePack).toBe(true)
      })

      it('detects .adg (Ableton Device Group) files', () => {
        const result = detectSamplePack(
          makeInspection({
            allFileNames: ['Instrument.adg'],
          }),
        )
        expect(result.isSamplePack).toBe(true)
      })

      it('is case insensitive on extensions', () => {
        const result = detectSamplePack(
          makeInspection({
            allFileNames: ['Bass.SERUMPRESET', 'chord.MID'],
          }),
        )
        expect(result.isSamplePack).toBe(true)
      })

      it('counts production files per extension', () => {
        const result = detectSamplePack(
          makeInspection({
            allFileNames: ['a.mid', 'b.mid', 'c.vital'],
          }),
        )
        expect(result.isSamplePack).toBe(true)
        expect(result.signals[0]).toContain('.mid (2)')
        expect(result.signals[0]).toContain('.vital (1)')
      })
    })

    describe('Tier 2: structural heuristic', () => {
      it('detects many audio files + many subdirectories', () => {
        const audioFiles = Array.from({ length: 25 }, (_, i) => `loop_${i}.wav`)
        const folderNames = Array.from({ length: 8 }, (_, i) => `Category_${i}`)
        const result = detectSamplePack(makeInspection({ audioFiles, allFileNames: audioFiles, folderNames }))
        expect(result.isSamplePack).toBe(true)
        expect(result.signals[0]).toContain('25 audio files')
        expect(result.signals[0]).toContain('8 subdirectories')
      })

      it('does not trigger with many files but few subdirectories', () => {
        const audioFiles = Array.from({ length: 50 }, (_, i) => `track_${i}.mp3`)
        const result = detectSamplePack(
          makeInspection({ audioFiles, allFileNames: audioFiles, folderNames: ['A', 'B'] }),
        )
        expect(result.isSamplePack).toBe(false)
      })

      it('does not trigger with few files but many subdirectories', () => {
        const folderNames = Array.from({ length: 10 }, (_, i) => `dir_${i}`)
        const result = detectSamplePack(
          makeInspection({ audioFiles: ['track.mp3'], allFileNames: ['track.mp3'], folderNames }),
        )
        expect(result.isSamplePack).toBe(false)
      })
    })

    describe('negative cases', () => {
      it('does not flag a normal DJ folder', () => {
        const result = detectSamplePack(
          makeInspection({
            audioFiles: ['Daft Punk - Da Funk.wav', 'Mall Grab - Positive Energy.flac'],
            allFileNames: ['Daft Punk - Da Funk.wav', 'Mall Grab - Positive Energy.flac'],
          }),
        )
        expect(result.isSamplePack).toBe(false)
      })

      it('does not flag an empty folder', () => {
        const result = detectSamplePack(makeInspection())
        expect(result.isSamplePack).toBe(false)
      })

      it('does not flag a small album folder', () => {
        const result = detectSamplePack(
          makeInspection({
            audioFiles: Array.from({ length: 12 }, (_, i) => `track_${i + 1}.flac`),
            allFileNames: Array.from({ length: 12 }, (_, i) => `track_${i + 1}.flac`),
            folderNames: [],
          }),
        )
        expect(result.isSamplePack).toBe(false)
      })
    })
  })

  describe('PRODUCTION_EXTENSIONS', () => {
    it('contains key production extensions', () => {
      expect(PRODUCTION_EXTENSIONS.has('.mid')).toBe(true)
      expect(PRODUCTION_EXTENSIONS.has('.serumpreset')).toBe(true)
      expect(PRODUCTION_EXTENSIONS.has('.vital')).toBe(true)
      expect(PRODUCTION_EXTENSIONS.has('.flp')).toBe(true)
      expect(PRODUCTION_EXTENSIONS.has('.als')).toBe(true)
    })

    it('does not contain audio extensions', () => {
      expect(PRODUCTION_EXTENSIONS.has('.mp3')).toBe(false)
      expect(PRODUCTION_EXTENSIONS.has('.wav')).toBe(false)
      expect(PRODUCTION_EXTENSIONS.has('.flac')).toBe(false)
    })
  })

  describe('createSamplePackFilter', () => {
    it('returns true for non-sample-pack folders', () => {
      const filter = createSamplePackFilter()
      const result = filter(
        makeInspection({ audioFiles: ['track.mp3'], allFileNames: ['track.mp3'] }),
      )
      expect(result).toBe(true)
    })

    it('returns false for sample-pack folders', () => {
      const filter = createSamplePackFilter()
      const result = filter(
        makeInspection({ allFileNames: ['preset.mid', 'kick.wav'] }),
      )
      expect(result).toBe(false)
    })

    it('calls onSkip with dir and signals when skipping', () => {
      const onSkip = vi.fn()
      const filter = createSamplePackFilter({ onSkip })
      const inspection = makeInspection({
        allFileNames: ['preset.vital'],
      })
      filter(inspection)
      expect(onSkip).toHaveBeenCalledWith('/test/dir', expect.arrayContaining([
        expect.stringContaining('.vital'),
      ]))
    })

    it('does not call onSkip for non-sample-pack folders', () => {
      const onSkip = vi.fn()
      const filter = createSamplePackFilter({ onSkip })
      filter(makeInspection({ audioFiles: ['track.flac'], allFileNames: ['track.flac'] }))
      expect(onSkip).not.toHaveBeenCalled()
    })
  })
})
