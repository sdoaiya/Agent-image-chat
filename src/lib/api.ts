import client from "./request";
import type { ModelCapabilities } from "@/types/image-workflow";

export interface ImageGenerationRequest {
  model?: string;
  prompt: string;
  n?: number;
  quality?: "auto" | "low" | "medium" | "high" | "standard" | "hd";
  size?: string;
  response_format?: "url" | "b64_json";
  style?: "vivid" | "natural";
  reference_images?: string[];
}

export interface ImageData {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
  file_id?: string;
  gen_id?: string;
  source_account_id?: string;
}

export interface ImageResult {
  created: number;
  data: ImageData[];
  capability_note?: string;
}

export interface ModelInfo {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

export interface ModelsResponse {
  object: string;
  data: ModelInfo[];
}

export interface ConfigPayload {
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
    migrationNote?: string;
  };
  proxy: {
    enabled: boolean;
    url: string;
  };
  capabilities?: ModelCapabilities;
}

export interface NormalizedModelState {
  availableModels: string[];
  selectedModel: string;
}

const DEFAULT_IMAGE_MODEL = "gpt-image-2";

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

export function extractAvailableModels(config?: Partial<ConfigPayload> | null): string[] {
  const chatgpt = config?.chatgpt;
  return uniqueModels([
    ...(chatgpt?.availableModels ?? []),
    chatgpt?.model,
  ]);
}

export function normalizeModelState(args: {
  builtins?: string[];
  remote?: string[];
  imported?: string[];
  backend?: Partial<ConfigPayload> | null;
  selected?: string;
}): NormalizedModelState {
  const availableModels = uniqueModels([
    ...(args.builtins ?? []),
    ...(args.remote ?? []),
    ...(args.imported ?? []),
    ...extractAvailableModels(args.backend),
    args.selected,
  ]);

  return {
    availableModels,
    selectedModel: normalizeModelValue(args.selected) || availableModels[0] || DEFAULT_IMAGE_MODEL,
  };
}

export async function generateImages(req: ImageGenerationRequest): Promise<ImageResult> {
  const { data } = await client.post<ImageResult>("/v1/images/generations", req);
  return data;
}

export async function listModels(): Promise<ModelsResponse> {
  const { data } = await client.get<ModelsResponse>("/v1/models");
  return data;
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`请求超时（${ms / 1000}秒）`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export async function getSettings(): Promise<ConfigPayload> {
  const { data } = await client.get<ConfigPayload>("/api/config");
  return data;
}

export async function updateSettings<T extends object>(settings: T): Promise<ConfigPayload> {
  const { data } = await client.put<ConfigPayload>("/api/config", settings);
  return data;
}

export async function healthCheck(): Promise<{ status: string }> {
  const { data } = await client.get<{ status: string }>("/health");
  return data;
}
