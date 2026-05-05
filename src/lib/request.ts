import axios from "axios";
import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8080";
const BACKEND_URL_CANDIDATES = [
  import.meta.env.VITE_BACKEND_URL,
  DEFAULT_BACKEND_URL,
].filter((value): value is string => Boolean(value));

let cachedBaseURL: string | null = null;
let pendingBaseURLPromise: Promise<string> | null = null;
const client: AxiosInstance = axios.create();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//.test(value);
}

function normalizeBaseURL(value: string): string {
  return value.replace(/\/+$/, "");
}

async function canReach(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${normalizeBaseURL(url)}/health`, {
      method: "GET",
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

function isLikelyDevServerOrigin(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["5173", "4173"].includes(parsed.port);
  } catch {
    return false;
  }
}

async function resolveElectronBaseURL(): Promise<string | null> {
  if (!window.electronAPI) {
    return null;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const origin = await window.electronAPI.getBackendOrigin?.();
    if (origin && isHttpUrl(origin)) {
      const normalizedOrigin = normalizeBaseURL(origin);
      if (await canReach(normalizedOrigin)) {
        return normalizedOrigin;
      }
    }

    const port = await window.electronAPI.getBackendPort();
    if (port) {
      const url = `http://127.0.0.1:${port}`;
      if (await canReach(url)) {
        return url;
      }
    }
    await delay(300);
  }

  return null;
}

async function resolveFallbackBaseURL(): Promise<string> {
  if (typeof window !== "undefined" && window.location.protocol.startsWith("http")) {
    const origin = normalizeBaseURL(window.location.origin);
    if (!isLikelyDevServerOrigin(origin) && (await canReach(origin))) {
      return origin;
    }
  }

  for (const candidate of BACKEND_URL_CANDIDATES) {
    if (isHttpUrl(candidate)) {
      const normalizedCandidate = normalizeBaseURL(candidate);
      if (await canReach(normalizedCandidate)) {
        return normalizedCandidate;
      }
    }
  }

  return normalizeBaseURL(BACKEND_URL_CANDIDATES[0] ?? DEFAULT_BACKEND_URL);
}

async function getBaseURL(): Promise<string> {
  if (cachedBaseURL && (await canReach(cachedBaseURL))) {
    return cachedBaseURL;
  }

  if (pendingBaseURLPromise) {
    return pendingBaseURLPromise;
  }

  pendingBaseURLPromise = (async () => {
    const electronBaseURL = await resolveElectronBaseURL();
    const nextBaseURL = electronBaseURL ?? (await resolveFallbackBaseURL());
    cachedBaseURL = nextBaseURL;
    pendingBaseURLPromise = null;
    return nextBaseURL;
  })().catch((error) => {
    pendingBaseURLPromise = null;
    throw error;
  });

  return pendingBaseURLPromise;
}

function selectAuthToken(state?: { authKey?: string; apiKey?: string }): string | undefined {
  if (!state) return undefined;
  const apiKey = state.apiKey?.trim();
  if (apiKey) return apiKey;
  return undefined;
}

async function resolveRequestAuthToken(state?: { authKey?: string; apiKey?: string }): Promise<string | undefined> {
  try {
    const electronToken = await window.electronAPI?.getBackendAuthToken?.();
    if (electronToken?.trim()) {
      return electronToken.trim();
    }
  } catch {
    // fall back to user-provided tokens below
  }

  return selectAuthToken(state);
}

function responseErrorText(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const nestedError = record.error;
    if (typeof nestedError === "string" && nestedError.trim()) return nestedError;
    if (nestedError && typeof nestedError === "object") {
      const nestedRecord = nestedError as Record<string, unknown>;
      for (const key of ["message", "detail", "code"]) {
        const nestedValue = nestedRecord[key];
        if (typeof nestedValue === "string" && nestedValue.trim()) return nestedValue;
      }
    }
    for (const key of ["message", "detail"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return null;
}

export function getReadableErrorMessage(error: AxiosError | Error | unknown, fallback = "请求失败"): string {
  if (axios.isAxiosError(error)) {
    const responseMessage = responseErrorText(error.response?.data);
    if (responseMessage) {
      return humanizeMessage(responseMessage);
    }
    if (error.message) {
      return humanizeMessage(error.message);
    }
  }
  if (error instanceof Error) {
    return humanizeMessage(error.message || fallback);
  }
  return fallback;
}

function humanizeMessage(message: string): string {
  const raw = message.trim();
  const lower = raw.toLowerCase();
  if (!raw) return "请求失败";
  if (lower.includes("network error")) {
    return window.electronAPI
      ? "无法连接本地后端服务，请确认应用后端已启动"
      : "网络连接失败，请确认 backend 已启动或服务地址可访问";
  }
  if (lower.includes("invalid api key") || lower.includes("401") || lower.includes("unauthorized")) {
    return "鉴权失败，请检查 API Key";
  }
  if (lower.includes("context deadline exceeded") || lower.includes("client.timeout exceeded") || lower.includes("awaiting headers")) {
    return "生成请求等待超时，请稍后重试；如果多次出现，请检查上游服务或代理。";
  }
  if (lower.includes("unexpected eof")) {
    return "上游生图连接中断，请稍后重试；如果连续出现，请降低张数或检查网络代理。";
  }
  if (lower.includes("native upscale is not supported") || lower.includes("unSUPPORTED_upscale".toLowerCase())) {
    return "当前模型或模式不支持放大，请切换支持放大的服务后再试";
  }
  if (lower.includes("prompt is required")) {
    return "请输入提示词后再提交";
  }
  if (lower.includes("at least one image is required")) {
    return "请至少选择 1 张图片";
  }
  return raw;
}

function getRequestErrorMessage(error: AxiosError): string {
  if (error.response) {
    return getReadableErrorMessage(error, error.message);
  }

  return window.electronAPI
    ? "本地服务未就绪，请稍候重试；若持续失败，请重启应用"
    : "无法连接本地服务，请确认 backend 已启动，或通过 VITE_BACKEND_URL 指定可用地址";
}

export { getBaseURL, resolveElectronBaseURL, resolveFallbackBaseURL, selectAuthToken };

client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const baseURL = await getBaseURL();
  config.baseURL = baseURL;

  const raw = localStorage.getItem("gimg-settings");
  if (raw) {
    try {
      const settings = JSON.parse(raw) as {
        state?: { authKey?: string; apiKey?: string };
      };
      const token = await resolveRequestAuthToken(settings?.state);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // ignore malformed settings
    }
  } else {
    const token = await resolveRequestAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.code === "ERR_CANCELED" || error.message?.toLowerCase() === "canceled") {
      return Promise.reject(error);
    }

    if (error.response?.status === 401) {
      error.message = getRequestErrorMessage(error);
      return Promise.reject(error);
    }

    if (error.response) {
      error.message = getRequestErrorMessage(error);
    }

    if (!error.response) {
      cachedBaseURL = null;
      error.message = getRequestErrorMessage(error);
    }

    return Promise.reject(error);
  },
);

export default client;
