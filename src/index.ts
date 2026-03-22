#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'
import { createLogger } from './util/logger.js'

const log = createLogger('main')

async function main() {
  const { server } = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  log.info('bangersss-mcp server running on stdio')
}

main().catch((error) => {
  log.error('Fatal error', error)
  process.exit(1)
})
