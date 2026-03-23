import { useState } from "react";
import Markdown from "react-markdown";
import { Copy, Check, Eye, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";


interface ResultViewProps {
  content: string | null;
  isLoading: boolean;
  error: string | null;
  elapsed: number | null;
  engine: string;
  format: string;
}

export function ResultView({
  content,
  isLoading,
  error,
  elapsed,
  engine,
  format,
}: ResultViewProps) {
  const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-8 space-y-4">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-8">
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">Error</p>
          <p className="mt-1 text-sm text-destructive/80">{error}</p>
        </div>
      </div>
    );
  }

  if (content === null) return null;

  return (
    <div className="w-full max-w-4xl mx-auto mt-8">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {elapsed !== null && (
            <Badge variant="secondary">
              {(elapsed / 1000).toFixed(1)}s
            </Badge>
          )}
          <Badge variant="outline">{engine}</Badge>
          <Badge variant="outline">{format}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() =>
              setViewMode(viewMode === "rendered" ? "raw" : "rendered")
            }
            title={viewMode === "rendered" ? "Show raw" : "Show rendered"}
          >
            {viewMode === "rendered" ? (
              <Code className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="size-4 text-green-500" />
            ) : (
              <Copy className="size-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="rounded-lg border border-border bg-card p-4 overflow-auto">
        {viewMode === "rendered" && format === "markdown" ? (
          <div className="prose-ghost">
            <Markdown>{content}</Markdown>
          </div>
        ) : (
          <pre className="text-sm whitespace-pre-wrap break-words font-mono text-foreground/90">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
