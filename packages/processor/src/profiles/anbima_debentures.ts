/**
 * ANBIMA Data — Debentures extraction profile.
 *
 * Extracts structured debenture data from the ANBIMA Data search page
 * (https://data.anbima.com.br/busca/debentures).
 *
 * Each debenture card is an <li class="list-item__container"> containing:
 *   - Ticker + detail URL in h2.list-item__title > a
 *   - Key-value pairs in <dl> elements with <dt> (label) and <dd> (value)
 *     for: Emissor, Remuneração, Data de vencimento, Duration,
 *          Setor, Data da emissão, PU PAR, PU Indicativo
 */

import * as cheerio from 'cheerio';
import type { Profile, ExtractionOutput } from './types.js';

/** Maps the Portuguese field labels to compact English keys used in output. */
const FIELD_MAP: Record<string, string> = {
  'emissor': 'emissor',
  'remuneração': 'remuneracao',
  'data de vencimento': 'vencimento',
  'duration': 'duration',
  'setor': 'setor',
  'data da emissão': 'emissao',
  'pu par': 'pu_par',
  'pu indicativo': 'pu_indicativo',
};

const anbimaDebentures: Profile = {
  name: 'anbima_debentures',
  captchaPatterns: [],
  waitForSelector: 'li.list-item__container',
  waitAfterLoad: 3,

  extract(html: string, _url: string): ExtractionOutput {
    const results: ExtractionOutput['results'] = [];
    const suggestions: string[] = [];

    const $ = cheerio.load(html);

    $('li.list-item__container').each((_, el) => {
      try {
        const card = $(el);

        // --- ticker & URL ---------------------------------------------------
        const titleAnchor = card.find('h2.list-item__title a').first();
        const ticker = titleAnchor.text().trim().split(/\s/)[0]; // strip badge text like "Lei 12.431"
        const url = titleAnchor.attr('href') || '';
        if (!ticker || !url) return;

        // --- key-value fields -----------------------------------------------
        const fields: Record<string, string> = {};
        card.find('dl').each((_, dlEl) => {
          const dl = $(dlEl);
          const label = dl.find('dt').first().text().trim().toLowerCase();
          const value = dl.find('dd').first().text().trim();
          const key = FIELD_MAP[label];
          if (key) {
            fields[key] = value === '-' ? '' : value;
          }
        });

        // --- pass fields as structured key-value object -------------------------
        results.push({
          url,
          title: ticker,
          content: fields,
        });
      } catch {
        // skip malformed cards
      }
    });

    return { results, suggestions };
  },
};

export default anbimaDebentures;
