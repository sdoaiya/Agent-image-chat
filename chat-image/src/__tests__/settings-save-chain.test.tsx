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
    apiKey: "store-api-key",
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
    Object.assign(mockSettingsState, {
      apiKey: "store-api-key",
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
    });
    mockGetSettings.mockResolvedValue({
      app: {
        apiKey: "server-api-key",
        baseUrl: "https://image.codesonline.dev",
        imageFormat: "url",
        authKey: "server-auth-key",
      },
      server: { host: "0.0.0.0", port: 8080 },
      chatgpt: {
        model: "gpt-image-2",
        sseTimeout: 300,
        requestTimeout: 30,
        availableModels: ["gpt-image-2"],
      },
      proxy: { enabled: false, url: "" },
      capabilities: undefined,
    });
    mockHealthCheck.mockResolvedValue({ status: "ok" });
    mockUpdateBackendSettings.mockResolvedValue({
      app: {
        apiKey: "server-api-key",
        baseUrl: "https://image.codesonline.dev",
        imageFormat: "url",
        authKey: "server-auth-key",
      },
      server: { host: "0.0.0.0", port: 8080 },
      chatgpt: {
        model: "gpt-image-2",
        sseTimeout: 300,
        requestTimeout: 30,
        availableModels: ["gpt-image-2"],
      },
      proxy: { enabled: false, url: "" },
      capabilities: undefined,
    });
  });

  it("保存时应先写入本地 store，再将统一 generations 所需关键字段透传到后端 payload", async () => {
    Object.assign(mockSettingsState, {
      importedModels: ["legacy-imported-model"],
      availableModels: ["gpt-image-2", "legacy-imported-model"],
    });

    render(<SettingsDrawer open onOpenChange={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("sk-..."), { target: { value: "new-api-key" } });
    fireEvent.change(screen.getByDisplayValue("https://image.codesonline.dev"), { target: { value: "https://example.gateway.dev" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(mockUpdateBackendSettings).toHaveBeenCalledTimes(1));

    expect(mockHealthCheck).toHaveBeenCalled();
    expect(updateStoreMock).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "new-api-key",
      authKey: "",
      baseUrl: "https://example.gateway.dev",
      defaultModel: "gpt-image-2",
      importedModels: [],
    }));

    const backendPayload = mockUpdateBackendSettings.mock.calls[0]?.[0];
    expect(backendPayload).toEqual(expect.objectContaining({
      app: expect.objectContaining({
        apiKey: "new-api-key",
        baseUrl: "https://example.gateway.dev",
        authKey: "",
      }),
      chatgpt: expect.objectContaining({
        model: "gpt-image-2",
        requestTimeout: 300,
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

  it("打开设置时若本地已选导入模型，应随导入列表废弃回落到内置模型", async () => {
    Object.assign(mockSettingsState, {
      defaultModel: "custom-model",
      remoteModels: ["server-model"],
      availableModels: ["gpt-image-2", "server-model", "custom-model"],
      importedModels: ["custom-model"],
    });

    render(<SettingsDrawer open onOpenChange={() => {}} />);

    await screen.findByText("应用设置");
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(updateStoreMock).toHaveBeenCalled());
    expect(updateStoreMock).toHaveBeenCalledWith(expect.objectContaining({
      defaultModel: "gpt-image-2",
      importedModels: [],
    }));
  });

  it("设置抽屉不再显示本地鉴权 Key、导入模型、默认生成张数和默认质量控件", async () => {
    render(<SettingsDrawer open onOpenChange={() => {}} />);

    await screen.findByText("应用设置");

    expect(screen.queryByText("本地鉴权 Key")).toBeNull();
    expect(screen.queryByText("导入模型")).toBeNull();
    expect(screen.queryByText("默认生成张数")).toBeNull();
    expect(screen.queryByText("质量")).toBeNull();
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
