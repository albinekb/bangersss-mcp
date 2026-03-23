#!/usr/bin/env node

import { Command } from 'commander'
import { createLogger, setLogLevel } from '@bangersss/core'

const log = createLogger('cli')

const program = new Command()
  .name('bangersss')
  .description('Music organization tools for DJs')
  .version('0.3.4')
  .option('--log-level <level>', 'Log level (debug, info, warn, error)', 'info')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts()
    if (opts.logLevel) {
      setLogLevel(opts.logLevel)
    }
  })

program
  .command('scan <path>')
  .description('Scan a directory for audio files')
  .option('--no-recursive', 'Do not scan subdirectories')
  .option('--extensions <exts>', 'Comma-separated file extensions (e.g. .mp3,.flac)')
  .option('--skip-sample-packs', 'Skip detected sample pack directories', true)
  .option('--no-skip-sample-packs', 'Do not skip sample packs')
  .option('--min-size <size>', 'Minimum file size (e.g. 1MB)')
  .option('--tags', 'Include tag reading in scan results')
  .option('--summary', 'Show summary statistics only')
  .option('--format <format>', 'Output format: table, json, paths', 'table')
  .action(async (scanPath, options) => {
    const { scan } = await import('./commands/scan.js')
    await scan(scanPath, options)
  })

program
  .command('analyze <path>')
  .description('Analyze BPM and/or musical key of audio files')
  .option('--bpm', 'Analyze BPM only')
  .option('--key', 'Analyze key only')
  .option('--concurrency <n>', 'Parallel workers (default: auto)', 'auto')
  .option('--no-cache', 'Disable persistent cache')
  .option('--format <format>', 'Output format: table, json', 'table')
  .action(async (analyzePath, options) => {
    const { analyze } = await import('./commands/analyze.js')
    await analyze(analyzePath, options)
  })

program
  .command('dedupe <paths...>')
  .description('Find duplicate audio files using multi-stage pipeline')
  .option('--stages <stages>', 'Stages to run: all, size, hash, tags', 'all')
  .option('--hash-algo <algo>', 'Hash algorithm: xxhash, blake3', 'xxhash')
  .option('--min-size <size>', 'Minimum file size to consider')
  .option('--action <action>', 'Action: report, link, delete', 'report')
  .option('--dry-run', 'Show what would happen without doing it')
  .option('--format <format>', 'Output format: table, json', 'table')
  .action(async (paths, options) => {
    const { dedupe } = await import('./commands/dedupe.js')
    await dedupe(paths, options)
  })

program
  .command('organize <path>')
  .description('Organize audio files into library structure')
  .option('--template <template>', 'Path template (e.g. {artist}/{title})', '{artist}/{title}')
  .option('--library <path>', 'Target library root directory')
  .option('--commit', 'Actually perform moves (default is dry-run)')
  .option('--format <format>', 'Output format: table, json', 'table')
  .action(async (organizePath, options) => {
    const { organize } = await import('./commands/organize.js')
    await organize(organizePath, options)
  })

const tagCmd = program
  .command('tag')
  .description('Read, write, or fix ID3 tags')

tagCmd
  .command('read <path>')
  .description('Read tags from an audio file')
  .option('--format <format>', 'Output format: table, json', 'table')
  .action(async (readPath, options) => {
    const { tagRead } = await import('./commands/tag.js')
    await tagRead(readPath, options)
  })

tagCmd
  .command('write <path>')
  .description('Write tags to an audio file')
  .option('--artist <artist>', 'Set artist')
  .option('--title <title>', 'Set title')
  .option('--album <album>', 'Set album')
  .option('--genre <genre>', 'Set genre')
  .option('--year <year>', 'Set year')
  .option('--bpm <bpm>', 'Set BPM')
  .option('--key <key>', 'Set key')
  .action(async (writePath, options) => {
    const { tagWrite } = await import('./commands/tag.js')
    await tagWrite(writePath, options)
  })

const cacheCmd = program
  .command('cache')
  .description('Manage the persistent analysis cache')

cacheCmd
  .command('stats')
  .description('Show cache statistics')
  .action(async () => {
    const { cacheStats } = await import('./commands/cache.js')
    await cacheStats()
  })

cacheCmd
  .command('clear')
  .description('Clear the entire cache')
  .action(async () => {
    const { cacheClear } = await import('./commands/cache.js')
    await cacheClear()
  })

cacheCmd
  .command('warm <path>')
  .description('Pre-populate cache for a directory')
  .option('--concurrency <n>', 'Parallel workers', 'auto')
  .action(async (warmPath, options) => {
    const { cacheWarm } = await import('./commands/cache.js')
    await cacheWarm(warmPath, options)
  })

program.parse()
