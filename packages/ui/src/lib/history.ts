const STORAGE_KEY = "ghostreader-history";
const MAX_ENTRIES = 20;

export interface HistoryEntry {
  id: string;
  url: string;
  mode: "render" | "extract";
  engine?: string;
  format?: string;
  profile?: string;
  article?: boolean;
  timestamp: number;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function getHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function addToHistory(
  entry: Omit<HistoryEntry, "id" | "timestamp">
): HistoryEntry {
  const entries = getHistory();
  const newEntry: HistoryEntry = {
    ...entry,
    id: generateId(),
    timestamp: Date.now(),
  };

  // Remove duplicate URLs with same mode
  const filtered = entries.filter(
    (e) => !(e.url === newEntry.url && e.mode === newEntry.mode)
  );

  // Add to front
  filtered.unshift(newEntry);

  // Keep only last MAX_ENTRIES
  const trimmed = filtered.slice(0, MAX_ENTRIES);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  return newEntry;
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
