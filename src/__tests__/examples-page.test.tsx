import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
  },
}));

import { ExamplesPage } from "@/app/examples/page";

describe("ExamplesPage", () => {
  it("keeps the page titlebar lightweight and lets the gallery own filtering", () => {
    const { container } = render(
      <MemoryRouter>
        <ExamplesPage />
      </MemoryRouter>,
    );

    expect(container.querySelector(".examples-page-app-badge")).toBeNull();
    expect(container.querySelector(".example-filter-bar--sync-only")).toBeNull();
    expect(screen.getByRole("heading", { name: "示例库" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "示例页主操作" })).toBeNull();
    expect(container.querySelector(".gallery-side .example-filter-bar")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "全部" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("searchbox", { name: "搜索示例" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "来源筛选" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "排序字段" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "全部示例" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "全部专题" })).toBeTruthy();
  });

  it("uses the locked immersive examples workspace shell without a side detail column", () => {
    const { container } = render(
      <MemoryRouter>
        <ExamplesPage />
      </MemoryRouter>,
    );

    expect(container.querySelector(".examples-page-workstation-frame--immersive")).toBeTruthy();
    expect(container.querySelector(".examples-layout")).toBeTruthy();
    expect(container.querySelector(".gallery-side")).toBeTruthy();
    expect(container.querySelector(".examples-canvas")).toBeTruthy();
    expect(container.querySelector(".example-side-panel")).toBeNull();
    expect(container.querySelector(".example-focus-strip")).toBeNull();
  });

  it("opens the topics branch from the page header entry", async () => {
    render(
      <MemoryRouter>
        <ExamplesPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "全部专题" }));

    expect(await screen.findByRole("heading", { name: "全部专题" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "返回示例" })).toBeTruthy();
  });

  it("switches back to all examples from the page header entry", async () => {
    render(
      <MemoryRouter>
        <ExamplesPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "全部专题" }));
    expect(await screen.findByRole("heading", { name: "全部专题" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "全部示例" }));
    expect(screen.queryByRole("heading", { name: "全部专题" })).toBeNull();
  });
});
