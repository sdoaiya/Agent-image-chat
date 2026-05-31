import type { ExamplePromptItem } from "@/data/example-prompts";
import {
  getYouMindPromptReadmeUrl,
  mapYouMindPromptsToExamplePromptItems,
  parseYouMindPromptReadme,
  YOUMIND_PROMPT_LOCALE,
  YOUMIND_PROMPT_MODEL,
  YOUMIND_PROMPT_PAGE_LIMIT,
  type YouMindPromptsRequest,
  type YouMindPromptsResponse,
} from "@/data/youmind-prompts";

export const YOUMIND_PROMPT_CACHE_VERSION = 1;
export const YOUMIND_PROMPT_SYNC_INTERVAL_MS = 60 * 60 * 1000;
export const YOUMIND_PROMPT_INCREMENTAL_MAX_PAGES = 3;
export const YOUMIND_PROMPT_SOURCE_URL = getYouMindPromptReadmeUrl(YOUMIND_PROMPT_LOCALE);
const YOUMIND_PROMPT_CACHE_KEY = "youmind-gpt-image-2-prompts-v1";

export type YouMindPromptTransport = (request: YouMindPromptsRequest) => Promise<YouMindPromptsResponse>;

export interface YouMindPromptCacheSnapshot {
  version: number;
  syncedAt: string;
  total: number;
  totalPages: number;
  pagesFetched: number;
  items: ExamplePromptItem[];
}

export interface FetchYouMindPromptLibraryOptions {
  now?: string;
  pageLimit?: number;
  maxPages?: number;
}

type PromptCacheStore = {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<T>;
};

let promptCacheStorePromise: Promise<PromptCacheStore> | null = null;
let activeRefreshPromise: Promise<YouMindPromptCacheSnapshot> | null = null;

async function getPromptCacheStore(): Promise<PromptCacheStore> {
  promptCacheStorePromise ??= import("localforage").then(({ default: localforage }) =>
    localforage.createInstance({
      name: "gimg",
      storeName: "youmind_prompt_cache",
    }),
  );
  return promptCacheStorePromise;
}

function normalizePageLimit(pageLimit: number): number {
  if (!Number.isFinite(pageLimit) || pageLimit <= 0) {
    return YOUMIND_PROMPT_PAGE_LIMIT;
  }

  return Math.min(Math.floor(pageLimit), YOUMIND_PROMPT_PAGE_LIMIT);
}

function createReadmePromptTransport(): YouMindPromptTransport {
  const datasetPromiseByUrl = new Map<string, Promise<ReturnType<typeof parseYouMindPromptReadme>>>();

  async function loadDataset(locale: string): Promise<ReturnType<typeof parseYouMindPromptReadme>> {
    const readmeUrl = getYouMindPromptReadmeUrl(locale);
    let datasetPromise = datasetPromiseByUrl.get(readmeUrl);
    if (!datasetPromise) {
      datasetPromise = fetch(readmeUrl, {
        headers: {
          Accept: "text/plain",
        },
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`YouMind README fallback failed: HTTP ${response.status}`);
          }

          const markdown = await response.text();
          const dataset = parseYouMindPromptReadme(markdown);
          if (!dataset.prompts.length) {
            throw new Error("YouMind README fallback returned no prompts");
          }

          return dataset;
        })
        .catch((error) => {
          datasetPromiseByUrl.delete(readmeUrl);
          throw error;
        });
      datasetPromiseByUrl.set(readmeUrl, datasetPromise);
    }

    return datasetPromise;
  }

  return async (request) => {
    const page = Number.isFinite(request.page) && request.page > 0 ? Math.floor(request.page) : 1;
    const limit = normalizePageLimit(request.limit ?? YOUMIND_PROMPT_PAGE_LIMIT);
    const dataset = await loadDataset(request.locale ?? YOUMIND_PROMPT_LOCALE);
    const totalPages = Math.max(1, Math.ceil(dataset.prompts.length / limit));
    const startIndex = (page - 1) * limit;
    const prompts = dataset.prompts.slice(startIndex, startIndex + limit);

    return {
      prompts,
      total: dataset.total,
      page,
      limit,
      totalPages,
      hasMore: startIndex + limit < dataset.prompts.length,
    };
  };
}

export function getYouMindPromptTransport(): YouMindPromptTransport | null {
  if (typeof fetch !== "function") {
    return null;
  }

  return createReadmePromptTransport();
}

