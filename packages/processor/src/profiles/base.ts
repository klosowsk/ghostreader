/**
 * Generic CSS selector-based extraction profile.
 *
 * Used when no vendor-specific profile is set. Takes CSS selectors from the
 * request payload and extracts results from rendered HTML.
 */

import * as cheerio from 'cheerio';
import type { Profile, ExtractionOutput } from './types.js';

const base: Profile = {
  name: 'base',
  captchaPatterns: [],
  waitAfterLoad: 2,

  extract(html: string, _url: string, options?: Record<string, string>): ExtractionOutput {
    const results: ExtractionOutput['results'] = [];
    const suggestions: string[] = [];

    const resultsSelector = options?.results_selector || '';
    const urlSelector = options?.url_selector || '';
    const titleSelector = options?.title_selector || '';
    const contentSelector = options?.content_selector || '';
    const thumbnailSelector = options?.thumbnail_selector || '';
    const suggestionSelector = options?.suggestion_selector || '';

    if (!resultsSelector || !urlSelector || !titleSelector) {
      return { results, suggestions };
    }

    const $ = cheerio.load(html);

    $(resultsSelector).each((_, el) => {
      try {
        const container = $(el);

        // URL: try attr href first, then text content
        const urlEl = container.find(urlSelector).first();
        let url = urlEl.attr('href') || urlEl.text().trim();
        if (!url) return;

        const title = container.find(titleSelector).first().text().trim();
        if (!title) return;

        const content = contentSelector
          ? container.find(contentSelector).first().text().trim()
          : '';

        const item: ExtractionOutput['results'][0] = { url, title, content };

        if (thumbnailSelector) {
          const thumb = container.find(thumbnailSelector).first().attr('src');
          if (thumb) item.thumbnail = thumb;
        }

        results.push(item);
      } catch {
        // skip
      }
    });

    if (suggestionSelector) {
      $(suggestionSelector).each((_, el) => {
        const text = $(el).text().trim();
        if (text) suggestions.push(text);
      });
    }

    return { results, suggestions };
  },
};

export default base;
