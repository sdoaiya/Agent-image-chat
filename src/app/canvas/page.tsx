import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle, Sparkles, Trash2, RefreshCw, Copy, TextQuote } from "lucide-react";
import { toast } from "sonner";
import { useConversations, type ImageData as StoreImageData } from "@/store/conversations";
import { useTasks } from "@/store/tasks";
import { useSettings } from "@/store/settings";
import { useExampleImport } from "@/store/example-import";
import { generateImages, getSettings, type ImageGenerationRequest, type ImageResult } from "@/lib/api";
import { getReadableErrorMessage } from "@/lib/request";
import { formatRelativeTime, generateId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConversationList } from "./conversation-list";
import { fileFromImage, ImageCard } from "./image-card";
import { PromptBar, type AttachedPromptFile, type PromptOptions } from "./prompt-bar";
import type { ModelCapabilities } from "@/types/image-workflow";

function imageDataFromApi(data: { url?: string; b64_json?: string; revised_prompt?: string; file_id?: string; gen_id?: string; source_account_id?: string; width?: number; height?: number }): StoreImageData {
  const b64_json = data.b64_json;
  return {
    url: data.url ?? "",
    b64_json,
    revised_prompt: data.revised_prompt,
    file_id: data.file_id,
    gen_id: data.gen_id,
    source_account_id: data.source_account_id,
    width: data.width,
    height: data.height,
    bytes: b64_json ? Math.round((b64_json.length * 3) / 4) : undefined,
  };
}

const fallbackCapabilities: ModelCapabilities = {
  supportsGenerate: true,
  supportsEdit: true,
  supportsUpscale: false,
  resolutions: ["1024x1024", "1024x1536", "1536x1024"],
  upscaleFactors: [],
  maxReferenceImages: 4,
  supportsMask: false,
  supportsMultiImageReference: true,
};

function cloneCapabilities(source?: ModelCapabilities | null): ModelCapabilities {
  return {
    ...fallbackCapabilities,
    ...(source ?? {}),
    resolutions: source?.resolutions?.length ? [...source.resolutions] : [...fallbackCapabilities.resolutions],
    upscaleFactors: source?.upscaleFactors?.length ? [...source.upscaleFactors] : [...(fallbackCapabilities.upscaleFactors ?? [])],
  };
}

const maxFrontendImageBatchSize = 2;

function hasGenerationCredentials(args: {
  apiKey: string;
  authKey: string;
  baseUrl: string;
}): { ok: boolean; reason?: string } {
  const normalizedBaseUrl = args.baseUrl?.trim?.() ?? "";
  if (!normalizedBaseUrl) {
    return { ok: false, reason: "请先在设置中填写 Base URL" };
  }
  if (!(args.apiKey?.trim?.()) && !(args.authKey?.trim?.())) {
    return { ok: false, reason: "请先在设置中填写 API Key 或本地鉴权 Key" };
  }
  return { ok: true };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error("图片编码失败"));
    reader.readAsDataURL(file);
  });
}

function isAbortGenerationError(error: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.message.toLowerCase() === "canceled") return true;
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    return code === "ERR_CANCELED";
  }
  return false;
}

async function generateImagesWithFrontendBatches(req: ImageGenerationRequest, signal: AbortSignal): Promise<ImageResult> {
  const total = Math.max(1, req.n ?? 1);
  if (total <= maxFrontendImageBatchSize) {
    return generateImages(req, { signal });
  }

  let remaining = total;
  const merged: ImageResult = {
    created: 0,
    data: [],
  };
  const capabilityNotes: string[] = [];

  while (remaining > 0) {
    if (signal.aborted) {
      throw new Error("canceled");
    }

    const batchSize = Math.min(maxFrontendImageBatchSize, remaining);
    const batch = await generateImages({ ...req, n: batchSize }, { signal });
    if (!merged.created) {
      merged.created = batch.created;
    }
    merged.data.push(...batch.data);
    if (batch.capability_note) {
      capabilityNotes.push(batch.capability_note);
    }
    remaining -= batchSize;
  }

  if (capabilityNotes.length > 0) {
    merged.capability_note = capabilityNotes.join("\n");
  }
  return merged;
}

