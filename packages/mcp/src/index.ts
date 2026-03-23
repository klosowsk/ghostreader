#!/usr/bin/env node
/**
 * GhostReader MCP Server (standalone)
 *
 * Calls the GhostReader processor HTTP API via GHOSTREADER_URL.
 * No heavy dependencies — just MCP SDK + fetch.
 *
 * Usage:
 *   GHOSTREADER_URL=http://localhost:3000 npx @ghostreader/mcp
 *
 * Environment variables:
 *   GHOSTREADER_URL — processor URL (default: http://localhost:3000)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = (process.env.GHOSTREADER_URL || process.env.SCRAPER_URL || 'http://localhost:3000').replace(/\/$/, '');

function truncate(text: string, maxLen = 50000): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + `\n\n... [truncated, ${text.length - maxLen} chars omitted]`;
}

async function post(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GhostReader ${endpoint} returned ${res.status}: ${text}`);
  }
  return res.json();
}

async function get(endpoint: string): Promise<string> {
  const res = await fetch(`${BASE_URL}${endpoint}`);
  if (!res.ok) throw new Error(`GhostReader ${endpoint} returned ${res.status}`);
  return res.text();
}

const server = new McpServer({
  name: 'ghostreader',
  version: '0.2.0',
});

// Tool: ghostreader_scrape
server.tool(
  'ghostreader_scrape',
  'Render a URL using an anti-detect browser (Camoufox) and return the page content as markdown. ' +
    'Use this for JS-heavy sites, SPAs, or pages that block normal HTTP fetches. ' +
    'The browser has a persistent identity (fingerprint, cookies, cache) that avoids bot detection.',
  {
    url: z.string().url().describe('The URL to render and return as markdown'),
    wait_after_load: z
      .number()
      .min(0)
      .max(30)
      .default(2)
      .describe('Seconds to wait after page load for JS to execute (default: 2)'),
    engine: z
      .string()
      .default('standard')
      .describe('Processing engine: standard (default, fast), ai (Ollama AI model), auto'),
    article: z
      .boolean()
      .default(false)
      .describe('Enable article mode: aggressively extract main content, strip sidebars/noise. Best for blog posts and news articles.'),
  },
  async ({ url, wait_after_load, engine, article }) => {
    try {
      const params = `engine=${engine}&wait=${wait_after_load}${article ? '&article=true' : ''}`;
      const markdown = await get(`/render/${url}?${params}`);
      return {
        content: [{ type: 'text' as const, text: truncate(markdown) }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error scraping ${url}: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// Tool: ghostreader_extract
server.tool(
  'ghostreader_extract',
  'Extract structured results from a URL using a named extraction profile. ' +
    "Profiles know how to parse specific sites (e.g., 'google_web' for Google Search, " +
    "'google_news' for Google News). Returns titles, URLs, and content snippets. " +
    'Available profiles: google_web, google_news, base (generic CSS selectors).',
  {
    url: z.string().url().describe('The URL to render and extract results from'),
    profile: z.string().describe("Extraction profile name (e.g., 'google_web', 'google_news', 'base')"),
    timeout: z
      .number()
      .min(1000)
      .max(120000)
      .default(30000)
      .describe('Render timeout in milliseconds (default: 30000)'),
  },
  async ({ url, profile, timeout }) => {
    try {
      const data = (await post('/extract', { url, profile, timeout })) as {
        results: Array<{ url: string; title: string; content: string }>;
        suggestions: string[];
        captcha: boolean;
        error: string | null;
      };

      if (data.captcha) {
        return {
          content: [{ type: 'text' as const, text: `CAPTCHA detected at ${url}. Try again later.` }],
          isError: true,
        };
      }
      if (data.error) {
        return {
          content: [{ type: 'text' as const, text: `Extraction error: ${data.error}` }],
          isError: true,
        };
      }

      const lines: string[] = [];
      lines.push(`Found ${data.results.length} results from ${profile} profile:\n`);
      for (const [i, r] of data.results.entries()) {
        lines.push(`${i + 1}. ${r.title}`);
        lines.push(`   URL: ${r.url}`);
        if (r.content) lines.push(`   ${r.content}`);
        lines.push('');
      }
      if (data.suggestions.length > 0) {
        lines.push('Related searches:');
        for (const s of data.suggestions) lines.push(`  - ${s}`);
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error extracting from ${url}: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[ghostreader-mcp] connected (GHOSTREADER_URL=${BASE_URL})`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
