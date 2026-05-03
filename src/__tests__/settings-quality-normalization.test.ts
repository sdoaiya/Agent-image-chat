import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGE_MODEL,
  getQualityOptionsByApiMode,
  normalizeQualityForApiMode,
  useSettings,
} from "@/store/settings";

describe("settings store quality normalization", () => {
  it("应在统一链路下返回固定质量选项", () => {
    const expected = ["auto", "low", "medium", "high"];
    expect(getQualityOptionsByApiMode("openai")).toEqual(expected);
    expect(getQualityOptionsByApiMode("codesonline")).toEqual(expected);
    expect(normalizeQualityForApiMode("openai", "hd")).toBe("auto");
    expect(normalizeQualityForApiMode("codesonline", "medium")).toBe("medium");
  });

  it("updateSettings 时应修正非法质量值，并保留单一 generations 链路所需默认模型", () => {
    useSettings.setState(useSettings.getInitialState());

    useSettings.getState().updateSettings({ defaultQuality: "hd" as any });
    expect(useSettings.getState().defaultQuality).toBe("auto");

    useSettings.getState().updateSettings({
      defaultModel: "gpt-image-2",
      defaultQuality: "medium",
    });
    expect(useSettings.getState().defaultModel).toBe("gpt-image-2");
    expect(useSettings.getState().defaultQuality).toBe("medium");

    useSettings.getState().updateSettings({ defaultQuality: "unknown" as any });
    expect(useSettings.getState().defaultQuality).toBe("auto");
  });

  it("resetSettings 后应回到 store 默认模型和质量", () => {
    useSettings.setState(useSettings.getInitialState());
    useSettings.getState().updateSettings({
      defaultModel: "custom-model",
      defaultQuality: "low",
    });

    useSettings.getState().resetSettings();

    expect(useSettings.getState().defaultModel).toBe(DEFAULT_IMAGE_MODEL);
    expect(useSettings.getState().defaultQuality).toBe("auto");
  });
});
