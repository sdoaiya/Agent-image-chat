import { useState } from "react";
import { Aperture, FolderOpen } from "lucide-react";
import { type ExamplePromptItem } from "@/data/example-prompts";
import { ExampleGallery } from "@/components/examples/example-gallery";

export function ExamplesPage() {
  const [category, setCategory] = useState<ExamplePromptItem["category"] | "all">("all");
  const [galleryView, setGalleryView] = useState<"featured" | "topics">("featured");
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const headerCategories: Array<{ value: ExamplePromptItem["category"] | "all"; label: string }> = [
    { value: "all", label: "全部" },
    { value: "portrait", label: "人像" },
    { value: "poster", label: "海报" },
    { value: "ui", label: "UI" },
    { value: "character", label: "角色" },
    { value: "infographic", label: "图鉴" },
    { value: "community", label: "社区" },
  ];

  return (
    <div className="examples-page-shell flex h-full min-h-0 flex-col overflow-hidden">
      <header
        className="examples-page-titlebar titlebar-drag flex shrink-0 items-center gap-3 border-b border-border bg-background/80 px-5 py-3 backdrop-blur-sm"
        style={{ paddingTop: "calc(env(titlebar-area-height, 32px) * 0.5)" }}
      >
        <div className="examples-page-app-badge titlebar-no-drag">
          <Aperture className="h-4 w-4" aria-hidden="true" />
        </div>
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
        <button
          type="button"
          className="titlebar-no-drag examples-page-status-pill ml-auto inline-flex items-center gap-2"
          onClick={() => {
            setGalleryView("topics");
            setActiveTopicId(null);
          }}
          aria-label="全部专题"
        >
          <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
          全部专题
        </button>
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
            hideToolbar
          />
        </div>
      </div>
    </div>
  );
}
