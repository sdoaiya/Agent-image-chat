import { beforeEach, describe, expect, it, vi } from "vitest";

const promptCacheStoreMock = vi.hoisted(() => {
  const store = {
    getItem: vi.fn(),
    setItem: vi.fn(async (_key: string, value: unknown) => value),
  };
  return {
    store,
    createInstance: vi.fn(() => store),
  };
});

vi.mock("localforage", () => ({
  default: {
    createInstance: promptCacheStoreMock.createInstance,
  },
}));

import {
  getYouMindPromptTransport,
  fetchYouMindPromptLibrarySnapshot,
  loadYouMindPromptCache,
  refreshYouMindPromptCache,
  YOUMIND_PROMPT_SOURCE_URL,
  type YouMindPromptTransport,
  type YouMindPromptCacheSnapshot,
} from "@/services/youmind-prompt-sync";
import type { YouMindPromptsRequest, YouMindPromptsResponse } from "@/data/youmind-prompts";

const readmeFallbackFixture = `
| \u6307\u6807 | \u6570\u91cf |
|--------|-------|
| \ud83d\udcdd \u63d0\u793a\u8bcd\u603b\u6570 | **8273** |

### No. 1: README Fallback Prompt

#### \ud83d\udcd6 \u63cf\u8ff0

Fallback prompt description.

#### \ud83d\udcdd \u63d0\u793a\u8bcd

\`\`\`
Create a README fallback prompt.
\`\`\`

#### \ud83d\uddbc\ufe0f \u751f\u6210\u56fe\u7247

<div align="center">
<img src="https://cms-assets.youmind.com/media/fallback-300x450.jpg" width="700" alt="Fallback image">
</div>

#### \ud83d\udccc \u8be6\u60c5

- **\u4f5c\u8005:** [Fallback Author](https://x.com/fallback_author)
- **\u6765\u6e90:** [Twitter Post](https://x.com/fallback_author/status/2050000000000000000)
- **\u53d1\u5e03\u65f6\u95f4:** 2026\u5e745\u670830\u65e5
- **\u591a\u8bed\u8a00:** en

**[\ud83d\udc49 \u7acb\u5373\u5c1d\u8bd5 \u2192](https://youmind.com/zh-CN/gpt-image-2-prompts?id=23001)**
`;

function makeResponse(page: number, hasMore: boolean): YouMindPromptsResponse {
  return {
    total: 2,
    page,
    limit: 1,
    totalPages: 2,
    hasMore,
    prompts: [
      {
        id: 18000 + page,
        title: `Remote ${page}`,
        slug: `remote-${page}`,
        description: "Remote prompt",
        sourcePublishedAt: `2026-05-0${page}T00:00:00.000Z`,
        author: { name: "YouMind" },
        content: `Create remote prompt ${page}.`,
        mediaThumbnails: [`https://cms-assets.youmind.com/media/remote-${page}-300x450.jpg`],
        media: [],
        language: "en",
        likes: page,
        resultsCount: page,
        promptCategories: [],
      },
    ],
  };
}

function makeCachedSnapshot(overrides: Partial<YouMindPromptCacheSnapshot> = {}): YouMindPromptCacheSnapshot {
  return {
    version: 1,
    syncedAt: "2026-05-05T00:00:00.000Z",
    total: 1,
    totalPages: 1,
    pagesFetched: 1,
    items: [
      {
        id: "youmind-17001",
        title: "Cached Remote",
        category: "portrait",
        author: "@YouMind",
        language: "en",
        createdAt: "2026-05-04T00:00:00.000Z",
        sourceUrl: "https://youmind.com/zh-CN/prompts/cached-remote-17001",
        imageUrl: "https://cms-assets.youmind.com/media/cached-300x450.jpg",
        width: 300,
        height: 450,
        prompt: "Create cached remote prompt.",
        summary: "Cached Remote",
        tags: ["YouMind"],
        caseNumber: 117001,
        imageAlt: "Cached Remote",
        imagePath: "cached-300x450.jpg",
        sourceType: "linked",
        upstreamDoc: "youmind:gpt-image-2-prompts",
        sourceOrigin: "youmind",
        upstreamId: 17001,
        upstreamPromptUrl: "https://youmind.com/zh-CN/prompts/cached-remote-17001",
      },
    ],
    ...overrides,
  };
}

