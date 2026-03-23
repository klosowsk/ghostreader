/**
 * Google News extraction profile.
 *
 * Extracts structured results from rendered Google News HTML using cheerio.
 * Handles base64-encoded URL decoding for /read/ and /articles/ redirects.
 */

import * as cheerio from 'cheerio';
import type { Profile, ExtractionOutput, ExtractResult } from './types.js';

function decodeGoogleNewsUrl(link: string): string {
  try {
    const prefixes = ['/read/', '/articles/'];
    let pathPart = '';

    for (const prefix of prefixes) {
      const idx = link.indexOf(prefix);
      if (idx !== -1) {
        pathPart = link.substring(idx + prefix.length).split('?')[0];
        break;
      }
    }

    if (!pathPart) return link;

    // Base64 URL-safe decode
    const padded = pathPart + '====';
    const decoded = Buffer.from(padded, 'base64url');

    // Find 'http' in the decoded bytes
    const httpIdx = decoded.indexOf('http');
    if (httpIdx === -1) return link;

    // Extract URL until separator byte
    const slice = decoded.subarray(httpIdx);
    const sepIdx = slice.indexOf(0xd2);
    const urlBytes = sepIdx !== -1 ? slice.subarray(0, sepIdx) : slice;
    return urlBytes.toString('utf-8');
  } catch {
    return link;
  }
}

const googleNews: Profile = {
  name: 'google_news',
  captchaPatterns: ['/sorry', 'consent.google', 'recaptcha'],
  waitAfterLoad: 3,

  extract(html: string): ExtractionOutput {
    const $ = cheerio.load(html);
    const results: ExtractResult[] = [];
    const seenUrls = new Set<string>();

    // Google News results are anchors with href starting with "./read/"
    $('a[href^="./read/"]').each((_, el) => {
      try {
        const $el = $(el);
        const href = $el.attr('href') || '';
        const title = $el.text().trim();

        if (!title || title.length < 10) return;

        // Build absolute URL
        const link = 'https://news.google.com' + href.substring(1); // strip leading "."
        const decodedLink = decodeGoogleNewsUrl(link);

        if (seenUrls.has(decodedLink)) return;
        seenUrls.add(decodedLink);

        // Walk up to find source/time metadata
        let source = '';
        let pubTime = '';
        let container = $el.parent();

        for (let i = 0; i < 5 && container.length; i++) {
          if (!source) {
            const srcEl = container.find('[data-n-tid]').first();
            if (srcEl.length) source = srcEl.text().trim();
          }
          if (!pubTime) {
            const timeEl = container.find('time').first();
            if (timeEl.length) pubTime = timeEl.text().trim();
          }
          if (source && pubTime) break;
          container = container.parent();
        }

        const content = [source, pubTime].filter(Boolean).join(' / ');

        // Thumbnail — look for nearby img
        let thumbnail: string | undefined;
        let parent = $el.parent();
        for (let i = 0; i < 3 && parent.length; i++) {
          const img = parent.find('img').first();
          const src = img.attr('src') || '';
          if (src.startsWith('http')) {
            thumbnail = src;
            break;
          }
          parent = parent.parent();
        }

        const result: ExtractResult = { url: decodedLink, title, content };
        if (thumbnail) result.thumbnail = thumbnail;
        results.push(result);
      } catch {
        // skip malformed results
      }
    });

    return { results, suggestions: [] };
  },
};

export default googleNews;
