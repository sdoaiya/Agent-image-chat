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
  it("keeps only the header controls needed by the examples workspace", () => {
    const { container } = render(
      <MemoryRouter>
        <ExamplesPage />
      </MemoryRouter>,
    );

    expect(container.querySelector(".examples-page-app-badge")).toBeNull();
    expect(container.querySelector(".example-filter-bar--sync-only")).toBeNull();
    expect(screen.getByRole("group", { name: "示例页主操作" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "示例页筛选与排序" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "全部" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("searchbox", { name: "搜索示例" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "来源筛选" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "排序字段" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "全部示例" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "全部专题" })).toBeTruthy();
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
