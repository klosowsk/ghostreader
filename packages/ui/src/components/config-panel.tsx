import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type Mode = "render" | "extract";
export type Format = "markdown" | "html" | "json";

const ENGINE_LABELS: Record<string, string> = {
  standard: "Standard (fast)",
  ai: "AI",
  auto: "Auto",
};

function engineLabel(name: string): string {
  return ENGINE_LABELS[name] || name;
}

export interface Config {
  mode: Mode;
  engine: string;
  format: Format;
  profile: string;
  article: boolean;
  images: boolean;
}

interface ConfigPanelProps {
  config: Config;
  onChange: (config: Config) => void;
  engines: string[];
  profiles: string[];
}

export function ConfigPanel({
  config,
  onChange,
  engines,
  profiles,
}: ConfigPanelProps) {
  function update(partial: Partial<Config>) {
    onChange({ ...config, ...partial });
  }

  return (
    <div className="w-full max-w-2xl mx-auto mt-4">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {/* Mode toggle */}
        <Tabs
          value={config.mode}
          onValueChange={(v) => update({ mode: v as Mode })}
        >
          <TabsList>
            <TabsTrigger value="render">Render</TabsTrigger>
            <TabsTrigger value="extract">Extract</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Engine select - only in render mode */}
        {config.mode === "render" && (
          <Select
            value={config.engine}
            onValueChange={(v) => update({ engine: v as string })}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Engine" />
            </SelectTrigger>
            <SelectContent>
              {engines.map((e) => (
                <SelectItem key={e} value={e}>
                  {engineLabel(e)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Format select - only in render mode */}
        {config.mode === "render" && (
          <Select
            value={config.format}
            onValueChange={(v) => update({ format: v as Format })}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="markdown">markdown</SelectItem>
              <SelectItem value="html">html</SelectItem>
              <SelectItem value="json">json</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Article toggle - only in render mode */}
        {config.mode === "render" && (
          <button
            type="button"
            onClick={() => update({ article: !config.article })}
            className={`h-8 px-3 rounded-md text-xs font-medium border transition-colors ${
              config.article
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            Article
          </button>
        )}

        {/* Images toggle - only in render mode */}
        {config.mode === "render" && (
          <button
            type="button"
            onClick={() => update({ images: !config.images })}
            className={`h-8 px-3 rounded-md text-xs font-medium border transition-colors ${
              config.images
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            Images
          </button>
        )}

        {/* Profile select - only in extract mode */}
        {config.mode === "extract" && (
          <Select
            value={config.profile}
            onValueChange={(v) => update({ profile: v as string })}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Profile" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}


      </div>
    </div>
  );
}
