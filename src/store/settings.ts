import { create } from "zustand";
import { persist } from "zustand/middleware";

export const BUILTIN_IMAGE_MODELS = ["gpt-image-2"] as const;
export const DEFAULT_IMAGE_MODEL = BUILTIN_IMAGE_MODELS[0];
export const CODESONLINE_BASE_URL = "https://image.codesonline.dev";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_DEFAULT_IMAGE_MODEL = "openai/gpt-5.4-image-2";
export const BLT_BASE_URL = "https://api.bltcy.ai";

export type ImageProvider = "codesonline" | "openrouter" | "blt";
export type ProviderApiKeys = Partial<Record<ImageProvider, string>>;

function normalizeProvider(provider: unknown): ImageProvider {
  if (provider === "blt") return "blt";
  return provider === "openrouter" ? "openrouter" : "codesonline";
}

export function inferProviderFromSettings(args: { provider?: unknown; baseUrl?: unknown; defaultModel?: unknown; apiKey?: unknown }): ImageProvider {
  const baseUrl = typeof args.baseUrl === "string" ? args.baseUrl.trim() : "";
  const defaultModel = typeof args.defaultModel === "string" ? args.defaultModel.trim() : "";
  const apiKey = typeof args.apiKey === "string" ? args.apiKey.trim().toLowerCase() : "";
  if (baseUrl === BLT_BASE_URL) {
    return "blt";
  }
  if (baseUrl === OPENROUTER_BASE_URL || defaultModel === OPENROUTER_DEFAULT_IMAGE_MODEL) {
    return "openrouter";
  }
  if (apiKey.startsWith("sk-or-v1-")) return "openrouter";
  if (apiKey.startsWith("sk-blt")) return "blt";
  if (args.provider === "blt") return "blt";
  if (args.provider === "openrouter") return "openrouter";
  return "codesonline";
}

export function getProviderDefaults(provider: unknown): { provider: ImageProvider; baseUrl: string; defaultModel: string } {
  const normalized = normalizeProvider(provider);
  if (normalized === "openrouter") {
    return {
      provider: normalized,
      baseUrl: OPENROUTER_BASE_URL,
      defaultModel: OPENROUTER_DEFAULT_IMAGE_MODEL,
    };
  }
  if (normalized === "blt") {
    return {
      provider: normalized,
      baseUrl: BLT_BASE_URL,
      defaultModel: DEFAULT_IMAGE_MODEL,
    };
  }
  return {
    provider: normalized,
    baseUrl: CODESONLINE_BASE_URL,
    defaultModel: DEFAULT_IMAGE_MODEL,
  };
}

function normalizeModelValue(model: unknown): string {
  return typeof model === "string" ? model.trim() : "";
}

