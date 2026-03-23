/**
 * Environment-based configuration for the processor.
 */

export interface Config {
  port: number;
  scraperUrl: string;
  ollamaUrl: string;
  ollamaAiModel: string;
  ollamaMaxContext: number;
  logLevel: string;
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    scraperUrl: (process.env.SCRAPER_URL || 'http://localhost:8080').replace(/\/$/, ''),
    ollamaUrl: (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, ''),
    ollamaAiModel: process.env.OLLAMA_AI_MODEL || 'milkey/reader-lm-v2:latest',
    ollamaMaxContext: parseInt(process.env.OLLAMA_MAX_CONTEXT || '65536', 10),
    logLevel: process.env.LOG_LEVEL || 'info',
  };
}

export const config = loadConfig();
