import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
  },
}));

import { ExampleGallery } from "@/components/examples/example-gallery";

describe("ExampleGallery", () => {
  it("keeps the workspace card action group available", () => {
    const { container } = render(
      <MemoryRouter>
        <ExampleGallery mode="workspace" />
      </MemoryRouter>,
    );

    const actionButtons = container.querySelectorAll("button.example-card-button");
    expect(actionButtons.length).toBeGreaterThan(0);
    expect(actionButtons.length % 3).toBe(0);
    expect(container.querySelectorAll("a.example-card-button")).toHaveLength(0);
  });

  it("falls back to prompt-only action labels when image is unavailable", () => {
    render(
      <MemoryRouter>
        <ExampleGallery mode="workspace" />
      </MemoryRouter>,
    );

    const failedImage = screen.getAllByRole("img")[0];
    expect(failedImage).toBeTruthy();
    fireEvent.error(failedImage as HTMLElement);

    expect(screen.getAllByRole("button", { name: /图片不可用/ }).length).toBeGreaterThan(0);
  });

  it("adds search, source and sort controls without restoring legacy card meta clutter", () => {
    const { container } = render(
      <MemoryRouter>
        <ExampleGallery mode="gallery" />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/348 个案例/)).toBeNull();
    expect(screen.queryByRole("button", { name: "热门" })).toBeNull();
    expect(screen.queryByRole("button", { name: "最新" })).toBeNull();
    expect(screen.getByRole("searchbox", { name: "搜索示例" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "来源筛选" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "排序字段" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "切换为升序" })).toBeTruthy();
    expect(screen.queryByText(/完整画廊当前收录/)).toBeNull();
    expect(screen.queryByText(/本地图集已接入/)).toBeNull();
    expect(container.querySelector(".example-gallery-status-panel")).toBeNull();
    expect(container.querySelector(".example-gallery-grid--gallery .example-category-badge")).toBeNull();
    expect(container.querySelector(".example-gallery-grid--gallery .example-masonry-author")).toBeNull();
    expect(container.querySelector(".example-gallery-grid--gallery .example-masonry-tags")).toBeNull();
    expect(container.querySelector(".example-masonry-cta")).toBeNull();
    expect(container.querySelector(".example-masonry-source")).toBeNull();
    expect(container.querySelectorAll("a.example-media-icon-button")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "加载更多" })).toBeNull();
    expect(container.querySelector(".example-infinite-sentinel")?.textContent).toContain("继续加载");
    expect(screen.getByRole("button", { name: "回到顶部" })).toBeTruthy();
  });

  it("continues loading the gallery stream without leaving a passive spinner", () => {
    const { container } = render(
      <MemoryRouter>
        <ExampleGallery mode="gallery" />
      </MemoryRouter>,
    );

    const initialCount = container.querySelectorAll(".example-masonry-card").length;
    expect(container.querySelector(".example-infinite-button .animate-spin")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "继续加载" }));

    expect(container.querySelectorAll(".example-masonry-card").length).toBeGreaterThan(initialCount);
  });

  it("keeps loading beyond the previous 138-item gallery cap", () => {
    const { container } = render(
      <MemoryRouter>
        <ExampleGallery mode="gallery" />
      </MemoryRouter>,
    );

    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "继续加载" }));
    }

    expect(container.querySelectorAll(".example-masonry-card").length).toBeGreaterThan(138);
  });

  it("filters the all examples stream by search query and source", () => {
    const { container } = render(
      <MemoryRouter>
        <ExampleGallery mode="gallery" />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索示例" }), { target: { value: "AP Calculus" } });

    expect(screen.getByText("AP Calculus 学习表信息图")).toBeTruthy();
    expect(container.querySelectorAll(".example-masonry-card")).toHaveLength(1);

    fireEvent.change(screen.getByRole("combobox", { name: "来源筛选" }), { target: { value: "youmind" } });

    expect(screen.getByText("当前筛选下暂无案例")).toBeTruthy();
  });

  it("opens a standalone image detail view from the image and keeps three reference actions", () => {
    const { container } = render(
      <MemoryRouter>
        <ExampleGallery mode="gallery" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /查看图片详情：/ })[0]!);

    expect(screen.getAllByRole("region", { name: "图片详情" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "关闭图片详情" })).toBeTruthy();
    expect(screen.getByText("图片提示词")).toBeTruthy();
    expect(container.querySelector(".example-detail-image")).toBeTruthy();
    expect(container.querySelectorAll(".example-detail-actions button.example-card-button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "一键引用：提示词 + 参照图" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "只引用提示词" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "只引用参照图" })).toBeTruthy();
  });

  it("offers an all examples view switch next to the topics switch", () => {
    render(
      <MemoryRouter>
        <ExampleGallery mode="gallery" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "全部专题" }));
    expect(screen.getByRole("heading", { name: "全部专题" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "全部示例" }));
    expect(screen.queryByRole("heading", { name: "全部专题" })).toBeNull();
  });

  it("opens the topic list from the top entry, drills into detail, and supports back navigation", () => {
    render(
      <MemoryRouter>
        <ExampleGallery mode="gallery" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "全部专题" }));

    expect(screen.getByRole("heading", { name: "全部专题" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "返回示例" })).toBeTruthy();

    const topicButtons = screen.getAllByRole("button", { name: /打开专题：/ });
    expect(topicButtons.length).toBeGreaterThan(2);

    const topicWithMoreThanOnePage = topicButtons.find((button) => {
      const countText = button.getAttribute("aria-label")?.match(/共 (\d+) 个案例/)?.[1];
      return countText ? Number(countText) > 24 : false;
    });

    fireEvent.click(topicWithMoreThanOnePage ?? topicButtons[0]!);

    expect(screen.getByRole("button", { name: "返回专题" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "专题详情" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /查看专题来源：/ })).toBeNull();
    expect(screen.queryByText("原始来源")).toBeNull();
    if (topicWithMoreThanOnePage) {
      expect(document.querySelector(".example-infinite-sentinel")?.textContent).toContain("继续加载");
    }

    fireEvent.click(screen.getByRole("button", { name: "返回专题" }));

    expect(screen.getByRole("heading", { name: "全部专题" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /打开专题：/ }).length).toBeGreaterThan(2);

    fireEvent.click(screen.getByRole("button", { name: "返回示例" }));

    expect(screen.queryByRole("heading", { name: "全部专题" })).toBeNull();
  });

  it("uses full-cover topic cards and keeps topic detail cards at gallery size", () => {
    const { container } = render(
      <MemoryRouter>
        <ExampleGallery mode="gallery" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "全部专题" }));

    const topicCoverImages = Array.from(container.querySelectorAll<HTMLImageElement>(".example-topic-card img"));
    expect(topicCoverImages.length).toBeGreaterThan(0);
    expect(topicCoverImages.some((image) => image.className.includes("contain"))).toBe(false);

    fireEvent.click(screen.getAllByRole("button", { name: /打开专题：/ })[0]!);

    const firstTopicImageFrame = container.querySelector<HTMLElement>(".example-gallery-grid--topic-stream .example-media-shell");
    expect(firstTopicImageFrame).toBeTruthy();
    expect(Number.parseInt(firstTopicImageFrame?.style.minHeight ?? "0", 10)).toBeGreaterThanOrEqual(200);
  });

  it("filters the topic list by the current category", () => {
    render(
      <MemoryRouter>
        <ExampleGallery mode="gallery" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "UI" }));
    fireEvent.click(screen.getByRole("button", { name: "全部专题" }));

    expect(screen.getAllByRole("button", { name: /打开专题：/ })).toHaveLength(2);
  });

  it("applies source filtering to the topic branch as well as the flat stream", () => {
    render(
      <MemoryRouter>
        <ExampleGallery mode="gallery" />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "来源筛选" }), { target: { value: "youmind" } });
    fireEvent.click(screen.getByRole("button", { name: "全部专题" }));

    expect(screen.getByText("当前分类下暂无专题")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /打开专题：/ })).toBeNull();
  });
});
