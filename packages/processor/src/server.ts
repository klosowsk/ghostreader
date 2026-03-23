/**
 * Hono HTTP API for the GhostReader content processor.
 */

import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'path';
import { fileURLToPath } from 'url';
import { process, getAvailableEngines, type OutputFormat, type Engine } from './pipeline/index.js';
import { scrape, scraperHealth } from './clients/scraper.js';
import { getProfile, listProfiles } from './profiles/index.js';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');

export const app = new Hono();

// ---------------------------------------------------------------------------
// POST /process — process pre-fetched HTML
// ---------------------------------------------------------------------------

app.post('/process', async (c) => {
  const body = await c.req.json<{
    html: string;
    url?: string;
    engine?: Engine;
    format?: OutputFormat;
  }>();

  if (!body.html) {
    return c.json({ error: "Missing 'html' field" }, 400);
  }

  try {
    const result = await process({
      html: body.html,
      url: body.url,
      engine: body.engine,
      format: body.format,
    });

    if (result.format === 'html') {
      return c.html(result.content);
    }
    if (result.format === 'json') {
      return c.json(JSON.parse(result.content));
    }
    // markdown
    return c.text(result.content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /scrape — render URL via scraper + process content
// ---------------------------------------------------------------------------

app.post('/scrape', async (c) => {
  const body = await c.req.json<{
    url: string;
    format?: OutputFormat;
    engine?: Engine;
    wait_after_load?: number;
    timeout?: number;
  }>();

  if (!body.url) {
    return c.json({ error: "Missing 'url' field" }, 400);
  }

  try {
    const scraped = await scrape({
      url: body.url,
      waitAfterLoad: body.wait_after_load,
      timeout: body.timeout,
    });

    const result = await process({
      html: scraped.html,
      url: scraped.url,
      engine: body.engine,
      format: body.format,
    });

    if (result.format === 'html') {
      return c.html(result.content);
    }
    if (result.format === 'json') {
      return c.json(JSON.parse(result.content));
    }
    return c.text(result.content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /render/{url} — Jina-style URL rendering
// ---------------------------------------------------------------------------

app.get('/render/*', async (c) => {
  // Extract target URL from path (everything after /render/)
  const targetPath = c.req.path.replace(/^\/render\//, '');
  if (!targetPath) {
    return c.json({ error: 'Missing URL after /render/' }, 400);
  }

  // Parse our query params vs target URL params
  const queryParams = c.req.query();
  const format = (queryParams.format as OutputFormat) || 'markdown';
  const engine = (queryParams.engine as Engine) || 'turndown';
  const wait = parseFloat(queryParams.wait || '2');
  const timeout = queryParams.timeout ? parseInt(queryParams.timeout, 10) : undefined;

  // Rebuild target URL with remaining query params
  const ourParams = new Set(['format', 'engine', 'wait', 'timeout']);
  const targetParams = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams)) {
    if (!ourParams.has(key)) {
      targetParams.append(key, value);
    }
  }
  const targetQuery = targetParams.toString();
  const targetUrl = targetQuery
    ? `${targetPath}${targetPath.includes('?') ? '&' : '?'}${targetQuery}`
    : targetPath;

  if (!['markdown', 'html', 'json'].includes(format)) {
    return c.json({ error: "Invalid format. Must be 'markdown', 'html', or 'json'" }, 400);
  }

  try {
    const scraped = await scrape({ url: targetUrl, waitAfterLoad: wait, timeout });

    const result = await process({
      html: scraped.html,
      url: scraped.url,
      engine,
      format,
    });

    if (result.format === 'html') {
      return c.html(result.content);
    }
    if (result.format === 'json') {
      return c.json(JSON.parse(result.content));
    }
    return c.text(result.content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /extract — render URL via scraper + extract structured results
// ---------------------------------------------------------------------------

app.post('/extract', async (c) => {
  const body = await c.req.json<{
    url: string;
    profile: string;
    timeout?: number;
    wait_after_load?: number;
    options?: Record<string, string>;
  }>();

  if (!body.url) {
    return c.json({ error: "Missing 'url' field" }, 400);
  }
  if (!body.profile) {
    return c.json({ error: "Missing 'profile' field" }, 400);
  }

  const profile = getProfile(body.profile);
  if (!profile) {
    return c.json({ error: `Unknown profile: ${body.profile}. Available: ${listProfiles().join(', ')}` }, 400);
  }

  // Check for CAPTCHA in the target URL before rendering
  const isCaptcha = (url: string) =>
    profile.captchaPatterns.some((p) => url.includes(p));

  try {
    const scraped = await scrape({
      url: body.url,
      waitAfterLoad: body.wait_after_load ?? profile.waitAfterLoad,
      timeout: body.timeout ?? 30000,
      waitForSelector: profile.waitForSelector,
    });

    // Check if we got a CAPTCHA
    if (isCaptcha(scraped.url)) {
      return c.json({
        results: [],
        suggestions: [],
        captcha: true,
        error: 'CAPTCHA detected',
      });
    }

    const output = profile.extract(scraped.html, scraped.url, body.options);

    return c.json({
      results: output.results,
      suggestions: output.suggestions,
      captcha: false,
      error: null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ results: [], suggestions: [], captcha: false, error: msg }, 500);
  }
});

// ---------------------------------------------------------------------------
// Utility endpoints
// ---------------------------------------------------------------------------

app.get('/health', async (c) => {
  const scraper = await scraperHealth();
  return c.json({
    status: 'ok',
    scraper: scraper ? 'connected' : 'unreachable',
  });
});

app.get('/config', (c) => {
  return c.json({
    scraperUrl: config.scraperUrl,
    ollamaUrl: config.ollamaUrl,
    ollamaAiModel: config.ollamaAiModel,
    ollamaMaxContext: config.ollamaMaxContext,
    port: config.port,
  });
});

app.get('/engines', async (c) => {
  const engines = await getAvailableEngines();
  return c.json({ engines });
});

app.get('/profiles', (c) => {
  return c.json({ profiles: listProfiles() });
});

// ---------------------------------------------------------------------------
// Static UI (served from /public directory)
// ---------------------------------------------------------------------------

app.use('/*', serveStatic({ root: publicDir }));

// SPA fallback — serve index.html for any unmatched route
app.get('/*', serveStatic({ root: publicDir, path: 'index.html' }));
