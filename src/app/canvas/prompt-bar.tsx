import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from "react";
import { Send, X, Paperclip, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AttachmentRef, ModelCapabilities } from "@/types/image-workflow";
import { normalizeQualityForApiMode } from "@/store/settings";

export interface AttachedPromptFile extends AttachmentRef {}

export interface PromptOptions {
  size?: string;
  quality?: string;
  n?: number;
  aspectRatio?: string;
  negativePrompt?: string;
}

interface PromptBarProps {
  onSubmit: (prompt: string, files?: File[], options?: PromptOptions) => void;
  onCancel?: () => void;
  disabled?: boolean;
  initialPrompt?: string;
  initialFiles?: AttachedPromptFile[];
  onInitialConsumed?: () => void;
  capabilities?: ModelCapabilities;
  defaultQuality?: string;
  defaultN?: number;
  layout?: "bottom" | "side" | "workspace";
}

const DEFAULT_ASPECT_RATIO = "1:1";
const DEFAULT_SIZE = "1024x1024";
const OUTPUT_LONG_EDGE_BY_QUALITY: Record<string, number> = {
  medium: 2048,
  high: 4096,
};
const DIMENSION_GRANULARITY = 8;
const MIN_IMAGE_COUNT = 1;
const MAX_IMAGE_COUNT = 4;

const aspectRatioOptions = [
  { value: "1:1", title: "方形", size: "1024x1024", preview: "square" },
  { value: "5:4", title: "横屏", size: "1536x1024", preview: "landscape" },
  { value: "9:16", title: "故事", size: "1024x1536", preview: "portrait" },
  { value: "21:9", title: "超宽屏", size: "1536x1024", preview: "ultrawide" },
  { value: "16:9", title: "宽屏", size: "1536x1024", preview: "landscape" },
  { value: "4:3", title: "横屏", size: "1536x1024", preview: "landscape" },
  { value: "3:2", title: "宽幅", size: "1536x1024", preview: "landscape" },
  { value: "4:5", title: "标准", size: "1024x1536", preview: "portrait" },
  { value: "3:4", title: "竖版", size: "1024x1536", preview: "portrait" },
  { value: "2:3", title: "竖版", size: "1024x1536", preview: "portrait" },
];

const outputSizeOptions = [
  { value: "auto", label: "原图" },
  { value: "medium", label: "2K 高清" },
  { value: "high", label: "4K 高清" },
];

function clampImageCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return MIN_IMAGE_COUNT;
  return Math.min(MAX_IMAGE_COUNT, Math.max(MIN_IMAGE_COUNT, Math.round(parsed)));
}

function normalizeOutputQuality(value: unknown): string {
  const normalized = normalizeQualityForApiMode("codesonline", value);
  return outputSizeOptions.some((item) => item.value === normalized) ? normalized : "auto";
}

function getAspectInstruction(aspectRatio: string): string {
  return `Make the aspect ratio ${aspectRatio},`;
}

function buildPromptWithAspectInstruction(prompt: string, aspectRatio: string): string {
  const instruction = getAspectInstruction(aspectRatio);
  const trimmed = prompt.trim();
  if (!trimmed) return instruction;
  if (/^make the aspect ratio\s+[^,\n]+,/i.test(trimmed)) {
    return trimmed.replace(/^make the aspect ratio\s+[^,\n]+,/i, instruction);
  }
  return `${instruction}\n${trimmed}`;
}

function buildPromptWithNegativePrompt(prompt: string, negativePrompt: string): string {
  const trimmedNegative = negativePrompt.trim();
  if (!trimmedNegative) return prompt;
  return `${prompt}\n\n负面提示词：\n${trimmedNegative}`;
}

function resolveAspectSize(aspectRatio: string, availableSizes: string[]): string {
  const option = aspectRatioOptions.find((item) => item.value === aspectRatio) ?? aspectRatioOptions[0]!;
  if (availableSizes.includes(option.size)) return option.size;
  return availableSizes[0] ?? DEFAULT_SIZE;
}

