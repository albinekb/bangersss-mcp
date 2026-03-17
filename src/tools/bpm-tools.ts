import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeBpm, batchAnalyzeBpm } from '../audio/bpm-analyzer.js';
import {
  getKeyInfo,
  toCamelot,
  toOpenKey,
  getCompatibleKeys,
  areKeysCompatible,
  getAllKeys,
} from '../audio/keys.js';
import type { ServerContext } from '../server.js';

export function registerBpmTools(server: McpServer, _context: ServerContext): void {
  server.tool(
    'analyze_bpm',
    'Analyze the BPM (beats per minute) of a single audio file using autocorrelation-based detection.',
    {
      path: z.string().describe('Absolute path to the audio file'),
    },
    async ({ path: filePath }) => {
      try {
        const result = await analyzeBpm(filePath);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              path: filePath,
              bpm: result.bpm,
              confidence: result.confidence,
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error analyzing BPM for ${filePath}: ${message}` }],
        };
      }
    },
  );

  server.tool(
    'batch_analyze_bpm',
    'Analyze BPM for multiple audio files with configurable concurrency.',
    {
      paths: z.array(z.string()).describe('Array of absolute paths to audio files'),
      concurrency: z.number().optional().default(4).describe('Maximum number of parallel analyses (default 4)'),
    },
    async ({ paths, concurrency }) => {
      try {
        const results = await batchAnalyzeBpm(paths, concurrency);
        const output: Record<string, { bpm: number; confidence: number }> = {};
        for (const [fp, result] of results) {
          output[fp] = { bpm: result.bpm, confidence: result.confidence };
        }

        const failed = Object.values(output).filter((r) => r.bpm === 0).length;

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              totalFiles: paths.length,
              analyzed: results.size,
              failed,
              concurrency,
              results: output,
            }, null, 2),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error in batch BPM analysis: ${message}` }],
        };
      }
    },
  );

  // --- Key / Camelot tools ---

  server.tool(
    'get_key_info',
    'Get full key information (standard, Camelot, Open Key, short notation) from any key notation.',
    {
      key: z.string().describe('Key in any notation: "C major", "8B", "1d", "Cmaj", "Am"'),
    },
    async ({ key }) => {
      const info = getKeyInfo(key);
      if (!info) {
        return { content: [{ type: 'text' as const, text: `Unknown key: "${key}"` }] };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(info, null, 2) }],
      };
    },
  );

  server.tool(
    'convert_key',
    'Convert a musical key between notations: standard, Camelot, Open Key.',
    {
      key: z.string().describe('Key in any notation'),
      format: z.enum(['camelot', 'openkey', 'standard']).describe('Target notation format'),
    },
    async ({ key, format }) => {
      let result: string | null = null;
      switch (format) {
        case 'camelot': result = toCamelot(key); break;
        case 'openkey': result = toOpenKey(key); break;
        case 'standard': result = getKeyInfo(key)?.standard ?? null; break;
      }
      if (!result) {
        return { content: [{ type: 'text' as const, text: `Cannot convert key: "${key}"` }] };
      }
      return { content: [{ type: 'text' as const, text: result }] };
    },
  );

  server.tool(
    'get_compatible_keys',
    'Get harmonically compatible keys for mixing (Camelot wheel neighbors + relative major/minor).',
    {
      key: z.string().describe('Key in any notation'),
    },
    async ({ key }) => {
      const compatible = getCompatibleKeys(key);
      if (compatible.length === 0) {
        return { content: [{ type: 'text' as const, text: `Unknown key: "${key}"` }] };
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            sourceKey: getKeyInfo(key),
            compatibleKeys: compatible,
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'check_key_compatibility',
    'Check if two keys are harmonically compatible for mixing.',
    {
      key1: z.string().describe('First key in any notation'),
      key2: z.string().describe('Second key in any notation'),
    },
    async ({ key1, key2 }) => {
      const info1 = getKeyInfo(key1);
      const info2 = getKeyInfo(key2);
      if (!info1 || !info2) {
        return { content: [{ type: 'text' as const, text: `Invalid key(s): "${key1}", "${key2}"` }] };
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            key1: info1,
            key2: info2,
            compatible: areKeysCompatible(key1, key2),
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'list_all_keys',
    'List all 24 musical keys with their Camelot, Open Key, and standard notations.',
    {},
    async () => {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(getAllKeys(), null, 2),
        }],
      };
    },
  );
}
