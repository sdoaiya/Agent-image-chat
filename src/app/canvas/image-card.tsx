import { useEffect, useState, type MouseEvent } from "react";
import { Download, ExternalLink, FileText, ImagePlus, Images, Maximize2, Pencil, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import type { ImageData, ImageMeta } from "@/store/conversations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ImageCardProps {
  image: ImageData;
  fileName?: string;
  prompt?: string;
  onEdit?: () => void;
  onUpscale?: () => void;
  onReference?: () => void;
  onPromptReference?: () => void;
  onImageReference?: () => void;
  onContinueEdit?: () => void;
  onRetry?: () => void;
  onDelete?: () => void;
  meta?: ImageMeta;
}

function normalizeBase64Image(value: string): string {
  const trimmed = value.trim();
  const commaIndex = trimmed.indexOf(",");
  if (trimmed.startsWith("data:") && commaIndex >= 0) {
    return trimmed.slice(commaIndex + 1).trim();
  }
  return trimmed;
}

function imageSrc(image: ImageData): string {
  if (!image.b64_json) return image.url;
  const trimmed = image.b64_json.trim();
  if (trimmed.startsWith("data:")) return trimmed;
  return `data:image/png;base64,${trimmed}`;
}

async function downloadImage(image: ImageData, fileName: string) {
  const src = imageSrc(image);
  if (!src) return;

  let href = src;
  let objectUrl: string | undefined;
  try {
    if (image.b64_json) {
      const bytes = Uint8Array.from(atob(normalizeBase64Image(image.b64_json)), (char) => char.charCodeAt(0));
      const blob = new Blob([bytes], { type: "image/png" });
      objectUrl = URL.createObjectURL(blob);
      href = objectUrl;
    } else if (window.electronAPI?.saveImage) {
      const response = await fetch(src);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = Array.from(new Uint8Array(arrayBuffer));
      const result = await window.electronAPI.saveImage({
        defaultPath: fileName.endsWith(".png") ? fileName : `${fileName}.png`,
        bytes,
      });
      if (result?.saved) return;
    } else {
      const response = await fetch(src);
      if (response.ok) {
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: "image/png" }));
        href = objectUrl;
      }
    }
  } catch {
    href = src;
  }

  const link = document.createElement("a");
  link.href = href;
  link.download = fileName.endsWith(".png") ? fileName : `${fileName}.png`;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function estimateBytes(image: ImageData, src: string): number | undefined {
  if (image.bytes) return image.bytes;
  if (image.b64_json) return Math.round((normalizeBase64Image(image.b64_json).length * 3) / 4);
  const match = src.match(/;base64,([A-Za-z0-9+/=]+)/);
  return match ? Math.round((match[1]!.length * 3) / 4) : undefined;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "大小未知";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(ts?: number): string {
  return ts ? new Date(ts).toLocaleString() : "时间未知";
}

async function readImageMeta(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
}

async function fileFromImage(image: ImageData, fallbackName = "reference.png"): Promise<File | null> {
  const src = imageSrc(image);
  if (!src) return null;
  if (image.b64_json) {
    const bytes = Uint8Array.from(atob(normalizeBase64Image(image.b64_json)), (char) => char.charCodeAt(0));
    return new File([bytes], fallbackName, { type: "image/png" });
  }
  const response = await fetch(src);
  const blob = await response.blob();
  return new File([blob], fallbackName, { type: blob.type || "image/png" });
}

export { fileFromImage, imageSrc };

export function ImageCard({
  image,
  fileName = "generated-image.png",
  prompt,
  onEdit,
  onUpscale,
  onReference,
  onPromptReference,
  onImageReference,
  onContinueEdit,
  onRetry,
  onDelete,
  meta,
}: ImageCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const src = imageSrc(image);
  const [dimension, setDimension] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    readImageMeta(src)
      .then((next) => {
        if (!cancelled) setDimension(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!src) return null;

  const bytes = estimateBytes(image, src);
  const detailPrompt = prompt?.trim() || image.revised_prompt?.trim() || "暂无提示词";
  const revisedPrompt = image.revised_prompt?.trim();
  const showRevisedPrompt = Boolean(revisedPrompt && revisedPrompt !== detailPrompt);
  const modeLabel = meta?.mode === "edit" ? "编辑" : meta?.mode === "upscale" ? "放大" : "生成";
  const providerLabel = image.provider || image.source || meta?.provider;
  const resolutionLabel = dimension
    ? `${dimension.width} × ${dimension.height}`
    : (image.width && image.height ? `${image.width} × ${image.height}` : (meta?.size ?? "分辨率读取中"));
  const stopAction = (action: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    action();
  };

  return (
    <>
      <div className="canvas-result-card group flex h-full min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-lg">
        <div className="canvas-result-media relative flex items-center justify-center bg-muted/10">
          {!loaded && <div className="canvas-result-skeleton h-64 w-full min-w-[16rem] animate-pulse rounded-t-2xl bg-muted" />}
          <button
            type="button"
            className="block w-full cursor-zoom-in text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setPreviewOpen(true)}
            aria-label="查看图片详情"
          >
            <img
              src={src}
              alt={image.revised_prompt ?? "Generated image"}
              className={`max-h-96 w-full object-contain ${loaded ? "block" : "hidden"}`}
              onLoad={() => setLoaded(true)}
            />
          </button>
          <div className="canvas-result-overlay pointer-events-none absolute inset-0 flex flex-wrap items-start justify-end gap-1.5 p-3 rounded-2xl bg-black/40 opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100">
            <button onClick={stopAction(() => setPreviewOpen(true))} className="pointer-events-auto rounded-lg bg-white/20 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/30" title="打开图片详情" aria-label="打开图片详情">
              <Maximize2 className="h-4 w-4" />
            </button>
            {onEdit && (
              <button onClick={stopAction(onEdit)} className="pointer-events-auto rounded-lg bg-white/20 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/30" title="遮罩编辑">
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {onReference && (
              <button onClick={stopAction(onReference)} className="pointer-events-auto rounded-lg bg-white/20 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/30" title="作为引用图">
                <ExternalLink className="h-4 w-4" />
              </button>
            )}
            {onContinueEdit && (
              <button onClick={stopAction(onContinueEdit)} className="pointer-events-auto rounded-lg bg-white/20 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/30" title="继续编辑">
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {onUpscale && (
              <button onClick={stopAction(onUpscale)} className="pointer-events-auto rounded-lg bg-white/20 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/30" title="放大图片">
                <Sparkles className="h-4 w-4" />
              </button>
            )}
            <button onClick={stopAction(() => void downloadImage(image, fileName))} className="pointer-events-auto rounded-lg bg-white/20 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/30" title="导出 PNG">
              <Download className="h-4 w-4" />
            </button>
            {onRetry && (
              <button onClick={stopAction(onRetry)} className="pointer-events-auto rounded-lg bg-white/20 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/30" title="重试">
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
            {onDelete && (
              <button onClick={stopAction(onDelete)} className="pointer-events-auto rounded-lg bg-white/20 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/30" title="删除记录">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="canvas-result-meta space-y-1 border-t border-border bg-card/95 px-3 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center justify-between gap-3">
            <span>{formatDate(meta?.created_at)}</span>
            <span>{modeLabel}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span>{resolutionLabel}</span>
            <span>{formatBytes(bytes)}</span>
            {providerLabel && <span>来源：{providerLabel}</span>}
            {meta?.scale && <span>{meta.scale}</span>}
          </div>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="canvas-detail-dialog max-h-[92vh] w-[min(1120px,92vw)] max-w-none overflow-hidden p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>图片详情</DialogTitle>
            <DialogDescription>查看生成图片、提示词与引用操作</DialogDescription>
          </DialogHeader>
          <section className="canvas-detail-view" aria-label="图片详情">
            <div className="canvas-detail-image-panel">
              <img src={src} alt={image.revised_prompt ?? "Generated image preview"} className="canvas-detail-image" />
            </div>
            <aside className="canvas-detail-copy">
              <p className="canvas-detail-kicker">图片提示词</p>
              <h3 className="canvas-detail-title">{modeLabel}结果</h3>
              <p className="canvas-detail-prompt">{detailPrompt}</p>
              {showRevisedPrompt ? (
                <div className="canvas-detail-revised">
                  <p className="canvas-detail-kicker">模型修订提示词</p>
                  <p>{revisedPrompt}</p>
                </div>
              ) : null}
              <dl className="canvas-detail-meta">
                <div>
                  <dt>模型</dt>
                  <dd>{meta?.model ?? "未知"}</dd>
                </div>
                <div>
                  <dt>模式</dt>
                  <dd>{modeLabel}</dd>
                </div>
                <div>
                  <dt>分辨率</dt>
                  <dd>{resolutionLabel}</dd>
                </div>
                <div>
                  <dt>大小</dt>
                  <dd>{formatBytes(bytes)}</dd>
                </div>
                {providerLabel && (
                  <div>
                    <dt>来源</dt>
                    <dd>{providerLabel}</dd>
                  </div>
                )}
              </dl>
              <div className="canvas-detail-actions">
                {onReference && (
                  <button type="button" onClick={onReference} className="canvas-detail-action canvas-detail-action--primary" aria-label="一键引用：提示词 + 图片">
                    <ImagePlus className="h-3.5 w-3.5" />
                    <span>一键引用</span>
                  </button>
                )}
                {onPromptReference && (
                  <button type="button" onClick={onPromptReference} className="canvas-detail-action" aria-label="只引用提示词">
                    <FileText className="h-3.5 w-3.5" />
                    <span>仅提示词</span>
                  </button>
                )}
                {onImageReference && (
                  <button type="button" onClick={onImageReference} className="canvas-detail-action" aria-label="只引用图片">
                    <Images className="h-3.5 w-3.5" />
                    <span>仅图片</span>
                  </button>
                )}
              </div>
              <div className="canvas-detail-tools" aria-label="图片工具">
                {onContinueEdit && <button type="button" onClick={onContinueEdit} className="canvas-detail-tool">继续编辑</button>}
                {onUpscale && <button type="button" onClick={onUpscale} className="canvas-detail-tool">放大</button>}
                {onRetry && <button type="button" onClick={onRetry} className="canvas-detail-tool">重试</button>}
                <button type="button" onClick={() => void downloadImage(image, fileName)} className="canvas-detail-tool">导出</button>
                {onDelete && <button type="button" onClick={onDelete} className="canvas-detail-tool canvas-detail-tool--danger">删除</button>}
              </div>
            </aside>
          </section>
        </DialogContent>
      </Dialog>
    </>
  );
}
