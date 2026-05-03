import { memo, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, FileText, FolderOpen, ImageOff, ImagePlus, Images, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { examplePromptDatasetSummary, examplePromptLibrary, type ExamplePromptItem } from "@/data/example-prompts";
import { galleryTopicLibrary, galleryTopicSeeds, type GalleryTopicItem } from "@/data/gallery-topics";
import { useExampleImport } from "@/store/example-import";
import type { AttachedPromptFile } from "@/app/canvas/prompt-bar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ExampleCategoryFilter = ExamplePromptItem["category"] | "all";
type ExampleGalleryView = "featured" | "topics";

interface ExampleGalleryProps {
  mode?: "workspace" | "gallery";
  category?: ExampleCategoryFilter;
  onCategoryChange?: (category: ExampleCategoryFilter) => void;
  galleryView?: ExampleGalleryView;
  onGalleryViewChange?: (view: ExampleGalleryView) => void;
  activeTopicId?: string | null;
  onActiveTopicChange?: (topicId: string | null) => void;
  hideToolbar?: boolean;
  onUseExample?: (example: ExamplePromptItem) => void;
  onUsePromptOnly?: (example: ExamplePromptItem) => void;
  onUseImageOnly?: (example: ExamplePromptItem) => void;
}

const categoryLabels: Record<ExampleCategoryFilter, string> = {
  all: "全部",
  portrait: "人像",
  poster: "海报",
  ui: "UI",
  character: "角色",
  infographic: "图鉴",
  community: "社区",
};

const PAGE_SIZE_WORKSPACE = 6;
const PAGE_SIZE_GALLERY = 24;
const EXAMPLE_IMAGE_MAX_HEIGHT = 600;
const EXAMPLE_IMAGE_MIN_HEIGHT = 220;
const GALLERY_SEED_IDS = new Set(galleryTopicSeeds.flatMap((topic) => topic.entries.map((entry) => entry.id)));
const GALLERY_COLUMN_COUNT = 4;
const TOPIC_WATERFALL_COLUMN_COUNT = 6;
const DESKTOP_GALLERY_MIN_WIDTH = 960;

type GalleryImageState = "idle" | "loading" | "loaded" | "failed";

const EXAMPLE_IMAGE_MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function inferImageMimeType(imagePath: string): string {
  const ext = imagePath.split(".").pop()?.toLowerCase() ?? "jpg";
  return EXAMPLE_IMAGE_MIME_BY_EXT[ext] ?? "image/jpeg";
}

async function toAttachedPromptFile(item: ExamplePromptItem): Promise<AttachedPromptFile> {
  const response = await fetch(item.imageUrl, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const mimeType = blob.type || inferImageMimeType(item.imagePath);
  const extension = item.imagePath.split(".").pop()?.toLowerCase() ?? "jpg";
  const file = new File([blob], `${item.id}.${extension}`, { type: mimeType });

  return {
    id: `${item.id}-reference`,
    file,
    preview: URL.createObjectURL(file),
    source: "workspace",
    name: file.name,
  };
}

function getImageFallbackMessage(item: Pick<ExamplePromptItem, "title" | "caseNumber">) {
  return `案例 #${item.caseNumber} 图片加载失败，可继续仅引用提示词。`;
}

function ExampleImageFallback({ item, isLoading, title }: { item: ExamplePromptItem; isLoading: boolean; title?: string }) {
  return (
    <div
      className="example-image-fallback"
      role={isLoading ? "status" : "note"}
      aria-live={isLoading ? "polite" : undefined}
    >
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageOff className="h-5 w-5" />}
      <div className="space-y-1 text-center">
        <p className="text-sm font-semibold text-foreground">{isLoading ? "图片加载中" : title ?? "图片暂不可用"}</p>
        <p className="text-xs leading-5 text-muted-foreground">{getImageFallbackMessage(item)}</p>
      </div>
    </div>
  );
}

function getCategoryCardClass(category: ExamplePromptItem["category"]) {
  switch (category) {
    case "portrait":
      return "example-card-tone example-card-tone--portrait";
    case "poster":
      return "example-card-tone example-card-tone--poster";
    case "ui":
      return "example-card-tone example-card-tone--ui";
    case "character":
      return "example-card-tone example-card-tone--character";
    case "infographic":
      return "example-card-tone example-card-tone--infographic";
    case "community":
      return "example-card-tone example-card-tone--community";
    default:
      return "example-card-tone";
  }
}

function getCategoryFrameClass(category: ExamplePromptItem["category"], mode: "workspace" | "gallery") {
  const modeClass = mode === "gallery" ? " example-media-shell--gallery" : " example-media-shell--workspace";

  switch (category) {
    case "portrait":
      return `example-media-shell example-media-shell--portrait${modeClass}`;
    case "poster":
      return `example-media-shell example-media-shell--poster${modeClass}`;
    case "ui":
      return `example-media-shell example-media-shell--ui${modeClass}`;
    case "character":
      return `example-media-shell example-media-shell--character${modeClass}`;
    case "infographic":
      return `example-media-shell example-media-shell--infographic${modeClass}`;
    case "community":
      return `example-media-shell example-media-shell--community${modeClass}`;
    default:
      return `example-media-shell${modeClass}`;
  }
}

function getCategoryImageClass(category: ExamplePromptItem["category"], width: number, height: number) {
  const ratio = width / height;

  switch (category) {
    case "portrait":
      return ratio <= 0.62
        ? "example-media-image example-media-image--cover example-media-image--focus-portrait"
        : "example-media-image example-media-image--cover example-media-image--focus-top";
    case "poster":
      return ratio >= 0.72
        ? "example-media-image example-media-image--cover"
        : "example-media-image example-media-image--contain-tight";
    case "ui":
      return ratio >= 1.55
        ? "example-media-image example-media-image--contain-edge"
        : "example-media-image example-media-image--contain-tight";
    case "character":
      return ratio >= 1.3
        ? "example-media-image example-media-image--cover"
        : "example-media-image example-media-image--contain-soft";
    case "infographic":
      return "example-media-image example-media-image--contain-edge";
    case "community":
      return ratio >= 0.86
        ? "example-media-image example-media-image--cover"
        : "example-media-image example-media-image--contain-tight";
    default:
      return "example-media-image example-media-image--contain-soft";
  }
}

function getImageFrameStyle(item: Pick<ExamplePromptItem, "width" | "height" | "category">): { aspectRatio: string; maxHeight: string; minHeight: string } {
  const width = Math.max(item.width || 1, 1);
  const height = Math.max(item.height || 1, 1);
  const ratio = width / height;

  let maxHeight = EXAMPLE_IMAGE_MAX_HEIGHT;
  let minHeight = EXAMPLE_IMAGE_MIN_HEIGHT;

  switch (item.category) {
    case "portrait":
      maxHeight = ratio <= 0.58 ? 560 : 520;
      minHeight = 280;
      break;
    case "poster":
      maxHeight = ratio <= 0.72 ? 520 : 460;
      minHeight = 240;
      break;
    case "ui":
      maxHeight = ratio >= 1.3 ? 360 : 420;
      minHeight = 220;
      break;
    case "character":
      maxHeight = ratio >= 1.45 ? 420 : 500;
      minHeight = 240;
      break;
    case "infographic":
      maxHeight = 540;
      minHeight = 260;
      break;
    case "community":
      maxHeight = ratio >= 0.9 ? 460 : 520;
      minHeight = 240;
      break;
    default:
      if (ratio <= 0.55) {
        maxHeight = 540;
      } else if (ratio <= 0.72) {
        maxHeight = 580;
      } else if (ratio >= 1.85) {
        maxHeight = 400;
        minHeight = 200;
      } else if (ratio >= 1.45) {
        maxHeight = 440;
        minHeight = 210;
      }
  }

  return {
    aspectRatio: `${width} / ${height}`,
    maxHeight: `${maxHeight}px`,
    minHeight: `${minHeight}px`,
  };
}

function getCompactImageFrameStyle(item: Pick<ExamplePromptItem, "width" | "height" | "category">): { aspectRatio: string; maxHeight: string; minHeight: string } {
  const base = getImageFrameStyle(item);
  const maxHeight = Number.parseInt(base.maxHeight, 10);
  const minHeight = Number.parseInt(base.minHeight, 10);
  const compactMaxHeight = Number.isFinite(maxHeight) ? Math.max(Math.round(maxHeight * 0.66), 220) : 320;
  const compactMinHeight = Number.isFinite(minHeight) ? Math.max(Math.round(minHeight * 0.6), 150) : 180;

  return {
    ...base,
    maxHeight: `${compactMaxHeight}px`,
    minHeight: `${compactMinHeight}px`,
  };
}

function ExampleActions({
  item,
  compact = false,
  disableImageActions = false,
  onUseExample,
  onUsePromptOnly,
  onUseImageOnly,
}: {
  item: ExamplePromptItem;
  compact?: boolean;
  disableImageActions?: boolean;
  onUseExample?: (example: ExamplePromptItem) => void;
  onUsePromptOnly?: (example: ExamplePromptItem) => void;
  onUseImageOnly?: (example: ExamplePromptItem) => void;
}) {
  const actionClassName = compact
    ? "example-media-icon-button"
    : "example-card-button inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted";

  return (
    <>
      <button
        type="button"
        onClick={() => onUseExample?.(item)}
        className={actionClassName}
        title={disableImageActions ? "图片不可用，点击后将退化为仅提示词" : "一键引用：提示词 + 参照图"}
        aria-label={disableImageActions ? "图片不可用，点击后将退化为仅提示词" : "一键引用：提示词 + 参照图"}
      >
        <ImagePlus className="h-3.5 w-3.5" />
        {!compact && <span>一键引用</span>}
      </button>
      <button
        type="button"
        onClick={() => onUsePromptOnly?.(item)}
        className={actionClassName}
        title="只引用提示词"
        aria-label="只引用提示词"
      >
        <FileText className="h-3.5 w-3.5" />
        {!compact && <span>仅提示词</span>}
      </button>
      <button
        type="button"
        onClick={() => onUseImageOnly?.(item)}
        className={actionClassName}
        title={disableImageActions ? "图片不可用，当前将退化为仅提示词" : "只引用参照图"}
        aria-label={disableImageActions ? "图片不可用，当前将退化为仅提示词" : "只引用参照图"}
      >
        <Images className="h-3.5 w-3.5" />
        {!compact && <span>仅参照图</span>}
      </button>
      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className={actionClassName}
        title="查看来源"
        aria-label="查看来源"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink className="h-3.5 w-3.5" />
        {!compact && <span>来源</span>}
      </a>
    </>
  );
}

function TopicCard({
  topic,
  onSelect,
  imageState,
  onImageStateChange,
}: {
  topic: GalleryTopicItem;
  onSelect: (topicId: string) => void;
  imageState: GalleryImageState;
  onImageStateChange: (key: string, state: GalleryImageState) => void;
}) {
  const imageFrameStyle = getImageFrameStyle({
    category: topic.category,
    width: topic.coverWidth,
    height: topic.coverHeight,
  });
  const mediaShellClassName = getCategoryFrameClass(topic.category, "gallery");
  const mediaImageClassName = getCategoryImageClass(topic.category, topic.coverWidth, topic.coverHeight);
  const cardToneClassName = getCategoryCardClass(topic.category);
  const imageAvailable = imageState !== "failed";
  const isImageLoading = imageState === "idle" || imageState === "loading";
  const fallbackItem = topic.entries[0]!;

  return (
    <article className={cn("examples-card group example-topic-card", cardToneClassName)}>
      <button
        type="button"
        className="example-topic-card-button"
        onClick={() => onSelect(topic.id)}
        aria-label={`打开专题：${topic.title}，共 ${topic.totalEntries} 个案例`}
      >
        <div className={cn(mediaShellClassName, "example-media-shell--masonry")} style={imageFrameStyle}>
          <div className="example-media-backdrop" aria-hidden="true" />
          {imageAvailable ? (
            <img
              src={topic.coverImageUrl}
              alt={`${topic.title} topic cover`}
              className={mediaImageClassName}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              onLoad={() => onImageStateChange(topic.id, "loaded")}
              onError={() => onImageStateChange(topic.id, "failed")}
            />
          ) : null}
          {isImageLoading || !imageAvailable ? <ExampleImageFallback item={fallbackItem} isLoading={isImageLoading} title={topic.title} /> : null}
          <div className="example-topic-overlay">
            <div className="example-topic-count">{topic.totalEntries} 个案例</div>
            <p className="example-topic-title">{topic.title}</p>
            <p className="example-topic-summary line-clamp-2">{topic.summary}</p>
            <span className="example-topic-expand" aria-hidden="true">打开专题</span>
          </div>
        </div>
      </button>
    </article>
  );
}

function GalleryExampleCard({
  item,
  mode,
  layout = "default",
  index,
  imageState,
  onImageStateChange,
  onImportExample,
  onImportPromptOnly,
  onImportImageOnly,
}: {
  item: ExamplePromptItem;
  mode: "workspace" | "gallery";
  layout?: "default" | "compact";
  index: number;
  imageState: GalleryImageState;
  onImageStateChange: (key: string, state: GalleryImageState) => void;
  onImportExample: (example: ExamplePromptItem) => void | Promise<void>;
  onImportPromptOnly: (example: ExamplePromptItem) => void | Promise<void>;
  onImportImageOnly: (example: ExamplePromptItem) => void | Promise<void>;
}) {
  const isGallery = mode === "gallery";
  const imageFrameStyle = layout === "compact" ? getCompactImageFrameStyle(item) : getImageFrameStyle(item);
  const width = Math.max(item.width || 1, 1);
  const height = Math.max(item.height || 1, 1);
  const mediaShellClassName = getCategoryFrameClass(item.category, mode);
  const mediaImageClassName = getCategoryImageClass(item.category, width, height);
  const cardToneClassName = getCategoryCardClass(item.category);
  const ratio = width / height;
  const imageAvailable = imageState !== "failed";
  const isImageLoading = imageState === "idle" || imageState === "loading";
  const compactOverlay = isGallery && ((item.category === "portrait" && ratio < 0.72) || (item.category === "community" && ratio > 0.72) || index % 5 === 1);
  const editorialOverlay = isGallery && (item.category === "poster" || item.category === "ui" || item.category === "infographic" || index % 4 === 0);
  const disableImageActions = !imageAvailable;

  return (
    <article
      key={item.id}
      className={cn(
        "examples-card group transition-all duration-300",
        isGallery
          ? "example-masonry-card"
          : "rounded-[1.7rem] border border-border/60 bg-card/96 shadow-[0_10px_30px_rgba(15,23,42,0.06)] hover:-translate-y-1 hover:border-primary/18 hover:shadow-[0_18px_44px_rgba(15,23,42,0.12)]",
        isGallery ? "example-card--gallery" : "example-card--workspace",
        compactOverlay && "example-masonry-card--compact",
        editorialOverlay && "example-masonry-card--editorial",
        cardToneClassName,
      )}
    >
      <div className={cn(isGallery ? "p-0" : "p-3 pb-2")}>
        <div className={cn(mediaShellClassName, isGallery && "example-media-shell--masonry")} style={imageFrameStyle}>
          <div className="example-media-backdrop" aria-hidden="true" />
          <div className="example-media-gloss" aria-hidden="true" />
          <div className="example-media-vignette" aria-hidden="true" />
          {imageAvailable ? (
            <img
              src={item.imageUrl}
              alt={item.imageAlt || item.title}
              className={mediaImageClassName}
              loading="lazy"
              decoding="async"
              fetchPriority={index < 4 ? "high" : "low"}
              onLoad={() => onImageStateChange(item.id, "loaded")}
              onError={() => onImageStateChange(item.id, "failed")}
            />
          ) : null}
          {isImageLoading || !imageAvailable ? <ExampleImageFallback item={item} isLoading={isImageLoading} /> : null}
          <div className="example-media-actions absolute right-3 top-3 flex gap-1.5 opacity-100 transition-opacity md:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
            <ExampleActions
              item={item}
              compact
              disableImageActions={disableImageActions}
              onUseExample={onImportExample}
              onUsePromptOnly={onImportPromptOnly}
              onUseImageOnly={onImportImageOnly}
            />
          </div>

          {isGallery ? (
            <div
              className={cn(
                "example-masonry-overlay",
                compactOverlay && "example-masonry-overlay--compact",
                editorialOverlay && "example-masonry-overlay--editorial",
              )}
            >
              <p className="example-masonry-title line-clamp-2">{item.title}</p>
              {!compactOverlay && <p className="example-masonry-summary line-clamp-2">{item.summary}</p>}
              <div className="example-masonry-bottom">
                <button
                  type="button"
                  onClick={() => void onImportExample(item)}
                  className="example-masonry-cta"
                  title={disableImageActions ? "图片不可用，点击后将退化为仅提示词" : "一键引用：提示词 + 参照图"}
                  aria-label={disableImageActions ? "图片不可用，点击后将退化为仅提示词" : "一键引用：提示词 + 参照图"}
                >
                  一键引用
                </button>
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="example-masonry-source"
                  title="查看来源"
                  aria-label="查看来源"
                  onClick={(e) => e.stopPropagation()}
                >
                  来源
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {!isGallery && (
        <div className="flex flex-1 flex-col gap-3 px-3 pb-3 pt-1">
          <div className="example-card-copy space-y-2 rounded-2xl border border-border/45 bg-muted/20 px-3 py-3">
            <div className="flex items-start gap-2">
              <p className="line-clamp-2 flex-1 text-[15px] font-semibold leading-6 text-foreground">{item.title}</p>
            </div>
            <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{item.summary}</p>
          </div>

          <div className="mt-auto example-card-actions example-card-actions-panel">
            <ExampleActions
              item={item}
              disableImageActions={disableImageActions}
              onUseExample={onImportExample}
              onUsePromptOnly={onImportPromptOnly}
              onUseImageOnly={onImportImageOnly}
            />
          </div>
        </div>
      )}
    </article>
  );
}

const MemoTopicCard = memo(TopicCard);
const MemoGalleryExampleCard = memo(GalleryExampleCard);

export function ExampleGallery({
  mode = "workspace",
  category: controlledCategory,
  onCategoryChange,
  galleryView: controlledGalleryView,
  onGalleryViewChange,
  activeTopicId: controlledActiveTopicId,
  onActiveTopicChange,
  hideToolbar = false,
  onUseExample,
  onUsePromptOnly,
  onUseImageOnly,
}: ExampleGalleryProps) {
  const navigate = useNavigate();
  const setExampleImportPending = useExampleImport((s) => s.setPending);
  const [localCategory, setLocalCategory] = useState<ExampleCategoryFilter>("all");
  const [page, setPage] = useState(1);
  const [localGalleryView, setLocalGalleryView] = useState<ExampleGalleryView>("featured");
  const [localActiveTopicId, setLocalActiveTopicId] = useState<string | null>(null);
  const [imageStates, setImageStates] = useState<Record<string, GalleryImageState>>({});
  const isGallery = mode === "gallery";
  const pageSize = isGallery ? PAGE_SIZE_GALLERY : PAGE_SIZE_WORKSPACE;
  const category = controlledCategory ?? localCategory;
  const galleryView = controlledGalleryView ?? localGalleryView;
  const activeTopicId = controlledActiveTopicId === undefined ? localActiveTopicId : controlledActiveTopicId;

  const setCategory = useCallback((next: ExampleCategoryFilter) => {
    if (controlledCategory === undefined) {
      setLocalCategory(next);
    }
    onCategoryChange?.(next);
  }, [controlledCategory, onCategoryChange]);

  const setGalleryView = useCallback((next: ExampleGalleryView) => {
    if (controlledGalleryView === undefined) {
      setLocalGalleryView(next);
    }
    onGalleryViewChange?.(next);
  }, [controlledGalleryView, onGalleryViewChange]);

  const setActiveTopicId = useCallback((next: string | null) => {
    if (controlledActiveTopicId === undefined) {
      setLocalActiveTopicId(next);
    }
    onActiveTopicChange?.(next);
  }, [controlledActiveTopicId, onActiveTopicChange]);

  useEffect(() => {
    setPage(1);
  }, [category, galleryView]);

  const filteredExamples = useMemo(() => {
    const base = examplePromptLibrary.filter((item) => category === "all" || item.category === category);

    return [...base].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [category]);

  const filteredTopics = useMemo(() => {
    const base = galleryTopicLibrary.filter((topic) => category === "all" || topic.category === category);

    return [...base].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [category]);

  const featuredExamples = useMemo(() => {
    if (!isGallery) {
      return filteredExamples;
    }

    const merged = filteredExamples.filter((item) => GALLERY_SEED_IDS.has(item.id));
    return merged.length ? merged : filteredExamples;
  }, [filteredExamples, isGallery]);

  const pagedExamples = useMemo(() => {
    const source = isGallery ? featuredExamples : filteredExamples;
    return source.slice(0, page * pageSize);
  }, [featuredExamples, filteredExamples, isGallery, page, pageSize]);

  const activeTopic = useMemo(
    () => (activeTopicId ? filteredTopics.find((topic) => topic.id === activeTopicId) ?? null : null),
    [activeTopicId, filteredTopics],
  );

  const visibleExampleCount = isGallery ? featuredExamples.length : filteredExamples.length;
  const hasMoreExamples = pagedExamples.length < visibleExampleCount;
  const categoryCaseCount = category === "all" ? examplePromptDatasetSummary.structuredCaseCount : filteredExamples.length;
  const shouldUseFourColumnGallery = isGallery && galleryView !== "topics";

  const setImageState = useCallback((key: string, state: GalleryImageState) => {
    setImageStates((current) => (current[key] === state ? current : { ...current, [key]: state }));
  }, []);

  const importExample = useCallback(async (item: ExamplePromptItem, variant: "full" | "prompt" | "image") => {
    if (variant === "prompt") {
      if (onUsePromptOnly) {
        onUsePromptOnly(item);
      } else {
        setExampleImportPending({ mode: "generate", prompt: item.prompt, files: [] });
        navigate("/");
        toast.success("已引用提示词");
      }
      return;
    }

    if (imageStates[item.id] === "failed") {
      if (variant === "image") {
        if (onUsePromptOnly) {
          onUsePromptOnly(item);
        } else {
          setExampleImportPending({ mode: "generate", prompt: item.prompt, files: [] });
          navigate("/");
        }
      } else if (onUsePromptOnly) {
        onUsePromptOnly(item);
      } else {
        setExampleImportPending({ mode: "generate", prompt: item.prompt, files: [] });
        navigate("/");
      }
      toast.info("示例图片加载失败，已退化为仅引用提示词");
      return;
    }

    if (variant === "image") {
      if (onUseImageOnly) {
        await onUseImageOnly(item);
      } else {
        setExampleImportPending({ mode: "generate", prompt: "", files: [] });
        navigate("/");
        toast.info("示例页暂不直接挂载工作台上传对象，请在工作台继续补充参照图。已为你打开工作台。", { duration: 2600 });
      }
      return;
    }

    if (variant === "full" && onUseExample) {
      await onUseExample(item);
    } else if (variant === "full") {
      try {
        const attachedFile = await toAttachedPromptFile(item);
        setExampleImportPending({ mode: "generate", prompt: item.prompt, files: [attachedFile] });
        navigate("/");
        toast.success("已引用提示词和参照图，工作台已打开");
      } catch {
        setExampleImportPending({ mode: "generate", prompt: item.prompt, files: [] });
        navigate("/");
        toast.info("示例图片加载失败，已退化为仅引用提示词");
      }
    }
  }, [imageStates, navigate, onUseExample, onUseImageOnly, onUsePromptOnly, setExampleImportPending]);

  const selectTopic = useCallback((topicId: string) => {
    setGalleryView("topics");
    setActiveTopicId(topicId);
  }, [setActiveTopicId, setGalleryView]);

  const openTopics = useCallback(() => {
    setGalleryView("topics");
    setActiveTopicId(null);
  }, [setActiveTopicId, setGalleryView]);

  const returnToFeatured = useCallback(() => {
    setActiveTopicId(null);
    setGalleryView("featured");
  }, [setActiveTopicId, setGalleryView]);

  const returnToTopicList = useCallback(() => {
    setActiveTopicId(null);
  }, [setActiveTopicId]);

  const handleImportFull = useCallback((example: ExamplePromptItem) => {
    void importExample(example, "full");
  }, [importExample]);

  const handleImportPromptOnly = useCallback((example: ExamplePromptItem) => {
    void importExample(example, "prompt");
  }, [importExample]);

  const handleImportImageOnly = useCallback((example: ExamplePromptItem) => {
    void importExample(example, "image");
  }, [importExample]);

  const gallerySectionTitleId = `example-gallery-title-${mode}`;
  const galleryResultsId = `example-gallery-results-${mode}`;
  const topicGalleryGridStyle = isGallery
    ? ({ ["--topic-waterfall-columns" as string]: `${TOPIC_WATERFALL_COLUMN_COUNT}` } satisfies CSSProperties)
    : undefined;

  useEffect(() => {
    if (activeTopicId && !filteredTopics.some((topic) => topic.id === activeTopicId)) {
      setActiveTopicId(null);
    }
  }, [activeTopicId, filteredTopics, setActiveTopicId]);

  const showingTopicList = isGallery && galleryView === "topics" && !activeTopic;
  const showingTopicDetail = isGallery && galleryView === "topics" && !!activeTopic;

  return (
    <section
      className={cn("example-gallery-shell flex h-full flex-col gap-4", isGallery && "example-gallery-shell--desktop")}
      aria-labelledby={gallerySectionTitleId}
      style={isGallery ? ({ ["--gallery-desktop-min-width" as string]: `${DESKTOP_GALLERY_MIN_WIDTH}px` } satisfies CSSProperties) : undefined}
    >
      <h2 id={gallerySectionTitleId} className="sr-only">
        {isGallery ? "示例完整画廊" : "示例工作台列表"}
      </h2>
      {!hideToolbar ? (
        <div className="example-filter-bar titlebar-no-drag" aria-label="示例筛选与视图切换工具栏">
          <div className="example-filter-group flex flex-wrap items-center gap-2" role="tablist" aria-label="示例分类筛选">
            {Object.entries(categoryLabels).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setCategory(value as ExampleCategoryFilter);
                }}
                className={cn("example-filter-pill", category === value && "example-filter-pill--active")}
                role="tab"
                aria-selected={category === value}
                aria-controls={galleryResultsId}
                id={`example-category-tab-${value}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="example-filter-side">
            {isGallery ? (
              <button
                type="button"
                onClick={openTopics}
                className={cn("example-view-pill", galleryView === "topics" && "example-view-pill--active")}
                aria-controls={galleryResultsId}
                aria-pressed={galleryView === "topics"}
                id="example-view-tab-topics"
                title="全部专题"
              >
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="example-view-pill-label">全部专题</span>
              </button>
            ) : (
              <span className="example-filter-count">{categoryCaseCount} 个案例</span>
            )}
          </div>
        </div>
      ) : null}

      {!isGallery ? (
        <div className="example-gallery-status-panel example-gallery-status-panel--workspace rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-xs leading-5 text-muted-foreground">
          <div className="example-workspace-panel-head">
            <div>
              <p className="example-workspace-panel-kicker">Workspace Picks</p>
              <p className="text-sm font-semibold text-foreground">工作台示例区</p>
            </div>
            <span className="example-workspace-panel-chip">支持一键引用 / 仅提示词 / 仅参照图</span>
          </div>
          <p className="mt-2">
            当前分类可用 {categoryCaseCount} 个案例，可直接带回工作台继续生成；若图片加载失败，会自动退化为仅提示词。
          </p>
        </div>
      ) : null}

      <div
        id={galleryResultsId}
        className={cn("example-gallery-results min-h-0 flex-1 overflow-y-auto sidebar-scrollbar", isGallery ? "pr-2" : "pr-1")}
        role="region"
        aria-live="polite"
        aria-label={showingTopicDetail ? "专题详情" : showingTopicList ? "专题列表" : "案例结果列表"}
      >
        {showingTopicList ? (
          <section className="example-topic-directory">
            <div className="example-topic-section-head example-topic-directory-head">
              <div>
                <p className="example-topic-section-kicker">专题入口</p>
                <h3 className="example-topic-section-title">全部专题</h3>
                <p className="example-topic-section-summary">先进入专题列表，再展开具体专题下的案例流。</p>
              </div>
              <button type="button" className="example-topic-back" onClick={returnToFeatured}>
                返回示例
              </button>
            </div>
            {filteredTopics.length ? (
              <div className="example-topic-rail">
                {filteredTopics.map((topic) => (
                  <MemoTopicCard
                    key={topic.id}
                    topic={topic}
                    onSelect={selectTopic}
                    imageState={imageStates[topic.id] ?? "idle"}
                    onImageStateChange={setImageState}
                  />
                ))}
              </div>
            ) : (
              <div className="example-empty-state">
                <p className="text-sm font-semibold text-foreground">当前分类下暂无专题</p>
                <p className="text-xs leading-5 text-muted-foreground">切换顶部分类，或返回示例继续浏览。</p>
              </div>
            )}
          </section>
        ) : showingTopicDetail && activeTopic ? (
          <section
            key={activeTopic.id}
            className="example-topic-section"
            id={`topic-panel-${activeTopic.id}`}
            aria-labelledby={`topic-panel-title-${activeTopic.id}`}
          >
            <div className="example-topic-section-head">
              <div className="flex min-w-0 flex-col gap-3">
                <button type="button" className="example-topic-back" onClick={returnToTopicList}>
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  返回专题
                </button>
                <div>
                  <p className="example-topic-section-kicker">专题详情</p>
                  <h3 id={`topic-panel-title-${activeTopic.id}`} className="example-topic-section-title">{activeTopic.title}</h3>
                  <p className="example-topic-section-summary">{activeTopic.summary}</p>
                </div>
              </div>
              <a href={activeTopic.sourceUrl} target="_blank" rel="noreferrer" className="example-topic-source" aria-label={`查看专题来源：${activeTopic.title}`}>
                原始来源
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
            <div
              className="example-gallery-grid example-gallery-grid--gallery example-gallery-grid--topic-stream example-gallery-grid--horizontal-waterfall"
              style={topicGalleryGridStyle}
            >
              {activeTopic.entries.map((item, index) => (
                <MemoGalleryExampleCard
                  key={`${activeTopic.id}-${item.id}`}
                  item={item}
                  mode="gallery"
                  layout="compact"
                  index={index}
                  imageState={imageStates[item.id] ?? "idle"}
                  onImageStateChange={setImageState}
                  onImportExample={handleImportFull}
                  onImportPromptOnly={handleImportPromptOnly}
                  onImportImageOnly={handleImportImageOnly}
                />
              ))}
            </div>
          </section>
        ) : (
          <div
            className={cn(
              "example-gallery-grid",
              isGallery ? "example-gallery-grid--gallery" : "example-gallery-grid--workspace",
              shouldUseFourColumnGallery && `example-gallery-grid--fixed-${GALLERY_COLUMN_COUNT}`,
            )}
          >
            {pagedExamples.length ? (
              pagedExamples.map((item, index) => (
                <MemoGalleryExampleCard
                  key={item.id}
                  item={item}
                  mode={mode}
                  index={index}
                  imageState={imageStates[item.id] ?? "idle"}
                  onImageStateChange={setImageState}
                  onImportExample={handleImportFull}
                  onImportPromptOnly={handleImportPromptOnly}
                  onImportImageOnly={handleImportImageOnly}
                />
              ))
            ) : (
              <div className="example-empty-state">
                <p className="text-sm font-semibold text-foreground">当前筛选下暂无案例</p>
                <p className="text-xs leading-5 text-muted-foreground">切换分类或进入全部专题继续浏览。</p>
              </div>
            )}
          </div>
        )}
      </div>

      {((isGallery && galleryView !== "topics" && hasMoreExamples) || (!isGallery && hasMoreExamples)) && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} className="gap-2">
            <Loader2 className="h-3.5 w-3.5" />
            加载更多（{pagedExamples.length}/{visibleExampleCount}）
          </Button>
        </div>
      )}
    </section>
  );
}
