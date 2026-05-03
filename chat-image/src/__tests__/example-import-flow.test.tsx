import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const navigateMock = vi.fn();
const setPendingMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastInfoMock = vi.fn();

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

describe("ExampleGallery import fallback chain", () => {
  beforeEach(() => {
    vi.resetModules();
    navigateMock.mockReset();
    setPendingMock.mockReset();
    toastSuccessMock.mockReset();
    toastInfoMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function clickActionByIndex(container: HTMLElement, actionIndex: number): void {
    const actionButtons = Array.from(container.querySelectorAll("button.example-media-icon-button"));
    const target = actionButtons[actionIndex];
    if (!target) {
      throw new Error(`action button index ${actionIndex} not found`);
    }
    (target as HTMLButtonElement).click();
  }

  it("在 gallery 页一键引用时会生成文件对象并带回工作台", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["abc"], { type: "image/jpeg" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const React = await import("react");
    const { render, waitFor } = await import("@testing-library/react");
    const { MemoryRouter } = await import("react-router-dom");
    const { ExampleGallery } = await import("@/components/examples/example-gallery");

    const { container } = render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(ExampleGallery, { mode: "gallery" }),
      ),
    );

    clickActionByIndex(container, 0);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 10000 });
    await waitFor(() => expect(setPendingMock).toHaveBeenCalledTimes(1), { timeout: 10000 });
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
  }, 10000);

  it("gallery 页仅参考图按钮会打开工作台并提示继续补充参考图", async () => {
    const React = await import("react");
    const { render } = await import("@testing-library/react");
    const { MemoryRouter } = await import("react-router-dom");
    const { ExampleGallery } = await import("@/components/examples/example-gallery");

    const { container } = render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(ExampleGallery, { mode: "gallery" }),
      ),
    );

    clickActionByIndex(container, 2);

    expect(setPendingMock).toHaveBeenCalledTimes(1);
    expect(setPendingMock).toHaveBeenCalledWith({ mode: "generate", prompt: "", files: [] });
    expect(navigateMock).toHaveBeenCalledWith("/");
    expect(toastInfoMock).toHaveBeenCalledWith(
      "示例页暂不直接挂载工作台上传对象，请在工作台继续补充参照图。已为你打开工作台。",
      { duration: 2600 },
    );
  });

  it("当 gallery 页图片抓取失败时会退化为仅提示词", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetchMock);

    const React = await import("react");
    const { render, waitFor } = await import("@testing-library/react");
    const { MemoryRouter } = await import("react-router-dom");
    const { ExampleGallery } = await import("@/components/examples/example-gallery");

    const { container } = render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(ExampleGallery, { mode: "gallery" }),
      ),
    );

    clickActionByIndex(container, 0);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 10000 });
    expect(setPendingMock).toHaveBeenCalledWith(expect.objectContaining({ mode: "generate", files: [] }));
    expect(navigateMock).toHaveBeenCalledWith("/");
    expect(toastInfoMock).toHaveBeenCalledWith("示例图片加载失败，已退化为仅引用提示词");
  }, 10000);
});
