import * as path from 'node:path'
import { analyzeBpm, analyzeKey, createLogger } from '@bangersss/core'

const log = createLogger('cli:analyze')

interface AnalyzeOptions {
  bpm?: boolean
  key?: boolean
  concurrency: string
  cache: boolean
  format: string
}

export async function analyze(analyzePath: string, options: AnalyzeOptions): Promise<void> {
  const resolvedPath = path.resolve(analyzePath)
  const doBpm = !options.key || options.bpm
  const doKey = !options.bpm || options.key

  log.info(`Analyzing ${resolvedPath}...`)

  const results: Record<string, unknown> = { path: resolvedPath }

  if (doBpm) {
    const bpmResult = await analyzeBpm(resolvedPath)
    results.bpm = bpmResult
  }

  if (doKey) {
    const keyResult = await analyzeKey(resolvedPath)
    results.key = keyResult
  }

  if (options.format === 'json') {
    console.log(JSON.stringify(results, null, 2))
  } else {
    if (results.bpm) {
      const bpm = results.bpm as { bpm: number; confidence: number }
      console.log(`BPM: ${bpm.bpm} (confidence: ${(bpm.confidence * 100).toFixed(1)}%)`)
    }
    if (results.key) {
      const key = results.key as { key: string }
      console.log(`Key: ${key.key}`)
    }
  }
}
