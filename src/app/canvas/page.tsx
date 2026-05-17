import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Trash2, RefreshCw, Copy, TextQuote } from "lucide-react";
import { toast } from "sonner";
import { useConversations, type ConversationTurn, type ImageData as StoreImageData } from "@/store/conversations";
import { useTasks } from "@/store/tasks";
import { useSettings } from "@/store/settings";
import { useExampleImport } from "@/store/example-import";
import { generateImages, getSettings, type ImageGenerationRequest, type ImageResult } from "@/lib/api";
import { getReadableErrorMessage } from "@/lib/request";
import { cn, formatRelativeTime, generateId } from "@/lib/utils";
import { ConversationList } from "./conversation-list";
import { fileFromImage, ImageCard } from "./image-card";
import { PromptBar, type AttachedPromptFile, type PromptOptions } from "./prompt-bar";
import type { ModelCapabilities } from "@/types/image-workflow";

function imageDataFromApi(data: { url?: string; b64_json?: string; revised_prompt?: string; file_id?: string; gen_id?: string; source_account_id?: string; provider?: string; source?: string; width?: number; height?: number }): StoreImageData {
  const b64_json = data.b64_json;
  return {
    url: data.url ?? "",
    b64_json,
    revised_prompt: data.revised_prompt,
    file_id: data.file_id,
    gen_id: data.gen_id,
    source_account_id: data.source_account_id,
    provider: data.provider,
    source: data.source,
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

const maxFrontendImageBatchSize = 1;

function buildPartialGenerationMessage(successCount: number, totalCount: number, error: unknown): string {
  const failureMessage = getReadableErrorMessage(error, "生成失败");
  return `已成功生成 ${successCount}/${totalCount} 张，其余未完成：${failureMessage}`;
}

function hasGenerationCredentials(args: {
  apiKey: string;
  providerApiKeys?: Record<string, string | undefined>;
  baseUrl: string;
}): { ok: boolean; reason?: string } {
  const normalizedBaseUrl = args.baseUrl?.trim?.() ?? "";
  if (!normalizedBaseUrl) {
    return { ok: false, reason: "请先在设置中填写 Base URL" };
  }
  const hasAnyApiKey = Boolean(args.apiKey?.trim?.())
    || Object.values(args.providerApiKeys ?? {}).some((value) => Boolean(value?.trim?.()));
  if (!hasAnyApiKey) {
    return { ok: false, reason: "请先在设置中填写至少一个 Provider API Key" };
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

const intentionalFaceObstructionPattern = /(遮挡脸|脸部遮挡|遮住脸|打码|马赛克|模糊脸|隐私|privacy blur|privacy mask|mosaic face|blurred face|covered face|face intentionally hidden)/i;

function buildPromptForReferenceImages(prompt: string, hasReferenceImages: boolean): string {
  const basePrompt = prompt || "请根据参考图生成结果";
  if (!hasReferenceImages || intentionalFaceObstructionPattern.test(basePrompt)) {
    return basePrompt;
  }

  return `${basePrompt}

参考图使用规则：参考图只用于构图、姿态、服装、发型、色彩、光影和整体风格；不要复制参考图中的脸部遮挡、隐私遮罩、马赛克、打码方块、水印、界面覆盖层或偶然遮挡。如果参考图脸部被遮住或模糊，请生成自然无遮挡的清晰脸部，保持眼睛、鼻子、嘴巴和皮肤纹理完整。`;
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

function normalizeImageQualityParam(value: unknown): "high" | "standard" | undefined {
  return value === "high" || value === "standard" ? value : undefined;
}

function normalizeImageStyleParam(value: unknown): "natural" | "vivid" | undefined {
  return value === "natural" || value === "vivid" ? value : undefined;
}

function normalizeImageUpscaleParam(value: unknown): "2k" | "4k" | undefined {
  return value === "2k" || value === "4k" ? value : undefined;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fall through to legacy copy
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) {
      throw new Error("copy failed");
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

function stripStoredPrompt(prompt: string): string {
  const withoutAspect = prompt.replace(/^make the aspect ratio\s+\S+\s*,\s*/i, "");
  return withoutAspect.split(/\n\n负面提示词：/)[0]?.trim() ?? "";
}

function summarizeTurnPrompt(prompt: string): string {
  return stripStoredPrompt(prompt).slice(0, 44) || "未命名任务";
}

function getTurnMetaSummary(turn: ConversationTurn): string {
  const parts = [
    formatRelativeTime(turn.created_at),
    turn.aspectRatio || turn.size,
    turn.upscale ? turn.upscale.toUpperCase() : null,
    turn.quality ? `画质 ${turn.quality}` : null,
    turn.source_images?.length ? `参考 ${turn.source_images.length} 张` : null,
    turn.images[0]?.provider || turn.images[0]?.source || null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function getTurnStatusLabel(turn: ConversationTurn, fallbackCount: number): string {
  const total = Math.max(1, turn.n ?? fallbackCount);
  if (turn.status === "generating") return `进行中 ${turn.images.length}/${total}`;
  if (turn.status === "error") return "失败";
  if (turn.status === "done") return turn.images.length > 0 ? `完成 ${turn.images.length}/${total}` : "完成";
  return "待处理";
}

function getTurnHeadline(turn: ConversationTurn): string {
  const parts = [summarizeTurnPrompt(turn.prompt)];
  const requestedCount = Math.max(1, turn.n ?? turn.images.length ?? 1);

  if (turn.source_images?.length) {
    parts.push(`引用 ${turn.source_images.length} 张`);
  } else if (requestedCount > 1) {
    parts.push(`${requestedCount} 张`);
  }

  if (turn.upscale) {
    parts.push(turn.upscale.toUpperCase());
  }

  return parts.join(" · ");
}

async function generateImagesWithFrontendBatches(
  req: ImageGenerationRequest,
  signal: AbortSignal,
  onProgress?: (partial: ImageResult) => void,
): Promise<ImageResult> {
  const total = Math.max(1, req.n ?? 1);
  if (total <= maxFrontendImageBatchSize) {
    const single = await generateImages(req, { signal });
    onProgress?.(single);
    return single;
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
    let batch: ImageResult;
    try {
      batch = await generateImages({ ...req, n: batchSize }, { signal });
    } catch (error) {
      if (merged.data.length === 0) {
        throw error;
      }
      merged.capability_note = buildPartialGenerationMessage(merged.data.length, total, error);
      return merged;
    }
    if (!merged.created) {
      merged.created = batch.created;
    }
    merged.data.push(...batch.data);
    onProgress?.({ ...merged, data: [...merged.data] });
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
  const [worklistOpen, setWorklistOpen] = useState(true);
  const conversations = useConversations((s) => s.conversations);
  const activeId = useConversations((s) => s.activeId);
  const loaded = useConversations((s) => s.loaded);
  const load = useConversations((s) => s.load);
  const create = useConversations((s) => s.create);
  const addTurn = useConversations((s) => s.addTurn);
  const updateTurn = useConversations((s) => s.updateTurn);
  const removeTurn = useConversations((s) => s.removeTurn);

  const startTask = useTasks((s) => s.startTask);
  const endTask = useTasks((s) => s.endTask);
  const activeTaskCount = useTasks((s) => s.activeTaskKeys.size);

  const provider = useSettings((s) => s.provider);
  const defaultModel = useSettings((s) => s.defaultModel);
  const defaultN = useSettings((s) => s.defaultN);
  const defaultQuality = useSettings((s) => s.defaultQuality);
  const apiKey = useSettings((s) => s.apiKey);
  const providerApiKeys = useSettings((s) => s.providerApiKeys);
  const baseUrl = useSettings((s) => s.baseUrl);
  const consumeImportedExample = useExampleImport((s) => s.consumePending);

  const [pendingPrompt, setPendingPrompt] = useState<{ importKey: string; prompt?: string; files?: AttachedPromptFile[]; replace?: boolean } | null>(null);
  const [capabilities, setCapabilities] = useState<ModelCapabilities>(() => cloneCapabilities());
  const [expandedPromptIds, setExpandedPromptIds] = useState<Set<string>>(() => new Set());
  const consumePending = useCallback(() => setPendingPrompt(null), []);
  const mountedRef = useRef(true);
  const generationControllersRef = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    if (!loaded) {
      void load();
    }
  }, [load, loaded]);

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
      importKey: generateId(),
      prompt: imported.prompt,
      files: imported.files,
      replace: true,
    });
  }, [consumeImportedExample]);

  const activeConv = conversations.find((c) => c.id === activeId);
  const activeConversationGenerating = (activeConv?.turns.some((turn) => turn.status === "generating")) ?? false;
  const orderedTurns = activeConv ? [...activeConv.turns].sort((a, b) => b.created_at - a.created_at) : [];

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
    const activeTurns = activeConv?.turns.filter((turn) => turn.status === "generating") ?? [];
    for (const turn of activeTurns) {
      generationControllersRef.current.get(turn.id)?.abort();
    }
  }, [activeConv]);

  const handleSubmit = async (prompt: string, files?: File[], options?: PromptOptions, retryTurnId?: string) => {
    let convId = activeId;
    if (!convId) {
      convId = create();
    }
    if (!convId) return;

    const credentialCheck = hasGenerationCredentials({ apiKey, providerApiKeys, baseUrl });
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
        style: options?.style,
        upscale: options?.upscale,
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
        style: options?.style,
        upscale: options?.upscale,
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
        style: options?.style,
        upscale: options?.upscale,
        aspectRatio: options?.aspectRatio,
        created_at: Date.now(),
        ...(files?.length ? { source_images: files } : {}),
      });
    }
    const abortController = new AbortController();
    generationControllersRef.current.set(turnId, abortController);
    startTask(convId, turnId);

    try {
      const reference_images = files?.length ? await Promise.all(files.map((file) => fileToBase64(file))) : undefined;
      if (abortController.signal.aborted) {
        throw new Error("canceled");
      }
      const selectedQuality = options && "quality" in options ? options.quality : defaultQuality;
      const apiPrompt = buildPromptForReferenceImages(prompt, Boolean(reference_images?.length));
      const result = await generateImagesWithFrontendBatches(
        {
          model: defaultModel,
          prompt: apiPrompt,
          n: options?.n ?? defaultN,
          size: options?.size,
          quality: normalizeImageQualityParam(selectedQuality),
          style: normalizeImageStyleParam(options?.style),
          upscale: normalizeImageUpscaleParam(options?.upscale),
          response_format: "b64_json",
          reference_images,
        },
        abortController.signal,
        (partial) => {
          if (!partial.data.length) return;
          updateTurn(convId, turnId, {
            status: "generating",
            images: partial.data.map(imageDataFromApi),
          });
        },
      );

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
      generationControllersRef.current.delete(turnId);
      endTask(convId, turnId);
    }
  };

  const pushImageToPrompt = async (img: StoreImageData, prompt?: string) => {
    try {
      const next = await makePromptFiles(img, prompt);
      if (!next) return;
      setPendingPrompt({ ...next, importKey: generateId(), replace: true });
    } catch (error) {
      console.error("引用图片失败", error);
    }
  };

  const quotePrompt = (prompt: string) => {
    setPendingPrompt({ importKey: generateId(), prompt, files: [], replace: true });
    toast.success("已引用提示词");
  };

  const copyPrompt = async (prompt: string) => {
    try {
      await copyText(prompt);
      toast.success("提示词已复制");
    } catch {
      toast.error("复制失败，请手动选择复制");
    }
  };

  const copyError = async (message: string) => {
    try {
      await copyText(message);
      toast.success("错误信息已复制");
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
    await handleSubmit(turn.prompt, turn.source_images, { size: turn.size, n: turn.n, quality: turn.quality, style: turn.style, upscale: turn.upscale, aspectRatio: turn.aspectRatio }, turnId);
  };

  const providerLabelMap = {
    codesonline: "CodesOnline",
    openrouter: "OpenRouter",
    blt: "BLT",
  } as const;
  const providerStatuses = (Object.entries(providerLabelMap) as Array<[keyof typeof providerLabelMap, string]>).map(([id, label]) => {
    const hasKey = Boolean(providerApiKeys?.[id]?.trim());
    return {
      id,
      label,
      available: hasKey,
      roleLabel: id === provider ? "当前" : hasKey ? "候补" : "未配置",
    };
  });
  const queueSummary = activeTaskCount > 0 ? `${activeTaskCount} 个任务生成中` : "当前空闲";
  const currentConversationLabel = activeConv?.title ?? "未选择工作";
  const renderLoadingSlots = (turn: { n?: number; images: StoreImageData[] }) => {
    const total = Math.max(1, turn.n ?? defaultN ?? 1);
    const remaining = Math.max(0, total - turn.images.length);
    return Array.from({ length: remaining }, (_, index) => {
      const current = turn.images.length + index + 1;
      const progress = Math.max(12, Math.round((turn.images.length / total) * 100));
      return (
        <div
          key={`loading-${current}`}
          className="canvas-image-loading-card"
          aria-label={`等待生成第 ${current} 张图片`}
          style={{ ["--progress" as string]: `${progress}%` }}
        >
          <span className="canvas-progress-ring" aria-hidden="true" />
          <span>等待生成 {current}/{total}</span>
        </div>
      );
    });
  };

  return (
    <section className="canvas-page-shell">
      <header className="canvas-workbench-topbar">
        <div className="canvas-topbar-copy">
          <div className="title-block">
            <h2>工作台</h2>
            <p>左侧切换工作，中央查看当前工作记录，底部继续输入。</p>
          </div>
        </div>
        <div className="canvas-topbar-actions">
          <span className="canvas-topbar-chip">
            <strong>当前工作</strong>
            <span>{currentConversationLabel}</span>
          </span>
          <span className="canvas-topbar-chip">
            <strong>队列</strong>
            <span>{queueSummary}</span>
          </span>
        </div>
      </header>

      <div className={cn("canvas-workspace", !worklistOpen && "canvas-workspace--worklist-collapsed")}>
        <aside
          className={cn("canvas-worklist-panel", !worklistOpen && "canvas-worklist-panel--collapsed")}
          aria-label="工作列表"
          data-testid="workspace-worklist"
        >
          <ConversationList sidebarOpen={worklistOpen} onToggleSidebar={() => setWorklistOpen((current) => !current)} />
        </aside>

        <section className="timeline canvas-stage" aria-label="生成任务时间线">
          <div className="canvas-queue-list" aria-label="生成任务队列" data-testid="workspace-turn-stream">
            {!activeConv || activeConv.turns.length === 0 ? (
              <div className="canvas-empty-state">
                <div className="canvas-empty-state-icon">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h3>开始创作</h3>
                <p>输入提示词，或添加附件图开始创作</p>
              </div>
            ) : (
              orderedTurns.map((turn) => (
                <article key={turn.id} className="canvas-turn-card canvas-turn-card--active" data-testid={`workspace-turn-card-${turn.id}`}>
                  <div className="canvas-turn-card-head">
                    <div className="canvas-turn-card-meta">
                      <strong>{getTurnHeadline(turn)}</strong>
                      <span>{getTurnMetaSummary(turn)}</span>
                    </div>
                    <div className="canvas-turn-card-actions">
                      <span className={cn(
                        "canvas-status-pill",
                        turn.status === "error" && "canvas-status-pill--error",
                        turn.status === "generating" && "canvas-status-pill--live",
                      )}
                      >
                        {getTurnStatusLabel(turn, defaultN ?? 1)}
                      </span>
                      <button type="button" onClick={() => void copyPrompt(turn.prompt)} className="canvas-turn-action" aria-label="复制提示词">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

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
                    <button type="button" onClick={() => quotePrompt(turn.prompt)} className="canvas-turn-action" aria-label="引用提示词">
                      <TextQuote className="h-3.5 w-3.5" />
                      <span>引用提示词</span>
                    </button>
                  </div>

                  {turn.status === "generating" && (
                    <div className="canvas-turn-progress">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      <span>处理中 · 已完成 {turn.images.length}/{turn.n ?? defaultN ?? 1} · 已用时 {elapsedSeconds[turn.id] ?? 0}s</span>
                    </div>
                  )}

                  {((turn.status === "done" && turn.images.length > 0) || turn.status === "generating") && (
                    <div className="canvas-turn-result-grid">
                      {turn.images.map((img, idx) => (
                        <ImageCard
                          key={idx}
                          image={img}
                          prompt={turn.prompt}
                          fileName={`gimg-generate-${turn.created_at}-${idx + 1}.png`}
                          meta={{
                            created_at: turn.created_at,
                            model: turn.model || defaultModel,
                            mode: "generate",
                            size: turn.size,
                            scale: turn.upscale ? turn.upscale.toUpperCase() : undefined,
                            provider: img.provider || img.source,
                          }}
                          onReference={() => void pushImageToPrompt(img, turn.prompt)}
                          onPromptReference={() => quotePrompt(turn.prompt)}
                          onImageReference={() => void pushImageToPrompt(img)}
                          onRetry={() => void retryTurn(turn.id)}
                          onDelete={() => activeConv && removeTurn(activeConv.id, turn.id)}
                        />
                      ))}
                      {turn.status === "generating" && renderLoadingSlots(turn)}
                    </div>
                  )}

                  {turn.status === "error" && turn.error && (
                    <div className="canvas-error-box">
                      <code>{turn.error}</code>
                      <div className="canvas-error-actions">
                        <button type="button" className="canvas-turn-action" aria-label="复制错误" onClick={() => void copyError(turn.error || "")}>
                          <Copy className="h-3.5 w-3.5" />
                          <span>复制错误</span>
                        </button>
                        <button type="button" className="canvas-turn-action" onClick={() => void retryTurn(turn.id)}>
                          <RefreshCw className="h-3.5 w-3.5" />
                          <span>重试</span>
                        </button>
                        {activeConv && (
                          <button type="button" className="canvas-turn-action canvas-turn-action--danger" onClick={() => removeTurn(activeConv.id, turn.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>删除</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </section>

        <PromptBar
          layout="workspace"
          onSubmit={handleSubmit}
          onCancel={stopGeneration}
          disabled={activeConversationGenerating}
          initialPrompt={pendingPrompt?.prompt}
          initialFiles={pendingPrompt?.files}
          initialImportKey={pendingPrompt?.importKey}
          replaceInitial={pendingPrompt?.replace}
          onInitialConsumed={consumePending}
          capabilities={capabilities}
          defaultQuality={defaultQuality}
          defaultN={defaultN}
          providerStatuses={providerStatuses}
        />
      </div>
    </section>
  );
}
