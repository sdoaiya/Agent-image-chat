import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Key,
  Loader2,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
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
import {
  DEFAULT_IMAGE_MODEL,
  CODESONLINE_BASE_URL,
  useSettings,
} from "@/store/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const themeIcons: Record<string, React.ReactNode> = {
  light: <Sun className="h-4 w-4" />,
  dark: <Moon className="h-4 w-4" />,
  system: <Monitor className="h-4 w-4" />,
};

const BACKEND_REQUEST_TIMEOUT_SECONDS = 300;

interface BackendSettingsPayload {
  app: {
    apiKey: string;
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
  apiKey: string;
  baseUrl: string;
  proxyEnabled: boolean;
  proxyUrl: string;
  defaultModel: string;
  theme: "light" | "dark" | "system";
}

function hasMeaningfulDraftChanges(args: {
  open: boolean;
  apiKey: string;
  baseUrl: string;
  proxyEnabled: boolean;
  proxyUrl: string;
  defaultModel: string;
  theme: "light" | "dark" | "system";
  settings: SettingsDraftSnapshot;
}): boolean {
  if (!args.open) return false;
  return args.apiKey !== args.settings.apiKey
    || args.baseUrl !== args.settings.baseUrl
    || args.proxyEnabled !== args.settings.proxyEnabled
    || args.proxyUrl !== args.settings.proxyUrl
    || args.defaultModel !== args.settings.defaultModel
    || args.theme !== args.settings.theme;
}

interface SettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDrawer({ open, onOpenChange }: SettingsDrawerProps) {
  const settings = useSettings();
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [proxyEnabled, setProxyEnabled] = useState(settings.proxyEnabled);
  const [proxyUrl, setProxyUrl] = useState(settings.proxyUrl);
  const [defaultModel, setDefaultModel] = useState(settings.defaultModel);
  const [theme, setTheme] = useState(settings.theme);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [backendConfig, setBackendConfig] = useState<ConfigPayload | null>(null);

  const refreshDraftFromStore = useCallback(() => {
    setApiKey(settings.apiKey);
    setBaseUrl(settings.baseUrl);
    setProxyEnabled(settings.proxyEnabled);
    setProxyUrl(settings.proxyUrl);
    setDefaultModel(settings.defaultModel);
    setTheme(settings.theme);
  }, [
    settings.apiKey,
    settings.baseUrl,
    settings.defaultModel,
    settings.proxyEnabled,
    settings.proxyUrl,
    settings.theme,
  ]);

  useEffect(() => {
    if (!open) return;
    if (hasMeaningfulDraftChanges({
      open,
      apiKey,
      baseUrl,
      proxyEnabled,
      proxyUrl,
      defaultModel,
      theme,
      settings,
    })) {
      return;
    }
    refreshDraftFromStore();
  }, [
    apiKey,
    baseUrl,
    defaultModel,
    open,
    proxyEnabled,
    proxyUrl,
    refreshDraftFromStore,
    settings,
    theme,
  ]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      try {
        const config = await getSettings();
        if (cancelled) return;

        setBackendConfig(config);
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
  }, [open, settings.builtinModels, settings.defaultModel, settings.remoteModels]);

  useEffect(() => {
    if (!baseUrl || baseUrl === "https://api.openai.com") {
      setBaseUrl(CODESONLINE_BASE_URL);
    }
    if (defaultModel !== "gpt-image-2" && !settings.remoteModels.includes(defaultModel)) {
      setDefaultModel("gpt-image-2");
    }
  }, [baseUrl, defaultModel, settings.remoteModels]);

  const capabilities = backendConfig?.capabilities;

  const availableModels = useMemo(() => {
    return normalizeModelState({
      builtins: settings.builtinModels,
      remote: settings.remoteModels,
      imported: [],
      backend: backendConfig,
      selected: defaultModel,
    }).availableModels;
  }, [backendConfig, defaultModel, settings.builtinModels, settings.remoteModels]);

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

    setSaving(true);
    setSaveStatus("idle");
    setSaveMessage("正在保存...");
    settings.updateSettings({
      apiKey,
      authKey: "",
      baseUrl,
      proxyEnabled,
      proxyUrl,
      defaultModel: selectedModel,
      importedModels: [],
      availableModels: normalized.availableModels,
      theme,
    });

