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
}));

vi.mock("@/lib/api", () => ({
  generateImages: generateImagesMock,
  getSettings: getSettingsMock,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/store/conversations", () => ({
  useConversations: (selector: (state: any) => any) => selector({
    conversations: [],
    activeId: null,
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
    useSettings: (selector: (state: any) => any) => selector({
      defaultModel: "saved-model-x",
      defaultN: 3,
      defaultQuality: "high",
      apiKey: "sk-test",
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

vi.mock("./conversation-list", () => ({
  ConversationList: () => null,
}));

vi.mock("./image-card", () => ({
  fileFromImage: vi.fn(),
  ImageCard: () => null,
}));

vi.mock("@/components/examples/example-gallery", () => ({
  ExampleGallery: () => null,
}));

vi.mock("./prompt-bar", () => ({
  PromptBar: ({ onSubmit }: { onSubmit: (prompt: string, files?: File[], options?: Record<string, unknown>) => void }) => (
    <button
      type="button"
      onClick={() => onSubmit("hello world", undefined, { size: "1024x1024", quality: "high" })}
    >
      stub-submit
    </button>
  ),
}));

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CanvasPage } from "@/app/canvas/page";

describe("canvas generate request chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSettingsMock.mockResolvedValue({ capabilities: undefined });
    generateImagesMock.mockResolvedValue({
      created: Date.now(),
      data: [{ b64_json: "abc" }],
    });
  });

  it("生成请求应读取已保存的 defaultModel、defaultQuality 与 defaultN", async () => {
    render(<CanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: "stub-submit" }));

    await waitFor(() => expect(generateImagesMock).toHaveBeenCalledTimes(1));

    expect(generateImagesMock).toHaveBeenCalledWith({
      model: "saved-model-x",
      prompt: "hello world",
      n: 3,
      size: "1024x1024",
      quality: "high",
      response_format: "b64_json",
      reference_images: undefined,
    });
    expect(startTaskMock).toHaveBeenCalled();
    expect(endTaskMock).toHaveBeenCalled();
  });
});
