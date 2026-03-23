/**
 * Content processing pipeline orchestrator.
 *
 * Four engines:
 *   - standard (default): Smart DOM extraction + Turndown — fast, no AI, preserves all data
 *   - clean: Readability + Turndown — aggressive article extraction, strips boilerplate
 *   - ai: Ollama AI model (configurable via OLLAMA_AI_MODEL, default reader-lm-v2)
 *   - auto: standard if no Ollama, ai if available and page is complex
 */

import { extractContent, extractArticle } from './readability.js';
import { htmlToMarkdown } from './turndown.js';
import { htmlToMarkdownWithAI, isOllamaAvailable, getAiModelInfo } from './ollama.js';
import { config } from '../config.js';

export type Engine = 'standard' | 'clean' | 'ai' | 'auto' | string;
export type OutputFormat = 'markdown' | 'html' | 'json';

export interface ProcessOptions {
  html: string;
  url?: string;
  engine?: Engine;
  format?: OutputFormat;
}

export interface ProcessResult {
  content: string;
  format: OutputFormat;
  engine: string;
  title?: string;
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
  const { html, url, format = 'markdown' } = options;
  let engine = options.engine || 'standard';

  // Backward compat aliases
  if (engine === 'turndown') engine = 'standard';
  if (engine === 'readerlm' || engine === 'qwen-small') engine = 'ai';

  // Auto-select engine
  if (engine === 'auto') {
    if (isComplex(html) && (await isOllamaAvailable())) {
      engine = 'ai';
    } else {
      engine = 'standard';
    }
  }

  // Choose extraction strategy based on engine
  const useArticle = engine === 'clean';
  const extracted = useArticle ? extractArticle(html, url) : extractContent(html, url);

  // HTML format: return cleaned HTML
  if (format === 'html') {
    return {
      content: extracted.content,
      format: 'html',
      engine,
      title: extracted.title,
    };
  }

  // JSON format: return metadata
  if (format === 'json') {
    const result = {
      title: extracted.title,
      content: extracted.content,
      length: extracted.content.length,
    };
    return {
      content: JSON.stringify(result),
      format: 'json',
      engine,
      title: extracted.title,
    };
  }

  // Markdown with standard or clean engine
  if (engine === 'standard' || engine === 'clean') {
    const markdown = htmlToMarkdown(extracted.content);
    return {
      content: markdown,
      format: 'markdown',
      engine,
      title: extracted.title,
    };
  }

  // AI engine: send pre-cleaned HTML to the configured Ollama model
  if (engine === 'ai') {
    const maxChars = config.ollamaMaxContext * 3; // ~3 chars per token
    const inputChars = extracted.content.length;
    let aiInput = extracted.content;
    let warning: string | undefined;

    if (inputChars > maxChars) {
      // Truncate to fit context, keep beginning (most important content)
      aiInput = extracted.content.slice(0, maxChars);
      warning = `Content truncated from ${Math.round(inputChars / 1024)}KB to ${Math.round(maxChars / 1024)}KB to fit AI context window (${config.ollamaMaxContext} tokens). Some content at the end of the page may be missing.`;
      console.warn(`[ghostreader] ${warning}`);
    }

    const markdown = await htmlToMarkdownWithAI(aiInput);
    const output = warning ? `${markdown}\n\n---\n_${warning}_` : markdown;
    return {
      content: output,
      format: 'markdown',
      engine: 'ai',
      title: extracted.title,
    };
  }

  // Unknown engine — fall back to standard
  const markdown = htmlToMarkdown(extracted.content);
  return {
    content: markdown,
    format: 'markdown',
    engine: 'standard',
    title: extracted.title,
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
    { name: 'clean', type: 'fast', available: true },
    { name: 'ai', type: 'ai', model: aiInfo.model, available: aiAvailable },
    { name: 'auto', type: 'auto', available: true },
  ];
}
