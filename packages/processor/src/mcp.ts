/**
 * GhostReader MCP Server
 *
 * Provides two tools for AI agents:
 *   ghostreader_scrape  — render any URL to markdown via anti-detect browser
 *   ghostreader_extract — extract structured results using a named profile
 *
 * Configuration via environment variables:
 *   SCRAPER_URL — base URL of the scraper service (default: http://localhost:8080)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { process as processHtml } from './pipeline/index.js';
import { scrape } from './clients/scraper.js';
import { getProfile, listProfiles } from './profiles/index.js';
import { config } from './config.js';

function truncate(text: string, maxLen = 50000): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + `\n\n... [truncated, ${text.length - maxLen} chars omitted]`;
}

const server = new McpServer({
  name: 'ghostreader',
  version: '0.2.0',
});

// Tool: ghostreader_scrape
server.tool(
  'ghostreader_scrape',
  'Render a URL using an anti-detect browser and return the page content as markdown. ' +
    'Uses Defuddle for content extraction with optional AI-powered formatting via Ollama. ' +
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
      .describe('Enable article mode: aggressively extract main content, strip sidebars/noise'),
    images: z
      .boolean()
      .default(false)
      .describe('Keep images in output (default: false). When false, strips all images for cleaner text output.'),
  },
  async ({ url, wait_after_load, engine, article, images }) => {
    try {
      const scraped = await scrape({
        url,
        waitAfterLoad: wait_after_load,
        timeout: 30000,
      });

      const result = await processHtml({
        html: scraped.html,
        url: scraped.url,
        engine,
        format: 'markdown',
        article,
        images,
      });

      return {
        content: [{ type: 'text' as const, text: truncate(result.content) }],
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
    `Available profiles: ${listProfiles().join(', ')}. ` +
    'Returns titles, URLs, and content snippets.',
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
  async ({ url, profile: profileName, timeout }) => {
    try {
      const profile = getProfile(profileName);
      if (!profile) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Unknown profile: ${profileName}. Available: ${listProfiles().join(', ')}`,
            },
          ],
          isError: true,
        };
      }

      const scraped = await scrape({
        url,
        waitAfterLoad: profile.waitAfterLoad,
        timeout,
        waitForSelector: profile.waitForSelector,
      });

      // Check for CAPTCHA
      if (profile.captchaPatterns.some((p) => scraped.url.includes(p))) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `CAPTCHA detected at ${url}. The target site blocked the request.`,
            },
          ],
          isError: true,
        };
      }

      const output = profile.extract(scraped.html, scraped.url);

      const lines: string[] = [];
      lines.push(`Found ${output.results.length} results from ${profileName} profile:\n`);

      for (const [i, r] of output.results.entries()) {
        lines.push(`${i + 1}. ${r.title}`);
        lines.push(`   URL: ${r.url}`);
        if (r.content) lines.push(`   ${r.content}`);
        lines.push('');
      }

      if (output.suggestions.length > 0) {
        lines.push('Related searches:');
        for (const s of output.suggestions) {
          lines.push(`  - ${s}`);
        }
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
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

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

export async function startMcp() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[ghostreader] MCP connected (SCRAPER_URL=${config.scraperUrl})`);
}
