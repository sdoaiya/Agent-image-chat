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

    expect(container.querySelectorAll("button.example-card-button").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("a.example-card-button").length).toBeGreaterThan(0);
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

  it("removes legacy gallery counters, sort controls, status copy and card meta clutter", () => {
    const { container } = render(
      <MemoryRouter>
        <ExampleGallery mode="gallery" />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/348 个案例/)).toBeNull();
    expect(screen.queryByRole("button", { name: "热门" })).toBeNull();
    expect(screen.queryByRole("button", { name: "最新" })).toBeNull();
    expect(screen.queryByText(/完整画廊当前收录/)).toBeNull();
    expect(screen.queryByText(/本地图集已接入/)).toBeNull();
    expect(container.querySelector(".example-gallery-status-panel")).toBeNull();
    expect(container.querySelector(".example-gallery-grid--gallery .example-category-badge")).toBeNull();
    expect(container.querySelector(".example-gallery-grid--gallery .example-masonry-author")).toBeNull();
    expect(container.querySelector(".example-gallery-grid--gallery .example-masonry-tags")).toBeNull();
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

    fireEvent.click(topicButtons[0]!);

    expect(screen.getByRole("button", { name: "返回专题" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "专题详情" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /查看专题来源：/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "返回专题" }));

    expect(screen.getByRole("heading", { name: "全部专题" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /打开专题：/ }).length).toBeGreaterThan(2);

    fireEvent.click(screen.getByRole("button", { name: "返回示例" }));

    expect(screen.queryByRole("heading", { name: "全部专题" })).toBeNull();
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
});
