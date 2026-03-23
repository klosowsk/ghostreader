import { AlertTriangle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ExtractResponse } from "@/lib/api";

interface ExtractViewProps {
  data: ExtractResponse | null;
  isLoading: boolean;
  error: string | null;
  elapsed: number | null;
}

export function ExtractView({
  data,
  isLoading,
  error,
  elapsed,
}: ExtractViewProps) {
  if (isLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-8 space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-5/6" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-4/6" />
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

  if (!data) return null;

  return (
    <div className="w-full max-w-4xl mx-auto mt-8">
      {/* Metadata bar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Badge variant="secondary">
          {data.results.length} result{data.results.length !== 1 ? "s" : ""}
        </Badge>
        {elapsed !== null && (
          <Badge variant="secondary">{(elapsed / 1000).toFixed(1)}s</Badge>
        )}
        {data.captcha && (
          <Badge variant="destructive">
            <AlertTriangle className="size-3 mr-1" />
            Captcha detected
          </Badge>
        )}
        {data.error && (
          <Badge variant="destructive">{data.error}</Badge>
        )}
      </div>

      {/* Suggestions — shown above results so they're always visible */}
      {data.suggestions && data.suggestions.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-muted-foreground mb-1.5">Suggestions</p>
          <div className="flex flex-wrap gap-1.5">
            {data.suggestions.map((s, i) => (
              <Badge key={i} variant="outline" className="cursor-default">
                {s}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Results table — natural page scroll, no constrained height */}
      {data.results.length > 0 && (
        <div className="rounded-lg border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30%] min-w-[150px]">Title</TableHead>
                <TableHead className="w-[25%] min-w-[120px]">URL</TableHead>
                <TableHead className="min-w-[200px]">Content</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.results.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium whitespace-normal align-top">
                    {r.title || <span className="text-muted-foreground italic">No title</span>}
                  </TableCell>
                  <TableCell className="whitespace-normal align-top">
                    {r.url ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline break-all text-sm"
                      >
                        <span className="line-clamp-2">{r.url}</span>
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground italic">-</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground align-top">
                    {r.content || <span className="italic">-</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data.results.length === 0 && !data.error && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          No results found.
        </div>
      )}
    </div>
  );
}
