import { describe, it, expect, beforeEach } from 'vitest';
import { OverlayFS } from '../../src/overlay/overlay-fs.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

describe('OverlayFS', () => {
  let overlay: OverlayFS;

  beforeEach(() => {
    overlay = new OverlayFS();
  });

  it('writes to overlay without touching real fs', async () => {
    const fakePath = path.join(tmpdir(), `musicsorter-test-${Date.now()}`, 'overlay-test.txt');
    await overlay.writeFile(fakePath, 'hello from overlay');

    // Should be readable from overlay
    const content = await overlay.readFile(fakePath, 'utf-8');
    expect(content).toBe('hello from overlay');

    // Should NOT exist on real filesystem
    await expect(fs.access(fakePath)).rejects.toThrow();
  });

  it('reads from real fs when file not in overlay', async () => {
    // package.json exists on real fs
    const realFile = path.resolve(process.cwd(), 'package.json');
    const content = await overlay.readFile(realFile, 'utf-8');
    expect(content).toContain('musicsorter');
  });

  it('overlay overrides real fs reads', async () => {
    const realFile = path.resolve(process.cwd(), 'package.json');
    await overlay.writeFile(realFile, 'overridden content');
    const content = await overlay.readFile(realFile, 'utf-8');
    expect(content).toBe('overridden content');
  });

  it('tracks operations after writes', async () => {
    await overlay.writeFile('/fake/path.mp3', Buffer.from('data'));
    const ops = overlay.getTrackedOperations();
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('write');
  });

  it('tracks rename operations', async () => {
    await overlay.writeFile('/music/old.mp3', Buffer.from('audio'));
    await overlay.rename('/music/old.mp3', '/music/new.mp3');

    const content = await overlay.readFile('/music/new.mp3');
    expect(Buffer.isBuffer(content)).toBe(true);
  });

  it('reports summary correctly', async () => {
    await overlay.writeFile('/a.mp3', 'a');
    await overlay.writeFile('/b.mp3', 'b');
    await overlay.mkdir('/newdir', { recursive: true });

    const summary = overlay.getSummary();
    expect(summary.writes).toBe(2);
    expect(summary.mkdirs).toBeGreaterThanOrEqual(1);
  });

  it('reset clears all overlay state', async () => {
    await overlay.writeFile('/test.mp3', 'data');
    expect(overlay.getTrackedOperations()).toHaveLength(1);

    overlay.reset();
    expect(overlay.getTrackedOperations()).toHaveLength(0);
  });

  it('exists returns true for overlay files', async () => {
    await overlay.writeFile('/virtual/file.txt', 'exists');
    expect(await overlay.exists('/virtual/file.txt')).toBe(true);
  });

  it('exists returns false for non-existent files', async () => {
    expect(await overlay.exists('/absolutely/does/not/exist/anywhere.xyz')).toBe(false);
  });

  it('readdir merges overlay and real entries', async () => {
    const cwd = process.cwd();
    await overlay.writeFile(path.join(cwd, 'overlay-only-file.txt'), 'hi');

    const entries = await overlay.readdir(cwd);
    expect(entries).toContain('package.json'); // real
    expect(entries).toContain('overlay-only-file.txt'); // overlay
  });
});
