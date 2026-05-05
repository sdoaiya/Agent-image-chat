import { describe, expect, it } from "vitest";

describe("settings drawer local reset and model persistence invariants", () => {
  it("重置后前端默认质量应与 store 一致", async () => {
    const { normalizeQualityForApiMode } = await import("@/store/settings");
    expect(normalizeQualityForApiMode("codesonline", "standard")).toBe("auto");
    expect(normalizeQualityForApiMode("codesonline", "low")).toBe("low");
  });

  it("保存模型时应优先保留当前选中的模型", async () => {
    const { normalizeModelState } = await import("@/lib/api");
    const normalized = normalizeModelState({
      builtins: ["gpt-image-2"],
      remote: ["remote-a"],
      imported: ["custom-a"],
      backend: {
        chatgpt: {
          model: "remote-a",
          availableModels: ["remote-a"],
        },
      } as any,
      selected: "custom-a",
    });

    expect(normalized.selectedModel).toBe("custom-a");
    expect(normalized.availableModels).toContain("custom-a");
  });
});