export async function fetchYouMindPromptLibrarySnapshot(
  transport: YouMindPromptTransport,
  options: FetchYouMindPromptLibraryOptions = {},
): Promise<YouMindPromptCacheSnapshot> {
  const pageLimit = normalizePageLimit(options.pageLimit ?? YOUMIND_PROMPT_PAGE_LIMIT);
  const maxPages = options.maxPages ?? 60;
  const prompts = [];
  let total = 0;
  let totalPages = 0;
  let pagesFetched = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    let response: YouMindPromptsResponse;
    try {
      response = await transport({
        model: YOUMIND_PROMPT_MODEL,
        page,
        limit: pageLimit,
        locale: YOUMIND_PROMPT_LOCALE,
        sortBy: "time",
        sortOrder: "desc",
      });
    } catch (error) {
      if (prompts.length > 0) {
        break;
      }
      throw error;
    }

    prompts.push(...response.prompts);
    total = response.total;
    totalPages = response.totalPages;
    pagesFetched = page;

    if (!response.hasMore || page >= response.totalPages) {
      break;
    }
  }

  return {
    version: YOUMIND_PROMPT_CACHE_VERSION,
    syncedAt: options.now ?? new Date().toISOString(),
    total,
    totalPages,
    pagesFetched,
    items: mapYouMindPromptsToExamplePromptItems(prompts),
  };
}

export async function loadYouMindPromptCache(): Promise<YouMindPromptCacheSnapshot | null> {
  try {
    const promptCacheStore = await getPromptCacheStore();
    const cached = await promptCacheStore.getItem<YouMindPromptCacheSnapshot>(YOUMIND_PROMPT_CACHE_KEY);
    if (!cached || cached.version !== YOUMIND_PROMPT_CACHE_VERSION || !Array.isArray(cached.items) || cached.items.length === 0) {
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

export async function saveYouMindPromptCache(snapshot: YouMindPromptCacheSnapshot): Promise<void> {
  try {
    const promptCacheStore = await getPromptCacheStore();
    await promptCacheStore.setItem(YOUMIND_PROMPT_CACHE_KEY, snapshot);
  } catch {
    // Cache writes are best-effort; the visible gallery should keep working without them.
  }
}

export function isYouMindPromptCacheFresh(
  snapshot: Pick<YouMindPromptCacheSnapshot, "syncedAt"> | null,
  now = Date.now(),
  maxAgeMs = YOUMIND_PROMPT_SYNC_INTERVAL_MS,
): boolean {
  if (!snapshot) {
    return false;
  }

  const syncedAt = new Date(snapshot.syncedAt).getTime();
  return Number.isFinite(syncedAt) && now - syncedAt < maxAgeMs;
}

function hasDisplayableItems(snapshot: YouMindPromptCacheSnapshot | null): snapshot is YouMindPromptCacheSnapshot {
  return Boolean(snapshot?.items.length);
}

function mergeIncrementalSnapshotWithCache(
  incoming: YouMindPromptCacheSnapshot,
  cached: YouMindPromptCacheSnapshot | null,
): YouMindPromptCacheSnapshot {
  if (!hasDisplayableItems(cached)) {
    return incoming;
  }

  if (!incoming.items.length) {
    return cached;
  }

  const seen = new Set(incoming.items.map((item) => item.id));
  const items = [
    ...incoming.items,
    ...cached.items.filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    }),
  ];

  return {
    ...incoming,
    total: Math.max(incoming.total, cached.total, items.length),
    totalPages: Math.max(incoming.totalPages, cached.totalPages),
    items,
  };
}

export function refreshYouMindPromptCache(transport: YouMindPromptTransport): Promise<YouMindPromptCacheSnapshot> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    const cached = await loadYouMindPromptCache();

    try {
      const snapshot = await fetchYouMindPromptLibrarySnapshot(transport, {
        maxPages: YOUMIND_PROMPT_INCREMENTAL_MAX_PAGES,
      });

      if (!snapshot.items.length && hasDisplayableItems(cached)) {
        return cached;
      }

      if (!snapshot.items.length) {
        throw new Error("YouMind prompt sync returned no displayable prompts");
      }

      const mergedSnapshot = mergeIncrementalSnapshotWithCache(snapshot, cached);
      await saveYouMindPromptCache(mergedSnapshot);
      return mergedSnapshot;
    } catch (error) {
      if (hasDisplayableItems(cached)) {
        return cached;
      }
      throw error;
    }
  })().finally(() => {
    activeRefreshPromise = null;
  });

  return activeRefreshPromise;
}
