/**
 * Profile registry — loads profiles by name.
 */

import type { Profile } from './types.js';
import googleWeb from './google_web.js';
import googleNews from './google_news.js';
import base from './base.js';
import anbimaDebentures from './anbima_debentures.js';

const profiles: Record<string, Profile> = {
  google_web: googleWeb,
  google_news: googleNews,
  base,
  anbima_debentures: anbimaDebentures,
};

export function getProfile(name: string): Profile | null {
  return profiles[name] || null;
}

export function listProfiles(): string[] {
  return Object.keys(profiles);
}

export type { Profile, ExtractionOutput, ExtractResult } from './types.js';
