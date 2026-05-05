import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  generateImagesMock,
  getSettingsMock,
  startTaskMock,
  endTaskMock,
  createMock,
  addTurnMock,
  updateTurnMock,
  removeTurnMock,
  loadMock,
  consumePendingMock,
  toastErrorMock,
  testConversationState,
  mockSettingsState,
} = vi.hoisted(() => ({
  generateImagesMock: vi.fn(),
  getSettingsMock: vi.fn(),
  startTaskMock: vi.fn(),
  endTaskMock: vi.fn(),
  createMock: vi.fn(() => "conv-1"),
  addTurnMock: vi.fn(),
  updateTurnMock: vi.fn(),
  removeTurnMock: vi.fn(),
  loadMock: vi.fn(),
  consumePendingMock: vi.fn(() => null),
  toastErrorMock: vi.fn(),
  testConversationState: {
    conversations: [] as any[],
    activeId: null as string | null,
  },
  mockSettingsState: {
    defaultModel: "saved-model-x",
    defaultN: 3,
    defaultQuality: "high",
    apiKey: "sk-test",
    authKey: "",
    baseUrl: "https://image.codesonline.dev",
  },
}));

vi.mock("@/lib/api", () => ({
  generateImages: generateImagesMock,
  getSettings: getSettingsMock,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: toastErrorMock,
    info: vi.fn(),
  },
}));

vi.mock("@/store/conversations", () => ({
  useConversations: (selector: (state: any) => any) => selector({
    conversations: testConversationState.conversations,
    activeId: testConversationState.activeId,
    load: loadMock,
    create: createMock,
    addTurn: addTurnMock,
    updateTurn: updateTurnMock,
    removeTurn: removeTurnMock,
  }),
}));

vi.mock("@/store/tasks", () => ({
  useTasks: (selector: (state: any) => any) => selector({
    activeTaskKeys: new Set(),
    startTask: startTaskMock,
    endTask: endTaskMock,
  }),
}));

vi.mock("@/store/settings", async () => {
  const actual = await vi.importActual<typeof import("@/store/settings")>("@/store/settings");
  return {
    ...actual,
    useSettings: (selector: (state: any) => any) => selector(mockSettingsState),
  };
});

vi.mock("@/store/example-import", () => ({
  useExampleImport: (selector: (state: any) => any) => selector({
    consumePending: consumePendingMock,
  }),
}));

vi.mock("./conversation-list", () => ({
  ConversationList: () => null,
}));

vi.mock("./image-card", () => ({
  fileFromImage: vi.fn(),
  ImageCard: () => null,
}));

vi.mock("./prompt-bar", () => ({
  PromptBar: ({ onSubmit, onCancel, layout }: { onSubmit: (prompt: string, files?: File[], options?: Record<string, unknown>) => void; onCancel?: () => void; layout?: string }) => (
    <>
      {layout === "workspace" && (
        <aside className="canvas-control-panel" aria-label="图片生成设置">
          <div className="prompt-bar-shell--workspace-settings" />
          <div className="prompt-bar-shell--workspace-composer" />
        </aside>
      )}
      <button
        type="button"
        onClick={() => onSubmit("hello world", undefined, { size: "1024x1024", quality: "high", n: 2, aspectRatio: "1:1" })}
      >
        stub-submit
      </button>
      <button
        type="button"
        onClick={() => onSubmit("hello world", undefined, { size: "1024x1024", quality: "high", n: 4, aspectRatio: "1:1" })}
      >
        stub-submit-four
      </button>
      <button type="button" onClick={onCancel}>
        stub-cancel
      </button>
    </>
  ),
}));

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CanvasPage } from "@/app/canvas/page";