export function CanvasPage() {
  const conversations = useConversations((s) => s.conversations);
  const activeId = useConversations((s) => s.activeId);
  const load = useConversations((s) => s.load);
  const create = useConversations((s) => s.create);
  const addTurn = useConversations((s) => s.addTurn);
  const updateTurn = useConversations((s) => s.updateTurn);
  const removeTurn = useConversations((s) => s.removeTurn);

  const startTask = useTasks((s) => s.startTask);
  const endTask = useTasks((s) => s.endTask);

  const defaultModel = useSettings((s) => s.defaultModel);
  const defaultN = useSettings((s) => s.defaultN);
  const defaultQuality = useSettings((s) => s.defaultQuality);
  const apiKey = useSettings((s) => s.apiKey);
  const authKey = useSettings((s) => s.authKey);
  const baseUrl = useSettings((s) => s.baseUrl);
  const consumeImportedExample = useExampleImport((s) => s.consumePending);

  const [pendingPrompt, setPendingPrompt] = useState<{ prompt?: string; files?: AttachedPromptFile[] } | null>(null);
  const [capabilities, setCapabilities] = useState<ModelCapabilities>(() => cloneCapabilities());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedPromptIds, setExpandedPromptIds] = useState<Set<string>>(() => new Set());
  const consumePending = useCallback(() => setPendingPrompt(null), []);
  const mountedRef = useRef(true);
  const activeGenerationRef = useRef<{ controller: AbortController; convId: string; turnId: string } | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      try {
        const config = await getSettings();
        if (!mountedRef.current) return;
        setCapabilities(cloneCapabilities(config.capabilities));
      } catch {
        if (mountedRef.current) setCapabilities(cloneCapabilities());
      }
    })();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const imported = consumeImportedExample();
    if (!imported) return;
    setPendingPrompt({
      prompt: imported.prompt,
      files: imported.files,
    });
  }, [consumeImportedExample]);

  const activeConv = conversations.find((c) => c.id === activeId);
  const isGenerating = useTasks((s) => s.activeTaskKeys.size > 0);

  const [elapsedSeconds, setElapsedSeconds] = useState<Record<string, number>>({});

  useEffect(() => {
    const activeTurns = activeConv?.turns.filter((turn) => turn.status === "generating") ?? [];
    if (activeTurns.length === 0) {
      setElapsedSeconds((current) => (Object.keys(current).length ? {} : current));
      return;
    }

    const computeElapsed = () => {
      const now = Date.now();
      setElapsedSeconds((current) => {
        const next: Record<string, number> = {};
        let changed = false;

        for (const turn of activeTurns) {
          const seconds = Math.max(0, Math.floor((now - turn.created_at) / 1000));
          next[turn.id] = seconds;
          if (current[turn.id] !== seconds) changed = true;
        }

        if (!changed && Object.keys(current).length === activeTurns.length) {
          return current;
        }

        return next;
      });
    };

    computeElapsed();
    const interval = window.setInterval(computeElapsed, 1000);
    return () => window.clearInterval(interval);
  }, [activeConv]);

  const makePromptFiles = async (img: StoreImageData, prompt?: string) => {
    const file = await fileFromImage(img, "reference.png");
    if (!file) return null;
    return {
      prompt,
      files: [{ id: `reference-${Date.now()}`, file, preview: URL.createObjectURL(file), source: "workspace" as const, name: file.name }],
    };
  };

  const stopGeneration = useCallback(() => {
    const active = activeGenerationRef.current;
    if (!active) return;
    active.controller.abort();
  }, []);

  const handleSubmit = async (prompt: string, files?: File[], options?: PromptOptions, retryTurnId?: string) => {
    let convId = activeId;
    if (!convId) {
      convId = create();
    }
    if (!convId) return;

    const credentialCheck = hasGenerationCredentials({ apiKey, authKey, baseUrl });
    if (!credentialCheck.ok) {
      const turnId = generateId();
      addTurn(convId, {
        id: turnId,
        mode: "generate",
        prompt: prompt || "生成图像",
        status: "error",
        images: [],
        model: defaultModel,
        size: options?.size,
        n: options?.n,
        quality: options?.quality,
        aspectRatio: options?.aspectRatio,
        created_at: Date.now(),
        error: credentialCheck.reason,
      });
      toast.error(credentialCheck.reason);
      return;
    }

    const turnId = retryTurnId || generateId();
    if (retryTurnId) {
      const retryStartedAt = Date.now();
      setElapsedSeconds((current) => ({ ...current, [retryTurnId]: 0 }));
      updateTurn(convId, retryTurnId, {
        status: "generating",
        images: [],
        error: undefined,
        source_images: files?.length ? files : undefined,
        size: options?.size,
        n: options?.n,
        quality: options?.quality,
        aspectRatio: options?.aspectRatio,
        created_at: retryStartedAt,
      });
    } else {
      addTurn(convId, {
        id: turnId,
        mode: "generate",
        prompt: prompt || (files?.length ? "请基于参考图生成结果" : "生成图像"),
        status: "generating",
        images: [],
        model: defaultModel,
        size: options?.size,
        n: options?.n,
        quality: options?.quality,
        aspectRatio: options?.aspectRatio,
        created_at: Date.now(),
        ...(files?.length ? { source_images: files } : {}),
      });
    }
    const abortController = new AbortController();
    activeGenerationRef.current = { controller: abortController, convId, turnId };
    startTask(convId, turnId);

    try {
      const reference_images = files?.length ? await Promise.all(files.map((file) => fileToBase64(file))) : undefined;
      if (abortController.signal.aborted) {
        throw new Error("canceled");
      }
      const result = await generateImagesWithFrontendBatches({
        model: defaultModel,
        prompt: prompt || "请根据参考图生成结果",
        n: options?.n ?? defaultN,
        size: options?.size,
        quality: (options?.quality as any) || defaultQuality,
        response_format: "b64_json",
        reference_images,
      }, abortController.signal);

      updateTurn(convId, turnId, {
        status: "done",
        images: result.data.map(imageDataFromApi),
        error: result.capability_note,
      });
    } catch (err) {
      const stopped = isAbortGenerationError(err, abortController.signal);
      updateTurn(convId, turnId, {
        status: "error",
        error: stopped ? "已停止生成" : getReadableErrorMessage(err, "生成失败"),
      });
    } finally {
      if (activeGenerationRef.current?.controller === abortController) {
        activeGenerationRef.current = null;
      }
      endTask(convId, turnId);
    }
  };

  const pushImageToPrompt = async (img: StoreImageData, prompt?: string) => {
    try {
      const next = await makePromptFiles(img, prompt);
      if (!next) return;
      setPendingPrompt(next);
    } catch (error) {
      console.error("引用图片失败", error);
    }
  };

  const quotePrompt = (prompt: string) => {
    setPendingPrompt({ prompt, files: [] });
    toast.success("已引用提示词");
  };

  const copyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("提示词已复制");
    } catch {
      toast.error("复制失败，请手动选择复制");
    }
  };

  const togglePrompt = (turnId: string) => {
    setExpandedPromptIds((current) => {
      const next = new Set(current);
      if (next.has(turnId)) {
        next.delete(turnId);
      } else {
        next.add(turnId);
      }
      return next;
    });
  };

  const retryTurn = async (turnId: string) => {
    if (!activeConv) return;
    const turn = activeConv.turns.find((item) => item.id === turnId);
    if (!turn) return;
    await handleSubmit(turn.prompt, turn.source_images, { size: turn.size, n: turn.n, quality: turn.quality, aspectRatio: turn.aspectRatio }, turnId);
  };

  return (
    <div className="flex h-full min-w-0">
      <div className={`${sidebarOpen ? "w-[208px]" : "w-[52px]"} shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200`}>
        <ConversationList sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((v) => !v)} />
      </div>
      <div className="canvas-workspace">
        <div className="canvas-stage">
          {!activeConv || activeConv.turns.length === 0 ? (
            <div className="flex h-full min-h-[360px] flex-col items-center justify-center px-5 py-10">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h2 className="mt-3 text-base font-semibold text-foreground">开始创作</h2>
                <p className="mt-1 text-sm text-muted-foreground">输入提示词，或添加附件图开始创作</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 p-5">
              {activeConv.turns.map((turn) => (
                <div key={turn.id} className="space-y-1.5">
                  <div className="canvas-turn-head">
                    <Badge variant="default">生成</Badge>
                    <button
                      type="button"
                      className={`canvas-turn-prompt ${expandedPromptIds.has(turn.id) ? "canvas-turn-prompt--expanded" : "canvas-turn-prompt--collapsed"}`}
                      onClick={() => togglePrompt(turn.id)}
                      aria-expanded={expandedPromptIds.has(turn.id)}
                      title={expandedPromptIds.has(turn.id) ? "收起提示词" : "展开提示词"}
                    >
                      {turn.prompt}
                    </button>
                    <div className="canvas-turn-prompt-actions">
                      <button type="button" onClick={() => quotePrompt(turn.prompt)} className="canvas-turn-action" title="引用提示词" aria-label="引用提示词">
                        <TextQuote className="h-3.5 w-3.5" />
                        <span>引用</span>
                      </button>
                      <button type="button" onClick={() => void copyPrompt(turn.prompt)} className="canvas-turn-action" title="复制提示词" aria-label="复制提示词">
                        <Copy className="h-3.5 w-3.5" />
                        <span>复制</span>
                      </button>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatRelativeTime(turn.created_at)}</span>
                    {turn.status === "generating" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                    {turn.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                    {turn.status === "done" && turn.error && <span className="text-xs text-muted-foreground">{turn.error}</span>}
                  </div>
                  {turn.status === "generating" && (
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      <span>处理中 · 已用时 {elapsedSeconds[turn.id] ?? 0}s</span>
                    </div>
                  )}
                  {turn.status === "done" && turn.images.length > 0 && (
                    <div className="flex flex-wrap gap-3">
                      {turn.images.map((img, idx) => (
                        <ImageCard
                          key={idx}
                          image={img}
                          fileName={`gimg-generate-${turn.created_at}-${idx + 1}.png`}
                          meta={{
                            created_at: turn.created_at,
                            model: turn.model || defaultModel,
                            mode: "generate",
                            size: turn.size,
                          }}
                          onReference={() => void pushImageToPrompt(img, turn.prompt)}
                          onRetry={() => void retryTurn(turn.id)}
                          onDelete={() => removeTurn(activeConv.id, turn.id)}
                        />
                      ))}
                    </div>
                  )}
                  {turn.status === "error" && turn.error && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
                      <p className="text-sm text-destructive">{turn.error}</p>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => void retryTurn(turn.id)} className="text-foreground">
                          <RefreshCw className="mr-1 h-3.5 w-3.5" />
                          重试
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => removeTurn(activeConv.id, turn.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          删除
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <PromptBar
          layout="workspace"
          onSubmit={handleSubmit}
          onCancel={stopGeneration}
          disabled={isGenerating}
          initialPrompt={pendingPrompt?.prompt}
          initialFiles={pendingPrompt?.files}
          onInitialConsumed={consumePending}
          capabilities={capabilities}
          defaultQuality={defaultQuality}
          defaultN={defaultN}
        />
      </div>
    </div>
  );
}
