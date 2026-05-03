import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle, Sparkles, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useConversations, type ImageData as StoreImageData } from "@/store/conversations";
import type { TurnMode, ModelCapabilities } from "@/types/image-workflow";
import { useTasks } from "@/store/tasks";
import { useSettings } from "@/store/settings";
import { useExampleImport } from "@/store/example-import";
import { generateImages, getSettings } from "@/lib/api";
import { getReadableErrorMessage } from "@/lib/request";
import { formatRelativeTime, generateId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ExamplePromptItem } from "@/data/example-prompts";
import { ConversationList } from "./conversation-list";
import { fileFromImage, ImageCard } from "./image-card";
import { PromptBar, type AttachedPromptFile, type PromptOptions } from "./prompt-bar";
import { EditModal } from "./edit-modal";

const ExampleGallery = lazy(async () => {
  const module = await import("@/components/examples/example-gallery");
  return { default: module.ExampleGallery };
});

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
  supportsReferenceGeneration: true,
  resolutions: ["1024x1024", "1024x1536", "1536x1024"],
  maxReferenceImages: 4,
  supportsMultiImageReference: true,
};

function cloneCapabilities(source?: Partial<ModelCapabilities> | null): ModelCapabilities {
  return {
    ...fallbackCapabilities,
    ...(source ?? {}),
    resolutions: source?.resolutions?.length ? [...source.resolutions] : [...fallbackCapabilities.resolutions],
  };
}

