import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import {
  extractAvailableModels,
  getSettings,
  healthCheck,
  listModels,
  normalizeModelState,
  updateSettings as updateBackendSettings,
  withTimeout,
  type ConfigPayload,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  DEFAULT_IMAGE_MODEL,
  CODESONLINE_BASE_URL,
  OPENROUTER_BASE_URL,
  BLT_BASE_URL,
  getProviderDefaults,
  inferProviderFromSettings,
  type ImageProvider,
  type ProviderApiKeys,
  useSettings,
} from "@/store/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const themeOptions = [
  { value: "light", label: "浅色模式", Icon: Sun },
  { value: "dark", label: "暗色模式", Icon: Moon },
  { value: "system", label: "跟随系统", Icon: Monitor },
] as const;

const providerOptions = [
  { value: "codesonline", label: "CodesOnline" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "blt", label: "BLT" },
] as const;

const BACKEND_REQUEST_TIMEOUT_SECONDS = 900;

interface BackendSettingsPayload {
  app: {
    provider: ImageProvider;
    apiKey: string;
    providerApiKeys?: ProviderApiKeys;
    baseUrl: string;
    imageFormat: "url" | "b64_json";
    authKey: string;
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
  };
  proxy: {
    enabled: boolean;
    url: string;
  };
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeBackendRequestTimeout(value: unknown): number {
  const parsed = numberValue(value, BACKEND_REQUEST_TIMEOUT_SECONDS);
  return parsed >= BACKEND_REQUEST_TIMEOUT_SECONDS ? parsed : BACKEND_REQUEST_TIMEOUT_SECONDS;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function formatRefreshTime(value: number | null): string {
  if (!value) return "尚未刷新";
  return new Date(value).toLocaleString();
}

function isBackendUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();
  return [
    "请求超时",
    "network error",
    "failed to fetch",
    "err_connection_refused",
    "econnrefused",
    "无法连接本地服务",
    "本地服务未就绪",
    "无法连接本地后端服务",
  ].some((keyword) => lower.includes(keyword.toLowerCase()));
}

async function waitForBackendReady(maxAttempts = 4, delayMs = 600): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await withTimeout(healthCheck(), 4000);
      return;
    } catch (error) {
      lastError = error;
      if (!isBackendUnavailableError(error) || attempt === maxAttempts - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (lastError) {
    throw lastError;
  }
}

function deriveDraftState(args: {
  defaultModel: string;
  builtinModels: string[];
  remoteModels: string[];
  importedModels: string[];
  backendConfig: ConfigPayload | null;
}) {
  return normalizeModelState({
    builtins: args.builtinModels,
    remote: args.remoteModels,
    imported: args.importedModels,
    backend: args.backendConfig,
    selected: args.defaultModel,
  });
}

interface SettingsDraftSnapshot {
  provider: ImageProvider;
  apiKey: string;
  providerApiKeys: ProviderApiKeys;
  baseUrl: string;
  proxyEnabled: boolean;
  proxyUrl: string;
  defaultModel: string;
  theme: "light" | "dark" | "system";
  tone: "warm" | "dark";
}

function hasMeaningfulDraftChanges(args: {
  open: boolean;
  provider: ImageProvider;
  apiKey: string;
  providerApiKeys: ProviderApiKeys;
  baseUrl: string;
  proxyEnabled: boolean;
  proxyUrl: string;
  defaultModel: string;
  theme: "light" | "dark" | "system";
  tone: "warm" | "dark";
  settings: SettingsDraftSnapshot;
}): boolean {
  if (!args.open) return false;
  return args.provider !== args.settings.provider
    || args.apiKey !== args.settings.apiKey
    || JSON.stringify(args.providerApiKeys) !== JSON.stringify(args.settings.providerApiKeys)
    || args.baseUrl !== args.settings.baseUrl
    || args.proxyEnabled !== args.settings.proxyEnabled
    || args.proxyUrl !== args.settings.proxyUrl
    || args.defaultModel !== args.settings.defaultModel
    || args.theme !== args.settings.theme
    || args.tone !== args.settings.tone;
}

function providerApiKeysEqual(a: ProviderApiKeys, b: ProviderApiKeys): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function setProviderApiKeysIfChanged(
  setter: Dispatch<SetStateAction<ProviderApiKeys>>,
  next: ProviderApiKeys,
): void {
  setter((current) => (providerApiKeysEqual(current, next) ? current : next));
}

function providerSummary(provider: ImageProvider): string {
  const defaults = getProviderDefaults(provider);
  if (provider === "openrouter") {
    return `${defaults.defaultModel} · 备用中转源 · ${defaults.baseUrl}`;
  }
  if (provider === "blt") {
    return `${defaults.defaultModel} · 2K 优先 · ${defaults.baseUrl}`;
  }
  return `${defaults.defaultModel} · 默认网关 · ${defaults.baseUrl}`;
}

function yesNo(value: boolean | undefined): string {
  if (value === undefined) return "读取中";
  return value ? "是" : "否";
}

function segmentedButtonClass(active: boolean) {
  return cn("settings-demo-segment", active && "settings-demo-segment--active");
}

function providerLabel(provider: ImageProvider): string {
  return providerOptions.find((item) => item.value === provider)?.label ?? provider;
}

interface SettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDrawer({ open, onOpenChange }: SettingsDrawerProps) {
  const settings = useSettings();
  const [provider, setProvider] = useState<ImageProvider>(inferProviderFromSettings(settings));
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [providerApiKeys, setProviderApiKeys] = useState<ProviderApiKeys>(() => ({
    ...settings.providerApiKeys,
    [inferProviderFromSettings(settings)]: settings.apiKey || settings.providerApiKeys[inferProviderFromSettings(settings)] || "",
  }));
  const [showApiKey, setShowApiKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [proxyEnabled, setProxyEnabled] = useState(settings.proxyEnabled);
  const [proxyUrl, setProxyUrl] = useState(settings.proxyUrl);
  const [defaultModel, setDefaultModel] = useState(settings.defaultModel);
  const [theme, setTheme] = useState(settings.theme);
  const [tone, setTone] = useState<"warm" | "dark">(settings.tone ?? "warm");
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [backendConfig, setBackendConfig] = useState<ConfigPayload | null>(null);

  const refreshDraftFromStore = useCallback(() => {
    const nextProvider = inferProviderFromSettings(settings);
    const nextProviderApiKeys = {
      ...settings.providerApiKeys,
      [nextProvider]: settings.apiKey || settings.providerApiKeys[nextProvider] || "",
    };
    setProvider(nextProvider);
    setProviderApiKeysIfChanged(setProviderApiKeys, nextProviderApiKeys);
    setApiKey(nextProviderApiKeys[nextProvider] || "");
    setBaseUrl(settings.baseUrl);
    setProxyEnabled(settings.proxyEnabled);
    setProxyUrl(settings.proxyUrl);
    setDefaultModel(settings.defaultModel);
    setTheme(settings.theme);
    setTone(settings.tone ?? "warm");
  }, [
    settings.provider,
    settings.apiKey,
    settings.providerApiKeys,
    settings.baseUrl,
    settings.defaultModel,
    settings.proxyEnabled,
    settings.proxyUrl,
    settings.theme,
    settings.tone,
  ]);

  useEffect(() => {
    if (!open) return;
    if (hasMeaningfulDraftChanges({
      open,
      provider,
      apiKey,
      providerApiKeys,
      baseUrl,
      proxyEnabled,
      proxyUrl,
      defaultModel,
      theme,
      tone,
      settings,
    })) {
      return;
    }
    refreshDraftFromStore();
  }, [
    apiKey,
    providerApiKeys,
    baseUrl,
    defaultModel,
    open,
    provider,
    proxyEnabled,
    proxyUrl,
    refreshDraftFromStore,
    settings,
    theme,
    tone,
  ]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      try {
        const config = await getSettings();
        if (cancelled) return;

        setBackendConfig(config);
        const backendProvider = inferProviderFromSettings({
          provider: config.app.provider ?? settings.provider,
          baseUrl: config.app.baseUrl ?? settings.baseUrl,
          defaultModel: config.chatgpt?.model ?? settings.defaultModel,
          apiKey: config.app.apiKey ?? settings.apiKey,
        });
        const backendProviderApiKeys = {
          ...settings.providerApiKeys,
          ...(config.app.providerApiKeys ?? {}),
          [backendProvider]: config.app.apiKey || config.app.providerApiKeys?.[backendProvider] || settings.apiKey,
        };
        setProvider(backendProvider);
        setProviderApiKeysIfChanged(setProviderApiKeys, backendProviderApiKeys);
        setApiKey(backendProviderApiKeys[backendProvider] || "");
        setBaseUrl(config.app.baseUrl || getProviderDefaults(backendProvider).baseUrl);
        const backendModels = extractAvailableModels(config);
        const mergedRemoteModels = backendModels.length > 0
          ? Array.from(new Set([...settings.remoteModels, ...backendModels]))
          : settings.remoteModels;

        if (!settings.defaultModel) {
          const normalized = deriveDraftState({
            defaultModel: settings.defaultModel,
            builtinModels: settings.builtinModels,
            remoteModels: mergedRemoteModels,
            importedModels: [],
            backendConfig: config,
          });
          setDefaultModel(normalized.selectedModel);
        }
      } catch {
        // ignore read failure in drawer preload
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, settings.builtinModels, settings.defaultModel, settings.providerApiKeys, settings.remoteModels]);

  useEffect(() => {
    if (!baseUrl || baseUrl === "https://api.openai.com") {
      setBaseUrl(getProviderDefaults(provider).baseUrl);
    }
    const providerDefaults = getProviderDefaults(provider);
    const isAvailableModel = defaultModel === providerDefaults.defaultModel || settings.remoteModels.includes(defaultModel);
    if (!isAvailableModel) {
      setDefaultModel(providerDefaults.defaultModel);
    }
  }, [baseUrl, defaultModel, provider, settings.remoteModels]);

  const capabilities = backendConfig?.capabilities;
  const configuredProviderCount = providerOptions.filter((item) => {
    const key = item.value === provider ? apiKey : providerApiKeys[item.value];
    return Boolean(key?.trim());
  }).length;
  const activeProviderLabel = providerLabel(provider);
  const providerKeyStatus = (itemProvider: ImageProvider) => {
    const key = itemProvider === provider ? apiKey : providerApiKeys[itemProvider];
    return key?.trim() ? "已配置" : "未启用";
  };
  const saveStateText = saving
    ? "保存中"
    : saveStatus === "success"
      ? "成功"
      : saveStatus === "error"
        ? "失败"
        : "待保存";

  const availableModels = useMemo(() => {
    return normalizeModelState({
      builtins: settings.builtinModels,
      remote: settings.remoteModels,
      imported: [],
      backend: backendConfig,
      selected: defaultModel,
    }).availableModels;
  }, [backendConfig, defaultModel, settings.builtinModels, settings.remoteModels]);

  const handleProviderChange = (nextProvider: ImageProvider) => {
    const defaults = getProviderDefaults(nextProvider);
    const currentKeys = { ...providerApiKeys, [provider]: apiKey };
    setProvider(nextProvider);
    setProviderApiKeys(currentKeys);
    setApiKey(currentKeys[nextProvider] || "");
    setBaseUrl(defaults.baseUrl);
    setDefaultModel(defaults.defaultModel);
    setShowApiKey(false);
    setSaveStatus("idle");
    setSaveMessage("");
  };

  const refreshModels = async () => {
    setRefreshingModels(true);
    try {
      const [modelsResponse, latestConfig] = await Promise.allSettled([listModels(), getSettings()]);

      let refreshedModels = settings.remoteModels;
      let nextBackendConfig = backendConfig;

      if (modelsResponse.status === "fulfilled") {
        refreshedModels = modelsResponse.value.data.map((item) => item.id);
        settings.setRemoteModels(refreshedModels);
      }

      if (latestConfig.status === "fulfilled") {
        nextBackendConfig = latestConfig.value;
        setBackendConfig(latestConfig.value);
        const backendModels = extractAvailableModels(latestConfig.value);
        if (backendModels.length > 0) {
          refreshedModels = [...refreshedModels, ...backendModels];
          settings.syncAvailableModels(refreshedModels, defaultModel);
        }
      }

      const normalized = deriveDraftState({
        defaultModel,
        builtinModels: settings.builtinModels,
        remoteModels: refreshedModels,
        importedModels: [],
        backendConfig: nextBackendConfig,
      });
      setDefaultModel(normalized.selectedModel);

      if (modelsResponse.status === "rejected" && latestConfig.status === "rejected") {
        throw new Error("模型刷新失败，请检查服务配置或网络连接");
      }

      toast.success("模型列表已刷新");
    } catch (error) {
      const message = error instanceof Error ? error.message : "模型刷新失败";
      toast.error(message);
    } finally {
      setRefreshingModels(false);
    }
  };

  const save = async () => {
    const normalized = deriveDraftState({
      defaultModel,
      builtinModels: settings.builtinModels,
      remoteModels: settings.remoteModels,
      importedModels: [],
      backendConfig,
    });
    const selectedModel = normalized.selectedModel;
    const nextProviderApiKeys = {
      ...providerApiKeys,
      [provider]: apiKey,
    };

    setSaving(true);
    setSaveStatus("idle");
    setSaveMessage("正在保存...");
    settings.updateSettings({
      provider,
      apiKey,
      providerApiKeys: nextProviderApiKeys,
      authKey: "",
      baseUrl,
      proxyEnabled,
      proxyUrl,
      defaultModel: selectedModel,
      importedModels: [],
      availableModels: normalized.availableModels,
      theme,
      tone,
    });

    const payload: BackendSettingsPayload = {
      app: {
        provider,
        apiKey,
        providerApiKeys: nextProviderApiKeys,
        baseUrl,
        imageFormat: "url",
        authKey: "",
      },
      server: {
        host: "0.0.0.0",
        port: 8080,
      },
      chatgpt: {
        model: selectedModel,
        sseTimeout: 300,
        requestTimeout: BACKEND_REQUEST_TIMEOUT_SECONDS,
        availableModels: normalized.availableModels,
      },
      proxy: {
        enabled: proxyEnabled,
        url: proxyUrl,
      },
    };

    try {
      await waitForBackendReady();
      const currentSettings = objectValue((await withTimeout(getSettings(), 8000)) as unknown);
      const currentApp = objectValue(currentSettings.app);
      const currentServer = objectValue(currentSettings.server);
      const currentChatgpt = objectValue(currentSettings.chatgpt);

      payload.app.imageFormat = stringValue(currentApp.imageFormat, "url") as "url" | "b64_json";
      payload.server.host = stringValue(currentServer.host, "0.0.0.0");
      payload.server.port = numberValue(currentServer.port, 8080);
      payload.chatgpt.sseTimeout = numberValue(currentChatgpt.sseTimeout, 300);
      payload.chatgpt.requestTimeout = normalizeBackendRequestTimeout(currentChatgpt.requestTimeout);

      const next = await withTimeout(updateBackendSettings(payload), 8000);
      setBackendConfig(next);
      const backendModels = extractAvailableModels(next);
      settings.syncAvailableModels(
        backendModels.length > 0 ? backendModels : normalized.availableModels,
        selectedModel,
      );
      setDefaultModel(selectedModel);
      setSaveStatus("success");
      setSaveMessage("设置已保存，模型与能力信息已刷新。");
      toast.success("设置已保存");
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法同步到后端";
      if (isBackendUnavailableError(error)) {
        setSaveStatus("success");
        setSaveMessage("本地设置已保存；后端未连通，暂未完成后端同步。若需后端配置生效，请恢复 backend 后重试保存。");
        toast.success("本地设置已保存（后端未同步）");
      } else {
        setSaveStatus("error");
        setSaveMessage(`设置保存失败：${message}`);
        toast.error(`设置保存失败：${message}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    settings.resetSettings();
    setProvider("codesonline");
    setApiKey("");
    setProviderApiKeys({});
    setBaseUrl(CODESONLINE_BASE_URL);
    setProxyEnabled(false);
    setProxyUrl("");
    setDefaultModel(DEFAULT_IMAGE_MODEL);
    setTheme("system");
    setTone("warm");
    setShowApiKey(false);
    setSaveStatus("idle");
    setSaveMessage("");
    toast.success("设置已重置");
  };

  const copyCurrentApiKey = async () => {
    if (!apiKey.trim()) {
      toast.info("当前 provider 尚未填写 API Key");
      return;
    }
    if (!globalThis.navigator?.clipboard?.writeText) {
      toast.error("当前环境不支持复制");
      return;
    }
    try {
      await globalThis.navigator.clipboard.writeText(apiKey);
      toast.success("API Key 已复制");
    } catch {
      toast.error("API Key 复制失败");
    }
  };

  const previewProviders = providerOptions.map((item) => {
    const itemProvider = item.value;
    const configured = providerKeyStatus(itemProvider) === "已配置";
    return {
      ...item,
      configured,
      active: itemProvider === provider,
      summary: providerSummary(itemProvider),
      status: providerKeyStatus(itemProvider),
    };
  });

  const stateCards = [
    {
      label: "读取配置",
      value: backendConfig ? "已完成" : "读取中",
      tone: backendConfig ? "ok" : "pending",
    },
    {
      label: "刷新模型",
      value: refreshingModels ? "刷新中" : formatRefreshTime(settings.lastModelRefreshAt),
      tone: refreshingModels ? "pending" : settings.lastModelRefreshAt ? "ok" : "idle",
    },
    {
      label: "本地保存",
      value: saveStatus === "error" ? "失败" : saveStatus === "success" || saving ? saveStateText : "待保存",
      tone: saveStatus === "error" ? "danger" : saveStatus === "success" || saving ? "ok" : "idle",
    },
    {
      label: "后端同步",
      value: saveMessage.includes("后端未连通")
        ? "未连通"
        : saveStatus === "error"
          ? "失败"
          : saveStatus === "success"
            ? "已同步"
            : "待同步",
      tone: saveMessage.includes("后端未连通")
        ? "danger"
        : saveStatus === "error"
          ? "danger"
          : saveStatus === "success"
            ? "ok"
            : "idle",
    },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        modal={false}
        closeClassName="top-7 right-7"
        style={{ width: "min(100vw, 1080px)" }}
        className="settings-demo-shell right-0 left-auto top-0 h-[100vh] max-w-[1080px] translate-x-0 translate-y-0 rounded-none border-l border-border p-0 data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-top-0"
      >
        <DialogHeader className="settings-demo-header border-b border-border px-7 py-6 text-left">
          <DialogTitle className="flex items-center gap-3 text-xl font-semibold">
            <Settings2 className="h-5 w-5 text-primary" />
            应用设置
          </DialogTitle>
          <DialogDescription className="max-w-[72ch] text-sm text-muted-foreground">
            对齐最终 UI Demo，保留统一的 provider 切换、单输入框 API Key、色调切换和本地优先保存逻辑。
          </DialogDescription>
        </DialogHeader>

        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="settings-demo-layout flex-1 overflow-y-auto px-6 py-5">
            <section className="settings-demo-preview">
              <div className="settings-demo-preview-head">
                <div className="space-y-2">
                  <p className="settings-demo-kicker">Provider 健康状态</p>
                  <h3>当前链路总览</h3>
                  <p>
                    左侧只读显示当前链路、能力和保存状态；右侧只编辑当前 provider，
                    切换时自动带出本机保存的 Key、Base URL 和默认模型。
                  </p>
                </div>
                <span className="settings-demo-pill">{configuredProviderCount} 个可用</span>
              </div>

              <div className="settings-demo-provider-list">
                {previewProviders.map((item) => (
                  <article
                    key={item.value}
                    className={cn(
                      "settings-demo-provider-card",
                      item.active && "settings-demo-provider-card--active",
                      !item.configured && "settings-demo-provider-card--missing",
                    )}
                  >
                    <div className="settings-demo-provider-card-head">
                      <strong>{item.label}</strong>
                      <span className="settings-demo-mini-pill">{item.status}</span>
                    </div>
                    <p>{item.summary}</p>
                  </article>
                ))}
              </div>

              <section className="settings-demo-panel">
                <div className="settings-demo-panel-head">
                  <div>
                    <h4>设置链路状态</h4>
                    <p>保存、刷新与同步的即时反馈。</p>
                  </div>
                  <span>{activeProviderLabel}</span>
                </div>
                <div className="settings-demo-state-grid">
                  {stateCards.map((card) => (
                    <div key={card.label} className="settings-demo-state-card">
                      <span className={cn("settings-demo-state-dot", `settings-demo-state-dot--${card.tone}`)} />
                      <strong>{card.label}</strong>
                      <span>{card.value}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="settings-demo-panel">
                <div className="settings-demo-panel-head">
                  <div>
                    <h4>当前能力摘要</h4>
                    <p>基于当前 provider 与后端能力回显。</p>
                  </div>
                  <span>{providerSummary(provider)}</span>
                </div>
                <div className="settings-demo-summary-grid">
                  <div className="settings-demo-summary-card">
                    <span>支持生成</span>
                    <strong>{yesNo(capabilities?.supportsGenerate)}</strong>
                  </div>
                  <div className="settings-demo-summary-card">
                    <span>多图参考</span>
                    <strong>{yesNo(capabilities?.supportsMultiImageReference)}</strong>
                  </div>
                  <div className="settings-demo-summary-card settings-demo-summary-card--wide">
                    <span>支持分辨率</span>
                    <strong>{capabilities?.resolutions?.join("、") || "读取中"}</strong>
                  </div>
                  <div className="settings-demo-summary-card settings-demo-summary-card--wide">
                    <span>当前色调 / 主题</span>
                    <strong>{tone === "dark" ? "暗色" : "暖色"} / {themeOptions.find((item) => item.value === theme)?.label ?? theme}</strong>
                  </div>
                </div>
              </section>
            </section>

            <aside className="settings-demo-drawer">
              <div className="settings-demo-drawer-head">
                <div className="space-y-1">
                  <p className="settings-demo-kicker">当前编辑</p>
                  <h3>{activeProviderLabel} 配置</h3>
                </div>
                <span className="settings-demo-pill">{saveStateText}</span>
              </div>

              <div className="settings-demo-form-stack">
                <section className="settings-demo-field">
                  <label className="settings-demo-field-label">
                    <span>界面色调</span>
                    <span>全局预览</span>
                  </label>
                  <div className="settings-demo-segmented">
                    <button type="button" aria-pressed={tone === "dark"} onClick={() => setTone("dark")} className={segmentedButtonClass(tone === "dark")}>
                      <Moon className="h-4 w-4" />
                      暗色
                    </button>
                    <button type="button" aria-pressed={tone === "warm"} onClick={() => setTone("warm")} className={segmentedButtonClass(tone === "warm")}>
                      <Sun className="h-4 w-4" />
                      暖色
                    </button>
                  </div>
                  <p className="settings-demo-help">暖色使用浅米白网格，暗色使用科技控制台。</p>
                </section>

                <section className="settings-demo-field">
                  <label className="settings-demo-field-label">
                    <span>Provider</span>
                    <span>切换会自动带出本机保存的对应 Key</span>
                  </label>
                  <div className="settings-demo-segmented settings-demo-segmented--triple">
                    {providerOptions.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        data-testid={`settings-provider-${item.value}`}
                        aria-pressed={provider === item.value}
                        onClick={() => handleProviderChange(item.value)}
                        className={segmentedButtonClass(provider === item.value)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="settings-demo-field">
                  <label className="settings-demo-field-label">
                    <span>API Key</span>
                    <div className="settings-demo-inline-actions">
                      <button
                        type="button"
                        aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                        className="settings-demo-ghost-button"
                        onClick={() => setShowApiKey((current) => !current)}
                      >
                        {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {showApiKey ? "隐藏" : "显示原文"}
                      </button>
                      <button
                        type="button"
                        aria-label="复制 API Key"
                        className="settings-demo-ghost-button"
                        onClick={() => void copyCurrentApiKey()}
                        disabled={!apiKey.trim()}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        复制
                      </button>
                    </div>
                  </label>
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(event) => {
                      const value = event.target.value;
                      setApiKey(value);
                      setProviderApiKeys((current) => ({ ...current, [provider]: value }));
                    }}
                    className="settings-demo-input"
                    placeholder="sk-..."
                  />
                  <p className="settings-demo-help">
                    只展示一个输入框。切换 provider 后会自动显示该 provider 已保存在本机的 Key。
                  </p>
                </section>

                <section className="settings-demo-field">
                  <label className="settings-demo-field-label">
                    <span>Base URL</span>
                    <span>{provider === "openrouter" ? "备用中转源" : provider === "blt" ? "BLT 专用源" : "默认网关"}</span>
                  </label>
                  <Input
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    className="settings-demo-input"
                    placeholder={CODESONLINE_BASE_URL}
                  />
                  <p className="settings-demo-help">
                    {provider === "openrouter"
                      ? `OpenRouter 默认地址：${OPENROUTER_BASE_URL}`
                      : provider === "blt"
                        ? `BLT 默认地址：${BLT_BASE_URL}`
                        : "默认使用 CodesOnline 网关地址，也可替换为自建兼容服务。"}
                  </p>
                </section>

                <section className="settings-demo-field">
                  <label className="settings-demo-field-label">
                    <span>模型</span>
                    <button
                      type="button"
                      className="settings-demo-ghost-button"
                      onClick={() => void refreshModels()}
                      disabled={refreshingModels}
                    >
                      {refreshingModels ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      刷新模型
                    </button>
                  </label>
                  <Select value={defaultModel} onValueChange={(value) => setDefaultModel(value)}>
                    <SelectTrigger data-testid="settings-default-model-trigger" className="settings-demo-input">
                      <SelectValue placeholder="请选择默认模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableModels.map((model) => (
                        <SelectItem key={model} value={model}>{model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="settings-demo-caption-row">
                    <span>内置 {settings.builtinModels.length}</span>
                    <span>刷新 {settings.remoteModels.length}</span>
                    <span>最近刷新：{formatRefreshTime(settings.lastModelRefreshAt)}</span>
                  </div>
                </section>

                <section className="settings-demo-field">
                  <label className="settings-demo-field-label">
                    <span>主题模式</span>
                    <span>不影响色调，只影响系统跟随策略</span>
                  </label>
                  <div className="settings-demo-segmented settings-demo-segmented--triple">
                    {themeOptions.map(({ value, label, Icon }) => (
                      <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)} className={segmentedButtonClass(theme === value)}>
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="settings-demo-field">
                  <label className="settings-demo-field-label">
                    <span>网络代理</span>
                    <span>按需开启</span>
                  </label>
                  <button
                    type="button"
                    aria-pressed={proxyEnabled}
                    onClick={() => setProxyEnabled((current) => !current)}
                    className={segmentedButtonClass(proxyEnabled)}
                  >
                    <Palette className="h-4 w-4" />
                    {proxyEnabled ? "代理已启用" : "代理未启用"}
                  </button>
                  {proxyEnabled ? (
                    <Input
                      value={proxyUrl}
                      onChange={(event) => setProxyUrl(event.target.value)}
                      className="settings-demo-input"
                      placeholder="http://127.0.0.1:7890"
                    />
                  ) : null}
                </section>

                <section className="settings-demo-field">
                  <label className="settings-demo-field-label">
                    <span>能力摘要</span>
                    <span>当前 provider</span>
                  </label>
                  <div className="settings-demo-summary-grid">
                    <div className="settings-demo-summary-card">
                      <span>生成</span>
                      <strong>{yesNo(capabilities?.supportsGenerate)}</strong>
                    </div>
                    <div className="settings-demo-summary-card">
                      <span>多图参考</span>
                      <strong>{yesNo(capabilities?.supportsMultiImageReference)}</strong>
                    </div>
                    <div className="settings-demo-summary-card settings-demo-summary-card--wide">
                      <span>分辨率</span>
                      <strong>{capabilities?.resolutions?.join("、") || "读取中"}</strong>
                    </div>
                  </div>
                </section>
              </div>
            </aside>
          </div>

          <div className="settings-demo-savebar">
            <div className="settings-demo-savecopy">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>正在保存当前设置...</span>
                </>
              ) : saveStatus === "success" ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>{saveMessage || "设置已保存"}</span>
                </>
              ) : saveStatus === "error" ? (
                <>
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="text-destructive">{saveMessage}</span>
                </>
              ) : (
                <>
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <span>保存会先写入本机，再尝试同步到后端；失败信息会直接保留在这里。</span>
                </>
              )}
            </div>
            <div className="settings-demo-saveactions">
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="h-4 w-4" />
                重置
              </Button>
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
