import { useState } from "react";
import { ArrowDown10, ArrowUp10, FolderOpen, Images, RefreshCw, Search } from "lucide-react";
import { type ExamplePromptItem } from "@/data/example-prompts";
import type { ExampleSortField, ExampleSortOrder, ExampleSourceFilter } from "@/data/example-library";
import { ExampleGallery } from "@/components/examples/example-gallery";
import { useYouMindPromptSync } from "@/hooks/use-youmind-prompt-sync";
import { cn } from "@/lib/utils";

export function ExamplesPage() {
  const [category, setCategory] = useState<ExamplePromptItem["category"] | "all">("all");
  const [galleryView, setGalleryView] = useState<"featured" | "topics">("featured");
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<ExampleSourceFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<ExampleSortField>("time");
  const [sortOrder, setSortOrder] = useState<ExampleSortOrder>("desc");
  const youMindSync = useYouMindPromptSync({ enabled: true });

  const headerCategories: Array<{ value: ExamplePromptItem["category"] | "all"; label: string }> = [
    { value: "all", label: "全部" },
    { value: "portrait", label: "人像" },
    { value: "poster", label: "海报" },
    { value: "ui", label: "UI" },
    { value: "character", label: "角色" },
    { value: "infographic", label: "图鉴" },
    { value: "community", label: "社区" },
  ];

  const sourceFilterLabels: Record<ExampleSourceFilter, string> = {
    all: "全部来源",
    local: "本地",
    youmind: "YouMind",
  };

  const sortFieldLabels: Record<ExampleSortField, string> = {
    time: "时间",
    likes: "点赞",
    title: "标题",
  };

  return (
    <div className="examples-page-shell flex h-full min-h-0 flex-col overflow-hidden">
      <header
        className="examples-page-titlebar titlebar-drag flex shrink-0 flex-col gap-3 border-b border-border bg-background/80 px-5 py-3 backdrop-blur-sm"
        style={{ paddingTop: "calc(env(titlebar-area-height, 32px) * 0.5)" }}
      >
        <div className="examples-page-titlebar-main" role="group" aria-label="示例页主操作">
          <div className="titlebar-no-drag example-filter-group" role="tablist" aria-label="示例分类筛选">
            {headerCategories.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setCategory(item.value)}
                className={`example-filter-pill ${category === item.value ? "example-filter-pill--active" : ""}`}
                role="tab"
                aria-selected={category === item.value}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="examples-page-titlebar-status">
            <button
              type="button"
              className="titlebar-no-drag examples-page-status-pill inline-flex items-center gap-2"
              onClick={() => {
                setGalleryView("featured");
                setActiveTopicId(null);
              }}
              aria-label="全部示例"
            >
              <Images className="h-3.5 w-3.5" aria-hidden="true" />
              全部示例
            </button>
            <button
              type="button"
              className="titlebar-no-drag examples-page-status-pill inline-flex items-center gap-2"
              onClick={() => {
                setGalleryView("topics");
                setActiveTopicId(null);
              }}
              aria-label="全部专题"
            >
              <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
              全部专题
            </button>
            <button
              type="button"
              className="titlebar-no-drag examples-page-status-pill inline-flex items-center gap-2"
              onClick={youMindSync.refreshNow}
              disabled={!youMindSync.canSync || youMindSync.status === "syncing"}
              aria-label="立即刷新"
              title="立即刷新"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", youMindSync.status === "syncing" && "animate-spin")} aria-hidden="true" />
              {youMindSync.status === "syncing" ? "同步中" : "刷新"}
            </button>
          </div>
        </div>

        <div className="titlebar-no-drag examples-page-toolbar-controls" role="group" aria-label="示例页筛选与排序">
          <label className="example-search-control" aria-label="搜索示例">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索提示词 / 标题 / 作者"
              aria-label="搜索示例"
            />
          </label>

          <select
            className="example-filter-select"
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value as ExampleSourceFilter)}
            aria-label="来源筛选"
          >
            {Object.entries(sourceFilterLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            className="example-filter-select"
            value={sortField}
            onChange={(event) => setSortField(event.target.value as ExampleSortField)}
            aria-label="排序字段"
          >
            {Object.entries(sortFieldLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="example-view-pill example-sort-order-button"
            onClick={() => setSortOrder((current) => (current === "desc" ? "asc" : "desc"))}
            aria-label={sortOrder === "desc" ? "切换为升序" : "切换为降序"}
            title={sortOrder === "desc" ? "降序" : "升序"}
          >
            {sortOrder === "desc" ? <ArrowDown10 className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowUp10 className="h-3.5 w-3.5" aria-hidden="true" />}
            <span className="example-view-pill-label">{sortOrder === "desc" ? "降序" : "升序"}</span>
          </button>
        </div>
      </header>

      <div className="examples-page-body min-h-0 flex-1 p-5">
        <div className="examples-page-workstation-frame min-h-0 flex-1 overflow-hidden">
          <ExampleGallery
            mode="gallery"
            category={category}
            onCategoryChange={setCategory}
            galleryView={galleryView}
            onGalleryViewChange={setGalleryView}
            activeTopicId={activeTopicId}
            onActiveTopicChange={setActiveTopicId}
            sourceFilter={sourceFilter}
            onSourceFilterChange={setSourceFilter}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            sortField={sortField}
            onSortFieldChange={setSortField}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
            youMindSyncState={youMindSync}
            hideToolbar
          />
        </div>
      </div>
    </div>
  );
}