async function exampleToPromptFile(example: ExamplePromptItem): Promise<AttachedPromptFile> {
  const response = await fetch(example.imageUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const file = new File([blob], `${example.id}.jpg`, { type: blob.type || "image/jpeg" });
  return {
    id: `${example.id}-reference`,
    file,
    preview: URL.createObjectURL(file),
    source: "workspace",
    name: file.name,
  };
}

function hasGenerationCredentials(args: {
  apiKey: string;
  authKey: string;
  accessToken: string;
  baseUrl: string;
}): { ok: boolean; reason?: string } {
  const normalizedBaseUrl = args.baseUrl?.trim?.() ?? "";
  if (!normalizedBaseUrl) {
    return { ok: false, reason: "请先在设置中填写 Base URL" };
  }
  if (!(args.apiKey?.trim?.()) && !(args.authKey?.trim?.()) && !(args.accessToken?.trim?.())) {
    return { ok: false, reason: "请先在设置中填写 API Key 或鉴权信息" };
  }
  return { ok: true };
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
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
  const accessToken = useSettings((s) => s.accessToken);
  const baseUrl = useSettings((s) => s.baseUrl);
  const consumeImportedExample = useExampleImport((s) => s.consumePending);

  const [pendingPrompt, setPendingPrompt] = useState<{ mode?: TurnMode; prompt?: string; files?: AttachedPromptFile[] } | null>(null);
  const [legacyEditNoticeOpen, setLegacyEditNoticeOpen] = useState(false);
  const [capabilities, setCapabilities] = useState<ModelCapabilities>(() => cloneCapabilities());
  const [loadingCapabilities, setLoadingCapabilities] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const consumePending = useCallback(() => setPendingPrompt(null), []);
  const mountedRef = useRef(true);

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
      } finally {
        if (mountedRef.current) setLoadingCapabilities(false);
      }
    })();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const imported = consumeImportedExample();
    if (!imported) return;
    setPendingPrompt(imported);
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

  const makePromptFiles = async (img: StoreImageData, mode: TurnMode, prompt?: string) => {
    const file = await fileFromImage(img, "reference.png");
    if (!file) return null;
    return {
      mode,
      prompt,
      files: [{ id: `${mode}-${Date.now()}`, file, preview: URL.createObjectURL(file), source: "workspace" as const, name: file.name }],
    };
  };

  const handleSubmit = async (prompt: string, mode: TurnMode, files?: File[], options?: PromptOptions, retryTurnId?: string) => {
    let convId = activeId;
    if (!convId) {
      convId = create();
    }
    if (!convId) return;

    const credentialCheck = hasGenerationCredentials({ apiKey, authKey, accessToken, baseUrl });
    if (!credentialCheck.ok) {
      const turnId = generateId();
      addTurn(convId, {
        id: turnId,
        mode,
        prompt: prompt || (mode === "reference" ? "参考图生成" : "生成图像"),
        status: "error",
        images: [],
        model: defaultModel,
        size: options?.size,
        created_at: Date.now(),
        error: credentialCheck.reason,
      });
      toast.error(credentialCheck.reason);
      return;
    }

    const turnId = retryTurnId || generateId();
    if (retryTurnId) {
      updateTurn(convId, retryTurnId, {
        status: "generating",
        images: [],
        error: undefined,
        source_images: files?.length ? files : undefined,
      });
    } else {
      addTurn(convId, {
        id: turnId,
        mode,
        prompt: prompt || (mode === "reference" ? "参考图生成" : "生成图像"),
        status: "generating",
        images: [],
        model: defaultModel,
        size: options?.size,
        created_at: Date.now(),
        ...(files?.length ? { source_images: files } : {}),
      });
    }
    startTask(convId, turnId);

    try {
      const referenceImages = files?.length ? await Promise.all(files.map((file) => fileToBase64(file))) : undefined;
      const result = await generateImages({
        model: defaultModel,
        prompt: prompt || (referenceImages?.length ? "请基于参考图进行重绘" : "请生成图片"),
        n: defaultN,
        size: options?.size,
        quality: (options?.quality as any) || defaultQuality,
        response_format: "b64_json",
        ...(referenceImages?.length ? { reference_images: referenceImages } : {}),
      });

      updateTurn(convId, turnId, {
        status: "done",
        images: result.data.map(imageDataFromApi),
        error: result.capability_note,
      });
    } catch (err) {
      updateTurn(convId, turnId, {
        status: "error",
        error: getReadableErrorMessage(err, mode === "reference" ? "参考图生成失败" : "生成失败"),
      });
    } finally {
      endTask(convId, turnId);
    }
  };

  const pushImageToPrompt = async (img: StoreImageData, mode: TurnMode, prompt?: string) => {
    try {
      const next = await makePromptFiles(img, mode, prompt);
      if (!next) return;
      setPendingPrompt(next);
      toast.success(mode === "reference" ? "已加入参考图区，可继续生成" : "已引用图片");
    } catch (error) {
      console.error("引用图片失败", error);
    }
  };

  const useExamplePromptOnly = (example: ExamplePromptItem) => {
    setPendingPrompt({
      mode: "generate",
      prompt: example.prompt,
      files: [],
    });
    toast.success("已引用提示词");
  };

  const useExampleImageOnly = async (example: ExamplePromptItem) => {
    try {
      const attachedFile = await exampleToPromptFile(example);
      setPendingPrompt({
        mode: "reference",
        prompt: "",
        files: [attachedFile],
      });
      toast.success("已引用参考图");
    } catch {
      useExamplePromptOnly(example);
      toast.info("示例图片加载失败，已退化为仅引用提示词");
    }
  };

  const useExampleFull = async (example: ExamplePromptItem) => {
    try {
      const attachedFile = await exampleToPromptFile(example);
      setPendingPrompt({
        mode: "reference",
        prompt: example.prompt,
        files: [attachedFile],
      });
      toast.success("已引用提示词和参考图");
    } catch {
      setPendingPrompt({ mode: "generate", prompt: example.prompt, files: [] });
      toast.info("示例图片加载失败，已退化为仅引用提示词");
    }
  };

  const retryTurn = async (turnId: string) => {
    if (!activeConv) return;
    const turn = activeConv.turns.find((item) => item.id === turnId);
    if (!turn) return;
    if (turn.mode === "reference" && !turn.source_images?.length) {
      toast.error("页面刷新后参考图已丢失，请重新选择图片后提交");
      return;
    }
    await handleSubmit(turn.prompt, turn.mode, turn.source_images, { size: turn.size }, turnId);
  };

  return (
    <div className="flex h-full min-w-0">
      <div className={`${sidebarOpen ? "w-[260px]" : "w-0 overflow-hidden"} shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200`}>
        <ConversationList />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="titlebar-drag flex h-14 shrink-0 items-center border-b border-border bg-background/80 px-4 backdrop-blur-sm">
          <div className="mr-3 h-full min-w-[120px] flex-1" aria-hidden="true" />
          <div className="titlebar-no-drag flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={sidebarOpen ? "收起侧栏" : "展开侧栏"}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                <rect x="1" y="3" width="14" height="1.5" rx="0.75" fill="currentColor" />
                <rect x="1" y="7.25" width="14" height="1.5" rx="0.75" fill="currentColor" />
                <rect x="1" y="11.5" width="14" height="1.5" rx="0.75" fill="currentColor" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-foreground">工作台</span>
            {activeConv && <span className="ml-2 max-w-[40ch] truncate text-xs text-muted-foreground">· {activeConv.title}</span>}
          </div>
          <div className="titlebar-no-drag ml-auto flex items-center gap-2">
            {loadingCapabilities && <span className="text-xs text-muted-foreground">读取中…</span>}
          </div>
          <div className="ml-3 h-full min-w-[120px] flex-1" aria-hidden="true" />
        </header>

        <div className="flex-1 overflow-y-auto">
          {!activeConv || activeConv.turns.length === 0 ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex flex-col items-center justify-center py-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h2 className="mt-3 text-base font-semibold text-foreground">开始创作</h2>
                <p className="mt-1 text-sm text-muted-foreground">输入提示词，或引用下方示例快速开始</p>
              </div>
              <div className="min-h-0 flex-1 px-5 pb-6">
                <Suspense fallback={<div className="flex items-center justify-center rounded-2xl border border-border/60 bg-muted/20 px-4 py-8 text-sm text-muted-foreground">示例区加载中…</div>}>
                  <ExampleGallery
                    mode="workspace"
                    onUseExample={(example) => void useExampleFull(example)}
                    onUsePromptOnly={useExamplePromptOnly}
                    onUseImageOnly={(example) => void useExampleImageOnly(example)}
                  />
                </Suspense>
              </div>
            </div>
          ) : (
            <div className="space-y-4 p-5">
              {activeConv.turns.map((turn) => (
                <div key={turn.id} className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={turn.mode === "generate" ? "default" : "secondary"}>
                      {turn.mode === "generate" ? "生成" : "参考图生成"}
                    </Badge>
                    <span className="text-sm break-words text-foreground">{turn.prompt}</span>
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
                          fileName={`gimg-${turn.mode}-${turn.created_at}-${idx + 1}.png`}
                          meta={{
                            created_at: turn.created_at,
                            model: turn.model || defaultModel,
                            mode: turn.mode,
                            size: turn.size,
                            scale: turn.scale,
                          }}
                          onReferenceGenerate={() => void pushImageToPrompt(img, "reference", turn.prompt)}
                          onReference={() => void pushImageToPrompt(img, "generate", turn.prompt)}
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
          onSubmit={handleSubmit}
          disabled={isGenerating}
          initialMode={pendingPrompt?.mode}
          initialPrompt={pendingPrompt?.prompt}
          initialFiles={pendingPrompt?.files}
          onInitialConsumed={consumePending}
          capabilities={capabilities}
          defaultQuality={defaultQuality}
        />
      </div>

      <EditModal
        open={legacyEditNoticeOpen}
        onClose={() => setLegacyEditNoticeOpen(false)}
      />
    </div>
  );
}
