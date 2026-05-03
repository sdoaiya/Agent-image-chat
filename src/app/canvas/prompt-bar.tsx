import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from "react";
import { Send, X, Paperclip, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AttachmentRef, ModelCapabilities } from "@/types/image-workflow";
import { getQualityOptionsByApiMode, normalizeQualityForApiMode } from "@/store/settings";

export interface AttachedPromptFile extends AttachmentRef {}

export interface PromptOptions {
  size?: string;
  quality?: string;
}

interface PromptBarProps {
  onSubmit: (prompt: string, files?: File[], options?: PromptOptions) => void;
  disabled?: boolean;
  initialPrompt?: string;
  initialFiles?: AttachedPromptFile[];
  onInitialConsumed?: () => void;
  capabilities?: ModelCapabilities;
  defaultQuality?: string;
}

const fallbackSizeOptions = [
  { value: "1024x1024", label: "1024 x 1024" },
  { value: "1024x1536", label: "1024 x 1536" },
  { value: "1536x1024", label: "1536 x 1024" },
];

export function PromptBar({ onSubmit, disabled, initialPrompt, initialFiles, onInitialConsumed, capabilities, defaultQuality }: PromptBarProps) {
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<AttachedPromptFile[]>([]);
  const [size, setSize] = useState(capabilities?.resolutions[0] ?? "1024x1024");
  const [quality, setQuality] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (!capabilities?.resolutions?.length) return;
    if (!capabilities.resolutions.includes(size)) {
      setSize(capabilities.resolutions[0]!);
    }
  }, [capabilities?.resolutions, size]);

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
    if (disabled) return;
    if (!trimmed && files.length === 0) return;

    onSubmit(trimmed, files.length > 0 ? files.map((f) => f.file) : undefined, {
      size,
      quality,
    });
    setPrompt("");
    files.forEach((f) => URL.revokeObjectURL(f.preview));
    setFiles([]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const sizeOptions = useMemo(() => {
    const source = capabilities?.resolutions?.length ? capabilities.resolutions : fallbackSizeOptions.map((item) => item.value);
    return source.map((value) => ({ value, label: value.replace("x", " x ") }));
  }, [capabilities?.resolutions]);

  const qualityOptions = useMemo(() => {
    return getQualityOptionsByApiMode("codesonline").map((value) => ({ value, label: value }));
  }, []);

  useEffect(() => {
    const normalizedQuality = normalizeQualityForApiMode("codesonline", quality ?? defaultQuality);
    if (normalizedQuality !== quality) {
      setQuality(normalizedQuality);
    }
  }, [defaultQuality, quality]);

  const canSubmit = !disabled && (!!prompt.trim() || files.length > 0);

  return (
    <div className="border-t border-border bg-card/90 p-4 backdrop-blur-sm">
      {files.length > 0 && (
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
      )}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <label className="flex items-center gap-1">
          分辨率
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-foreground"
            disabled={disabled}
          >
            {sizeOptions.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          质量
          <select
            value={quality ?? qualityOptions[0]?.value ?? "standard"}
            onChange={(e) => setQuality(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-foreground"
            disabled={disabled}
          >
            {qualityOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <span>支持文本、粘贴图与上传图统一生成。</span>
      </div>
      <div className="flex items-end gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="上传图片"
          aria-label="上传图片"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <input
          ref={(node) => { fileInputRef.current = node; }}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
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
        <Button size="icon" onClick={handleSubmit} disabled={!canSubmit} className="shrink-0 rounded-2xl" aria-label="发送">
          {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
