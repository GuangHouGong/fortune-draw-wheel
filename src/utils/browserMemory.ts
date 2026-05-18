import type { WinnerRecord } from './csv';

const BROWSER_MEMORY_KEY = 'fortune-draw-wheel:browser-memory';

export type BrowserMemorySnapshot = {
  participantsText: string;
  winnerHistory: WinnerRecord[];
  allowRepeat: boolean;
  savedAt: string;
};

function isWinnerRecord(value: unknown): value is WinnerRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.round === 'number' &&
    typeof record.drawnAt === 'string'
  );
}

export function readBrowserMemorySnapshot(): BrowserMemorySnapshot | null {
  try {
    const raw = localStorage.getItem(BROWSER_MEMORY_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<BrowserMemorySnapshot>;

    if (
      typeof parsed.participantsText !== 'string' ||
      typeof parsed.allowRepeat !== 'boolean' ||
      typeof parsed.savedAt !== 'string' ||
      !Array.isArray(parsed.winnerHistory) ||
      !parsed.winnerHistory.every(isWinnerRecord)
    ) {
      return null;
    }

    return {
      participantsText: parsed.participantsText,
      winnerHistory: parsed.winnerHistory,
      allowRepeat: parsed.allowRepeat,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function saveBrowserMemorySnapshot(snapshot: BrowserMemorySnapshot): void {
  localStorage.setItem(BROWSER_MEMORY_KEY, JSON.stringify(snapshot));
}

export function clearBrowserMemorySnapshot(): void {
  localStorage.removeItem(BROWSER_MEMORY_KEY);
}
