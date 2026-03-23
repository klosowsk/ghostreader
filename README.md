# GhostReader

Self-hosted anti-detect browser rendering proxy with AI-powered content processing. Render any URL to clean markdown through a stealth [Camoufox](https://github.com/daijro/camoufox) browser, extract structured data with extraction profiles, and optionally restructure content with [Ollama](https://ollama.com) AI.

## Quick Start

```bash
# Docker Compose
git clone https://github.com/klosowsk/ghostreader
cd ghostreader && docker compose up -d --build

# CLI
npx ghostreader render https://example.com

# API
curl https://your-instance/render/https://example.com
```

## Architecture

```
                   ┌────────────────────────────────────┐
                   │         GhostReader                │
  Web UI ──────┐   │                                    │
  CLI ─────────┤   │  Processor (TypeScript/Hono)       │
  MCP agents ──┤──▶│  ├─ Defuddle content extraction    │
  SearXNG ─────┤   │  ├─ Ollama AI formatting (opt.)    │
  curl/API ────┘   │  └─ Extraction profiles            │
                   │         │                          │
                   │         ▼                          │
                   │  Scraper (Python/Camoufox)         │
                   │  ├─ Anti-detect Firefox browser    │
                   │  ├─ Persistent identity/cookies    │
                   │  └─ GeoIP fingerprint matching     │
                   └────────────────────────────────────┘
```

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [**processor**](packages/processor) | Content processing API + Web UI | Docker |
| [**scraper**](packages/scraper) | Anti-detect browser service | Docker |
| [**cli**](packages/cli) | Command-line tool | `npm i -g ghostreader` |
| [**mcp**](packages/mcp) | MCP server for AI agents | `npm i -g @ghostreader/mcp` |
| [**ui**](packages/ui) | React web interface | Embedded in processor |

## Engines

| Engine | Speed | Description |
|--------|-------|-------------|
| **standard** | ~2-5s | Defuddle extraction + markdown. No AI needed. |
| **ai** | ~5-15s | Defuddle + reader-lm-v2. Restructures content into clean tables. |

## Documentation

Full documentation is available at the [/docs](https://ghostreader.home.rklosowski.com/docs) page on any running instance, covering:

- API reference
- CLI commands
- MCP setup (Claude Desktop, Cursor, OpenCode)
- Self-hosting (Docker Compose, Kubernetes)
- SearXNG integration

## License

MIT
