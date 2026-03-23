/**
 * Content extraction utilities.
 *
 * Two strategies:
 *   - extractContent(): Smart DOM extraction — strips nav/header/footer/aside,
 *     extracts <main>. Preserves all data content. Default for 'standard' engine.
 *   - extractArticle(): Mozilla Readability — aggressive article extraction.
 *     Best for blog posts/articles. Strips data-heavy content. Used by 'clean' engine.
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

export interface ExtractedContent {
  title: string;
  content: string; // cleaned HTML suitable for Turndown
}

/**
 * Strip heavy tags via regex BEFORE feeding to JSDOM.
 * Avoids JSDOM parsing megabytes of inline scripts and SVG paths.
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
 * Smart DOM extraction (default).
 *
 * Strips nav/header/footer/aside, extracts <main> if present.
 * Preserves all data content (tables, charts, indicators).
 */
export function extractContent(html: string, url?: string): ExtractedContent {
  const cleaned = preClean(html);
  const dom = new JSDOM(cleaned, { url });
  const doc = dom.window.document;

  const title = doc.querySelector('title')?.textContent?.trim() || '';

  doc.querySelectorAll('nav, header, footer, aside').forEach((el) => el.remove());

  const main = doc.querySelector('main');
  const content = main ? main.innerHTML : doc.body?.innerHTML || cleaned;

  return { title, content };
}

/**
 * Readability-based article extraction (clean engine).
 *
 * Uses Mozilla Readability to identify and extract the "main article"
 * content. Aggressively strips navigation, sidebars, ads, and boilerplate.
 * Best for articles and blog posts. Will strip data-heavy content on
 * pages like financial dashboards.
 *
 * Falls back to smart DOM extraction if Readability can't identify content.
 */
export function extractArticle(html: string, url?: string): ExtractedContent {
  const cleaned = preClean(html);
  const dom = new JSDOM(cleaned, { url });

  const title = dom.window.document.querySelector('title')?.textContent?.trim() || '';

  const reader = new Readability(dom.window.document);
  const result = reader.parse();

  if (result) {
    return {
      title: result.title || title,
      content: result.content,
    };
  }

  // Readability couldn't extract — fall back to smart DOM extraction
  return extractContent(html, url);
}
