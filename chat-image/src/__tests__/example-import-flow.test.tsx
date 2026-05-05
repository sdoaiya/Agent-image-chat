import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.hoisted(() => vi.fn());
const setPendingMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastInfoMock = vi.hoisted(() => vi.fn());
const syncStateMock = vi.hoisted(() => ({
  items: [] as Array<{
    id: string;
    title: string;
    category: "portrait" | "poster" | "ui" | "character" | "infographic" | "community";
    author: string;
    language: string;
    createdAt: string;
    sourceUrl: string;
    imageUrl: string;
    width: number;
    height: number;
    prompt: string;
    summary: string;
    tags?: string[];
    caseNumber: number;
    imageAlt: string;
    imagePath: string;
    sourceType: "linked" | "text" | "missing";
    upstreamDoc: string;
    sourceOrigin?: "local" | "youmind";
    referenceImageUrl?: string;
  }>,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/store/example-import", () => ({
  useExampleImport: (selector: (state: { setPending: typeof setPendingMock }) => unknown) =>
    selector({ setPending: setPendingMock }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    info: toastInfoMock,
  },
}));

vi.mock("@/hooks/use-youmind-prompt-sync", () => ({
  useYouMindPromptSync: () => ({
    canSync: false,
    status: "unavailable",
    items: syncStateMock.items,
    total: syncStateMock.items.length,
    syncedAt: null,
    pagesFetched: 0,
    error: null,
    refreshNow: vi.fn(),
  }),
}));

import { ExampleGallery } from "@/components/examples/example-gallery";

const IMPORT_FLOW_TIMEOUT_MS = 15000;

describe("ExampleGallery import fallback chain", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    setPendingMock.mockReset();
    toastSuccessMock.mockReset();
    toastInfoMock.mockReset();
    syncStateMock.items = [];
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "electronAPI");
    vi.unstubAllGlobals();
  });

  function clickActionByIndex(container: HTMLElement, actionIndex: number): void {
    const actionButtons = Array.from(container.querySelectorAll("button.example-media-icon-button"));
    const target = actionButtons[actionIndex];
    if (!target) {
      throw new Error(`action button index ${actionIndex} not found`);
    }
    fireEvent.click(target);
  }

  it("在 gallery 页一键引用时会生成文件对象并带回工作台", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["abc"], { type: "image/jpeg" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      createElement(
        MemoryRouter,
        null,
        createElement(ExampleGallery, { mode: "gallery" }),
      ),
    );

    clickActionByIndex(container, 0);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: IMPORT_FLOW_TIMEOUT_MS });
    await waitFor(() => expect(setPendingMock).toHaveBeenCalledTimes(1), { timeout: IMPORT_FLOW_TIMEOUT_MS });
    const payload = setPendingMock.mock.calls[0]?.[0];
    expect(payload?.mode).toBe("generate");
    expect(payload?.prompt).toBeTruthy();
    expect(payload?.files).toHaveLength(1);
    expect(payload?.files?.[0]?.file).toBeInstanceOf(File);
    expect(payload?.files?.[0]).toEqual(expect.objectContaining({
      source: "workspace",
      name: expect.stringMatching(/\.(jpg|jpeg|png|webp|gif)$/),
    }));
    expect(navigateMock).toHaveBeenCalledWith("/");
    expect(toastSuccessMock).toHaveBeenCalledWith("已引用提示词和参照图，工作台已打开");
  }, IMPORT_FLOW_TIMEOUT_MS);

  it("gallery 页仅参考图按钮会生成文件对象并带回工作台", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["abc"], { type: "image/jpeg" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      createElement(
        MemoryRouter,
        null,
        createElement(ExampleGallery, { mode: "gallery" }),
      ),
    );

    clickActionByIndex(container, 2);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: IMPORT_FLOW_TIMEOUT_MS });
    await waitFor(() => expect(setPendingMock).toHaveBeenCalledTimes(1), { timeout: IMPORT_FLOW_TIMEOUT_MS });
    const payload = setPendingMock.mock.calls[0]?.[0];
    expect(payload?.mode).toBe("generate");
    expect(payload?.prompt).toBe("");
    expect(payload?.files).toHaveLength(1);
    expect(payload?.files?.[0]?.file).toBeInstanceOf(File);
    expect(navigateMock).toHaveBeenCalledWith("/");
    expect(toastSuccessMock).toHaveBeenCalledWith("已引用参照图，工作台已打开");
  }, IMPORT_FLOW_TIMEOUT_MS);

  it("当 gallery 页图片抓取失败时会退化为仅提示词", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      createElement(
        MemoryRouter,
        null,
        createElement(ExampleGallery, { mode: "gallery" }),
      ),
    );

    clickActionByIndex(container, 0);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: IMPORT_FLOW_TIMEOUT_MS });
    expect(setPendingMock).toHaveBeenCalledWith(expect.objectContaining({ mode: "generate", files: [] }));
    expect(navigateMock).toHaveBeenCalledWith("/");
    expect(toastInfoMock).toHaveBeenCalledWith("示例图片加载失败，已退化为仅引用提示词");
  }, IMPORT_FLOW_TIMEOUT_MS);
});
