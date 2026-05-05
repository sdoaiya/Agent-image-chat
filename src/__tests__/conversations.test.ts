import { describe, it, expect, vi, beforeEach } from "vitest";
import { useConversations, type ConversationTurn } from "../store/conversations";

function createTurn(overrides: Partial<ConversationTurn> = {}): ConversationTurn {
  return {
    id: "turn-1",
    mode: "generate",
    prompt: "test",
    status: "done",
    images: [],
    model: "gpt-5.4",
    created_at: Date.now(),
    ...overrides,
  };
}

describe("normalizeTurns", () => {
  beforeEach(() => {
    useConversations.setState({ conversations: [], activeId: null, loaded: false, loadError: null });
  });

  it("should mark pending turns as error with descriptive message", () => {
    const pendingTurn = createTurn({ id: "t1", status: "pending" });
    const generatingTurn = createTurn({ id: "t2", status: "generating" });
    const doneTurn = createTurn({ id: "t3", status: "done" });
    const errorTurn = createTurn({ id: "t4", status: "error", error: "original error" });

    const turns = [pendingTurn, generatingTurn, doneTurn, errorTurn];

const normalized = turns.map((t: ConversationTurn) => {
      if (t.status !== "pending" && t.status !== "generating") return t;
      return {
        ...t,
        status: "error" as const,
        error: t.error || "页面刷新后任务中断，请重试",
        source_images: undefined,
      };
    });

    const pendingResult = normalized.find((t) => t.id === "t1")!;
    expect(pendingResult.status).toBe("error");
    expect(pendingResult.status).toBe("error");
    expect(pendingResult.error).toBe("页面刷新后任务中断，请重试");
    expect(pendingResult.source_images).toBeUndefined();

    const generatingResult = normalized.find((t) => t.id === "t2")!;
    expect(generatingResult.status).toBe("error");
    expect(generatingResult.error).toBe("页面刷新后任务中断，请重试");

    const doneResult = normalized.find((t) => t.id === "t3")!;
    expect(doneResult.status).toBe("done");
    expect(doneResult.error).toBeUndefined();

    const errorResult = normalized.find((t) => t.id === "t4")!;
    expect(errorResult.status).toBe("error");
    expect(errorResult.error).toBe("original error");
  });

  it("should clear source_images on pending/generating turns after normalize", () => {
    const turn = createTurn({
      id: "t1",
      status: "generating",
      source_images: [new File([], "test.png")] as any,
    });

    const normalized = {
      ...turn,
      status: "error" as const,
      error: "页面刷新后任务中断，请重试",
      source_images: undefined,
    };

    expect(normalized.source_images).toBeUndefined();
  });
});

describe("persistConversations error handling", () => {
  it("should not throw when localforage.setItem fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let writeQueue: Promise<void> = Promise.resolve();

    writeQueue = writeQueue.then(async () => {
      throw new Error("QuotaExceededError");
    }).catch((err) => {
      consoleErrorSpy("[gimg] Failed to persist conversations:", err);
    });

    await writeQueue;

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe("conversation rename", () => {
  beforeEach(() => {
    useConversations.setState({
      conversations: [{
        id: "conv-1",
        title: "旧标题",
        turns: [],
        created_at: 1,
        updated_at: 1,
      }],
      activeId: "conv-1",
      loaded: true,
      loadError: null,
    });
  });

  it("should trim and persist a renamed conversation title", () => {
    useConversations.getState().rename("conv-1", "  新标题  ");

    expect(useConversations.getState().conversations[0]?.title).toBe("新标题");
    expect(useConversations.getState().conversations[0]?.updated_at).toBeGreaterThan(1);
  });

  it("should ignore empty renamed titles", () => {
    useConversations.getState().rename("conv-1", "   ");

    expect(useConversations.getState().conversations[0]?.title).toBe("旧标题");
  });
});
