import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExamplePromptItem } from "@/data/example-prompts";
import {
  getYouMindPromptTransport,
  isYouMindPromptCacheFresh,
  loadYouMindPromptCache,
  refreshYouMindPromptCache,
  YOUMIND_PROMPT_SYNC_INTERVAL_MS,
  type YouMindPromptCacheSnapshot,
  type YouMindPromptTransport,
} from "@/services/youmind-prompt-sync";

export type YouMindPromptSyncStatus = "unavailable" | "idle" | "cached" | "syncing" | "synced" | "error";

export interface YouMindPromptSyncState {
  canSync: boolean;
  status: YouMindPromptSyncStatus;
  items: ExamplePromptItem[];
  total: number;
  syncedAt: string | null;
  pagesFetched: number;
  error: string | null;
  refreshNow: () => void;
}

interface UseYouMindPromptSyncOptions {
  enabled?: boolean;
}

function getSnapshotState(snapshot: YouMindPromptCacheSnapshot) {
  return {
    items: snapshot.items,
    total: snapshot.total,
    syncedAt: snapshot.syncedAt,
    pagesFetched: snapshot.pagesFetched,
  };
}

export function useYouMindPromptSync({ enabled = true }: UseYouMindPromptSyncOptions = {}): YouMindPromptSyncState {
  const transport = useMemo<YouMindPromptTransport | null>(() => getYouMindPromptTransport(), []);
  const canSync = Boolean(enabled && transport);
  const [status, setStatus] = useState<YouMindPromptSyncStatus>(canSync ? "idle" : "unavailable");
  const [items, setItems] = useState<ExamplePromptItem[]>([]);
  const [total, setTotal] = useState(0);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [pagesFetched, setPagesFetched] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef<ExamplePromptItem[]>([]);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(false);

  const applySnapshot = useCallback((snapshot: YouMindPromptCacheSnapshot) => {
    const next = getSnapshotState(snapshot);
    itemsRef.current = next.items;
    setItems(next.items);
    setTotal(next.total);
    setSyncedAt(next.syncedAt);
    setPagesFetched(next.pagesFetched);
  }, []);

  const runRefresh = useCallback(() => {
    if (!transport || !enabled) {
      return;
    }
    if (refreshPromiseRef.current) {
      return;
    }

    setStatus("syncing");
    setError(null);
    const refreshPromise = refreshYouMindPromptCache(transport)
      .then((snapshot) => {
        if (!mountedRef.current) {
          return;
        }
        applySnapshot(snapshot);
        setStatus("synced");
      })
      .catch((reason: unknown) => {
        if (!mountedRef.current) {
          return;
        }
        setError(reason instanceof Error ? reason.message : "YouMind prompt sync failed");
        setStatus((current) => (itemsRef.current.length ? "cached" : current === "syncing" ? "error" : current));
      })
      .finally(() => {
        if (refreshPromiseRef.current === refreshPromise) {
          refreshPromiseRef.current = null;
        }
      });
    refreshPromiseRef.current = refreshPromise;
  }, [applySnapshot, enabled, transport]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !transport) {
      setStatus("unavailable");
      return;
    }

    let disposed = false;
    let intervalId: number | undefined;

    async function hydrate() {
      const cached = await loadYouMindPromptCache();
      if (disposed) {
        return;
      }

      if (cached) {
        applySnapshot(cached);
        setStatus("cached");
      }

      if (!isYouMindPromptCacheFresh(cached)) {
        runRefresh();
      }
    }

    void hydrate();
    intervalId = window.setInterval(runRefresh, YOUMIND_PROMPT_SYNC_INTERVAL_MS);

    return () => {
      disposed = true;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [applySnapshot, enabled, runRefresh, transport]);

  return {
    canSync,
    status,
    items,
    total,
    syncedAt,
    pagesFetched,
    error,
    refreshNow: runRefresh,
  };
}
