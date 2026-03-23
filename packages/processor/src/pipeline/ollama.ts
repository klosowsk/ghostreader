/**
 * Ollama client for AI-powered HTML-to-Markdown conversion.
 *
 * Uses a single configurable AI model (OLLAMA_AI_MODEL env var).
 * Default: milkey/reader-lm-v2:latest (purpose-trained for HTML→markdown).
 *
 * Ollama is entirely optional — if unreachable, AI engine is unavailable
 * and 'auto' falls back to 'standard'.
 */

import { Ollama } from 'ollama';
import { config } from '../config.js';

let client: Ollama | null = null;

function getClient(): Ollama {
  if (!client) {
    client = new Ollama({ host: config.ollamaUrl });
  }
  return client;
}

// ---------------------------------------------------------------------------
// Cached Ollama availability (30s TTL)
// ---------------------------------------------------------------------------

let cachedAvailable: boolean | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 30_000;

async function checkAvailability(): Promise<boolean> {
  const now = Date.now();
  if (cachedAvailable !== null && now < cacheExpiry) {
    return cachedAvailable;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    await getClient().list();
    clearTimeout(timeout);
    cachedAvailable = true;
  } catch {
    cachedAvailable = false;
  }
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return cachedAvailable;
}

/**
 * Check if Ollama is reachable.
 */
export async function isOllamaAvailable(): Promise<boolean> {
  return checkAvailability();
}

// ---------------------------------------------------------------------------
// Model-family detection for optimal inference params
// ---------------------------------------------------------------------------

function isReaderLM(model: string): boolean {
  return model.includes('reader-lm');
}

function isQwen(model: string): boolean {
  return model.includes('qwen');
}

/**
 * Strip markdown code fence wrapper that some models add around output.
 * e.g. ```markdown\n...\n``` → ...
 */
function stripCodeFence(text: string): string {
  const match = text.match(/^```(?:markdown|md|html)?\s*\n([\s\S]*?)\n?```\s*$/);
  return match ? match[1].trim() : text;
}

/**
 * Strip markdown image syntax from text.
 * Safety net: images should already be removed at the HTML level in preClean,
 * but this catches any that leak through Defuddle's markdown conversion.
 */
function stripMarkdownImages(text: string): string {
  // Strip linked images: [![alt](img-url)](link-url)
  let cleaned = text.replace(/\[!\[[^\]]*\]\([^)]+\)\]\([^)]+\)/g, '');
  // Strip standalone images: ![alt](url)
  cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
  // Clean up empty link wrappers left behind: [](url)
  cleaned = cleaned.replace(/\[\]\([^)]+\)\s*/g, '');
  // Collapse multiple blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned;
}

/**
 * Estimate token count from HTML character count.
 * HTML averages ~3 chars per token.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/**
 * Calculate dynamic num_ctx based on input size.
 * Leaves room for output (input * 1.5), clamped to [4096, OLLAMA_MAX_CONTEXT].
 */
function dynamicContext(inputTokens: number): number {
  const needed = Math.ceil(inputTokens * 1.5);
  return Math.max(4096, Math.min(needed, config.ollamaMaxContext));
}

/**
 * Convert content to clean markdown using the configured Ollama AI model.
 *
 * Input can be either HTML or pre-extracted markdown (Defuddle output).
 * Sending markdown is 30-50% faster for most pages; HTML is better for
 * complex data-heavy pages where markdown conversion loses structure.
 *
 * Automatically selects optimal inference params based on model family:
 *   - reader-lm: temperature=0, deterministic output
 *   - qwen: temperature=0.7, top_p=0.8, top_k=20, num_predict capped
 *   - other: temperature=0, system prompt
 */
export async function toMarkdownWithAI(
  content: string,
  options?: { isHtml?: boolean },
): Promise<string> {
  const model = config.ollamaAiModel;
  const isHtml = options?.isHtml ?? false;

  // Pre-flight: is Ollama reachable?
  const available = await isOllamaAvailable();
  if (!available) {
    throw new Error(
      `AI engine requires Ollama at ${config.ollamaUrl} which is unreachable. ` +
        `Use engine 'standard' (no AI required), or set OLLAMA_URL to a running Ollama instance.`,
    );
  }

  // Strip any residual markdown images before sending to AI
  const input = isHtml ? content : stripMarkdownImages(content);

  const inputTokens = estimateTokens(input);
  const numCtx = dynamicContext(inputTokens);

  const systemPrompt = isHtml
    ? 'You are a precise HTML-to-Markdown converter. Convert the provided HTML to clean, well-formatted Markdown. Preserve all content, links, headings, lists, tables, and code blocks. For listings or catalogs, create structured tables. Remove navigation, filters, and decorative elements. Output only the markdown, no explanations.'
    : 'You are a content formatter. Clean up and restructure the provided markdown into well-formatted, readable markdown. For listings or catalogs, create structured tables with appropriate columns. Remove navigation noise, filter links, and empty sections. Preserve all data content and links. Output only the cleaned markdown, no explanations.';

  // Model-family specific settings
  if (isReaderLM(model)) {
    // reader-lm works with both HTML and markdown input, deterministic output
    const response = await getClient().chat({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input },
      ],
      options: {
        temperature: 0,
        num_ctx: numCtx,
      },
    });
    return stripCodeFence(response.message.content.trim());
  }

  if (isQwen(model)) {
    // Qwen non-thinking mode settings from Unsloth docs
    const response = await getClient().chat({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input },
      ],
      options: {
        temperature: 0.7,
        top_p: 0.8,
        top_k: 20,
        num_ctx: numCtx,
        num_predict: Math.min(inputTokens, 8192),
      },
    });
    return stripCodeFence(response.message.content.trim());
  }

  // Generic model: conservative settings
  const response = await getClient().chat({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input },
    ],
    options: {
      temperature: 0,
      num_ctx: numCtx,
    },
  });
  return stripCodeFence(response.message.content.trim());
}

/**
 * Get info about the configured AI model.
 */
export function getAiModelInfo(): { model: string; available: Promise<boolean> } {
  return {
    model: config.ollamaAiModel,
    available: isOllamaAvailable(),
  };
}
