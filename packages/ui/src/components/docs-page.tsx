import { useState, useEffect, useRef } from "react";
import { Link } from "react-router";
import { ArrowLeft, Ghost, Menu, X } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Section {
  id: string;
  label: string;
}

const SECTIONS: Section[] = [
  { id: "web-ui", label: "Web UI" },
  { id: "api", label: "API" },
  { id: "cli", label: "CLI" },
  { id: "mcp-server", label: "MCP Server" },
  { id: "self-hosting", label: "Self-Hosting" },
  { id: "searxng-integration", label: "SearXNG" },
  { id: "engines", label: "Engines" },
];

const DOCS = `
# GhostReader

Anti-detect browser rendering proxy with AI-powered content processing. Render any URL to clean markdown through a stealth Camoufox browser, extract structured data, and process content with Ollama AI.

- **Web UI** — you're looking at it
- **CLI** — \`npx ghostreader render https://example.com\`
- **MCP** — \`ghostreader-mcp\` for Claude Desktop, Cursor, OpenCode
- **API** — \`GET /render/https://example.com\`

---

## Web UI

Enter a URL, pick an engine, and hit enter.

| Option | Description |
|--------|-------------|
| **Standard** | Fast extraction via Defuddle — no AI |
| **AI** | reader-lm-v2 restructures content into clean tables/lists |
| **Article** | Aggressive mode — strips sidebars, keeps only main content |
| **Images** | Keep image references in output (off by default) |
| **Format** | markdown, html, or json output |

---

## API

### Render a URL

\`\`\`
GET /render/https://example.com?engine=standard&format=markdown
\`\`\`

Query params: \`engine\`, \`format\`, \`wait\` (seconds), \`article\`, \`images\`, \`timeout\` (ms).

### Render via POST

\`\`\`bash
curl -X POST /scrape \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com", "engine": "ai"}'
\`\`\`

### Process pre-fetched HTML

\`\`\`bash
curl -X POST /process \\
  -H "Content-Type: application/json" \\
  -d '{"html": "<html>...</html>", "engine": "standard"}'
\`\`\`

### Extract structured results

\`\`\`bash
curl -X POST /extract \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://google.com/search?q=test", "profile": "google_web"}'
\`\`\`

Profiles: \`google_web\`, \`google_news\`, \`base\`.

### Utility endpoints

\`\`\`
GET /health      # {"status":"ok","scraper":"connected"}
GET /engines     # list available engines
GET /profiles    # list extraction profiles
GET /config      # current configuration
\`\`\`

---

## CLI

Zero-dependency command-line tool.

\`\`\`bash
npm install -g ghostreader
# or run directly
npx ghostreader render https://example.com
\`\`\`

### Commands

\`\`\`bash
ghostreader render <url> [--engine ai] [--format json] [--article]
ghostreader extract <url> --profile google_web [--json]
ghostreader engines
ghostreader health
\`\`\`

### Environment

\`\`\`bash
export GHOSTREADER_URL=https://your-instance.example.com
\`\`\`

---

## MCP Server

For AI agents — Claude Desktop, Cursor, OpenCode, etc.

\`\`\`bash
npm install -g ghostreader-mcp
\`\`\`

### Tools

| Tool | Description |
|------|-------------|
| \`ghostreader_scrape\` | Render a URL to markdown via anti-detect browser |
| \`ghostreader_extract\` | Extract structured results using a named profile |

### Claude Desktop

\`\`\`json
{
  "mcpServers": {
    "ghostreader": {
      "command": "npx",
      "args": ["-y", "ghostreader-mcp"],
      "env": {
        "GHOSTREADER_URL": "https://your-instance.example.com"
      }
    }
  }
}
\`\`\`

### OpenCode / Cursor

\`\`\`json
{
  "mcp": {
    "ghostreader": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "ghostreader-mcp"],
      "env": {
        "GHOSTREADER_URL": "https://your-instance.example.com"
      }
    }
  }
}
\`\`\`

---

## Self-Hosting

GhostReader runs as two services: a **scraper** (Python/Camoufox anti-detect browser) and a **processor** (TypeScript/Hono that handles content extraction, AI, and the web UI).

### Docker Compose

\`\`\`bash
git clone https://github.com/klosowsk/ghostreader
cd ghostreader
docker compose up -d --build
\`\`\`

This starts the scraper on port 8090 and the processor on port 3000. The processor includes the web UI.

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| \`SCRAPER_URL\` | \`http://scraper:8080\` | URL of the scraper service |
| \`OLLAMA_URL\` | \`http://localhost:11434\` | Ollama API URL (optional, for AI engine) |
| \`OLLAMA_AI_MODEL\` | \`milkey/reader-lm-v2:latest\` | Ollama model for AI engine |
| \`OLLAMA_MAX_CONTEXT\` | \`131072\` | Max context window (tokens) |
| \`PORT\` | \`3000\` | Processor HTTP port |

### Ollama setup (optional)

The AI engine requires [Ollama](https://ollama.com) with reader-lm-v2:

\`\`\`bash
ollama pull milkey/reader-lm-v2
\`\`\`

reader-lm-v2 is a 1.1GB model purpose-trained for HTML/markdown restructuring. It runs well on GPUs with 4GB+ VRAM. The AI engine is optional — the standard engine works without it.

### Kubernetes / k3s

Deploy scraper and processor as separate Deployments. The processor needs \`SCRAPER_URL\` pointing to the scraper Service. Both images are on GHCR:

\`\`\`
ghcr.io/klosowsk/ghostreader/processor:latest
ghcr.io/klosowsk/ghostreader/scraper:latest
\`\`\`

The scraper needs a PersistentVolume at \`/userdata\` for fingerprint persistence across restarts (browser identity, cookies, cache). Without it, a new fingerprint is generated on every pod restart.

The scraper needs ~1-2GB memory. Set resource limits accordingly:

\`\`\`yaml
resources:
  requests:
    memory: "512Mi"
  limits:
    memory: "2Gi"
\`\`\`

---

## SearXNG Integration

GhostReader integrates with [SearXNG](https://github.com/searxng/searxng) as a search backend using the built-in \`json_engine\` — **zero SearXNG code changes needed**.

### How it works

1. SearXNG sends a search query to GhostReader's \`/extract\` endpoint via \`json_engine\`
2. GhostReader renders the target search engine (Google, etc.) through the anti-detect browser
3. Extraction profiles parse the rendered HTML into structured results
4. Results are returned to SearXNG in its expected format

### SearXNG configuration

Add this to your SearXNG \`settings.yml\` engines section:

\`\`\`yaml
- name: ghostreader
  engine: json_engine
  shortcut: gr
  categories: [general]
  paging: true
  search_url: http://processor-svc:3000/extract
  method: POST
  request_body: >-
    {
      "url": "https://www.google.com/search?q={query}&start={pageno}0&hl=en",
      "profile": "google_web",
      "timeout": 30000
    }
  content_type: application/json
  results_query: results
  url_query: url
  title_query: title
  content_query: content
  disabled: false
  timeout: 30
\`\`\`

Replace \`http://processor-svc:3000\` with your processor's internal service URL.

### Available search profiles

| Profile | Target | Notes |
|---------|--------|-------|
| \`google_web\` | Google Web Search | Best results, but Google may CAPTCHA |
| \`google_news\` | Google News | Less aggressive rate limiting |
| \`base\` | Any site | Generic CSS extraction, pass custom selectors |

### Gotcha: suggestion_query

Do **not** set \`suggestion_query\` in the SearXNG config. The \`/extract\` endpoint returns suggestions as a flat string array, but SearXNG's \`json_engine\` wraps them in a list, causing an \`unhashable type: 'list'\` crash.

---

## Engines

| Engine | Speed | Description |
|--------|-------|-------------|
| **standard** | ~2-5s | Defuddle extraction + markdown. No AI required. |
| **ai** | ~5-15s | Defuddle + Ollama reader-lm-v2. Creates structured tables from listings. |

The AI engine automatically strips images before processing (images waste tokens for text models).

---

## Source

[github.com/klosowsk/ghostreader](https://github.com/klosowsk/ghostreader)
`;

