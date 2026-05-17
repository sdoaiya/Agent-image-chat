import { describe, expect, it, beforeEach, vi } from "vitest";
import type { AxiosError } from "axios";

const {
  mockGetSettings,
  mockHealthCheck,
  mockUpdateBackendSettings,
  updateStoreMock,
  syncAvailableModelsMock,
  resetSettingsMock,
  addImportedModelsMock,
  setRemoteModelsMock,
  toastSuccessMock,
  toastErrorMock,
  toastInfoMock,
  mockSettingsState,
} = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
  mockHealthCheck: vi.fn(),
  mockUpdateBackendSettings: vi.fn(),
  updateStoreMock: vi.fn(),
  syncAvailableModelsMock: vi.fn(),
  resetSettingsMock: vi.fn(),
  addImportedModelsMock: vi.fn(() => []),
  setRemoteModelsMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastInfoMock: vi.fn(),
  mockSettingsState: {
    provider: "codesonline" as const,
    apiKey: "store-api-key",
    providerApiKeys: { codesonline: "store-api-key" },
    authKey: "store-auth-key",
    baseUrl: "https://image.codesonline.dev",
    proxyEnabled: false,
    proxyUrl: "",
    defaultModel: "gpt-image-2",
    builtinModels: ["gpt-image-2"],
    remoteModels: [],
    importedModels: [],
    availableModels: ["gpt-image-2"],
    lastModelRefreshAt: null,
    defaultN: 1,
    defaultQuality: "auto" as const,
    theme: "system" as const,
    tone: "warm" as const,
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
    info: toastInfoMock,
  },
}));

vi.mock("@/lib/api", () => ({
  extractAvailableModels: vi.fn(() => ["server-model"]),
  getSettings: mockGetSettings,
  healthCheck: mockHealthCheck,
  listModels: vi.fn(),
  normalizeModelState: vi.fn(({ builtins = [], remote = [], imported = [], selected = "" }) => ({
    availableModels: Array.from(new Set([...builtins, ...remote, ...imported, selected].filter(Boolean))),
    selectedModel: selected || builtins[0] || remote[0] || imported[0] || "gpt-image-2",
  })),
  updateSettings: mockUpdateBackendSettings,
  withTimeout: vi.fn((promise: Promise<unknown>) => promise),
}));

vi.mock("@/store/settings", async () => {
  const actual = await vi.importActual<typeof import("@/store/settings")>("@/store/settings");

  return {
    ...actual,
    useSettings: Object.assign(() => ({
      ...mockSettingsState,
      updateSettings: updateStoreMock,
      syncAvailableModels: syncAvailableModelsMock,
      resetSettings: resetSettingsMock,
      addImportedModels: addImportedModelsMock,
      setRemoteModels: setRemoteModelsMock,
    }), {
      ...mockSettingsState,
      updateSettings: updateStoreMock,
      syncAvailableModels: syncAvailableModelsMock,
      resetSettings: resetSettingsMock,
      addImportedModels: addImportedModelsMock,
      setRemoteModels: setRemoteModelsMock,
    }),
  };
});

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettingsDrawer } from "@/components/settings/settings-drawer";

