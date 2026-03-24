/**
 * Shared types for extraction profiles.
 */

export interface ExtractResult {
  url: string;
  title: string;
  content: string | Record<string, string>;
  thumbnail?: string;
}

export interface ExtractionOutput {
  results: ExtractResult[];
  suggestions: string[];
}

export interface Profile {
  name: string;
  captchaPatterns: string[];
  waitForSelector?: string;
  waitAfterLoad: number;
  extract: (html: string, url: string, options?: Record<string, string>) => ExtractionOutput;
}
