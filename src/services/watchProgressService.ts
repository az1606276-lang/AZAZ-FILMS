export interface WatchProgressEntry {
  filmId: string;
  currentTime: number;
  duration: number;
  updatedAt: number;
}

const STORAGE_KEY = 'az_watch_progress_v1';

function readAll(): Record<string, WatchProgressEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, WatchProgressEntry>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors in restricted WebViews
  }
}

export function saveWatchProgress(filmId: string, currentTime: number, duration: number): void {
  if (!filmId || !isFinite(currentTime) || !isFinite(duration) || duration <= 10) return;
  const map = readAll();

  if (currentTime / duration >= 0.94) {
    if (map[filmId]) {
      delete map[filmId];
      writeAll(map);
    }
    return;
  }

  if (currentTime < 4) return;

  map[filmId] = {
    filmId,
    currentTime: Math.floor(currentTime),
    duration: Math.floor(duration),
    updatedAt: Date.now(),
  };
  writeAll(map);
}

export function clearWatchProgress(filmId: string): void {
  if (!filmId) return;
  const map = readAll();
  if (map[filmId]) {
    delete map[filmId];
    writeAll(map);
  }
}

export function getWatchProgress(filmId: string): WatchProgressEntry | null {
  const entry = readAll()[filmId];
  if (!entry || !isFinite(entry.currentTime) || entry.currentTime < 4) return null;
  return entry;
}

export function listContinueWatching(): WatchProgressEntry[] {
  const all = Object.values(readAll()).filter(
    (e) => e && e.currentTime >= 4 && e.duration > 10 && e.currentTime / e.duration < 0.94
  );
  all.sort((a, b) => b.updatedAt - a.updatedAt);
  return all;
}