    const payload: BackendSettingsPayload = {
      app: {
        apiKey,
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
    setApiKey("");
    setBaseUrl(CODESONLINE_BASE_URL);
    setProxyEnabled(false);
    setProxyUrl("");
    setDefaultModel(DEFAULT_IMAGE_MODEL);
    setTheme("system");
    toast.success("设置已重置");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent modal={false} className="right-0 left-auto top-0 h-[100vh] w-full max-w-[520px] translate-x-0 translate-y-0 rounded-none border-l border-border p-0 data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-top-0">
        <DialogHeader className="border-b border-border px-6 py-5 text-left">
          <DialogTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-primary" /> 应用设置</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            当前仅保留统一生图链路配置：保存后先写本地，再尝试同步到本地后端。
          </DialogDescription>
        </DialogHeader>
        <div className="flex h-full flex-col overflow-hidden">
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
            <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><Key className="h-4 w-4 text-primary" /> API 配置</div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Base URL</label>
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={CODESONLINE_BASE_URL} />
                <p className="text-[11px] text-muted-foreground">默认使用 CodesOnline 网关地址，也可替换为自建兼容服务。</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">API Key</label>
                <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={proxyEnabled} onChange={(e) => setProxyEnabled(e.target.checked)} className="rounded accent-primary" /> 启用代理
                </label>
                {proxyEnabled && <Input value={proxyUrl} onChange={(e) => setProxyUrl(e.target.value)} placeholder="http://127.0.0.1:7890" />}
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="h-4 w-4 text-primary" /> 生成偏好</div>
              <div className="space-y-3 rounded-xl border border-border bg-background px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="text-sm font-medium">默认模型</label>
                  <Button type="button" size="sm" variant="outline" onClick={() => void refreshModels()} disabled={refreshingModels}>
                    {refreshingModels ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} 刷新模型
                  </Button>
                </div>
                <Select value={defaultModel} onValueChange={(value) => {
                  setDefaultModel(value);
                }}>
                  <SelectTrigger data-testid="settings-default-model-trigger">
                    <SelectValue placeholder="请选择默认模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model} value={model}>{model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>内置 {settings.builtinModels.length}</span>
                  <span>·</span>
                  <span>刷新 {settings.remoteModels.length}</span>
                  <span>·</span>
                  <span>最近刷新：{formatRefreshTime(settings.lastModelRefreshAt)}</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">主题</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["light", "dark", "system"] as const).map((value) => (
                    <button key={value} type="button" onClick={() => setTheme(value)} className={`rounded-xl border px-3 py-2 text-sm ${theme === value ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}>
                      <span className="inline-flex items-center gap-2">{themeIcons[value]} {value}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-border bg-card p-4 text-sm">
              <div className="flex items-center gap-2 font-semibold text-foreground"><Palette className="h-4 w-4 text-primary" /> 当前能力摘要</div>
              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div className="rounded-xl border border-border bg-background px-3 py-3">支持生成：<span className="text-foreground">{capabilities?.supportsGenerate ? "是" : "读取中"}</span></div>
                <div className="rounded-xl border border-border bg-background px-3 py-3">多图参考：<span className="text-foreground">{capabilities?.supportsMultiImageReference ? "是" : "否"}</span></div>
                <div className="col-span-2 rounded-xl border border-border bg-background px-3 py-3">支持分辨率：<span className="text-foreground">{capabilities?.resolutions?.join("、") || "读取中"}</span></div>
              </div>
            </section>
          </div>

          <div className="border-t border-border bg-card/80 px-6 py-4">
            <div className="mb-3 flex items-center gap-2 text-sm">
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin text-primary" /><span>保存中...</span></>
              ) : saveStatus === "success" ? (
                <><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span>{saveMessage || "设置已保存"}</span></>
              ) : saveStatus === "error" ? (
                <><AlertCircle className="h-4 w-4 text-destructive" /><span className="text-destructive">{saveMessage}</span></>
              ) : (
                <span className="text-muted-foreground">修改后点击保存，会立即反馈结果。</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" onClick={handleReset}><RotateCcw className="h-4 w-4" /> 重置</Button>
              <Button onClick={() => void save()} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
