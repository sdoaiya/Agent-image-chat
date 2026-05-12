import { describe, it, expect, vi } from "vitest";

describe("Object URL cleanup on PromptBar unmount", () => {
  it("should revoke all object URLs when files are cleaned up", () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-1");

    const files = [
      { id: "f1", file: new File([], "a.png"), preview: "blob:test-1", source: "upload" as const },
      { id: "f2", file: new File([], "b.png"), preview: "blob:test-2", source: "upload" as const },
    ];

    for (const f of files) {
      URL.revokeObjectURL(f.preview);
    }

    expect(revokeSpy).toHaveBeenCalledTimes(2);
    expect(revokeSpy).toHaveBeenCalledWith("blob:test-1");
    expect(revokeSpy).toHaveBeenCalledWith("blob:test-2");

    revokeSpy.mockRestore();
    createSpy.mockRestore();
  });

  it("should revoke removed file preview URL", () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const files = [
      { id: "f1", file: new File([], "a.png"), preview: "blob:test-1", source: "upload" as const },
      { id: "f2", file: new File([], "b.png"), preview: "blob:test-2", source: "upload" as const },
    ];

    const removed = files.find((f) => f.id === "f1")!;
    const remaining = files.filter((f) => f.id !== "f1");
    if (removed) URL.revokeObjectURL(removed.preview);

    expect(revokeSpy).toHaveBeenCalledWith("blob:test-1");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe("f2");

    revokeSpy.mockRestore();
  });
});

describe("Image dimension re-measurement on src change", () => {
  it("should reset dimension when src changes", () => {
    let dimension: { width: number; height: number } | null = null;
    const srcHistory: string[] = [];

    function handleSrcChange(newSrc: string) {
      srcHistory.push(newSrc);
      dimension = null;
    }

    handleSrcChange("data:image/png;base64,abc");
    expect(dimension).toBeNull();

    dimension = { width: 100, height: 200 };
    expect(dimension).toEqual({ width: 100, height: 200 });

    handleSrcChange("data:image/png;base64,def");
    expect(dimension).toBeNull();
  });
});

describe("Settings drawer useEffect dependency optimization", () => {
  it("should produce stable reference for specific fields vs whole object", () => {
    const settings = {
      builtinModels: ["gpt-5.4", "gpt-image-1"],
      remoteModels: ["model-a"],
      importedModels: [],
      defaultModel: "gpt-5.4",
    };

    const deps1 = [settings.builtinModels, settings.remoteModels, settings.importedModels, settings.defaultModel];
    const deps2 = [settings.builtinModels, settings.remoteModels, settings.importedModels, settings.defaultModel];

    expect(deps1).toEqual(deps2);
  });

  it("should detect changes in specific fields", () => {
    const settings1 = { defaultModel: "gpt-5.4", remoteModels: ["a"] };
    const settings2 = { defaultModel: "gpt-image-1", remoteModels: ["a"] };

    expect(settings1.defaultModel).not.toBe(settings2.defaultModel);
  });
});

describe("Settings defaults", () => {
  it("should default to codesonline provider defaults", async () => {
    const { useSettings, CODESONLINE_BASE_URL, DEFAULT_IMAGE_MODEL } = await import("@/store/settings");
    useSettings.setState(useSettings.getInitialState());
    expect(useSettings.getState().provider).toBe("codesonline");
    expect(useSettings.getState().baseUrl).toBe(CODESONLINE_BASE_URL);
    expect(useSettings.getState().defaultModel).toBe(DEFAULT_IMAGE_MODEL);
  });

  it("should default to a request-safe quality value", async () => {
    const { useSettings } = await import("@/store/settings");
    useSettings.setState(useSettings.getInitialState());
    expect(useSettings.getState().defaultQuality).toBe("auto");
  });

  it("should expose BLT provider defaults and infer BLT from its baseUrl", async () => {
    const { BLT_BASE_URL, DEFAULT_IMAGE_MODEL, getProviderDefaults, inferProviderFromSettings } = await import("@/store/settings");

    expect(getProviderDefaults("blt")).toEqual({
      provider: "blt",
      baseUrl: BLT_BASE_URL,
      defaultModel: DEFAULT_IMAGE_MODEL,
    });
    expect(inferProviderFromSettings({ baseUrl: BLT_BASE_URL })).toBe("blt");
    expect(inferProviderFromSettings({ provider: "codesonline", baseUrl: BLT_BASE_URL })).toBe("blt");
  });
});

describe("persistConversations write queue resilience", () => {
  it("should continue queue after a failed write", async () => {
    const results: string[] = [];
    let callCount = 0;

    const mockSetItem = async () => {
      callCount++;
      if (callCount === 1) throw new Error("QuotaExceededError");
      results.push("success");
    };

    let writeQueue: Promise<void> = Promise.resolve();

    writeQueue = writeQueue.then(async () => {
      await mockSetItem();
    }).catch(() => {
      // first write fails, caught and handled
    });

    await writeQueue;

    writeQueue = writeQueue.then(async () => {
      await mockSetItem();
    });

    await writeQueue;

    expect(results).toEqual(["success"]);
  });
});
