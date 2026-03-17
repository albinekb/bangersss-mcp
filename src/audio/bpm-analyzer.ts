/**
 * BPM detection using autocorrelation on PCM audio data decoded via ffmpeg.
 */

import { decodeToFloat32 } from './audio-decoder.js';

export interface BpmResult {
  /** Detected beats per minute. */
  bpm: number;
  /** Confidence score between 0 and 1. */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute the energy envelope of the signal by dividing it into short frames,
 * computing RMS energy per frame, and returning the envelope.
 */
function computeEnergyEnvelope(
  samples: Float32Array,
  sampleRate: number,
  frameMs = 10,
): Float32Array {
  const frameSize = Math.round((sampleRate * frameMs) / 1000);
  const numFrames = Math.floor(samples.length / frameSize);
  const envelope = new Float32Array(numFrames);

  for (let i = 0; i < numFrames; i++) {
    let sum = 0;
    const offset = i * frameSize;
    for (let j = 0; j < frameSize; j++) {
      const v = samples[offset + j];
      sum += v * v;
    }
    envelope[i] = Math.sqrt(sum / frameSize);
  }

  return envelope;
}

/**
 * Simple onset-strength function: half-wave rectified first-order difference
 * of the energy envelope.
 */
function onsetStrength(envelope: Float32Array): Float32Array {
  const oss = new Float32Array(envelope.length);
  for (let i = 1; i < envelope.length; i++) {
    const diff = envelope[i] - envelope[i - 1];
    oss[i] = diff > 0 ? diff : 0;
  }
  return oss;
}

/**
 * Normalised autocorrelation of a signal over a given range of lags.
 */
function autocorrelation(
  signal: Float32Array,
  minLag: number,
  maxLag: number,
): Float32Array {
  const len = maxLag - minLag + 1;
  const result = new Float32Array(len);

  // Energy at lag 0 for normalisation.
  let energy0 = 0;
  for (let i = 0; i < signal.length; i++) {
    energy0 += signal[i] * signal[i];
  }

  if (energy0 === 0) return result;

  for (let idx = 0; idx < len; idx++) {
    const lag = minLag + idx;
    let sum = 0;
    for (let i = 0; i < signal.length - lag; i++) {
      sum += signal[i] * signal[i + lag];
    }
    result[idx] = sum / energy0;
  }

  return result;
}

/**
 * Pick the best BPM from the autocorrelation result, preferring common
 * musical tempos and penalising half / double-time ambiguity.
 */
function pickBestBpm(
  acf: Float32Array,
  minLag: number,
  framesPerSecond: number,
): BpmResult {
  // Find local peaks in the ACF.
  interface Peak {
    lag: number;
    value: number;
  }
  const peaks: Peak[] = [];

  for (let i = 1; i < acf.length - 1; i++) {
    if (acf[i] > acf[i - 1] && acf[i] > acf[i + 1] && acf[i] > 0.01) {
      peaks.push({ lag: minLag + i, value: acf[i] });
    }
  }

  if (peaks.length === 0) {
    return { bpm: 0, confidence: 0 };
  }

  // Sort peaks by value descending.
  peaks.sort((a, b) => b.value - a.value);

  // Convert lag to BPM: BPM = 60 * framesPerSecond / lag
  const candidates = peaks.slice(0, 10).map((p) => ({
    bpm: (60 * framesPerSecond) / p.lag,
    value: p.value,
  }));

  // Prefer tempos in the 80-180 range (common for most music).
  const scored = candidates.map((c) => {
    let bonus = 1.0;
    if (c.bpm >= 80 && c.bpm <= 180) bonus = 1.3;
    else if (c.bpm >= 60 && c.bpm <= 200) bonus = 1.1;
    return { ...c, score: c.value * bonus };
  });

  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const maxAcf = peaks[0].value;
  const confidence = Math.min(1, best.value / Math.max(maxAcf, 0.001));

  return { bpm: Math.round(best.bpm * 10) / 10, confidence };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyse the BPM of an audio file.
 *
 * Decodes the file to mono PCM via ffmpeg, computes an onset-strength
 * function, then uses autocorrelation to estimate the tempo.
 *
 * @param filePath  Absolute path to an audio file.
 * @returns Detected BPM and a confidence value between 0 and 1.
 */
export async function analyzeBpm(filePath: string): Promise<BpmResult> {
  // Decode at a lower sample rate to speed up analysis — 22050 Hz is enough.
  const analysisSampleRate = 22050;
  const { samples, sampleRate } = await decodeToFloat32(
    filePath,
    analysisSampleRate,
    true,
  );

  const frameMs = 10;
  const framesPerSecond = 1000 / frameMs;

  // 1. Compute energy envelope.
  const envelope = computeEnergyEnvelope(samples, sampleRate, frameMs);

  // 2. Onset strength.
  const oss = onsetStrength(envelope);

  // 3. Autocorrelation over a BPM range of 40–220.
  const minBpm = 40;
  const maxBpm = 220;
  const minLag = Math.floor(framesPerSecond * (60 / maxBpm));
  const maxLag = Math.ceil(framesPerSecond * (60 / minBpm));

  const acf = autocorrelation(oss, minLag, Math.min(maxLag, oss.length - 1));

  // 4. Pick the best candidate.
  return pickBestBpm(acf, minLag, framesPerSecond);
}

/**
 * Analyse BPM for multiple files with limited concurrency.
 *
 * @param filePaths    Absolute paths to audio files.
 * @param concurrency  Maximum number of parallel analyses (default 4).
 */
export async function batchAnalyzeBpm(
  filePaths: string[],
  concurrency = 4,
): Promise<Map<string, BpmResult>> {
  const results = new Map<string, BpmResult>();
  const queue = [...filePaths];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const fp = queue.shift();
      if (!fp) break;
      try {
        const result = await analyzeBpm(fp);
        results.set(fp, result);
      } catch (err) {
        results.set(fp, {
          bpm: 0,
          confidence: 0,
        });
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, filePaths.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return results;
}
