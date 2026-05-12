import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPost = vi.fn();
const mockGet = vi.fn();
const mockPut = vi.fn();

vi.mock("@/lib/request", () => ({
  default: {
    post: mockPost,
    get: mockGet,
    put: mockPut,
  },
}));

describe("api request layer", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockGet.mockReset();
    mockPut.mockReset();
  });

  it("generateImages 应透传文生图参数到 /v1/images/generations", async () => {
    const response = { created: 1, data: [{ b64_json: "abc" }] };
    mockPost.mockResolvedValue({ data: response });

    const { generateImages } = await import("@/lib/api");
    const payload = {
      model: "gpt-image-2",
      prompt: "A cute orange cat playing with yarn",
      n: 1,
      size: "1024x1024",
      quality: "high" as const,
      response_format: "b64_json" as const,
    };

    await expect(generateImages(payload as any)).resolves.toEqual(response);
    expect(mockPost).toHaveBeenCalledWith("/v1/images/generations", payload);
  });

  it("generateImages 应透传图生图 reference_images 到统一生成接口", async () => {
    const response = { created: 1, data: [{ url: "https://img.test/result.png" }] };
    mockPost.mockResolvedValue({ data: response });

    const { generateImages } = await import("@/lib/api");
    const payload = {
      model: "gpt-image-2",
      prompt: "Turn the cat into a watercolor painting",
      n: 1,
      size: "1024x1024",
      reference_images: ["Y2F0"],
    };

    await expect(generateImages(payload as any)).resolves.toEqual(response);
    expect(mockPost).toHaveBeenCalledWith("/v1/images/generations", payload);
    expect(mockPost).not.toHaveBeenCalledWith("/v1/images/edits", expect.anything(), expect.anything());
    expect(mockPost).not.toHaveBeenCalledWith("/v1/images/upscale", expect.anything(), expect.anything());
  });

  it("模型与配置接口应命中正确路径，且配置结构不再依赖旧 free/paid route 字段", async () => {
    const modelsResponse = { object: "list", data: [{ id: "gpt-image-2" }] };
    const configResponse = {
      app: { apiMode: "openai", apiKey: "", baseUrl: "https://image.codesonline.dev", accountId: "", imageFormat: "url", authKey: "" },
      server: { host: "0.0.0.0", port: 8080 },
      chatgpt: {
        model: "gpt-image-2",
        sseTimeout: 300,
        requestTimeout: 30,
        availableModels: ["gpt-image-2"],
      },
      proxy: { enabled: false, url: "", mode: "fixed" },
    };
    mockGet
      .mockResolvedValueOnce({ data: modelsResponse })
      .mockResolvedValueOnce({ data: configResponse });
    mockPut.mockResolvedValue({ data: configResponse });

    const { getSettings, listModels, updateSettings } = await import("@/lib/api");
    await expect(listModels()).resolves.toEqual(modelsResponse);
    await expect(getSettings()).resolves.toEqual(configResponse);
    await expect(updateSettings({ app: { apiMode: "openai" } })).resolves.toEqual(configResponse);

    expect(mockGet).toHaveBeenNthCalledWith(1, "/v1/models");
    expect(mockGet).toHaveBeenNthCalledWith(2, "/api/config", {
      signal: undefined,
      headers: undefined,
    });
    expect(mockPut).toHaveBeenCalledWith("/api/config", { app: { apiMode: "openai" } }, {
      signal: undefined,
      headers: undefined,
    });
  });
  it("generateImages 应把停止信号传给请求层", async () => {
    const response = { created: 1, data: [{ b64_json: "abc" }] };
    const controller = new AbortController();
    mockPost.mockResolvedValue({ data: response });

    const { generateImages } = await import("@/lib/api");
    const payload = {
      model: "gpt-image-2",
      prompt: "A cancellable image request",
      n: 1,
    };

    await expect(generateImages(payload as any, { signal: controller.signal })).resolves.toEqual(response);
    expect(mockPost).toHaveBeenCalledWith("/v1/images/generations", payload, { signal: controller.signal });
  });
});
