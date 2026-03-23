#!/usr/bin/env node
/**
 * GhostReader CLI
 *
 * Render any URL to markdown, extract structured data, or list available engines.
 *
 * Usage:
 *   ghostreader render <url> [--engine standard] [--format markdown] [--wait 2]
 *   ghostreader extract <url> --profile google_web [--timeout 30000] [--json]
 *   ghostreader engines
 *   ghostreader health
 *
 * Environment variables:
 *   GHOSTREADER_URL — processor URL (default: http://localhost:3000)
 */

const BASE_URL = (process.env.GHOSTREADER_URL || 'http://localhost:3000').replace(/\/$/, '');

// Simple arg parser — no dependencies
function parseArgs(args: string[]) {
  const command = args[0] || '';
  const positional: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

async function render(url: string, flags: Record<string, string>) {
  const engine = flags.engine || 'standard';
  const format = flags.format || 'markdown';
  const wait = flags.wait || '2';
  const article = flags.article === 'true' ? '&article=true' : '';

  const res = await fetch(`${BASE_URL}/render/${url}?engine=${engine}&format=${format}&wait=${wait}${article}`);
  if (!res.ok) {
    const text = await res.text();
    console.error(`Error: ${res.status} ${text}`);
    process.exit(1);
  }
  const text = await res.text();
  process.stdout.write(text);
  if (!text.endsWith('\n')) process.stdout.write('\n');
}

async function extract(url: string, flags: Record<string, string>) {
  const profile = flags.profile;
  if (!profile) {
    console.error('Error: --profile is required for extract command');
    console.error('Available profiles: google_web, google_news, base');
    process.exit(1);
  }

  const timeout = parseInt(flags.timeout || '30000', 10);

  const res = await fetch(`${BASE_URL}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, profile, timeout }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Error: ${res.status} ${text}`);
    process.exit(1);
  }

  const data = (await res.json()) as {
    results: Array<{ url: string; title: string; content: string }>;
    suggestions: string[];
    captcha: boolean;
    error: string | null;
  };

  if (flags.json === 'true') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (data.captcha) {
    console.error('CAPTCHA detected. The target site blocked the request.');
    process.exit(1);
  }
  if (data.error) {
    console.error(`Extraction error: ${data.error}`);
    process.exit(1);
  }

  console.log(`Found ${data.results.length} results:\n`);
  for (const [i, r] of data.results.entries()) {
    console.log(`${i + 1}. ${r.title}`);
    console.log(`   ${r.url}`);
    if (r.content) console.log(`   ${r.content}`);
    console.log('');
  }

  if (data.suggestions.length > 0) {
    console.log('Related searches:');
    for (const s of data.suggestions) console.log(`  - ${s}`);
  }
}

async function engines() {
  const res = await fetch(`${BASE_URL}/engines`);
  if (!res.ok) {
    console.error(`Error: ${res.status}`);
    process.exit(1);
  }
  const data = (await res.json()) as {
    engines: Array<{ name: string; type: string; model?: string; available: boolean }>;
  };

  console.log('Available engines:\n');
  for (const e of data.engines) {
    const status = e.available ? 'available' : 'unavailable';
    const model = e.model ? ` (${e.model})` : '';
    console.log(`  ${e.name}${model} [${e.type}] - ${status}`);
  }
}

async function health() {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) {
    console.error(`Processor unreachable at ${BASE_URL}`);
    process.exit(1);
  }
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

function usage() {
  console.log(`ghostreader - Anti-detect browser rendering + AI content processing

Usage:
  ghostreader render <url> [options]    Render a URL to markdown
  ghostreader extract <url> [options]   Extract structured results
  ghostreader engines                   List available processing engines
  ghostreader health                    Check processor health

Options (render):
  --engine <name>     Processing engine: standard (default, fast), ai (Ollama reader-lm-v2)
  --format <type>     Output format: markdown (default), html, json
  --article           Enable article mode (aggressive content extraction)

Options (extract):
  --profile <name>    Extraction profile (required): google_web, google_news, base
  --timeout <ms>      Render timeout in ms (default: 30000)
  --json              Output raw JSON

Environment:
  GHOSTREADER_URL     Processor URL (default: http://localhost:3000)
`);
}

async function main() {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));

  try {
    switch (command) {
      case 'render': {
        const url = positional[0];
        if (!url) {
          console.error('Error: URL is required');
          console.error('Usage: ghostreader render <url>');
          process.exit(1);
        }
        await render(url, flags);
        break;
      }
      case 'extract': {
        const url = positional[0];
        if (!url) {
          console.error('Error: URL is required');
          console.error('Usage: ghostreader extract <url> --profile <name>');
          process.exit(1);
        }
        await extract(url, flags);
        break;
      }
      case 'engines':
        await engines();
        break;
      case 'health':
        await health();
        break;
      default:
        usage();
        if (command && command !== 'help' && command !== '--help' && command !== '-h') {
          process.exit(1);
        }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('connect')) {
      console.error(`Error: Cannot connect to GhostReader at ${BASE_URL}`);
      console.error('Make sure the processor is running, or set GHOSTREADER_URL.');
      process.exit(1);
    }
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}

main();
