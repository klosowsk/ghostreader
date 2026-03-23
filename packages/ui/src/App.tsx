import { useState, useEffect, useCallback } from "react";
import { History, Ghost } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UrlInput } from "@/components/url-input";
import { ConfigPanel, type Config } from "@/components/config-panel";
import { ResultView } from "@/components/result-view";
import { ExtractView } from "@/components/extract-view";
import { HistorySidebar } from "@/components/history-sidebar";
import {
  renderUrl,
  extractUrl,
  getEngines,
  getProfiles,
  type ExtractResponse,
} from "@/lib/api";
import {
  getHistory,
  addToHistory,
  clearHistory,
  type HistoryEntry,
} from "@/lib/history";

const DEFAULT_ENGINES = ["standard", "clean", "ai", "auto"];
const DEFAULT_PROFILES = ["google_web", "google_news", "base"];

function App() {
  // Config state
  const [config, setConfig] = useState<Config>({
    mode: "render",
    engine: "standard",
    format: "markdown",
    profile: "google_web",
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

  // History
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Fetch engines and profiles on mount
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
    });
    setHistoryOpen(false);

    // Small delay so config state updates before submit
    setTimeout(() => handleSubmit(entry.url), 0);
  }

  function handleClearHistory() {
    clearHistory();
    setHistory([]);
  }

  const hasResults = renderContent !== null || extractData !== null || error !== null;

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
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setHistoryOpen(true)}
          title="History"
        >
          <History className="size-4" />
        </Button>
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
      <footer className="border-t border-border py-3 px-4 text-center text-xs text-muted-foreground">
        GhostReader v0.1.0
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

export default App;
