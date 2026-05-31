import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useYouMindPromptSync } from "@/hooks/use-youmind-prompt-sync";
import type { YouMindPromptCacheSnapshot, YouMindPromptTransport } from "@/services/youmind-prompt-sync";

const syncService = vi.hoisted(() => ({
  getYouMindPromptTransport: vi.fn<() => YouMindPromptTransport | null>(),
  isYouMindPromptCacheFresh: vi.fn(),
  loadYouMindPromptCache: vi.fn(),
  refreshYouMindPromptCache: vi.fn(),
}));

vi.mock("@/services/youmind-prompt-sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/youmind-prompt-sync")>();
  return {
    ...actual,
    getYouMindPromptTransport: syncService.getYouMindPromptTransport,
    isYouMindPromptCacheFresh: syncService.isYouMindPromptCacheFresh,
    loadYouMindPromptCache: syncService.loadYouMindPromptCache,
    refreshYouMindPromptCache: syncService.refreshYouMindPromptCache,
    YOUMIND_PROMPT_SYNC_INTERVAL_MS: 60 * 60 * 1000,
  };
});

function makeSnapshot(overrides: Partial<YouMindPromptCacheSnapshot> = {}): YouMindPromptCacheSnapshot {
  return {
    version: 1,
    syncedAt: "2026-05-05T00:00:00.000Z",
    total: 1,
    totalPages: 1,
    pagesFetched: 1,
    items: [
      {
        id: "youmind-1",
        title: "Cached prompt",
        category: "portrait",
        author: "@YouMind",
        language: "en",
        createdAt: "2026-05-05T00:00:00.000Z",
        sourceUrl: "https://youmind.com/zh-CN/prompts/cached-1",
        imageUrl: "https://cms-assets.youmind.com/media/cached-300x450.jpg",
        width: 300,
        height: 450,
        prompt: "Create a cached portrait prompt.",
        summary: "Cached prompt",
        tags: ["YouMind"],
        caseNumber: 100001,
        imageAlt: "Cached prompt",
        imagePath: "cached-300x450.jpg",
        sourceType: "linked",
        upstreamDoc: "youmind:gpt-image-2-prompts",
        sourceOrigin: "youmind",
        upstreamId: 1,
        upstreamPromptUrl: "https://youmind.com/zh-CN/prompts/cached-1",
      },
    ],
    ...overrides,
  };
}

describe("useYouMindPromptSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncService.getYouMindPromptTransport.mockReturnValue(vi.fn());
    syncService.loadYouMindPromptCache.mockResolvedValue(null);
    syncService.isYouMindPromptCacheFresh.mockReturnValue(false);
  });

  it("starts syncing when the public README transport is available", async () => {
    const browserTransport = vi.fn();
    syncService.getYouMindPromptTransport.mockReturnValue(browserTransport);
    syncService.refreshYouMindPromptCache.mockResolvedValue(makeSnapshot());

    const { result } = renderHook(() => useYouMindPromptSync());

    await waitFor(() => expect(syncService.refreshYouMindPromptCache).toHaveBeenCalledWith(browserTransport));
    expect(result.current.canSync).toBe(true);
  });

  it("does not start a second background refresh while one is already running", async () => {
    syncService.refreshYouMindPromptCache.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useYouMindPromptSync());

    await waitFor(() => expect(syncService.refreshYouMindPromptCache).toHaveBeenCalledTimes(1));
    act(() => {
      result.current.refreshNow();
    });

    expect(syncService.refreshYouMindPromptCache).toHaveBeenCalledTimes(1);
  });

  it("keeps cached status and cached items when a stale-cache refresh fails", async () => {
    const cached = makeSnapshot();
    syncService.loadYouMindPromptCache.mockResolvedValue(cached);
    syncService.refreshYouMindPromptCache.mockRejectedValue(new Error("HTTP 429"));

    const { result } = renderHook(() => useYouMindPromptSync());

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await waitFor(() => expect(result.current.status).toBe("cached"));

    expect(result.current.error).toBe("HTTP 429");
    expect(result.current.items[0]?.id).toBe("youmind-1");
  });

  it("reports unavailable when no public transport can be created", async () => {
    syncService.getYouMindPromptTransport.mockReturnValue(null);

    const { result } = renderHook(() => useYouMindPromptSync());

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.canSync).toBe(false);
  });
});