function uniqueModels(models: unknown[]): string[] {
  const seen = new Set<string>();
  return models
    .map((model) => normalizeModelValue(model))
    .filter((model) => {
      if (!model) return false;
      const key = model.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeDefaultModel(model: unknown, availableModels: unknown[]): string {
  const normalized = normalizeModelValue(model);
  const merged = uniqueModels(availableModels);
  if (normalized) return normalized;
  if (merged.length > 0) return merged[0]!;
  return DEFAULT_IMAGE_MODEL;
}

function mergeModelPools(...pools: unknown[][]): string[] {
  return uniqueModels(pools.flat());
}

export type ImageQuality = "auto" | "low" | "medium" | "high" | "standard" | "hd";

export function getQualityOptionsByApiMode(_apiMode?: unknown): ImageQuality[] {
  return ["auto", "low", "medium", "high"];
}

export function normalizeQualityForApiMode(_apiMode: unknown, quality: unknown): ImageQuality {
  const options = getQualityOptionsByApiMode();
  const normalized = typeof quality === "string" ? quality : "";
  return (options.find((item) => item === normalized) ?? options[0] ?? "standard") as ImageQuality;
}

export interface Settings {
  provider: ImageProvider;
  apiKey: string;
  providerApiKeys: ProviderApiKeys;
  authKey: string;
  baseUrl: string;
  proxyEnabled: boolean;
  proxyUrl: string;
  defaultModel: string;
  builtinModels: string[];
  remoteModels: string[];
  importedModels: string[];
  availableModels: string[];
  lastModelRefreshAt: number | null;
  defaultN: number;
  defaultQuality: ImageQuality;
  theme: "light" | "dark" | "system";
  tone: "warm" | "dark";
}

interface SettingsActions {
  updateSettings: (partial: Partial<Settings>) => void;
  setRemoteModels: (models: string[], refreshedAt?: number | null) => void;
  setImportedModels: (models: string[]) => void;
  addImportedModels: (models: string[]) => string[];
  syncAvailableModels: (models: string[], preferredModel?: string) => void;
  resetSettings: () => void;
}

const defaults: Settings = {
  provider: "codesonline",
  apiKey: "",
  providerApiKeys: {},
  authKey: "",
  baseUrl: CODESONLINE_BASE_URL,
  proxyEnabled: false,
  proxyUrl: "",
  defaultModel: DEFAULT_IMAGE_MODEL,
  builtinModels: [...BUILTIN_IMAGE_MODELS],
  remoteModels: [],
  importedModels: [],
  availableModels: [...BUILTIN_IMAGE_MODELS],
  lastModelRefreshAt: null,
  defaultN: 1,
  defaultQuality: "auto",
  theme: "system",
  tone: "warm",
};

function deriveModelState(state: Pick<Settings, "builtinModels" | "remoteModels" | "importedModels" | "defaultModel"> & Partial<Pick<Settings, "availableModels">>) {
  const builtinModels = uniqueModels(state.builtinModels);
  const remoteModels = uniqueModels(state.remoteModels);
  const importedModels = uniqueModels(state.importedModels);
  const availableModels = mergeModelPools(builtinModels, remoteModels, importedModels, state.availableModels ?? [], [state.defaultModel]);
  const defaultModel = normalizeDefaultModel(state.defaultModel, availableModels);

  return {
    builtinModels,
    remoteModels,
    importedModels,
    availableModels,
    defaultModel,
  };
}

function normalizeProviderApiKeys(value: unknown): ProviderApiKeys {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  return {
    codesonline: typeof raw.codesonline === "string" ? raw.codesonline : undefined,
    openrouter: typeof raw.openrouter === "string" ? raw.openrouter : undefined,
    blt: typeof raw.blt === "string" ? raw.blt : undefined,
  };
}

function syncProviderApiKeys(state: Pick<Settings, "provider" | "apiKey" | "providerApiKeys">, partial: Partial<Settings>, nextProvider: ImageProvider): ProviderApiKeys {
  const providerApiKeys = {
    ...normalizeProviderApiKeys(state.providerApiKeys),
    ...normalizeProviderApiKeys(partial.providerApiKeys),
  };
  const currentProvider = normalizeProvider(state.provider);
  if (typeof partial.apiKey === "string") {
    providerApiKeys[nextProvider] = partial.apiKey;
  } else if (state.apiKey && nextProvider === currentProvider) {
    providerApiKeys[currentProvider] = state.apiKey;
  }
  return providerApiKeys;
}

export const useSettings = create<Settings & SettingsActions>()(
  persist(
    (set) => ({
      ...defaults,
      updateSettings: (partial) => set((state) => {
        const nextProvider = normalizeProvider(partial.provider ?? state.provider);
        const providerApiKeys = syncProviderApiKeys(state, partial, nextProvider);
        const apiKey = typeof partial.apiKey === "string" ? partial.apiKey : (providerApiKeys[nextProvider] ?? state.apiKey);
        const next = { ...state, ...partial, provider: nextProvider, apiKey, providerApiKeys, authKey: "", importedModels: [] };
        return {
          ...next,
          defaultQuality: normalizeQualityForApiMode(nextProvider, next.defaultQuality),
          ...deriveModelState(next),
        };
      }),
      setRemoteModels: (models, refreshedAt = Date.now()) => set((state) => {
        const next = { ...state, remoteModels: uniqueModels(models), lastModelRefreshAt: refreshedAt };
        return { ...next, ...deriveModelState(next) };
      }),
      setImportedModels: (models) => set((state) => {
        const next = { ...state, importedModels: uniqueModels(models) };
        return { ...next, ...deriveModelState(next) };
      }),
      addImportedModels: (models) => {
        const incoming = uniqueModels(models);
        let added: string[] = [];
        set((state) => {
          const existingKeys = new Set(state.importedModels.map((model) => model.toLowerCase()));
          added = incoming.filter((model) => !existingKeys.has(model.toLowerCase()));
          const next = { ...state, importedModels: [...state.importedModels, ...added] };
          return { ...next, ...deriveModelState(next) };
        });
        return added;
      },
      syncAvailableModels: (models, preferredModel) => set((state) => {
        const next = {
          ...state,
          remoteModels: uniqueModels(models),
          lastModelRefreshAt: Date.now(),
          defaultModel: normalizeModelValue(preferredModel) || state.defaultModel,
        };
        return { ...next, ...deriveModelState(next) };
      }),
      resetSettings: () => set(defaults),
    }),
    {
      name: "gimg-settings",
      partialize: (state) => ({
        provider: state.provider,
        apiKey: state.apiKey,
        providerApiKeys: state.providerApiKeys,
        authKey: "",
        baseUrl: state.baseUrl,
        proxyEnabled: state.proxyEnabled,
        proxyUrl: state.proxyUrl,
        defaultModel: state.defaultModel,
        builtinModels: state.builtinModels,
        remoteModels: state.remoteModels,
        importedModels: [],
        availableModels: state.availableModels,
        lastModelRefreshAt: state.lastModelRefreshAt,
        defaultN: state.defaultN,
        defaultQuality: state.defaultQuality,
        theme: state.theme,
        tone: state.tone,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<Settings>;
        const provider = inferProviderFromSettings({
          provider: persisted.provider ?? currentState.provider,
          baseUrl: persisted.baseUrl ?? currentState.baseUrl,
          defaultModel: persisted.defaultModel ?? currentState.defaultModel,
          apiKey: persisted.apiKey ?? currentState.apiKey,
        });
        const providerApiKeys = normalizeProviderApiKeys(persisted.providerApiKeys);
        const legacyApiKey = typeof persisted.apiKey === "string" ? persisted.apiKey : currentState.apiKey;
        if (legacyApiKey && !providerApiKeys[provider]) {
          providerApiKeys[provider] = legacyApiKey;
        }
        const providerDefaults = getProviderDefaults(provider);
        const builtinModels = uniqueModels(persisted.builtinModels ?? currentState.builtinModels);
        const remoteModels = uniqueModels(persisted.remoteModels ?? currentState.remoteModels);
        const persistedDefaultModel = normalizeModelValue(persisted.defaultModel);
        const defaultModelCandidates = mergeModelPools(builtinModels, remoteModels);
        const defaultModel = persistedDefaultModel
          && defaultModelCandidates.some((model) => model.toLowerCase() === persistedDefaultModel.toLowerCase())
          ? persistedDefaultModel
          : providerDefaults.defaultModel;
        const tone: Settings["tone"] = persisted.tone === "dark" ? "dark" : "warm";
        const merged: Settings & SettingsActions = {
          ...currentState,
          ...persisted,
          provider,
          providerApiKeys,
          apiKey: providerApiKeys[provider] ?? legacyApiKey ?? "",
          authKey: "",
          baseUrl: normalizeModelValue(persisted.baseUrl) || providerDefaults.baseUrl,
          builtinModels,
          remoteModels,
          importedModels: [],
          availableModels: [],
          defaultModel,
          tone,
        };
        return {
          ...merged,
          defaultQuality: normalizeQualityForApiMode(provider, merged.defaultQuality),
          ...deriveModelState(merged),
        };
      },
    },
  ),
);