function parseAspectRatio(aspectRatio: string): { width: number; height: number } {
  const [rawWidth, rawHeight] = aspectRatio.split(":").map((part) => Number(part));
  if (rawWidth === undefined || rawHeight === undefined || !Number.isFinite(rawWidth) || !Number.isFinite(rawHeight) || rawWidth <= 0 || rawHeight <= 0) {
    return { width: 1, height: 1 };
  }
  return { width: rawWidth, height: rawHeight };
}

function roundDimension(value: number): number {
  return Math.max(DIMENSION_GRANULARITY, Math.round(value / DIMENSION_GRANULARITY) * DIMENSION_GRANULARITY);
}

function resolveScaledAspectSize(aspectRatio: string, longEdge: number): string {
  const ratio = parseAspectRatio(aspectRatio);
  if (ratio.width >= ratio.height) {
    return `${longEdge}x${roundDimension((longEdge * ratio.height) / ratio.width)}`;
  }
  return `${roundDimension((longEdge * ratio.width) / ratio.height)}x${longEdge}`;
}

function resolveOutputSize(aspectRatio: string, outputQuality: string, availableSizes: string[]): string {
  const longEdge = OUTPUT_LONG_EDGE_BY_QUALITY[outputQuality];
  if (longEdge) return resolveScaledAspectSize(aspectRatio, longEdge);
  return resolveAspectSize(aspectRatio, availableSizes);
}

