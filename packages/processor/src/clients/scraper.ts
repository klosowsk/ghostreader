/**
 * HTTP client for the GhostReader scraper service.
 *
 * The scraper handles anti-detect browser rendering.
 * This client calls its /scrape endpoint and returns raw HTML.
 */

import { config } from '../config.js';

export interface ScrapeOptions {
  url: string;
  waitAfterLoad?: number;
  timeout?: number;
  headers?: Record<string, string>;
  waitForSelector?: string;
  waitUntil?: string;
}

export interface ScrapeResult {
  html: string;
  status: number;
  url: string;
}

/**
 * Render a URL via the scraper service. Returns raw HTML.
 */
export async function scrape(options: ScrapeOptions): Promise<ScrapeResult> {
  const res = await fetch(`${config.scraperUrl}/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: options.url,
      wait_after_load: options.waitAfterLoad ?? 2,
      timeout: options.timeout ?? 60000,
      headers: options.headers,
      wait_for_selector: options.waitForSelector,
      wait_until: options.waitUntil ?? 'load',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Scraper returned ${res.status}: ${text}`);
  }

  const data = (await res.json()) as ScrapeResult;
  return data;
}

/**
 * Check if the scraper service is reachable.
 */
export async function scraperHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${config.scraperUrl}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
