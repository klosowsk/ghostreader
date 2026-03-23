/**
 * Google Web Search extraction profile.
 *
 * Extracts structured results from rendered Google search HTML using cheerio.
 * Ported from the Python lxml/XPath version with equivalent selectors.
 *
 * Strategy (modeled on SearXNG's google.py):
 * - Container-first: iterate div.MjjYud result blocks
 * - Snippet via data-sncf="1" attribute (Google-internal marker)
 * - Fallback to div.VwiC3b class for snippets
 * - Title via a:has(h3) > h3 pattern
 * - URL de-tracking (strips Google redirect wrappers)
 * - Suggestion parsing from "People also search for" section
 */

import * as cheerio from 'cheerio';
import type { Profile, ExtractionOutput, ExtractResult } from './types.js';

const RE_GOOGLE_REDIRECT = /^\/url\?q=([^&]+)/;

function cleanGoogleUrl(url: string): string {
  const match = url.match(RE_GOOGLE_REDIRECT);
  if (match) {
    return decodeURIComponent(match[1]);
  }
  return url;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText(el: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): string {
  // Remove scripts before extracting text
  el.find('script').remove();
  return el.text().replace(/\s+/g, ' ').trim();
}

function extractSnippet(container: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): string {
  // Strategy 1: data-sncf="1" attribute (most resilient)
  const sncf = container.find('[data-sncf*="1"]');
  if (sncf.length) return extractText(sncf.first(), $);

  // Strategy 2: data-snf="nke7rc" slot marker
  const snf = container.find('[data-snf="nke7rc"]');
  if (snf.length) return extractText(snf.first(), $);

  // Strategy 3: VwiC3b class (current Google snippet class)
  const vwi = container.find('.VwiC3b');
  if (vwi.length) return extractText(vwi.first(), $);

  return '';
}

function extractThumbnail(container: cheerio.Cheerio<any>): string {
  const imgs = container.find('img:not(.XNo5Ab)');
  for (let i = 0; i < imgs.length; i++) {
    const src = imgs.eq(i).attr('src') || '';
    if (src.startsWith('http')) return src;
    if (src.startsWith('data:image') && src.length > 200) return src;
  }
  return '';
}

function extractResult(
  container: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI,
): ExtractResult | null {
  // Find h3 inside an anchor
  const h3 = container.find('a h3').first();
  if (!h3.length) return null;

  const title = h3.text().trim();
  if (!title) return null;

  const linkNode = h3.closest('a');
  let url = linkNode.attr('href') || '';
  url = cleanGoogleUrl(url);
  if (!url || !url.startsWith('http')) return null;

  const content = extractSnippet(container, $);
  const thumbnail = extractThumbnail(container);

  const result: ExtractResult = { url, title, content };
  if (thumbnail) result.thumbnail = thumbnail;
  return result;
}

const googleWeb: Profile = {
  name: 'google_web',
  captchaPatterns: ['/sorry', 'consent.google', 'recaptcha'],
  waitForSelector: 'a h3',
  waitAfterLoad: 2,

  extract(html: string): ExtractionOutput {
    const $ = cheerio.load(html);
    const results: ExtractResult[] = [];
    const suggestions: string[] = [];
    const seenUrls = new Set<string>();

    // Find result containers
    let containers = $('#rso .MjjYud');
    if (!containers.length) {
      containers = $('.MjjYud');
    }

    containers.each((_, el) => {
      try {
        const result = extractResult($(el), $);
        if (!result) return;
        if (seenUrls.has(result.url)) return;
        seenUrls.add(result.url);
        results.push(result);
      } catch {
        // skip malformed results
      }
    });

    // Suggestions — "People also search for"
    $('.oIk2Cb a').each((_, el) => {
      const text = $(el).text().trim();
      if (text) suggestions.push(text);
    });

    // Fallback suggestion selector
    if (!suggestions.length) {
      $('.ouy7Mc a').each((_, el) => {
        const text = $(el).text().trim();
        if (text) suggestions.push(text);
      });
    }

    return { results, suggestions };
  },
};

export default googleWeb;
