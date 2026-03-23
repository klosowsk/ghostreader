export interface RenderOptions {
  engine?: string;
  format?: "markdown" | "html" | "json";
  wait_after_load?: number;
  article?: boolean;
  images?: boolean;
}

export interface ExtractResult {
  title: string;
  url: string;
  content: string;
}

export interface ExtractResponse {
  results: ExtractResult[];
  suggestions: string[];
  captcha: boolean;
  error: string | null;
}

export interface EngineInfo {
  name: string;
  type: string;
  model?: string;
  available: boolean;
}

export interface EnginesResponse {
  engines: EngineInfo[];
}

export interface ProfilesResponse {
  profiles: string[];
}

export interface HealthResponse {
  status: string;
  scraper: {
    type: string;
    healthy: boolean;
  };
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new ApiError(text, res.status);
  }
  return res.json();
}

async function handleTextResponse(res: Response): Promise<string> {
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new ApiError(text, res.status);
  }
  return res.text();
}

export async function renderUrl(
  url: string,
  options: RenderOptions = {}
): Promise<string> {
  const params = new URLSearchParams();
  if (options.engine) params.set("engine", options.engine);
  if (options.format) params.set("format", options.format);
  if (options.wait_after_load != null)
    params.set("wait", String(options.wait_after_load));
  if (options.article) params.set("article", "true");
  if (options.images) params.set("images", "true");

  const query = params.toString();
  const renderUrl = `/render/${url}${query ? `?${query}` : ""}`;
  const res = await fetch(renderUrl);
  return handleTextResponse(res);
}

export async function extractUrl(
  url: string,
  profile: string,
  timeout?: number
): Promise<ExtractResponse> {
  const res = await fetch("/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      profile,
      timeout: timeout != null ? timeout * 1000 : 30000,
    }),
  });
  return handleResponse<ExtractResponse>(res);
}

export async function getEngines(): Promise<EnginesResponse> {
  const res = await fetch("/engines");
  return handleResponse<EnginesResponse>(res);
}

export async function getProfiles(): Promise<ProfilesResponse> {
  const res = await fetch("/profiles");
  return handleResponse<ProfilesResponse>(res);
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch("/health");
  return handleResponse<HealthResponse>(res);
}
