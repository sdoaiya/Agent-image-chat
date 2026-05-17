import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  generateImagesMock,
  getSettingsMock,
  startTaskMock,
  endTaskMock,
  toastSuccessMock,
  toastErrorMock,
  createMock,
  addTurnMock,
  updateTurnMock,
  removeTurnMock,
  loadMock,
  consumePendingMock,
  imageCardMock,
  testConversationState,
  testTaskState,
} = vi.hoisted(() => ({
  generateImagesMock: vi.fn(),
  getSettingsMock: vi.fn(),
  startTaskMock: vi.fn(),
  endTaskMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  createMock: vi.fn(() => "conv-1"),
  addTurnMock: vi.fn(),
  updateTurnMock: vi.fn(),
  removeTurnMock: vi.fn(),
  loadMock: vi.fn(),
  consumePendingMock: vi.fn(() => null),
  imageCardMock: vi.fn(() => null),
  testConversationState: {
    conversations: [] as any[],
    activeId: null as string | null,
    loaded: false,
  },
  testTaskState: {
    activeTaskKeys: new Set<string>(),
  },
}));

vi.mock("@/lib/api", () => ({
  generateImages: generateImagesMock,
  getSettings: getSettingsMock,
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
    info: vi.fn(),
  },
}));

vi.mock("@/store/conversations", () => ({
  useConversations: (selector: (state: any) => any) => selector({
    conversations: testConversationState.conversations,
    activeId: testConversationState.activeId,
    loaded: testConversationState.loaded,
    load: loadMock,
    setActive: (id: string) => {
      testConversationState.activeId = id;
    },
    create: createMock,
    remove: (id: string) => {
      testConversationState.conversations = testConversationState.conversations.filter((conv) => conv.id !== id);
      if (testConversationState.activeId === id) {
        testConversationState.activeId = testConversationState.conversations[0]?.id ?? null;
      }
    },
    rename: (id: string, title: string) => {
      testConversationState.conversations = testConversationState.conversations.map((conv) => (
        conv.id === id ? { ...conv, title } : conv
      ));
    },
    addTurn: addTurnMock,
    updateTurn: updateTurnMock,
    removeTurn: removeTurnMock,
  }),
}));

vi.mock("@/store/tasks", () => ({
  useTasks: (selector: (state: any) => any) => selector({
    activeTaskKeys: testTaskState.activeTaskKeys,
    startTask: startTaskMock,
    endTask: endTaskMock,
  }),
}));

vi.mock("@/store/settings", async () => {
  const actual = await vi.importActual<typeof import("@/store/settings")>("@/store/settings");
  return {
    ...actual,
    useSettings: (selector: (state: any) => any) => selector({
      defaultModel: "saved-model-x",
      defaultN: 3,
      defaultQuality: "high",
      apiKey: "sk-test",
      providerApiKeys: { codesonline: "sk-test" },
      authKey: "",
      baseUrl: "https://image.codesonline.dev",
    }),
  };
});

vi.mock("@/store/example-import", () => ({
  useExampleImport: (selector: (state: any) => any) => selector({
    consumePending: consumePendingMock,
  }),
}));

vi.mock("./conversation-list", async () => await vi.importActual("./conversation-list"));

vi.mock("./image-card", () => ({
  fileFromImage: vi.fn(),
  ImageCard: imageCardMock,
}));

vi.mock("./prompt-bar", () => ({
  PromptBar: ({ onSubmit, onCancel, layout, disabled }: { onSubmit: (prompt: string, files?: File[], options?: Record<string, unknown>) => void; onCancel?: () => void; layout?: string; disabled?: boolean }) => (
    <>
      {layout === "workspace" && (
        <aside className="canvas-control-panel" aria-label="图片生成设置">
          <div className="prompt-bar-shell--workspace-settings" />
          <div className="prompt-bar-shell--workspace-composer" />
        </aside>
      )}
      <div data-testid="stub-prompt-disabled">{String(Boolean(disabled))}</div>
      <button
        type="button"
        onClick={() => onSubmit("hello world", undefined, { size: "1:1", quality: "high", style: "vivid", upscale: "2k", n: 2, aspectRatio: "1:1" })}
      >
        stub-submit
      </button>
      <button
        type="button"
        onClick={() => onSubmit("hello world", undefined, { size: "1024x1024", quality: "high", n: 4, aspectRatio: "1:1" })}
      >
        stub-submit-four
      </button>
      <button
        type="button"
        onClick={() => onSubmit("", [new File(["ref-image"], "ref.png", { type: "image/png" })], { size: "1:1", quality: "high", n: 2, aspectRatio: "1:1" })}
      >
        stub-submit-reference
      </button>
      <button type="button" onClick={onCancel}>
        stub-cancel
      </button>
    </>
  ),
}));

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CanvasPage } from "@/app/canvas/page";

