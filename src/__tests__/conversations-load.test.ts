import { beforeEach, describe, expect, it, vi } from "vitest";

const localforageMocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock("localforage", () => ({
  default: {
    createInstance: vi.fn(() => localforageMocks),
  },
}));

describe("conversation loading", () => {
  beforeEach(() => {
    vi.resetModules();
    localforageMocks.getItem.mockReset();
    localforageMocks.setItem.mockReset();
    localforageMocks.setItem.mockResolvedValue(undefined);
  });

  it("finishes loading with a recoverable error when local history cannot be read", async () => {
    localforageMocks.getItem.mockRejectedValue(new Error("IndexedDB unavailable"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { useConversations } = await import("@/store/conversations");

    useConversations.setState({ conversations: [], activeId: null, loaded: false, loadError: null });
    await useConversations.getState().load();

    expect(useConversations.getState()).toEqual(expect.objectContaining({
      conversations: [],
      activeId: null,
      loaded: true,
      loadError: "对话读取失败，可新建对话继续使用。",
    }));
    expect(consoleErrorSpy).toHaveBeenCalledWith("[gimg] Failed to load conversations:", expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it("clears the load error after creating a new conversation", async () => {
    localforageMocks.getItem.mockRejectedValue(new Error("IndexedDB unavailable"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { useConversations } = await import("@/store/conversations");

    await useConversations.getState().load();
    useConversations.getState().create();

    expect(useConversations.getState().loadError).toBeNull();
    expect(useConversations.getState().conversations).toHaveLength(1);
    consoleErrorSpy.mockRestore();
  });
});
