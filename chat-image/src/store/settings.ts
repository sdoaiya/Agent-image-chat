import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ApiMode = "codesonline";

export const BUILTIN_IMAGE_MODELS = ["gpt-image-2"] as const;
export const DEFAULT_IMAGE_MODEL = BUILTIN_IMAGE_MODELS[0];
export const CODESONLINE_BASE_URL = "https://image.codesonline.dev/v1";

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

export function getQualityOptionsByApiMode(apiMode: ApiMode): ImageQuality[] {
  void apiMode;
  return ["auto", "low", "medium", "high"];
}

export function normalizeQualityForApiMode(apiMode: ApiMode, quality: unknown): ImageQuality {
  void apiMode;
  const options = getQualityOptionsByApiMode("codesonline");
  const normalized = typeof quality === "string" ? quality : "";
  return (options.find((item) => item === normalized) ?? options[0] ?? "auto") as ImageQuality;
}

export interface Settings {
  apiMode: ApiMode;
  apiKey: string;
  authKey: string;
  baseUrl: string;
  accessToken: string;
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
  apiMode: "codesonline",
  apiKey: "",
  authKey: "",
  baseUrl: CODESONLINE_BASE_URL,
  accessToken: "",
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

export const useSettings = create<Settings & SettingsActions>()(
  persist(
    (set) => ({
      ...defaults,
      updateSettings: (partial) => set((state) => {
        const next = { ...state, ...partial };
        return {
          ...next,
          defaultQuality: normalizeQualityForApiMode(next.apiMode, next.defaultQuality),
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
        apiMode: state.apiMode,
        apiKey: state.apiKey,
        authKey: state.authKey,
        baseUrl: state.baseUrl,
        accessToken: state.accessToken,
        proxyEnabled: state.proxyEnabled,
        proxyUrl: state.proxyUrl,
        defaultModel: state.defaultModel,
        builtinModels: state.builtinModels,
        remoteModels: state.remoteModels,
        importedModels: state.importedModels,
        availableModels: state.availableModels,
        lastModelRefreshAt: state.lastModelRefreshAt,
        defaultN: state.defaultN,
        defaultQuality: state.defaultQuality,
        theme: state.theme,
      }),
      merge: (persistedState, currentState) => {
        const merged = { ...currentState, ...(persistedState as Partial<Settings>) };
        return {
          ...merged,
          defaultQuality: normalizeQualityForApiMode(merged.apiMode, merged.defaultQuality),
          ...deriveModelState(merged),
        };
      },
    },
  ),
);
