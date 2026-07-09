import RNFS from 'react-native-fs';
import { SERVER_URL } from './config';

// ── File paths ──
export const DATA_PATH = `${RNFS.ExternalDirectoryPath}/data.json`;
export const FAVORITES_PATH = `${RNFS.ExternalDirectoryPath}/favorites.json`;
export const HISTORY_PATH = `${RNFS.ExternalDirectoryPath}/history.json`;
export const DOWNLOADS_MANIFEST_PATH = `${RNFS.ExternalDirectoryPath}/downloads.json`;
export const DOWNLOADS_ROOT = `${RNFS.ExternalDirectoryPath}/downloads`;
export const SEARCH_HISTORY_PATH = `${RNFS.ExternalDirectoryPath}/searchHistory.json`;
export const SETTINGS_PATH = `${RNFS.ExternalDirectoryPath}/settings.json`;
export const STATS_PATH = `${RNFS.ExternalDirectoryPath}/stats.json`;

// ── JSON helpers ──
export const safeParseJSON = (jsonString: string): any => {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return [];
  }
};

export const readJsonFile = async <T = any>(path: string, fallback: T): Promise<T> => {
  try {
    const exists = await RNFS.exists(path);
    if (!exists) return fallback;
    const data = await RNFS.readFile(path, 'utf8');
    return JSON.parse(data) as T;
  } catch (err) {
    console.error(`Failed to read ${path}:`, err);
    return fallback;
  }
};

export const writeJsonFile = async (path: string, data: any): Promise<void> => {
  try {
    await RNFS.writeFile(path, JSON.stringify(data), 'utf8');
  } catch (err) {
    console.error(`Failed to write ${path}:`, err);
  }
};

// ── Image proxy ──
export const getProxiedImageUrl = (imageUrl: string, bustCache = false): string => {
  if (!imageUrl) return '';
  const encoded = encodeURIComponent(imageUrl);
  return bustCache
    ? `${SERVER_URL}/proxy-image?url=${encoded}&t=${Date.now()}`
    : `${SERVER_URL}/proxy-image?url=${encoded}`;
};

// ── String helpers ──
export const safeName = (value: string) => value.replace(/[^a-z0-9]/gi, '_').slice(0, 80);

// ── Directory helpers ──
export const ensureDir = async (dir: string) => {
  const exists = await RNFS.exists(dir);
  if (!exists) {
    await RNFS.mkdir(dir);
  }
};

// ── History helpers ──
export interface HistoryItem {
  mangaUrl: string;
  title: string;
  coverImage: string;
  lastChapterUrl: string;
  lastChapterTitle: string;
  timestamp: number;
  progress: number;
  lastPage?: number;
  totalPages?: number;
}

export const readHistory = async (): Promise<HistoryItem[]> => {
  return readJsonFile<HistoryItem[]>(HISTORY_PATH, []);
};

export const writeHistory = async (list: HistoryItem[]): Promise<void> => {
  return writeJsonFile(HISTORY_PATH, list);
};

// ── Favorites helpers ──
export interface FavoriteItem {
  mangaUrl: string;
  title: string;
  coverImage: string;
}

export const readFavorites = async (): Promise<FavoriteItem[]> => {
  return readJsonFile<FavoriteItem[]>(FAVORITES_PATH, []);
};

export const writeFavorites = async (list: FavoriteItem[]): Promise<void> => {
  return writeJsonFile(FAVORITES_PATH, list);
};

// ── Settings helpers ──
export interface AppSettings {
  readingDirection: 'ltr' | 'rtl';
  keepScreenAwake: boolean;
  serverUrl: string;
  imageQuality: 'high' | 'compressed';
}

export const DEFAULT_SETTINGS: AppSettings = {
  readingDirection: 'ltr',
  keepScreenAwake: true,
  serverUrl: SERVER_URL,
  imageQuality: 'high',
};

export const readSettings = async (): Promise<AppSettings> => {
  const settings = await readJsonFile<Partial<AppSettings>>(SETTINGS_PATH, {});
  return { ...DEFAULT_SETTINGS, ...settings };
};

export const writeSettings = async (settings: AppSettings): Promise<void> => {
  return writeJsonFile(SETTINGS_PATH, settings);
};

// ── Stats helpers ──
export interface ReadingStats {
  totalPagesRead: number;
  totalChaptersCompleted: number;
  totalTimeSpentMs: number;
  mangaStarted: number;
  lastSessionStart?: number;
}

export const DEFAULT_STATS: ReadingStats = {
  totalPagesRead: 0,
  totalChaptersCompleted: 0,
  totalTimeSpentMs: 0,
  mangaStarted: 0,
};

export const readStats = async (): Promise<ReadingStats> => {
  const stats = await readJsonFile<Partial<ReadingStats>>(STATS_PATH, {});
  return { ...DEFAULT_STATS, ...stats };
};

export const writeStats = async (stats: ReadingStats): Promise<void> => {
  return writeJsonFile(STATS_PATH, stats);
};

// ── Search history helpers ──
export const readSearchHistory = async (): Promise<string[]> => {
  return readJsonFile<string[]>(SEARCH_HISTORY_PATH, []);
};

export const writeSearchHistory = async (list: string[]): Promise<void> => {
  return writeJsonFile(SEARCH_HISTORY_PATH, list);
};

export const addSearchQuery = async (query: string): Promise<string[]> => {
  const history = await readSearchHistory();
  const filtered = history.filter(q => q.toLowerCase() !== query.toLowerCase());
  const updated = [query, ...filtered].slice(0, 20); // Keep last 20
  await writeSearchHistory(updated);
  return updated;
};
