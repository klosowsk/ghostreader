import { useState, useEffect, useRef } from "react";
import { Link } from "react-router";
import { ArrowLeft, Ghost, Menu, X } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import DOCS from "../../../../docs/docs.md?raw";

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
      <div className="flex-1 flex">
        {/* Desktop sidebar — sticky below header */}
        <aside className="hidden md:block w-48 shrink-0 border-r border-border sticky top-0 h-screen overflow-y-auto py-6 px-3">
          {nav}
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 px-6 py-8" ref={contentRef}>
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
