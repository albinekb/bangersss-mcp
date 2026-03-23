/**
 * Tests for BPM analyzer internals — we can't test the full pipeline
 * without ffmpeg + audio files, but we can test the signal processing.
 */
import { describe, it, expect } from 'vitest'

// We need to test the internal functions. Since they're not exported,
// we test the public API with mocked inputs via the module structure.
// For now, test the autocorrelation math by creating synthetic signals.

describe('BPM analysis signal processing', () => {
  // Generate a synthetic click track at a known BPM
  function generateClickTrack(
    bpm: number,
    durationSec: number,
    sampleRate: number,
  ): Float32Array {
    const totalSamples = durationSec * sampleRate
    const samples = new Float32Array(totalSamples)
    const samplesPerBeat = (60 / bpm) * sampleRate

    for (let i = 0; i < totalSamples; i++) {
      const beatPos = i % samplesPerBeat
      // Short click at each beat (10ms burst)
      if (beatPos < sampleRate * 0.01) {
        samples[i] = 0.8 * Math.sin(2 * Math.PI * 1000 * (beatPos / sampleRate))
      }
    }
    return samples
  }

  // Simplified energy envelope (matches the module's internal logic)
  function computeEnvelope(
    samples: Float32Array,
    sampleRate: number,
    frameMs: number,
  ): Float32Array {
    const frameSize = Math.round((sampleRate * frameMs) / 1000)
    const numFrames = Math.floor(samples.length / frameSize)
    const envelope = new Float32Array(numFrames)
    for (let i = 0; i < numFrames; i++) {
      let sum = 0
      const offset = i * frameSize
      for (let j = 0; j < frameSize; j++) {
        const v = samples[offset + j]
        sum += v * v
      }
      envelope[i] = Math.sqrt(sum / frameSize)
    }
    return envelope
  }

  function onsetStrength(envelope: Float32Array): Float32Array {
    const oss = new Float32Array(envelope.length)
    for (let i = 1; i < envelope.length; i++) {
      const diff = envelope[i] - envelope[i - 1]
      oss[i] = diff > 0 ? diff : 0
    }
    return oss
  }

  function autocorrelation(
    signal: Float32Array,
    minLag: number,
    maxLag: number,
  ): Float32Array {
    const len = maxLag - minLag + 1
    const result = new Float32Array(len)
    let energy0 = 0
    for (let i = 0; i < signal.length; i++) energy0 += signal[i] * signal[i]
    if (energy0 === 0) return result
    for (let idx = 0; idx < len; idx++) {
      const lag = minLag + idx
      let sum = 0
      for (let i = 0; i < signal.length - lag; i++)
        sum += signal[i] * signal[i + lag]
      result[idx] = sum / energy0
    }
    return result
  }

  it('energy envelope captures beats in a click track', () => {
    const sr = 22050
    const clicks = generateClickTrack(120, 4, sr)
    const envelope = computeEnvelope(clicks, sr, 10)

    // Should have peaks at beat positions
    expect(envelope.length).toBeGreaterThan(0)
    const max = Math.max(...envelope)
    expect(max).toBeGreaterThan(0)
  })

  it('onset strength is non-negative', () => {
    const sr = 22050
    const clicks = generateClickTrack(128, 2, sr)
    const envelope = computeEnvelope(clicks, sr, 10)
    const oss = onsetStrength(envelope)

    for (let i = 0; i < oss.length; i++) {
      expect(oss[i]).toBeGreaterThanOrEqual(0)
    }
  })

  it('autocorrelation peaks at the correct BPM lag', () => {
    const bpm = 120
    const sr = 22050
    const frameMs = 10
    const fps = 1000 / frameMs

    const clicks = generateClickTrack(bpm, 8, sr)
    const envelope = computeEnvelope(clicks, sr, frameMs)
    const oss = onsetStrength(envelope)

    const minBpm = 60
    const maxBpm = 200
    const minLag = Math.floor(fps * (60 / maxBpm))
    const maxLag = Math.ceil(fps * (60 / minBpm))

    const acf = autocorrelation(oss, minLag, Math.min(maxLag, oss.length - 1))

    // Find peak
    let bestIdx = 0
    let bestVal = -1
    for (let i = 0; i < acf.length; i++) {
      if (acf[i] > bestVal) {
        bestVal = acf[i]
        bestIdx = i
      }
    }

    const detectedBpm = (60 * fps) / (minLag + bestIdx)
    // Should be within 5 BPM of the actual
    expect(Math.abs(detectedBpm - bpm)).toBeLessThan(5)
  })

  it('handles silence gracefully', () => {
    const silence = new Float32Array(22050 * 2) // 2 seconds of silence
    const envelope = computeEnvelope(silence, 22050, 10)
    const oss = onsetStrength(envelope)

    // All zeros
    for (let i = 0; i < oss.length; i++) {
      expect(oss[i]).toBe(0)
    }

    const acf = autocorrelation(oss, 10, 100)
    // All zeros when input is silent
    for (let i = 0; i < acf.length; i++) {
      expect(acf[i]).toBe(0)
    }
  })

  it('detects different tempos (allowing half/double-time)', () => {
    const sr = 22050
    const frameMs = 10
    const fps = 1000 / frameMs

    for (const targetBpm of [100, 128, 140, 174]) {
      const clicks = generateClickTrack(targetBpm, 8, sr)
      const envelope = computeEnvelope(clicks, sr, frameMs)
      const oss = onsetStrength(envelope)

      const minLag = Math.floor(fps * (60 / 220))
      const maxLag = Math.ceil(fps * (60 / 40))

      const acf = autocorrelation(oss, minLag, Math.min(maxLag, oss.length - 1))

      let bestIdx = 0
      let bestVal = -1
      for (let i = 1; i < acf.length - 1; i++) {
        if (acf[i] > acf[i - 1] && acf[i] > acf[i + 1] && acf[i] > bestVal) {
          bestVal = acf[i]
          bestIdx = i
        }
      }

      const detected = (60 * fps) / (minLag + bestIdx)
      // BPM detection can legitimately find half-time or double-time,
      // so check that detected is close to targetBpm, targetBpm/2, or targetBpm*2
      const closeToTarget = Math.abs(detected - targetBpm) < 5
      const closeToHalf = Math.abs(detected - targetBpm / 2) < 5
      const closeToDouble = Math.abs(detected - targetBpm * 2) < 5
      expect(closeToTarget || closeToHalf || closeToDouble).toBe(true)
    }
  })
})
