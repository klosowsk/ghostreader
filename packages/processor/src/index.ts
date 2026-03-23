/**
 * GhostReader Content Processor
 *
 * Entry point — starts HTTP server or MCP server based on args.
 *
 * Usage:
 *   node dist/index.js          # Start HTTP server (default)
 *   node dist/index.js --mcp    # Start MCP server (stdio transport)
 */

import { serve } from '@hono/node-server';
import { app } from './server.js';
import { startMcp } from './mcp.js';
import { config } from './config.js';

const isMcp = process.argv.includes('--mcp');

if (isMcp) {
  startMcp().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
} else {
  console.log(`[ghostreader] Starting processor on port ${config.port}`);
  console.log(`[ghostreader] Scraper: ${config.scraperUrl}`);
  console.log(`[ghostreader] Ollama: ${config.ollamaUrl} (default model: ${config.ollamaDefaultModel})`);

  serve(
    {
      fetch: app.fetch,
      port: config.port,
    },
    (info) => {
      console.log(`[ghostreader] Processor listening on http://localhost:${info.port}`);
    },
  );
}
