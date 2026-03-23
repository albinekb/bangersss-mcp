import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { registerScanTools } from './tools/scan-tools.js'
import { registerTagTools } from './tools/tag-tools.js'
import { registerBpmTools } from './tools/bpm-tools.js'
import { registerPlaylistTools } from './tools/playlist-tools.js'
import { registerPlanTools } from './tools/plan-tools.js'
import { registerOverlayTools } from './tools/overlay-tools.js'
import { registerRekordboxTools } from './tools/rekordbox-tools.js'
import { registerEngineDjTools } from './tools/engine-dj-tools.js'
import { registerFileTools } from './tools/file-tools.js'
import { registerIngestTools } from './tools/ingest-tools.js'
import { OverlayFS, PlanManager, PlaylistManager, CacheStore, createLogger } from '@bangersss/core'

const log = createLogger('server')

export interface ServerContext {
  overlay: OverlayFS
  planManager: PlanManager
  playlistManager: PlaylistManager
  cache: CacheStore
}

export function createServer(): { server: McpServer; context: ServerContext } {
  const server = new McpServer({
    name: 'bangersss-mcp',
    version: '0.1.0',
  })

  const overlay = new OverlayFS()
  const planManager = new PlanManager()
  const playlistManager = new PlaylistManager()
  const cache = new CacheStore()

  const context: ServerContext = { overlay, planManager, playlistManager, cache }

  // Register all tool groups
  registerScanTools(server, context)
  registerTagTools(server, context)
  registerBpmTools(server, context)
  registerPlaylistTools(server, context)
  registerPlanTools(server, context)
  registerOverlayTools(server, context)
  registerRekordboxTools(server, context)
  registerEngineDjTools(server, context)
  registerFileTools(server, context)
  registerIngestTools(server, context)

  log.info('bangersss-mcp server initialized')

  return { server, context }
}
