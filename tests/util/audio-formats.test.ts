import { describe, it, expect } from 'vitest';
import { isAudioFile, getFormat, SUPPORTED_FORMATS } from '../../src/util/audio-formats.js';

describe('audio-formats', () => {
  describe('isAudioFile', () => {
    it('recognizes supported formats', () => {
      expect(isAudioFile('/music/track.mp3')).toBe(true);
      expect(isAudioFile('/music/track.flac')).toBe(true);
      expect(isAudioFile('/music/track.wav')).toBe(true);
      expect(isAudioFile('/music/track.aiff')).toBe(true);
      expect(isAudioFile('/music/track.m4a')).toBe(true);
      expect(isAudioFile('/music/track.ogg')).toBe(true);
    });

    it('is case insensitive', () => {
      expect(isAudioFile('/music/track.MP3')).toBe(true);
      expect(isAudioFile('/music/track.Flac')).toBe(true);
    });

    it('rejects non-audio files', () => {
      expect(isAudioFile('/music/cover.jpg')).toBe(false);
      expect(isAudioFile('/music/notes.txt')).toBe(false);
      expect(isAudioFile('/music/playlist.m3u')).toBe(false);
    });

    it('rejects files without extension', () => {
      expect(isAudioFile('/music/noext')).toBe(false);
    });
  });

  describe('getFormat', () => {
    it('returns extension for supported files', () => {
      expect(getFormat('/track.mp3')).toBe('.mp3');
      expect(getFormat('/track.flac')).toBe('.flac');
    });

    it('returns null for unsupported files', () => {
      expect(getFormat('/image.png')).toBeNull();
    });

    it('returns null for no extension', () => {
      expect(getFormat('/noext')).toBeNull();
    });
  });

  describe('SUPPORTED_FORMATS', () => {
    it('includes common DJ formats', () => {
      expect(SUPPORTED_FORMATS).toContain('.mp3');
      expect(SUPPORTED_FORMATS).toContain('.flac');
      expect(SUPPORTED_FORMATS).toContain('.wav');
      expect(SUPPORTED_FORMATS).toContain('.aiff');
      expect(SUPPORTED_FORMATS).toContain('.m4a');
    });
  });
});
