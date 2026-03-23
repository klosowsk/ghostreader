import { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router";
import { History, Ghost, BookOpen, Terminal, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UrlInput } from "@/components/url-input";
import { ConfigPanel, type Config } from "@/components/config-panel";
import { ResultView } from "@/components/result-view";
import { ExtractView } from "@/components/extract-view";
import { HistorySidebar } from "@/components/history-sidebar";
import { DocsPage } from "@/components/docs-page";
import {
  renderUrl,
  extractUrl,
  getEngines,
  getProfiles,
  getHealth,
  type ExtractResponse,
} from "@/lib/api";
import {
  getHistory,
  addToHistory,
  clearHistory,
  type HistoryEntry,
} from "@/lib/history";

const DEFAULT_ENGINES = ["standard", "ai"];
const DEFAULT_PROFILES = ["google_web", "google_news", "base"];

function HomePage() {
  // Config state
  const [config, setConfig] = useState<Config>({
    mode: "render",
    engine: "standard",
    format: "markdown",
    profile: "google_web",
    article: false,
    images: false,
  });

  // Data sources
  const [engines, setEngines] = useState<string[]>(DEFAULT_ENGINES);
  const [profiles, setProfiles] = useState<string[]>(DEFAULT_PROFILES);

  // Results
  const [renderContent, setRenderContent] = useState<string | null>(null);
  const [extractData, setExtractData] = useState<ExtractResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  // Health / status
  const [scraperConnected, setScraperConnected] = useState<boolean | null>(null);

  // History
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Fetch engines, profiles, and health on mount
  useEffect(() => {
    getEngines()
      .then((res) => {
        if (res.engines?.length) setEngines(res.engines.map((e) => e.name));
      })
      .catch(() => {
        /* use defaults */
      });

    getProfiles()
      .then((res) => {
        if (res.profiles?.length) setProfiles(res.profiles);
      })
      .catch(() => {
        /* use defaults */
      });

    getHealth()
      .then((res) => {
        setScraperConnected(res.scraper?.healthy ?? false);
      })
      .catch(() => {
        setScraperConnected(false);
      });

    setHistory(getHistory());
  }, []);

  const handleSubmit = useCallback(
    async (url: string) => {
      setIsLoading(true);
      setError(null);
      setRenderContent(null);
      setExtractData(null);
      setElapsed(null);

      const start = performance.now();

      try {
        if (config.mode === "render") {
          const result = await renderUrl(url, {
            engine: config.engine,
            format: config.format,
            article: config.article,
            images: config.images,
          });
          setRenderContent(result);
        } else {
          const result = await extractUrl(url, config.profile);
          setExtractData(result);
        }
        setElapsed(performance.now() - start);

        // Add to history
        const entry = addToHistory({
          url,
          mode: config.mode,
          engine: config.engine,
          format: config.format,
          profile: config.profile,
          article: config.article,
          images: config.images,
        });
        setHistory((prev) => {
          const filtered = prev.filter((e) => e.id !== entry.id);
          return [entry, ...filtered].slice(0, 20);
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "An unknown error occurred";
        setError(msg);
        setElapsed(performance.now() - start);
      } finally {
        setIsLoading(false);
      }
    },
    [config]
  );

  function handleHistorySelect(entry: HistoryEntry) {
    setConfig({
      mode: entry.mode,
      engine: entry.engine || "standard",
      format: (entry.format as Config["format"]) || "markdown",
      profile: entry.profile || "google_web",
      article: entry.article || false,
      images: entry.images || false,
    });
    setHistoryOpen(false);

    // Small delay so config state updates before submit
    setTimeout(() => handleSubmit(entry.url), 0);
  }

  function handleClearHistory() {
    clearHistory();
    setHistory([]);
  }

  const hasResults =
    renderContent !== null || extractData !== null || error !== null;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Ghost className="size-5 text-foreground" />
          <span className="font-medium text-sm tracking-tight">
            GhostReader
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Link
            to="/docs"
            className="inline-flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Docs"
          >
            <BookOpen className="size-4" />
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setHistoryOpen(true)}
            title="History"
          >
            <History className="size-4" />
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col px-4">
        {/* Search area - vertically centered when no results */}
        <div
          className={`flex flex-col items-center transition-all duration-300 ${
            hasResults ? "pt-6" : "flex-1 justify-center"
          }`}
        >
          {/* Logo area when no results */}
          {!hasResults && (
            <div className="mb-8 text-center">
              <Ghost className="size-12 mx-auto mb-3 text-muted-foreground" />
              <h1 className="text-2xl font-medium tracking-tight">
                GhostReader
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Render and extract web content through an anti-detect browser
              </p>
            </div>
          )}

          <UrlInput onSubmit={handleSubmit} isLoading={isLoading} />
          <ConfigPanel
            config={config}
            onChange={setConfig}
            engines={engines}
            profiles={profiles}
          />

          {/* Status + tip — only on landing page */}
          {!hasResults && (
            <div className="mt-4 flex flex-col items-center gap-2 text-xs text-muted-foreground">
              {scraperConnected !== null && (
                <div className="flex items-center gap-1.5">
                  <span
                    className={`size-1.5 rounded-full ${
                      scraperConnected ? "bg-emerald-500" : "bg-red-500"
                    }`}
                  />
                  {scraperConnected
                    ? "Anti-detect browser connected"
                    : "Scraper offline"}
                </div>
              )}
              <p className="text-center max-w-md">
                Also available as{" "}
                <Link to="/docs#cli" className="underline hover:text-foreground">
                  CLI
                </Link>
                {" and "}
                <Link to="/docs#mcp-server" className="underline hover:text-foreground">
                  MCP server
                </Link>
                {" for AI agents."}
              </p>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="pb-8">
          {config.mode === "render" ? (
            <ResultView
              content={renderContent}
              isLoading={isLoading}
              error={error}
              elapsed={elapsed}
              engine={config.engine}
              format={config.format}
            />
          ) : (
            <ExtractView
              data={extractData}
              isLoading={isLoading}
              error={error}
              elapsed={elapsed}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-3 px-4">
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span>GhostReader v0.1.0</span>
          <span className="text-border">|</span>
          <Link
            to="/docs"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <BookOpen className="size-3" />
            Docs
          </Link>
          <a
            href="https://www.npmjs.com/package/ghostreader"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Terminal className="size-3" />
            CLI (npm)
          </a>
          <a
            href="https://www.npmjs.com/package/ghostreader-mcp"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Terminal className="size-3" />
            MCP (npm)
          </a>
          <a
            href="https://github.com/klosowsk/ghostreader"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Code className="size-3" />
            GitHub
          </a>
        </div>
      </footer>

      {/* History sidebar */}
      <HistorySidebar
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        entries={history}
        onSelect={handleHistorySelect}
        onClear={handleClearHistory}
      />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/docs" element={<DocsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
