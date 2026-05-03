import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

describe("Canvas titlebar drag zones", () => {
  it("仅标题栏空白区可拖拽，交互控件保留 no-drag", async () => {
    const { CanvasPage } = await import("@/app/canvas/page");
    const { container } = render(
      <MemoryRouter>
        <CanvasPage />
      </MemoryRouter>,
    );

    expect(container.querySelector("header.titlebar-drag")).toBeNull();

    const sidebarTitlebar = container.querySelector(".titlebar-drag");
    expect(sidebarTitlebar).toBeTruthy();
    expect(sidebarTitlebar?.textContent).toContain("工作台");

    const toggleButton = sidebarTitlebar?.querySelector('button[aria-label="收起对话区"]');
    const createButton = sidebarTitlebar?.querySelector('button[aria-label="新建对话"]');
    expect(toggleButton).toBeTruthy();
    expect(createButton).toBeTruthy();
    expect(toggleButton?.className).not.toContain("titlebar-drag");
    expect(toggleButton?.closest(".titlebar-no-drag")).toBeTruthy();
    expect(createButton?.closest(".titlebar-no-drag")).toBeTruthy();
  });
});
