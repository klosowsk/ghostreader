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
 * Convert HTML to markdown using the configured Ollama AI model.
 *
 * Automatically selects optimal inference params based on model family:
 *   - reader-lm: temperature=0, no system prompt (trained for raw HTML input)
 *   - qwen: temperature=0.7, top_p=0.8, top_k=20, system prompt, num_predict capped
 *   - other: temperature=0, system prompt
 */
export async function htmlToMarkdownWithAI(html: string): Promise<string> {
  const model = config.ollamaAiModel;

  // Pre-flight: is Ollama reachable?
  const available = await isOllamaAvailable();
  if (!available) {
    throw new Error(
      `AI engine requires Ollama at ${config.ollamaUrl} which is unreachable. ` +
        `Use engine 'standard' (no AI required), or set OLLAMA_URL to a running Ollama instance.`,
    );
  }

  const inputTokens = estimateTokens(html);
  const numCtx = dynamicContext(inputTokens);

  // Model-family specific settings
  if (isReaderLM(model)) {
    // reader-lm is trained on raw HTML, no system prompt needed, deterministic output
    const response = await getClient().chat({
      model,
      messages: [{ role: 'user', content: html }],
      options: {
        temperature: 0,
        num_ctx: numCtx,
      },
    });
    return response.message.content.trim();
  }

  if (isQwen(model)) {
    // Qwen non-thinking mode settings from Unsloth docs
    const response = await getClient().chat({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a precise HTML-to-Markdown converter. Convert the provided HTML to clean, well-formatted Markdown. Preserve all content, links, headings, lists, tables, and code blocks. Output only the markdown, no explanations.',
        },
        { role: 'user', content: html },
      ],
      options: {
        temperature: 0.7,
        top_p: 0.8,
        top_k: 20,
        num_ctx: numCtx,
        num_predict: Math.min(inputTokens, 8192),
      },
    });
    return response.message.content.trim();
  }

  // Generic model: conservative settings
  const response = await getClient().chat({
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are a precise HTML-to-Markdown converter. Convert the provided HTML to clean, well-formatted Markdown. Preserve all content, links, headings, lists, tables, and code blocks. Output only the markdown, no explanations.',
      },
      { role: 'user', content: html },
    ],
    options: {
      temperature: 0,
      num_ctx: numCtx,
    },
  });
  return response.message.content.trim();
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
