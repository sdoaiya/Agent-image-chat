import { describe, expect, it } from "vitest";
import { extractAvailableModels, normalizeModelState } from "@/lib/api";

describe("model config normalization", () => {
  it("应从后端配置合并 availableModels 与默认模型候选", () => {
    const config = {
      chatgpt: {
        model: "gpt-image-main",
        availableModels: ["gpt-image-main", "gpt-image-alt", "gpt-image-main"],
      },
    };

    expect(extractAvailableModels(config as any)).toEqual([
      "gpt-image-main",
      "gpt-image-alt",
    ]);
  });

  it("应按 builtins / remote / imported / backend / selected 去重并保留选中模型", () => {
    const normalized = normalizeModelState({
      builtins: ["gpt-image-2", "gpt-image-1"],
      remote: ["gpt-image-1", "remote-a"],
      imported: ["custom-a", "remote-a"],
      backend: {
        chatgpt: {
          model: "backend-main",
          availableModels: ["backend-main", "remote-a"],
        },
      } as any,
      selected: "custom-a",
    });

    expect(normalized.availableModels).toEqual([
      "gpt-image-2",
      "gpt-image-1",
      "remote-a",
      "custom-a",
      "backend-main",
    ]);
    expect(normalized.selectedModel).toBe("custom-a");
  });

  it("未提供选中模型时应回退到首个可用模型，再回退默认内置模型", () => {
    expect(normalizeModelState({ remote: ["remote-a"] }).selectedModel).toBe("remote-a");
    expect(normalizeModelState({}).selectedModel).toBe("gpt-image-2");
  });
});