export function PromptBar({ onSubmit, onCancel, disabled, initialPrompt, initialFiles, onInitialConsumed, capabilities, defaultQuality, defaultN = 1, layout = "bottom" }: PromptBarProps) {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [files, setFiles] = useState<AttachedPromptFile[]>([]);
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT_RATIO);
  const [imageCount, setImageCount] = useState(() => clampImageCount(defaultN));
  const [quality, setQuality] = useState(() => normalizeOutputQuality(defaultQuality));
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const controlPanelScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      setFiles((prev) => {
        for (const f of prev) URL.revokeObjectURL(f.preview);
        return prev;
      });
    };
  }, []);

  useEffect(() => {
    if (!initialPrompt && !initialFiles?.length) return;
    if (initialPrompt) setPrompt(initialPrompt);
    if (initialFiles?.length) {
      setFiles((prev) => {
        const existingIds = new Set(prev.map((f) => f.id));
        const next = [...prev];
        const limit = capabilities?.maxReferenceImages ?? 4;
        for (const file of initialFiles) {
          if (next.length >= limit) break;
          if (existingIds.has(file.id)) continue;
          next.push(file);
        }
        return next;
      });
    }
    onInitialConsumed?.();
  }, [capabilities?.maxReferenceImages, initialFiles, initialPrompt, onInitialConsumed]);

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const found = prev.find((item) => item.id === id);
      if (found) URL.revokeObjectURL(found.preview);
      return prev.filter((item) => item.id !== id);
    });
  };

  const addFiles = (fileList: FileList | File[]) => {
    const limit = capabilities?.maxReferenceImages ?? 4;
    const incomingFiles = Array.from(fileList);
    const imageFiles = incomingFiles.filter((file) => file.type.startsWith("image/"));
    const duplicateKeys = new Set(files.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
    const dedupedFiles = imageFiles.filter((file) => !duplicateKeys.has(`${file.name}:${file.size}:${file.lastModified}`));
    const availableSlots = Math.max(0, limit - files.length);
    const acceptedFiles = dedupedFiles.slice(0, availableSlots);

    if (incomingFiles.length > imageFiles.length) {
      toast.error("仅支持导入图片文件");
    }
    if (imageFiles.length > 0 && dedupedFiles.length === 0) {
      toast.info("所选图片已在引用区，无需重复添加");
    }
    if (dedupedFiles.length > availableSlots) {
      toast.info(`最多可添加 ${limit} 张图片，已保留前 ${acceptedFiles.length} 张`);
    }

    if (acceptedFiles.length === 0) {
      return;
    }

    const newFiles: AttachedPromptFile[] = acceptedFiles.map((f) => ({
      id: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      preview: URL.createObjectURL(f),
      source: "upload",
      name: f.name,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item?.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addFiles(imageFiles);
    }
  };

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    const trimmedNegative = negativePrompt.trim();
    if (disabled) return;
    if (!trimmed && files.length === 0) return;

    const availableSizes = capabilities?.resolutions?.length ? capabilities.resolutions : [DEFAULT_SIZE, "1024x1536", "1536x1024"];
    const nextSize = resolveOutputSize(aspectRatio, quality, availableSizes);
    const nextPrompt = buildPromptWithNegativePrompt(buildPromptWithAspectInstruction(trimmed, aspectRatio), trimmedNegative);

    onSubmit(nextPrompt, files.length > 0 ? files.map((f) => f.file) : undefined, {
      size: nextSize,
      quality,
      n: imageCount,
      aspectRatio,
      negativePrompt: trimmedNegative || undefined,
    });
    setPrompt("");
    setNegativePrompt("");
    files.forEach((f) => URL.revokeObjectURL(f.preview));
    setFiles([]);
  };

  const handlePrimaryAction = () => {
    if (disabled) {
      onCancel?.();
      return;
    }
    handleSubmit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    const normalizedQuality = normalizeOutputQuality(quality ?? defaultQuality);
    if (normalizedQuality !== quality) {
      setQuality(normalizedQuality);
    }
  }, [defaultQuality, quality]);

  useEffect(() => {
    setImageCount(clampImageCount(defaultN));
  }, [defaultN]);

  useEffect(() => {
    if (layout !== "workspace" || files.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      const scrollRoot = controlPanelScrollRef.current;
      if (scrollRoot) {
        scrollRoot.scrollTop = scrollRoot.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [files.length, layout]);

  const canSubmit = !disabled && (!!prompt.trim() || files.length > 0);
  const actionDisabled = disabled ? !onCancel : !canSubmit;
  const isWorkspaceLayout = layout === "workspace";

  const attachmentsPanel = files.length > 0 && (
        <div className="mb-3 rounded-2xl border border-border bg-muted/20 p-2.5" data-testid="prompt-attachments-panel">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span data-testid="prompt-attachments-count">引用图片（{files.length}/{capabilities?.maxReferenceImages ?? 4}）</span>
            <span>首张图片优先作为参考主图</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {files.map((f, index) => (
              <div key={f.id} className={cn("group relative shrink-0 overflow-hidden rounded-xl border border-border", index === 0 ? "ring-2 ring-primary" : "") }>
                <img src={f.preview} alt={f.file.name} className="h-16 w-16 object-cover" data-testid="prompt-attachment-preview" />
                <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-[10px] leading-4 text-white">
                  <span className="block truncate">{index === 0 ? "主参考图" : f.file.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                  aria-label="移除图片"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
  );

  const parameterPanel = (
      <div className="prompt-parameter-panel">
        <div className="prompt-parameter-heading">
          <span>画面比例</span>
          <span>{aspectRatio}</span>
        </div>
        <div className="prompt-aspect-grid" role="group" aria-label="画面比例">
          {aspectRatioOptions.map((item) => (
            <button
              key={item.value}
              type="button"
              className={cn("prompt-aspect-button", aspectRatio === item.value && "prompt-aspect-button--active")}
              onClick={() => setAspectRatio(item.value)}
              disabled={disabled}
              aria-label={`选择画面比例 ${item.title} ${item.value}`}
              aria-pressed={aspectRatio === item.value}
            >
              <span className={cn("prompt-aspect-preview", `prompt-aspect-preview--${item.preview}`)} aria-hidden="true" />
              <span className="prompt-aspect-title">{item.title}</span>
              <span className="prompt-aspect-value">{item.value}</span>
            </button>
          ))}
        </div>
        <div className="prompt-count-row">
          <label htmlFor="prompt-image-count">张数</label>
          <span>{imageCount}</span>
        </div>
        <input
          id="prompt-image-count"
          aria-label="生成张数"
          type="range"
          min={MIN_IMAGE_COUNT}
          max={MAX_IMAGE_COUNT}
          step={1}
          value={imageCount}
          onChange={(event) => setImageCount(clampImageCount(event.target.value))}
          disabled={disabled}
          className="prompt-count-slider"
        />
        <div className="prompt-output-panel">
          <div className="prompt-parameter-heading">
            <span>输出尺寸</span>
          </div>
          <div className="prompt-output-segment" role="group" aria-label="输出尺寸">
            {outputSizeOptions.map((item) => (
              <button
                key={item.value}
                type="button"
                className={cn("prompt-output-button", quality === item.value && "prompt-output-button--active")}
                onClick={() => setQuality(item.value)}
                disabled={disabled}
                aria-pressed={quality === item.value}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
  );

  const inputPanel = (
      <div className={cn("prompt-input-row flex items-end gap-3", isWorkspaceLayout && "prompt-input-row--workspace")}>
        {isWorkspaceLayout && (
          <div className="prompt-field-stack">
            <label className="prompt-field-label" htmlFor="prompt-negative-input">负面提示词</label>
            <textarea
              id="prompt-negative-input"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="不想出现的内容，例如：低清晰度、畸形手指、文字错误..."
              disabled={disabled}
              rows={3}
              className="prompt-textarea prompt-textarea--negative"
            />
            <label className="prompt-field-label" htmlFor="prompt-positive-input">正向提示词</label>
            <textarea
              id="prompt-positive-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="描述你想生成的画面..."
              disabled={disabled}
              rows={4}
              className="prompt-textarea prompt-textarea--positive"
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "shrink-0 rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            isWorkspaceLayout && "prompt-attach-button",
          )}
          title="上传图片"
          aria-label="上传图片"
        >
          <Paperclip className="h-4 w-4" />
          {isWorkspaceLayout && <span>添加参考图</span>}
        </button>
        <input
          ref={(node) => { fileInputRef.current = node; }}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        {!isWorkspaceLayout && (
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="输入提示词，可只传图片让模型参考生成..."
            disabled={disabled}
            rows={1}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        )}
        <Button
          size={isWorkspaceLayout ? "lg" : "icon"}
          variant={disabled ? "destructive" : "default"}
          onClick={handlePrimaryAction}
          disabled={actionDisabled}
          className={cn("shrink-0 rounded-2xl", isWorkspaceLayout && "prompt-generate-button")}
          aria-label={disabled ? "停止生成" : isWorkspaceLayout ? "生成" : "发送"}
          title={disabled ? "停止生成" : isWorkspaceLayout ? "生成" : "发送"}
        >
          {disabled ? <Square className="h-4 w-4 fill-current" /> : <Send className="h-4 w-4" />}
          {isWorkspaceLayout && <span>{disabled ? "停止生成" : "生成"}</span>}
        </Button>
      </div>
  );

  if (layout === "workspace") {
    return (
      <aside className="canvas-control-panel" aria-label="图片生成设置">
        <div className="canvas-control-panel-scroll" ref={controlPanelScrollRef}>
          <div className="prompt-bar-shell prompt-bar-shell--workspace-settings">
            {parameterPanel}
          </div>
          <div className="prompt-bar-shell prompt-bar-shell--workspace-composer">
            {attachmentsPanel}
            {inputPanel}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <div className={cn("prompt-bar-shell", layout === "side" ? "prompt-bar-shell--side" : "prompt-bar-shell--bottom")}>
      {attachmentsPanel}
      {parameterPanel}
      {inputPanel}
    </div>
  );
}