describe("settings drawer save chain regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      configurable: true,
      value: vi.fn(() => false),
    });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.assign(mockSettingsState, {
      provider: "codesonline",
      apiKey: "store-api-key",
      providerApiKeys: { codesonline: "store-api-key" },
      authKey: "store-auth-key",
      baseUrl: "https://image.codesonline.dev",
      proxyEnabled: false,
      proxyUrl: "",
      defaultModel: "gpt-image-2",
      builtinModels: ["gpt-image-2"],
      remoteModels: [],
      importedModels: [],
      availableModels: ["gpt-image-2"],
      lastModelRefreshAt: null,
      defaultN: 1,
      defaultQuality: "auto",
      theme: "system",
      tone: "warm",
    });
    mockGetSettings.mockResolvedValue({
      app: {
        provider: "codesonline",
        apiKey: "server-api-key",
        providerApiKeys: { codesonline: "server-api-key" },
        baseUrl: "https://image.codesonline.dev",
        imageFormat: "url",
        authKey: "server-auth-key",
      },
      server: { host: "0.0.0.0", port: 8080 },
      chatgpt: {
        model: "gpt-image-2",
        sseTimeout: 300,
        requestTimeout: 900,
        availableModels: ["gpt-image-2"],
      },
      proxy: { enabled: false, url: "" },
      capabilities: undefined,
    });
    mockHealthCheck.mockResolvedValue({ status: "ok" });
    mockUpdateBackendSettings.mockResolvedValue({
      app: {
        provider: "codesonline",
        apiKey: "server-api-key",
        providerApiKeys: { codesonline: "server-api-key" },
        baseUrl: "https://image.codesonline.dev",
        imageFormat: "url",
        authKey: "server-auth-key",
      },
      server: { host: "0.0.0.0", port: 8080 },
      chatgpt: {
        model: "gpt-image-2",
        sseTimeout: 300,
        requestTimeout: 900,
        availableModels: ["gpt-image-2"],
      },
      proxy: { enabled: false, url: "" },
      capabilities: undefined,
    });
  });

  it("设置页不展示本地鉴权、导入模型、默认张数和默认质量入口", async () => {
    render(<SettingsDrawer open onOpenChange={() => {}} />);

    await screen.findByText("应用设置");

    expect(screen.queryByText("本地鉴权 Key")).toBeNull();
    expect(screen.queryByText("导入模型")).toBeNull();
    expect(screen.queryByText("默认生成张数")).toBeNull();
    expect(screen.queryByText("质量")).toBeNull();
  });

  it("API Key 默认隐藏，点击按钮后可显示原文并再次隐藏", async () => {
    render(<SettingsDrawer open onOpenChange={() => {}} />);

    await screen.findByText("应用设置");

    expect(screen.getAllByPlaceholderText("sk-...")).toHaveLength(1);
    const apiKeyInput = screen.getByPlaceholderText("sk-...") as HTMLInputElement;
    expect(apiKeyInput.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "显示 API Key" }));
    expect(apiKeyInput.type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "隐藏 API Key" }));
    expect(apiKeyInput.type).toBe("password");
  });

  it("色调切换不移除原有主题模式选择", async () => {
    render(<SettingsDrawer open onOpenChange={() => {}} />);

    await screen.findByText("应用设置");

    fireEvent.click(screen.getByRole("button", { name: "暗色" }));
    fireEvent.click(screen.getByRole("button", { name: "跟随系统" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(updateStoreMock).toHaveBeenCalledWith(expect.objectContaining({
      tone: "dark",
      theme: "system",
    })));
  });

  it("设置抽屉关闭按钮应比默认弹窗位置更低", async () => {
    render(<SettingsDrawer open onOpenChange={() => {}} />);

    await screen.findByText("应用设置");

    expect(screen.getByRole("button", { name: "Close" }).className).toContain("top-7");
  });

  it("保存时应先写入本地 store，再将统一 generations 所需关键字段透传到后端 payload", async () => {
    render(<SettingsDrawer open onOpenChange={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("sk-..."), { target: { value: "new-api-key" } });
    fireEvent.change(screen.getByDisplayValue("https://image.codesonline.dev"), { target: { value: "https://example.gateway.dev" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(mockUpdateBackendSettings).toHaveBeenCalledTimes(1));

    expect(mockHealthCheck).toHaveBeenCalled();
    expect(updateStoreMock).toHaveBeenCalledWith(expect.objectContaining({
      provider: "codesonline",
      apiKey: "new-api-key",
      providerApiKeys: expect.objectContaining({ codesonline: "new-api-key" }),
      authKey: "",
      baseUrl: "https://example.gateway.dev",
      defaultModel: "gpt-image-2",
      importedModels: [],
    }));
    const storePayload = updateStoreMock.mock.calls[0]?.[0];
    expect(storePayload).not.toHaveProperty("defaultN");
    expect(storePayload).not.toHaveProperty("defaultQuality");

    const backendPayload = mockUpdateBackendSettings.mock.calls[0]?.[0];
    expect(backendPayload).toEqual(expect.objectContaining({
      app: expect.objectContaining({
        provider: "codesonline",
        apiKey: "new-api-key",
        providerApiKeys: expect.objectContaining({ codesonline: "new-api-key" }),
        baseUrl: "https://example.gateway.dev",
        authKey: "",
      }),
      chatgpt: expect.objectContaining({
        model: "gpt-image-2",
        requestTimeout: 900,
        availableModels: expect.arrayContaining(["gpt-image-2"]),
      }),
      proxy: expect.objectContaining({
        enabled: false,
        url: "",
      }),
    }));

    expect(backendPayload.app).not.toHaveProperty("apiMode");
    expect(backendPayload.app).not.toHaveProperty("accountId");
    expect(backendPayload.chatgpt).not.toHaveProperty("freeImageRoute");
    expect(backendPayload.chatgpt).not.toHaveProperty("paidImageRoute");
    expect(backendPayload.chatgpt).not.toHaveProperty("freeImageModel");
    expect(backendPayload.chatgpt).not.toHaveProperty("paidImageModel");
    expect(backendPayload.proxy).not.toHaveProperty("mode");

    expect(await screen.findByText("设置已保存，模型与能力信息已刷新。", { exact: false })).toBeTruthy();
    expect(toastSuccessMock).toHaveBeenCalledWith("设置已保存");
  });

  it("打开设置时若本地已选自定义模型，不应被后端返回的其他模型覆盖", async () => {
    Object.assign(mockSettingsState, {
      provider: "codesonline",
      defaultModel: "custom-model",
      remoteModels: ["server-model", "custom-model"],
      availableModels: ["gpt-image-2", "server-model", "custom-model"],
      importedModels: [],
    });

    render(<SettingsDrawer open onOpenChange={() => {}} />);

    await screen.findByText("应用设置");
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(updateStoreMock).toHaveBeenCalled());
    expect(updateStoreMock).toHaveBeenCalledWith(expect.objectContaining({
      provider: "codesonline",
      defaultModel: "custom-model",
    }));
  });

  it("切换到 openrouter 时应自动带出 provider 默认 baseUrl 和默认模型，并保存到本地", async () => {
    render(<SettingsDrawer open onOpenChange={() => {}} />);

    await screen.findByText("应用设置");

    fireEvent.click(screen.getByTestId("settings-provider-openrouter"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("https://openrouter.ai/api/v1")).toBeTruthy();
    });

    expect(screen.getByTestId("settings-default-model-trigger").textContent).toContain("openai/gpt-5.4-image-2");

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(updateStoreMock).toHaveBeenCalledWith(expect.objectContaining({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      defaultModel: "openai/gpt-5.4-image-2",
    })));
  });

  it("切换到 BLT 时应自动带出 BLT baseUrl 和 gpt-image-2，并保存到本地", async () => {
    render(<SettingsDrawer open onOpenChange={() => {}} />);

    await screen.findByText("应用设置");

    fireEvent.click(screen.getByTestId("settings-provider-blt"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("https://api.bltcy.ai")).toBeTruthy();
    });

    expect(screen.getByTestId("settings-default-model-trigger").textContent).toContain("gpt-image-2");

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(updateStoreMock).toHaveBeenCalledWith(expect.objectContaining({
      provider: "blt",
      baseUrl: "https://api.bltcy.ai",
      defaultModel: "gpt-image-2",
    })));
  });

  it("设置已保存为 openrouter 时，重新打开应回显 provider、baseUrl 和默认模型", async () => {
    Object.assign(mockSettingsState, {
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      defaultModel: "openai/gpt-5.4-image-2",
      builtinModels: ["gpt-image-2"],
      remoteModels: ["openai/gpt-5.4-image-2"],
      availableModels: ["gpt-image-2", "openai/gpt-5.4-image-2"],
    });
    mockGetSettings.mockResolvedValueOnce({
      app: {
        provider: "openrouter",
        apiKey: "server-api-key",
        providerApiKeys: { openrouter: "server-api-key" },
        baseUrl: "https://openrouter.ai/api/v1",
        imageFormat: "url",
        authKey: "server-auth-key",
      },
      server: { host: "0.0.0.0", port: 8080 },
      chatgpt: {
        model: "openai/gpt-5.4-image-2",
        sseTimeout: 300,
        requestTimeout: 900,
        availableModels: ["openai/gpt-5.4-image-2"],
      },
      proxy: { enabled: false, url: "" },
      capabilities: undefined,
    });

    render(<SettingsDrawer open onOpenChange={() => {}} />);

    await screen.findByText("应用设置");

    await waitFor(() => {
      expect(screen.getByTestId("settings-provider-openrouter").getAttribute("aria-pressed")).toBe("true");
      expect((screen.getByPlaceholderText("https://image.codesonline.dev") as HTMLInputElement).value).toBe("https://openrouter.ai/api/v1");
      expect(screen.getByTestId("settings-default-model-trigger").textContent).toContain("openai/gpt-5.4-image-2");
    });
  });

  it("切换 provider 时只显示一个 API Key 输入框，并回填该 provider 已保存的 Key", async () => {
    Object.assign(mockSettingsState, {
      provider: "codesonline",
      apiKey: "codes-key",
      providerApiKeys: {
        codesonline: "codes-key",
        openrouter: "or-key",
        blt: "blt-key",
      },
    });
    mockGetSettings.mockResolvedValueOnce({
      app: {
        provider: "codesonline",
        apiKey: "codes-key",
        providerApiKeys: {
          codesonline: "codes-key",
          openrouter: "or-key",
          blt: "blt-key",
        },
        baseUrl: "https://image.codesonline.dev",
        imageFormat: "url",
        authKey: "server-auth-key",
      },
      server: { host: "0.0.0.0", port: 8080 },
      chatgpt: {
        model: "gpt-image-2",
        sseTimeout: 300,
        requestTimeout: 900,
        availableModels: ["gpt-image-2"],
      },
      proxy: { enabled: false, url: "" },
      capabilities: undefined,
    });

    render(<SettingsDrawer open onOpenChange={() => {}} />);

    await screen.findByText("应用设置");
    await waitFor(() => expect((screen.getByPlaceholderText("sk-...") as HTMLInputElement).value).toBe("codes-key"));
    expect(screen.getAllByPlaceholderText("sk-...")).toHaveLength(1);

    fireEvent.click(screen.getByTestId("settings-provider-openrouter"));

    await waitFor(() => expect((screen.getByPlaceholderText("sk-...") as HTMLInputElement).value).toBe("or-key"));
    expect(screen.getAllByPlaceholderText("sk-...")).toHaveLength(1);
  });

  it("后端 provider 字段陈旧但 Base URL 是 BLT 时，重新打开应回显 BLT", async () => {
    Object.assign(mockSettingsState, {
      provider: "codesonline",
      baseUrl: "https://image.codesonline.dev",
      defaultModel: "gpt-image-2",
    });
    mockGetSettings.mockResolvedValueOnce({
      app: {
        provider: "codesonline",
        apiKey: "server-api-key",
        providerApiKeys: { blt: "server-api-key" },
        baseUrl: "https://api.bltcy.ai",
        imageFormat: "url",
        authKey: "server-auth-key",
      },
      server: { host: "0.0.0.0", port: 8080 },
      chatgpt: {
        model: "gpt-image-2",
        sseTimeout: 300,
        requestTimeout: 900,
        availableModels: ["gpt-image-2"],
      },
      proxy: { enabled: false, url: "" },
      capabilities: undefined,
    });

    render(<SettingsDrawer open onOpenChange={() => {}} />);

    await screen.findByText("应用设置");

    await waitFor(() => {
      expect(screen.getByTestId("settings-provider-blt").getAttribute("aria-pressed")).toBe("true");
      expect((screen.getByPlaceholderText("https://image.codesonline.dev") as HTMLInputElement).value).toBe("https://api.bltcy.ai");
    });
  });

  it("后端短暂未就绪时应先重试 health，再继续同步保存", async () => {
    mockHealthCheck
      .mockRejectedValueOnce(new Error("ERR_CONNECTION_REFUSED"))
      .mockRejectedValueOnce(new Error("ERR_CONNECTION_REFUSED"))
      .mockResolvedValue({ status: "ok" });

    render(<SettingsDrawer open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(mockUpdateBackendSettings).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(mockHealthCheck).toHaveBeenCalledTimes(3);
    expect(toastSuccessMock).toHaveBeenCalledWith("设置已保存");
  });

  it("后端不可达时应明确提示仅本地保存成功", async () => {
    mockGetSettings.mockRejectedValue(new Error("ERR_CONNECTION_REFUSED"));

    render(<SettingsDrawer open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText((content) => content.includes("本地设置已保存；后端未连通"))).toBeTruthy();
    expect(mockUpdateBackendSettings).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith("本地设置已保存（后端未同步）");
  });

  it("后端返回业务错误时应保持失败态，不得降级成保存成功", async () => {
    const error = new Error("Internal Server Error") as AxiosError;
    mockUpdateBackendSettings.mockRejectedValueOnce(error);

    render(<SettingsDrawer open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("设置保存失败：Internal Server Error")).toBeTruthy();
    expect(toastErrorMock).toHaveBeenCalledWith("设置保存失败：Internal Server Error");
  });
});