function expectTextContent(element: HTMLElement, expected: string) {
  expect(element.textContent).toContain(expected);
}

describe("canvas generate request chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testConversationState.conversations = [];
    testConversationState.activeId = null;
    testConversationState.loaded = false;
    testTaskState.activeTaskKeys = new Set();
    createMock.mockImplementation(() => {
      const id = "conv-1";
      testConversationState.activeId = id;
      testConversationState.conversations = [{
        id,
        title: "新对话",
        created_at: Date.now(),
        updated_at: Date.now(),
        turns: [],
      }];
      return id;
    });
    addTurnMock.mockImplementation((convId: string, turn: any) => {
      testConversationState.conversations = testConversationState.conversations.map((conv) => (
        conv.id === convId
          ? { ...conv, turns: [...conv.turns, turn], updated_at: Date.now() }
          : conv
      ));
    });
    updateTurnMock.mockImplementation((convId: string, turnId: string, partial: any) => {
      testConversationState.conversations = testConversationState.conversations.map((conv) => (
        conv.id === convId
          ? {
              ...conv,
              turns: conv.turns.map((turn: any) => (turn.id === turnId ? { ...turn, ...partial } : turn)),
              updated_at: Date.now(),
            }
          : conv
      ));
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

    await waitFor(() => expect(generateImagesMock).toHaveBeenCalledTimes(2));

    expect(generateImagesMock.mock.calls.map((call) => call[0].n)).toEqual([1, 1]);
    expect(generateImagesMock).toHaveBeenCalledWith({
      model: "saved-model-x",
      prompt: "hello world",
      n: 1,
      size: "1:1",
      quality: "high",
      style: "vivid",
      upscale: "2k",
      response_format: "b64_json",
      reference_images: undefined,
    }, {
      signal: expect.any(AbortSignal),
    });
    expect(startTaskMock).toHaveBeenCalled();
    expect(endTaskMock).toHaveBeenCalled();
  });

  it("引用参考图生成时应增强接口提示词避免复制脸部遮挡，但历史记录保持用户可见文案", async () => {
    render(<CanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: "stub-submit-reference" }));

    await waitFor(() => expect(generateImagesMock).toHaveBeenCalledTimes(2));

    const requestPayloads = generateImagesMock.mock.calls.map((call) => call[0]);
    expect(requestPayloads.map((payload) => payload.n)).toEqual([1, 1]);
    expect(requestPayloads[0].prompt).toContain("请根据参考图生成结果");
    expect(requestPayloads[0].prompt).toContain("不要复制参考图中的脸部遮挡");
    expect(requestPayloads[0].reference_images).toEqual([expect.any(String)]);
    expect(addTurnMock).toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({
        prompt: "请基于参考图生成结果",
        source_images: [expect.any(File)],
        n: 2,
      }),
    );
    const addedTurn = addTurnMock.mock.calls[0]?.[1];
    expect(addedTurn).toBeDefined();
    expect(addedTurn.prompt).not.toContain("不要复制参考图中的脸部遮挡");
  });

  it("会话已加载时重新挂载工作台不应重复 load，避免误判为页面刷新中断", () => {
    testConversationState.loaded = true;
    testConversationState.activeId = "conv-1";
    testConversationState.conversations = [{
      id: "conv-1",
      title: "历史对话",
      created_at: 1,
      updated_at: 1,
      turns: [],
    }];

    render(<CanvasPage />);

    expect(loadMock).not.toHaveBeenCalled();
  });

  it("生成 4 张时前端按单张串行拆分请求，降低上游 429 风险", async () => {
    generateImagesMock
      .mockResolvedValueOnce({
        created: Date.now(),
        data: [{ b64_json: "first-a" }],
      })
      .mockResolvedValueOnce({
        created: Date.now(),
        data: [{ b64_json: "first-b" }],
      })
      .mockResolvedValueOnce({
        created: Date.now(),
        data: [{ b64_json: "second-a" }],
      })
      .mockResolvedValueOnce({
        created: Date.now(),
        data: [{ b64_json: "second-b" }],
      });

    render(<CanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: "stub-submit-four" }));

    await waitFor(() => expect(generateImagesMock).toHaveBeenCalledTimes(4));
    expect(generateImagesMock.mock.calls.map((call) => call[0].n)).toEqual([1, 1, 1, 1]);
    const progressUpdates = updateTurnMock.mock.calls.filter((call) => call[2]?.status === "generating");
    expect(progressUpdates.map((call) => call[2].images.length)).toEqual([1, 2, 3, 4]);
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

  it("生成中的多图记录应显示已完成图片和剩余加载框", () => {
    testConversationState.activeId = "conv-1";
    testConversationState.loaded = true;
    testConversationState.conversations = [{
      id: "conv-1",
      title: "历史对话",
      created_at: 1,
      updated_at: 1,
      turns: [{
        id: "turn-1",
        mode: "generate",
        prompt: "running",
        status: "generating",
        images: [{ url: "data:image/png;base64,abc" }],
        model: "saved-model-x",
        n: 4,
        created_at: Date.now(),
      }],
    }];

    render(<CanvasPage />);

    expect(screen.getByText(/已完成 1\/4/)).toBeTruthy();
    expect(screen.getAllByLabelText(/等待生成第/)).toHaveLength(3);
  });

  it("批量生成中途失败时应保留已成功图片并提示部分未完成", async () => {
    generateImagesMock
      .mockResolvedValueOnce({
        created: Date.now(),
        data: [{ b64_json: "first-a" }],
      })
      .mockResolvedValueOnce({
        created: Date.now(),
        data: [{ b64_json: "first-b" }],
      })
      .mockRejectedValueOnce(new Error("上游返回不完整或无效的 JSON"));

    render(<CanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: "stub-submit-four" }));

    await waitFor(() => expect(generateImagesMock).toHaveBeenCalledTimes(3));
    expect(updateTurnMock).toHaveBeenCalledWith(
      "conv-1",
      expect.any(String),
      expect.objectContaining({
        status: "done",
        images: expect.arrayContaining([
          expect.objectContaining({ b64_json: "first-a" }),
          expect.objectContaining({ b64_json: "first-b" }),
        ]),
        error: expect.stringContaining("已成功生成 2/4 张"),
      }),
    );
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

  it("复制提示词在 clipboard API 失败时应回退到 execCommand", async () => {
    testConversationState.activeId = "conv-1";
    testConversationState.conversations = [{
      id: "conv-1",
      title: "历史对话",
      created_at: 1,
      updated_at: 1,
      turns: [{
        id: "turn-1",
        mode: "generate",
        prompt: "copy me",
        status: "done",
        images: [{ url: "data:image/png;base64,abc" }],
        model: "saved-model-x",
        created_at: 1000,
      }],
    }];
    const clipboardWriteText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, {
      clipboard: { writeText: clipboardWriteText },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => true),
    });
    const execCommandMock = vi.mocked(document.execCommand);

    render(<CanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: "复制提示词" }));

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("提示词已复制"));
    expect(clipboardWriteText).toHaveBeenCalledWith("copy me");
    expect(execCommandMock).toHaveBeenCalledWith("copy");
  });

  it("错误信息支持一键复制", async () => {
    testConversationState.activeId = "conv-1";
    testConversationState.loaded = true;
    testConversationState.conversations = [{
      id: "conv-1",
      title: "历史对话",
      created_at: 1,
      updated_at: 1,
      turns: [{
        id: "turn-1",
        mode: "generate",
        prompt: "bad",
        status: "error",
        images: [],
        model: "saved-model-x",
        created_at: 1000,
        error: "上游 400 错误",
      }],
    }];
    const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: clipboardWriteText },
    });

    render(<CanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: /复制错误/ }));

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("错误信息已复制"));
    expect(clipboardWriteText).toHaveBeenCalledWith("上游 400 错误");
  });

  it("当前 conversation 的工作详情默认选中最新生成记录", () => {
    testConversationState.activeId = "conv-1";
    testConversationState.loaded = true;
    testConversationState.conversations = [{
      id: "conv-1",
      title: "历史对话",
      created_at: 1,
      updated_at: 1,
      turns: [
        {
          id: "old",
          mode: "generate",
          prompt: "old prompt",
          status: "error",
          images: [],
          model: "saved-model-x",
          created_at: 1000,
          error: "old error",
        },
        {
          id: "new",
          mode: "generate",
          prompt: "new prompt",
          status: "error",
          images: [],
          model: "saved-model-x",
          created_at: 2000,
          error: "new error",
        },
      ],
    }];

    render(<CanvasPage />);

    const prompts = screen.getAllByRole("button", { name: /prompt/ });
    expect(prompts.map((button) => button.textContent)).toEqual(["new prompt", "old prompt"]);
  });

  it("左侧工作列表应常驻显示工作状态，并支持切换当前工作与新建工作", () => {
    testConversationState.activeId = "conv-live";
    testConversationState.loaded = true;
    testConversationState.conversations = [
      {
        id: "conv-live",
        title: "产品海报批次",
        created_at: 2,
        updated_at: 2000,
        turns: [{
          id: "turn-live",
          mode: "generate",
          prompt: "new prompt",
          status: "generating",
          images: [{ url: "data:image/png;base64,abc" }],
          model: "saved-model-x",
          n: 4,
          created_at: 2000,
        }],
      },
      {
        id: "conv-old",
        title: "角色草图",
        created_at: 1,
        updated_at: 1000,
        turns: [{
          id: "turn-old",
          mode: "generate",
          prompt: "old prompt",
          status: "error",
          images: [],
          model: "saved-model-x",
          created_at: 1000,
          error: "old error",
        }],
      },
    ];
    createMock.mockImplementation(() => {
      const id = "conv-new";
      testConversationState.activeId = id;
      testConversationState.conversations = [{
        id,
        title: "新对话",
        created_at: 3000,
        updated_at: 3000,
        turns: [],
      }, ...testConversationState.conversations];
      return id;
    });

    const view = render(<CanvasPage />);

    const workList = screen.getByTestId("workspace-worklist");
    expectTextContent(workList, "产品海报批次");
    expectTextContent(workList, "角色草图");
    expectTextContent(workList, "1 个任务生成中");
    expectTextContent(workList, "old error");
    expectTextContent(screen.getByTestId("workspace-turn-stream"), "new prompt");

    fireEvent.click(screen.getByTestId("conversation-item-conv-old"));
    view.rerender(<CanvasPage />);
    expectTextContent(screen.getByTestId("workspace-turn-stream"), "old prompt");
    expect(screen.getAllByText("old error").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "新建工作" }));
    view.rerender(<CanvasPage />);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("开始创作")).toBeTruthy();
  });

  it("工作列表头部应支持折叠与展开，折叠后释放更多中间工作区宽度", () => {
    testConversationState.activeId = "conv-live";
    testConversationState.loaded = true;
    testConversationState.conversations = [
      {
        id: "conv-live",
        title: "产品海报批次",
        created_at: 2,
        updated_at: 2000,
        turns: [{
          id: "turn-live",
          mode: "generate",
          prompt: "new prompt",
          status: "generating",
          images: [{ url: "data:image/png;base64,abc" }],
          model: "saved-model-x",
          n: 1,
          created_at: 2000,
        }],
      },
    ];

    render(<CanvasPage />);

    const workList = screen.getByTestId("workspace-worklist");
    expect(screen.getByRole("button", { name: "新建工作" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "收起工作列表" })).toBeTruthy();
    expectTextContent(workList, "产品海报批次");

    fireEvent.click(screen.getByRole("button", { name: "收起工作列表" }));

    expect(screen.queryByRole("button", { name: "新建工作" })).toBeNull();
    expect(screen.getByRole("button", { name: "展开工作列表" })).toBeTruthy();
    expect(workList.className).toContain("canvas-worklist-panel--collapsed");
    expect(screen.queryByTestId("conversation-item-conv-live")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "展开工作列表" }));

    expect(screen.getByRole("button", { name: "新建工作" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "收起工作列表" })).toBeTruthy();
    expect(screen.getByTestId("conversation-item-conv-live")).toBeTruthy();
  });

  it("生成图片详情应接收提示词和三种引用入口", () => {
    testConversationState.activeId = "conv-1";
    testConversationState.loaded = true;
    testConversationState.conversations = [{
      id: "conv-1",
      title: "历史对话",
      created_at: 1,
      updated_at: 1,
      turns: [{
        id: "turn-1",
        mode: "generate",
        prompt: "detail prompt",
        status: "done",
        images: [{ url: "data:image/png;base64,abc" }],
        model: "saved-model-x",
        created_at: 1000,
      }],
    }];

    render(<CanvasPage />);

    expect(imageCardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "detail prompt",
        onReference: expect.any(Function),
        onPromptReference: expect.any(Function),
        onImageReference: expect.any(Function),
      }),
      undefined,
    );
  });

  it("其他对话正在生成时，新建对话的输入区不应被全局锁死", () => {
    testTaskState.activeTaskKeys = new Set(["conv-1:turn-1"]);
    testConversationState.activeId = "conv-2";
    testConversationState.loaded = true;
    testConversationState.conversations = [
      {
        id: "conv-1",
        title: "对话一",
        created_at: 1,
        updated_at: 1,
        turns: [{
          id: "turn-1",
          mode: "generate",
          prompt: "running",
          status: "generating",
          images: [],
          model: "saved-model-x",
          created_at: 1000,
        }],
      },
      {
        id: "conv-2",
        title: "对话二",
        created_at: 2,
        updated_at: 2,
        turns: [],
      },
    ];

    render(<CanvasPage />);

    expect(screen.getByTestId("stub-prompt-disabled").textContent).toBe("false");
  });
});
