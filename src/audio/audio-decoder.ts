/**
 * Decode audio files to raw PCM Float32 data using ffmpeg.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, constants } from 'node:fs/promises';

const execFileAsync = promisify(execFile);

export interface DecodedAudio {
  /** Interleaved Float32 PCM samples. */
  samples: Float32Array;
  /** Sample rate in Hz. */
  sampleRate: number;
  /** Number of audio channels. */
  channels: number;
}

/**
 * Verify that ffmpeg is reachable on the system PATH.
 */
async function assertFfmpegAvailable(): Promise<void> {
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 5_000 });
  } catch {
    throw new Error(
      'ffmpeg is not installed or not found in PATH. ' +
        'Install it with: brew install ffmpeg (macOS) or apt install ffmpeg (Linux).',
    );
  }
}

let ffmpegChecked = false;

/**
 * Decode an audio file to mono Float32 PCM at the given sample rate.
 *
 * Spawns ffmpeg as a child process and captures the raw PCM output from
 * stdout. The data is returned as a Float32Array suitable for analysis.
 *
 * @param filePath  Absolute path to an audio file.
 * @param targetSampleRate  Desired sample rate (default 44100).
 * @param mono  Down-mix to mono (default true, recommended for analysis).
 */
export async function decodeToFloat32(
  filePath: string,
  targetSampleRate = 44100,
  mono = true,
): Promise<DecodedAudio> {
  if (!ffmpegChecked) {
    await assertFfmpegAvailable();
    ffmpegChecked = true;
  }

  // Ensure the source file exists before invoking ffmpeg.
  await access(filePath, constants.R_OK);

  const channels = mono ? 1 : 2;

  const args = [
    '-i',
    filePath,
    '-vn', // skip video streams
    '-ac',
    String(channels),
    '-ar',
    String(targetSampleRate),
    '-f',
    'f32le', // raw little-endian 32-bit float PCM
    '-acodec',
    'pcm_f32le',
    'pipe:1', // write to stdout
  ];

  const { stdout } = await execFileAsync('ffmpeg', args, {
    encoding: 'buffer',
    maxBuffer: 500 * 1024 * 1024, // 500 MB — large enough for long tracks
    timeout: 120_000,
  });

  const samples = new Float32Array(
    stdout.buffer,
    stdout.byteOffset,
    stdout.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );

  return { samples, sampleRate: targetSampleRate, channels };
}