/** Generate heading ID from text (same algorithm as rehype-slug) */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .trim();
}

export function DocsPage() {
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Track active section via IntersectionObserver
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const headings = el.querySelectorAll("h2[id]");
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, []);

  function handleNavClick(id: string) {
    setActiveSection(id);
    setMobileNavOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const nav = (
    <nav className="space-y-0.5">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          onClick={() => handleNavClick(s.id)}
          className={`block w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors ${
            activeSection === s.id
              ? "bg-accent text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          }`}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <Link
          to="/"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <Ghost className="size-5 text-foreground" />
          <span className="font-medium text-sm tracking-tight">
            GhostReader
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {/* Mobile nav toggle */}
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="md:hidden inline-flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {mobileNavOpen ? (
              <X className="size-4" />
            ) : (
              <Menu className="size-4" />
            )}
          </button>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Back</span>
          </Link>
        </div>
      </header>

      {/* Mobile nav dropdown */}
      {mobileNavOpen && (
        <div className="md:hidden border-b border-border bg-background px-4 py-3">
          {nav}
        </div>
      )}

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-48 shrink-0 border-r border-border overflow-y-auto py-6 px-3">
          {nav}
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-6 py-8" ref={contentRef}>
          <div className="max-w-2xl mx-auto">
            <div className="prose-ghost">
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h2: ({ children, ...props }) => {
                    const text =
                      typeof children === "string"
                        ? children
                        : Array.isArray(children)
                          ? children
                              .map((c) =>
                                typeof c === "string" ? c : ""
                              )
                              .join("")
                          : "";
                    const id = slugify(text);
                    return (
                      <h2 id={id} className="scroll-mt-20" {...props}>
                        {children}
                      </h2>
                    );
                  },
                }}
              >
                {DOCS}
              </Markdown>
            </div>
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-3 px-4 text-center text-xs text-muted-foreground">
        GhostReader v0.1.0
      </footer>
    </div>
  );
}