describe("canvas generate request chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testConversationState.conversations = [];
    testConversationState.activeId = null;
    Object.assign(mockSettingsState, {
      defaultModel: "saved-model-x",
      defaultN: 3,
      defaultQuality: "high",
      apiKey: "sk-test",
      authKey: "",
      baseUrl: "https://image.codesonline.dev",
    });
    getSettingsMock.mockResolvedValue({ capabilities: undefined });
    generateImagesMock.mockResolvedValue({
      created: Date.now(),
      data: [{ b64_json: "abc" }],
    });
  });

  it("生成请求应读取已保存的 defaultModel，并优先使用本次提交的参数", async () => {
    render(<CanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: "stub-submit" }));

    await waitFor(() => expect(generateImagesMock).toHaveBeenCalledTimes(1));

    expect(generateImagesMock).toHaveBeenCalledWith({
      model: "saved-model-x",
      prompt: "hello world",
      n: 2,
      size: "1024x1024",
      quality: "high",
      response_format: "b64_json",
      reference_images: undefined,
    }, {
      signal: expect.any(AbortSignal),
    });
    expect(startTaskMock).toHaveBeenCalled();
    expect(endTaskMock).toHaveBeenCalled();
  });

  it("生成 4 张时前端也应按每批 2 张拆分请求，避免旧 backend 直传 n=4", async () => {
    generateImagesMock
      .mockResolvedValueOnce({
        created: Date.now(),
        data: [{ b64_json: "first-a" }, { b64_json: "first-b" }],
      })
      .mockResolvedValueOnce({
        created: Date.now(),
        data: [{ b64_json: "second-a" }, { b64_json: "second-b" }],
      });

    render(<CanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: "stub-submit-four" }));

    await waitFor(() => expect(generateImagesMock).toHaveBeenCalledTimes(2));
    expect(generateImagesMock.mock.calls.map((call) => call[0].n)).toEqual([2, 2]);
    expect(updateTurnMock).toHaveBeenCalledWith(
      "conv-1",
      expect.any(String),
      expect.objectContaining({
        status: "done",
        images: expect.arrayContaining([
          expect.objectContaining({ b64_json: "first-a" }),
          expect.objectContaining({ b64_json: "first-b" }),
          expect.objectContaining({ b64_json: "second-a" }),
          expect.objectContaining({ b64_json: "second-b" }),
        ]),
      }),
    );
  });

  it("生成前只接受 API Key，不再把本地鉴权 Key 当作生图凭据", async () => {
    Object.assign(mockSettingsState, {
      apiKey: "",
      authKey: "runtime-only-auth",
      baseUrl: "https://image.codesonline.dev",
    });

    render(<CanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: "stub-submit" }));

    await waitFor(() => expect(addTurnMock).toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({
        status: "error",
        error: "请先在设置中填写 API Key",
      }),
    ));
    expect(toastErrorMock).toHaveBeenCalledWith("请先在设置中填写 API Key");
    expect(generateImagesMock).not.toHaveBeenCalled();
  });

  it("工作台空状态不再挂载示例区", async () => {
    const { container } = render(<CanvasPage />);

    expect(screen.getByText("开始创作")).toBeTruthy();
    expect(screen.getByText("输入提示词，或添加附件图开始创作")).toBeTruthy();
    expect(screen.queryByText("示例区加载中…")).toBeNull();
    expect(container.querySelector(".canvas-stage")).toBeTruthy();
    expect(container.querySelector('aside.canvas-control-panel[aria-label="图片生成设置"]')).toBeTruthy();
    expect(container.querySelector(".prompt-bar-shell--workspace-composer")).toBeTruthy();
  });

  it("生成记录提示词默认折叠，点击可展开，重试应重新计算开始时间", async () => {
    const longPrompt = Array.from({ length: 18 }, () => "这是一段很长的提示词").join(" ");
    testConversationState.activeId = "conv-1";
    testConversationState.conversations = [{
      id: "conv-1",
      title: "历史对话",
      created_at: 1,
      updated_at: 1,
      turns: [{
        id: "turn-1",
        mode: "generate",
        prompt: longPrompt,
        status: "error",
        images: [],
        model: "saved-model-x",
        size: "1024x1024",
        quality: "high",
        n: 1,
        aspectRatio: "1:1",
        created_at: 1000,
        error: "失败",
      }],
    }];

    render(<CanvasPage />);

    const promptButton = screen.getByRole("button", { name: longPrompt });
    expect(promptButton.className).toContain("canvas-turn-prompt--collapsed");

    fireEvent.click(promptButton);

    expect(promptButton.getAttribute("aria-expanded")).toBe("true");
    expect(promptButton.className).toContain("canvas-turn-prompt--expanded");
    expect(screen.getByRole("button", { name: "引用提示词" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "复制提示词" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() => expect(generateImagesMock).toHaveBeenCalledTimes(1));
    expect(updateTurnMock).toHaveBeenCalledWith(
      "conv-1",
      "turn-1",
      expect.objectContaining({
        status: "generating",
        created_at: expect.any(Number),
      }),
    );
    const retryUpdate = updateTurnMock.mock.calls.find((call) => call[2]?.status === "generating")?.[2];
    expect(retryUpdate.created_at).toBeGreaterThan(1000);
  });

  it("点击停止生成应取消当前请求并把记录标记为已停止", async () => {
    generateImagesMock.mockImplementation((_payload: any, options: { signal?: AbortSignal } = {}) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
    );

    render(<CanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: "stub-submit" }));
    await waitFor(() => expect(generateImagesMock).toHaveBeenCalledTimes(1));
    const requestOptions = generateImagesMock.mock.calls[0]?.[1];
    expect(requestOptions?.signal).toBeInstanceOf(AbortSignal);

    fireEvent.click(screen.getByRole("button", { name: "stub-cancel" }));

    await waitFor(() => expect(updateTurnMock).toHaveBeenCalledWith(
      "conv-1",
      expect.any(String),
      expect.objectContaining({
        status: "error",
        error: "已停止生成",
      }),
    ));
    expect(endTaskMock).toHaveBeenCalled();
  });
});
