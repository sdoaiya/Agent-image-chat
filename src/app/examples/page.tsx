import { ExampleGallery } from "@/components/examples/example-gallery";
import { examplePromptLibrary } from "@/data/example-prompts";
import { galleryTopicLibrary } from "@/data/gallery-topics";

export function ExamplesPage() {
  return (
    <div className="examples-page-shell flex h-full min-h-0 flex-col overflow-hidden">
      <header
        className="examples-page-titlebar titlebar-drag flex shrink-0 items-center justify-between gap-4 border-b border-border bg-background/80 px-5 py-3 backdrop-blur-sm"
        style={{ paddingTop: "calc(env(titlebar-area-height, 32px) * 0.5)" }}
      >
        <div className="title-block">
          <h2>示例库</h2>
          <p>延续源文件的分类、专题、搜索和引用逻辑，重做成独立的沉浸式图库工作台。</p>
        </div>
        <div className="examples-page-titlebar-status titlebar-no-drag">
          <span className="examples-page-status-pill">
            <strong>示例</strong> {examplePromptLibrary.length}
          </span>
          <span className="examples-page-status-pill">
            <strong>专题</strong> {galleryTopicLibrary.length}
          </span>
        </div>
      </header>

      <div className="examples-page-body min-h-0 flex-1 p-5">
        <div className="examples-page-workstation-frame examples-page-workstation-frame--immersive min-h-0 flex-1 overflow-hidden">
          <ExampleGallery mode="gallery" />
        </div>
      </div>
    </div>
  );
}
