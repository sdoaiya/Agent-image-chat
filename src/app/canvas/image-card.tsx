import { useEffect, useState, type MouseEvent } from "react";
import { Download, ExternalLink, Maximize2, Pencil, RefreshCw, Sparkles, Trash2 } from "lucide-react";
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
  onEdit?: () => void;
  onUpscale?: () => void;
  onReference?: () => void;
  onContinueEdit?: () => void;
  onRetry?: () => void;
  onDelete?: () => void;
  meta?: ImageMeta;
}

function imageSrc(image: ImageData): string {
  return image.b64_json ? `data:image/png;base64,${image.b64_json}` : image.url;
}

async function downloadImage(image: ImageData, fileName: string) {
  const src = imageSrc(image);
  if (!src) return;

  let href = src;
  let objectUrl: string | undefined;
  try {
    if (image.b64_json) {
      const bytes = Uint8Array.from(atob(image.b64_json), (char) => char.charCodeAt(0));
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
  if (image.b64_json) return Math.round((image.b64_json.length * 3) / 4);
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
    const bytes = Uint8Array.from(atob(image.b64_json), (char) => char.charCodeAt(0));
    return new File([bytes], fallbackName, { type: "image/png" });
  }
  const response = await fetch(src);
  const blob = await response.blob();
  return new File([blob], fallbackName, { type: blob.type || "image/png" });
}

export { fileFromImage, imageSrc };

export function ImageCard({ image, fileName = "generated-image.png", onEdit, onUpscale, onReference, onContinueEdit, onRetry, onDelete, meta }: ImageCardProps) {
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
  const modeLabel = meta?.mode === "edit" ? "编辑" : meta?.mode === "upscale" ? "放大" : "生成";
  const resolutionLabel = dimension
    ? `${dimension.width} × ${dimension.height}`
    : (image.width && image.height ? `${image.width} × ${image.height}` : (meta?.size ?? "分辨率读取中"));
  const stopAction = (action: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    action();
  };

  return (
    <>
      <div className="group flex h-full min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-lg">
        <div className="relative flex items-center justify-center bg-muted/10">
          {!loaded && <div className="h-64 w-full min-w-[16rem] animate-pulse rounded-t-2xl bg-muted" />}
          <button
            type="button"
            className="block w-full cursor-zoom-in text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setPreviewOpen(true)}
            aria-label="放大预览图片"
          >
            <img
              src={src}
              alt={image.revised_prompt ?? "Generated image"}
              className={`max-h-96 w-full object-contain ${loaded ? "block" : "hidden"}`}
              onLoad={() => setLoaded(true)}
            />
          </button>
          <div className="pointer-events-none absolute inset-0 flex flex-wrap items-start justify-end gap-1.5 p-3 rounded-2xl bg-black/40 opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100">
            <button onClick={stopAction(() => setPreviewOpen(true))} className="pointer-events-auto rounded-lg bg-white/20 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/30" title="放大预览">
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
        <div className="space-y-1 border-t border-border bg-card/95 px-3 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center justify-between gap-3">
            <span>{formatDate(meta?.created_at)}</span>
            <span>{modeLabel}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span>{resolutionLabel}</span>
            <span>{formatBytes(bytes)}</span>
            {meta?.scale && <span>{meta.scale}</span>}
          </div>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[92vh] max-w-[92vw] overflow-hidden p-4">
          <DialogHeader className="sr-only">
            <DialogTitle>图片预览</DialogTitle>
            <DialogDescription>查看生成图片的大图预览</DialogDescription>
          </DialogHeader>
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            {onReference && <button onClick={onReference} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">引用</button>}
            {onContinueEdit && <button onClick={onContinueEdit} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">继续编辑</button>}
            {onUpscale && <button onClick={onUpscale} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">放大</button>}
            <button onClick={() => void downloadImage(image, fileName)} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">导出</button>
          </div>
          <img src={src} alt={image.revised_prompt ?? "Generated image preview"} className="max-h-[84vh] max-w-full rounded-lg object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
