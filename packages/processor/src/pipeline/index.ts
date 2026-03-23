/**
 * Content processing pipeline orchestrator.
 *
 * Engines:
 *   - standard (default): Defuddle extraction + markdown — fast, no AI
 *   - ai: Defuddle extraction + Ollama AI model for markdown conversion
 *   - auto: standard if no Ollama, ai if available and page is complex
 *
 * The `article` toggle applies to ALL engines:
 *   - article=false (default): forgiving extraction, preserves data tables/charts
 *   - article=true: aggressive content scoring, extracts article body only
 */

import { extract } from './extraction.js';
import { toMarkdownWithAI, isOllamaAvailable, getAiModelInfo } from './ollama.js';
import { config } from '../config.js';

export type Engine = 'standard' | 'ai' | 'auto' | string;
export type OutputFormat = 'markdown' | 'html' | 'json';

export interface ProcessOptions {
  html: string;
  url?: string;
  engine?: Engine;
  format?: OutputFormat;
  article?: boolean;
  images?: boolean;
}

export interface ProcessResult {
  content: string;
  format: OutputFormat;
  engine: string;
  title?: string;
  author?: string;
  description?: string;
  wordCount?: number;
  parseTime?: number;
}

/**
 * Detect if HTML is complex enough to warrant AI processing.
 */
function isComplex(html: string): boolean {
  const tableCount = (html.match(/<table[\s>]/gi) || []).length;
  const mathPresent = /<math[\s>]/i.test(html) || /\$\$/.test(html) || /\\begin\{/i.test(html);
  const preCount = (html.match(/<pre[\s>]/gi) || []).length;
  return tableCount >= 3 || mathPresent || preCount >= 5;
}

/**
 * Process HTML through the content pipeline.
 */
export async function process(options: ProcessOptions): Promise<ProcessResult> {
  const { html, url, format = 'markdown', article = false, images = false } = options;
  let engine = options.engine || 'standard';

  // Backward compat aliases
  if (engine === 'turndown' || engine === 'clean') engine = 'standard';
  if (engine === 'readerlm' || engine === 'qwen-small') engine = 'ai';

  // Auto-select engine
  if (engine === 'auto') {
    if (isComplex(html) && (await isOllamaAvailable())) {
      engine = 'ai';
    } else {
      engine = 'standard';
    }
  }

  // For HTML format, extract cleaned HTML (no markdown conversion)
  if (format === 'html') {
    const extracted = await extract(html, url, { article, markdown: false, images });
    return {
      content: extracted.content,
      format: 'html',
      engine,
      title: extracted.title,
      author: extracted.author,
      description: extracted.description,
      wordCount: extracted.wordCount,
      parseTime: extracted.parseTime,
    };
  }

  // For JSON format, return metadata
  if (format === 'json') {
    const extracted = await extract(html, url, { article, markdown: false, images });
    const result = {
      title: extracted.title,
      author: extracted.author,
      description: extracted.description,
      published: extracted.published,
      domain: extracted.domain,
      site: extracted.site,
      content: extracted.content,
      wordCount: extracted.wordCount,
      parseTime: extracted.parseTime,
    };
    return {
      content: JSON.stringify(result),
      format: 'json',
      engine,
      title: extracted.title,
    };
  }

  // Standard engine: Defuddle handles extraction + markdown conversion
  if (engine === 'standard') {
    const extracted = await extract(html, url, { article, markdown: true, images });
    return {
      content: extracted.content,
      format: 'markdown',
      engine: 'standard',
      title: extracted.title,
      author: extracted.author,
      description: extracted.description,
      wordCount: extracted.wordCount,
      parseTime: extracted.parseTime,
    };
  }

  // AI engine: Defuddle extracts markdown (images always stripped for AI),
  // then Ollama restructures it into clean, well-formatted markdown.
  //
  // Sending Defuddle markdown (not HTML) to reader-lm-v2 is 30-50% faster
  // and produces equally structured output for most pages.
  // For complex pages (many tables/math), we still send HTML to preserve
  // structure that markdown conversion might lose.
  if (engine === 'ai') {
    const complex = isComplex(html);
    const extracted = await extract(html, url, {
      article,
      markdown: !complex,
      images: false,
    });

    // Truncate if content exceeds AI context window
    const maxChars = config.ollamaMaxContext * 3;
    let aiInput = extracted.content;
    let warning: string | undefined;

    if (aiInput.length > maxChars) {
      aiInput = aiInput.slice(0, maxChars);
      warning = `Content truncated from ${Math.round(extracted.content.length / 1024)}KB to ${Math.round(maxChars / 1024)}KB to fit AI context window (${config.ollamaMaxContext} tokens). Some content may be missing.`;
      console.warn(`[ghostreader] ${warning}`);
    }

    const markdown = await toMarkdownWithAI(aiInput, { isHtml: complex });
    const output = warning ? `${markdown}\n\n---\n_${warning}_` : markdown;

    return {
      content: output,
      format: 'markdown',
      engine: 'ai',
      title: extracted.title,
      author: extracted.author,
      description: extracted.description,
      wordCount: extracted.wordCount,
      parseTime: extracted.parseTime,
    };
  }

  // Unknown engine — fall back to standard
  const extracted = await extract(html, url, { article, markdown: true, images });
  return {
    content: extracted.content,
    format: 'markdown',
    engine: 'standard',
    title: extracted.title,
    wordCount: extracted.wordCount,
    parseTime: extracted.parseTime,
  };
}

/**
 * List available engines.
 */
export async function getAvailableEngines(): Promise<Array<{ name: string; type: string; model?: string; available: boolean }>> {
  const aiInfo = getAiModelInfo();
  const aiAvailable = await aiInfo.available;

  return [
    { name: 'standard', type: 'fast', available: true },
    { name: 'ai', type: 'ai', model: aiInfo.model, available: aiAvailable },
    { name: 'auto', type: 'auto', available: true },
  ];
}