describe("YouMind prompt sync", () => {
  const originalElectronApi = window.electronAPI;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = originalElectronApi;
    globalThis.fetch = originalFetch;
    promptCacheStoreMock.store.getItem.mockResolvedValue(null);
  });

  it("uses the public README feed as the primary transport", async () => {
    globalThis.fetch = vi.fn(async () => new Response(readmeFallbackFixture, { status: 200 }));

    const transport = getYouMindPromptTransport();
    const response = await transport?.({
      model: "gpt-image-2",
      page: 1,
      limit: 50,
      locale: "zh-CN",
      sortBy: "time",
      sortOrder: "desc",
    });

    expect(response).toMatchObject({
      total: 8273,
      page: 1,
      limit: 50,
      totalPages: 1,
      hasMore: false,
    });
    expect(response?.prompts[0]?.id).toBe(23001);
    expect(globalThis.fetch).toHaveBeenCalledWith(YOUMIND_PROMPT_SOURCE_URL, {
      headers: {
        Accept: "text/plain",
      },
    });
  });

  it("reuses the README dataset across paginated requests", async () => {
    globalThis.fetch = vi.fn(async () => new Response(readmeFallbackFixture, { status: 200 }));

    const transport = getYouMindPromptTransport();
    await transport?.({
      model: "gpt-image-2",
      page: 1,
      limit: 50,
      locale: "zh-CN",
      sortBy: "time",
      sortOrder: "desc",
    });

    await transport?.({
      model: "gpt-image-2",
      page: 2,
      limit: 50,
      locale: "zh-CN",
      sortBy: "time",
      sortOrder: "desc",
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("fetches all pages through the provided background transport and returns a cache snapshot", async () => {
    const transport: YouMindPromptTransport = vi.fn(async (request: YouMindPromptsRequest) => {
      return makeResponse(request.page, request.page < 2);
    });

    const snapshot = await fetchYouMindPromptLibrarySnapshot(transport, {
      now: "2026-05-05T01:00:00.000Z",
      pageLimit: 1,
      maxPages: 4,
    });

    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport).toHaveBeenNthCalledWith(1, expect.objectContaining({ model: "gpt-image-2", page: 1, limit: 1 }));
    expect(snapshot).toMatchObject<Partial<YouMindPromptCacheSnapshot>>({
      version: 1,
      total: 2,
      totalPages: 2,
      pagesFetched: 2,
      syncedAt: "2026-05-05T01:00:00.000Z",
    });
    expect(snapshot.items.map((item) => item.id)).toEqual(["youmind-18001", "youmind-18002"]);
  });

  it("caps each upstream request to the YouMind single-page limit", async () => {
    const transport: YouMindPromptTransport = vi.fn(async (request: YouMindPromptsRequest) => {
      return {
        ...makeResponse(request.page, false),
        limit: request.limit ?? 100,
        totalPages: 1,
      };
    });

    await fetchYouMindPromptLibrarySnapshot(transport, {
      pageLimit: 500,
      maxPages: 1,
    });

    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 100 }));
  });

  it("returns a partial snapshot when a later upstream page is rate limited", async () => {
    const transport: YouMindPromptTransport = vi.fn(async (request: YouMindPromptsRequest) => {
      if (request.page > 1) {
        throw new Error("HTTP 429");
      }
      return {
        ...makeResponse(1, true),
        total: 200,
        totalPages: 2,
      };
    });

    const snapshot = await fetchYouMindPromptLibrarySnapshot(transport, {
      now: "2026-05-05T02:00:00.000Z",
      pageLimit: 1,
      maxPages: 2,
    });

    expect(transport).toHaveBeenCalledTimes(2);
    expect(snapshot.pagesFetched).toBe(1);
    expect(snapshot.total).toBe(200);
    expect(snapshot.items.map((item) => item.id)).toEqual(["youmind-18001"]);
  });

  it("coalesces concurrent background refreshes into one upstream request chain", async () => {
    const transport: YouMindPromptTransport = vi.fn(async (request: YouMindPromptsRequest) => ({
      ...makeResponse(request.page, false),
      totalPages: 1,
    }));

    const [first, second] = await Promise.all([
      refreshYouMindPromptCache(transport),
      refreshYouMindPromptCache(transport),
    ]);

    expect(transport).toHaveBeenCalledTimes(1);
    expect(promptCacheStoreMock.store.setItem).toHaveBeenCalledTimes(1);
    expect(first.items.map((item) => item.id)).toEqual(["youmind-18001"]);
    expect(second.items.map((item) => item.id)).toEqual(["youmind-18001"]);
  });

  it("does not treat an empty cache snapshot as usable cached data", async () => {
    promptCacheStoreMock.store.getItem.mockResolvedValue(makeCachedSnapshot({ items: [] }));

    await expect(loadYouMindPromptCache()).resolves.toBeNull();
  });

  it("returns the previous non-empty cache when the first incremental page is rate limited", async () => {
    const cached = makeCachedSnapshot();
    promptCacheStoreMock.store.getItem.mockResolvedValue(cached);
    const transport: YouMindPromptTransport = vi.fn(async () => {
      throw new Error("HTTP 429");
    });

    const snapshot = await refreshYouMindPromptCache(transport);

    expect(snapshot.items.map((item) => item.id)).toEqual(["youmind-17001"]);
    expect(snapshot.syncedAt).toBe("2026-05-05T00:00:00.000Z");
    expect(promptCacheStoreMock.store.setItem).not.toHaveBeenCalled();
  });

  it("does not overwrite the previous non-empty cache when upstream returns no displayable prompts", async () => {
    const cached = makeCachedSnapshot();
    promptCacheStoreMock.store.getItem.mockResolvedValue(cached);
    const transport: YouMindPromptTransport = vi.fn(async () => ({
      total: 0,
      page: 1,
      limit: 100,
      totalPages: 1,
      hasMore: false,
      prompts: [],
    }));

    const snapshot = await refreshYouMindPromptCache(transport);

    expect(snapshot.items.map((item) => item.id)).toEqual(["youmind-17001"]);
    expect(promptCacheStoreMock.store.setItem).not.toHaveBeenCalled();
  });

  it("rejects an empty upstream snapshot instead of saving an empty cache when no previous cache exists", async () => {
    const transport: YouMindPromptTransport = vi.fn(async () => ({
      total: 0,
      page: 1,
      limit: 100,
      totalPages: 1,
      hasMore: false,
      prompts: [],
    }));

    await expect(refreshYouMindPromptCache(transport)).rejects.toThrow("no displayable prompts");
    expect(promptCacheStoreMock.store.setItem).not.toHaveBeenCalled();
  });

  it("merges a low-page incremental refresh with the existing cache", async () => {
    const cached = makeCachedSnapshot();
    promptCacheStoreMock.store.getItem.mockResolvedValue(cached);
    const transport: YouMindPromptTransport = vi.fn(async (request: YouMindPromptsRequest) => ({
      ...makeResponse(request.page, request.page < 8),
      total: 8,
      totalPages: 8,
    }));

    const snapshot = await refreshYouMindPromptCache(transport);

    expect(transport).toHaveBeenCalledTimes(3);
    expect(snapshot.items.map((item) => item.id)).toEqual([
      "youmind-18001",
      "youmind-18002",
      "youmind-18003",
      "youmind-17001",
    ]);
    expect(promptCacheStoreMock.store.setItem).toHaveBeenCalledWith(
      "youmind-gpt-image-2-prompts-v1",
      expect.objectContaining({
        total: 8,
        pagesFetched: 3,
      }),
    );
  });
});
