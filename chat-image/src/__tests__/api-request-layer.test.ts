import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPost = vi.fn();
const mockGet = vi.fn();
const mockPut = vi.fn();

type MockConfigPayload = {
  app: {
    apiMode: string;
    apiKey: string;
    baseUrl: string;
    imageFormat: string;
    authKey: string;
    migrationNote?: string;
  };
  server: {
    host: string;
    port: number;
  };
  chatgpt: {
    model: string;
    sseTimeout: number;
    requestTimeout: number;
    availableModels?: string[];
    migrationNote?: string;
  };
  proxy: {
    enabled: boolean;
    url: string;
    mode: string;
  };
};

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

  it("generateImages 应透传生成参数到 /v1/images/generations", async () => {
    const response = { created: 1, data: [{ b64_json: "abc" }] };
    mockPost.mockResolvedValue({ data: response });

    const { generateImages } = await import("@/lib/api");
    const payload = {
      model: "gpt-image-2",
      prompt: "test prompt",
      n: 2,
      quality: "high" as const,
      size: "1024x1024",
      response_format: "b64_json" as const,
      style: "vivid" as const,
      reference_images: ["ZmFrZS1iYXNlNjQ="],
    };

    await expect(generateImages(payload)).resolves.toEqual(response);
    expect(mockPost).toHaveBeenCalledWith("/v1/images/generations", payload);
  });

  it("模型与配置接口应命中正确路径，且 /api/config 使用单模型 schema", async () => {
    const modelsResponse = { object: "list", data: [{ id: "gpt-image-2" }] };
    const configResponse: MockConfigPayload = {
      app: {
        apiMode: "codesonline",
        apiKey: "",
        baseUrl: "https://image.codesonline.dev/v1",
        imageFormat: "url",
        authKey: "",
      },
      server: { host: "0.0.0.0", port: 8080 },
      chatgpt: {
        model: "gpt-image-2",
        sseTimeout: 300,
        requestTimeout: 30,
        availableModels: ["gpt-image-2"],
        migrationNote: "normalized",
      },
      proxy: { enabled: false, url: "", mode: "fixed" },
    };
    mockGet
      .mockResolvedValueOnce({ data: modelsResponse })
      .mockResolvedValueOnce({ data: configResponse });
    mockPut.mockResolvedValue({ data: configResponse });

    const { getSettings, listModels, updateSettings } = await import("@/lib/api");
    await expect(listModels()).resolves.toEqual(modelsResponse);
    const fetched = await getSettings();
    await expect(updateSettings({ app: { apiMode: "codesonline" } })).resolves.toEqual(configResponse);

    expect(fetched.chatgpt).toMatchObject({
      model: "gpt-image-2",
      sseTimeout: 300,
      requestTimeout: 30,
      availableModels: ["gpt-image-2"],
    });
    expect(fetched.chatgpt).not.toHaveProperty("freeImageRoute");
    expect(fetched.chatgpt).not.toHaveProperty("paidImageRoute");
    expect(fetched.chatgpt).not.toHaveProperty("freeImageModel");
    expect(fetched.chatgpt).not.toHaveProperty("paidImageModel");
    expect(fetched.app).not.toHaveProperty("accountId");

    expect(mockGet).toHaveBeenNthCalledWith(1, "/v1/models");
    expect(mockGet).toHaveBeenNthCalledWith(2, "/api/config");
    expect(mockPut).toHaveBeenCalledWith("/api/config", { app: { apiMode: "codesonline" } });
  });
});
