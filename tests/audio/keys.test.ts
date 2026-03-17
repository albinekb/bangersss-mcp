import { describe, it, expect } from 'vitest';
import {
  normalizeKey,
  getKeyInfo,
  toCamelot,
  toOpenKey,
  getCompatibleKeys,
  areKeysCompatible,
  getAllKeys,
} from '../../src/audio/keys.js';

describe('Musical key / Camelot wheel', () => {
  describe('normalizeKey', () => {
    it('passes through standard notation', () => {
      expect(normalizeKey('C major')).toBe('C major');
      expect(normalizeKey('A minor')).toBe('A minor');
      expect(normalizeKey('F# minor')).toBe('F# minor');
    });

    it('converts Camelot to standard', () => {
      expect(normalizeKey('8B')).toBe('C major');
      expect(normalizeKey('8A')).toBe('A minor');
      expect(normalizeKey('1B')).toBe('B major');
      expect(normalizeKey('12A')).toBe('C# minor');
    });

    it('converts Open Key to standard', () => {
      expect(normalizeKey('1d')).toBe('C major');
      expect(normalizeKey('1m')).toBe('A minor');
      expect(normalizeKey('6d')).toBe('B major');
    });

    it('converts short notation', () => {
      expect(normalizeKey('Cmaj')).toBe('C major');
      expect(normalizeKey('Amin')).toBe('A minor');
      expect(normalizeKey('F#min')).toBe('F# minor');
    });

    it('converts "Xm" minor shorthand', () => {
      expect(normalizeKey('Am')).toBe('A minor');
      expect(normalizeKey('F#m')).toBe('F# minor');
    });

    it('returns null for invalid input', () => {
      expect(normalizeKey('')).toBeNull();
      expect(normalizeKey('not a key')).toBeNull();
      expect(normalizeKey('13B')).toBeNull();
    });
  });

  describe('toCamelot', () => {
    it('converts standard keys', () => {
      expect(toCamelot('C major')).toBe('8B');
      expect(toCamelot('A minor')).toBe('8A');
      expect(toCamelot('D major')).toBe('10B');
    });

    it('is idempotent for Camelot input', () => {
      expect(toCamelot('8B')).toBe('8B');
      expect(toCamelot('1A')).toBe('1A');
    });

    it('converts Open Key', () => {
      expect(toCamelot('1d')).toBe('8B');
      expect(toCamelot('1m')).toBe('8A');
    });
  });

  describe('toOpenKey', () => {
    it('converts standard keys', () => {
      expect(toOpenKey('C major')).toBe('1d');
      expect(toOpenKey('A minor')).toBe('1m');
    });

    it('converts Camelot keys', () => {
      expect(toOpenKey('8B')).toBe('1d');
      expect(toOpenKey('8A')).toBe('1m');
    });
  });

  describe('getKeyInfo', () => {
    it('returns full info', () => {
      const info = getKeyInfo('C major');
      expect(info).toEqual({
        standard: 'C major',
        camelot: '8B',
        openKey: '1d',
        short: 'Cmaj',
      });
    });

    it('works from any input format', () => {
      const from8B = getKeyInfo('8B');
      const fromCmaj = getKeyInfo('Cmaj');
      const from1d = getKeyInfo('1d');
      expect(from8B).toEqual(fromCmaj);
      expect(from8B).toEqual(from1d);
    });

    it('handles flats and sharps', () => {
      const info = getKeyInfo('Eb major');
      expect(info?.camelot).toBe('5B');
    });
  });

  describe('getCompatibleKeys', () => {
    it('returns 4 compatible keys for 8B (C major)', () => {
      const compatible = getCompatibleKeys('8B');
      expect(compatible).toHaveLength(4);

      const codes = compatible.map((k) => k.camelot);
      expect(codes).toContain('8B'); // same
      expect(codes).toContain('9B'); // +1
      expect(codes).toContain('7B'); // -1
      expect(codes).toContain('8A'); // relative minor
    });

    it('wraps around the wheel', () => {
      const compatible = getCompatibleKeys('1B');
      const codes = compatible.map((k) => k.camelot);
      expect(codes).toContain('12B'); // -1 wraps
      expect(codes).toContain('2B');  // +1
      expect(codes).toContain('1A');  // relative
    });

    it('returns empty for invalid key', () => {
      expect(getCompatibleKeys('XYZ')).toEqual([]);
    });
  });

  describe('areKeysCompatible', () => {
    it('same key is compatible', () => {
      expect(areKeysCompatible('C major', 'C major')).toBe(true);
    });

    it('adjacent wheel positions are compatible', () => {
      expect(areKeysCompatible('8B', '9B')).toBe(true); // C maj -> G maj
      expect(areKeysCompatible('8B', '7B')).toBe(true); // C maj -> F maj
    });

    it('relative major/minor is compatible', () => {
      expect(areKeysCompatible('C major', 'A minor')).toBe(true); // 8B <-> 8A
    });

    it('distant keys are not compatible', () => {
      expect(areKeysCompatible('C major', 'F# major')).toBe(false); // 8B vs 2B
    });

    it('works across notations', () => {
      expect(areKeysCompatible('8B', 'Am')).toBe(true);
      expect(areKeysCompatible('1d', '8A')).toBe(true);
    });
  });

  describe('getAllKeys', () => {
    it('returns 24 keys (12 major + 12 minor)', () => {
      const keys = getAllKeys();
      expect(keys).toHaveLength(24);

      const majors = keys.filter((k) => k.standard.includes('major'));
      const minors = keys.filter((k) => k.standard.includes('minor'));
      expect(majors).toHaveLength(12);
      expect(minors).toHaveLength(12);
    });
  });
});
