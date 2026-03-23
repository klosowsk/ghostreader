/**
 * Content extraction using Defuddle.
 *
 * Defuddle extracts the main content from web pages, removing clutter like
 * comments, sidebars, headers, footers, and other non-essential elements.
 *
 * Two modes controlled by the `article` toggle:
 *   - article=false (default): forgiving extraction, preserves data tables
 *   - article=true: aggressive article extraction via content scoring
 *
 * Pre-cleans HTML with regex before DOM parsing to avoid parsing megabytes
 * of inline scripts/styles (significant performance win on large pages).
 */

import { Defuddle } from 'defuddle/node';
import { JSDOM } from 'jsdom';

export interface ExtractionResult {
  content: string;       // HTML or markdown
  title: string;
  author?: string;
  description?: string;
  published?: string;
  domain?: string;
  site?: string;
  wordCount: number;
  parseTime: number;
}

/**
 * Strip heavy tags via regex BEFORE feeding to DOM parser.
 * Avoids parsing megabytes of inline scripts and SVG paths.
 */
function preClean(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');
}

/**
 * Extract content from rendered HTML using Defuddle.
 *
 * @param html - Raw HTML from the scraper
 * @param url - URL of the page (used for relative URL resolution)
 * @param options.article - Enable aggressive article extraction (removeLowScoring)
 * @param options.markdown - Output markdown (true) or cleaned HTML (false)
 */
export async function extract(
  html: string,
  url?: string,
  options: { article?: boolean; markdown?: boolean } = {},
): Promise<ExtractionResult> {
  const cleaned = preClean(html);
  const dom = new JSDOM(cleaned, { url });

  const result = await Defuddle(dom.window.document, url || '', {
    markdown: options.markdown ?? true,
    removeLowScoring: options.article ?? false,
    removeHiddenElements: true,
    removeExactSelectors: true,
    removePartialSelectors: true,
    removeSmallImages: true,
  });

  return {
    content: result.content,
    title: result.title || '',
    author: result.author || undefined,
    description: result.description || undefined,
    published: result.published || undefined,
    domain: result.domain || undefined,
    site: result.site || undefined,
    wordCount: result.wordCount,
    parseTime: result.parseTime,
  };
}
