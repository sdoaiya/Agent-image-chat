import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const refreshNowMock = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/hooks/use-youmind-prompt-sync", () => ({
  useYouMindPromptSync: () => ({
    canSync: true,
    status: "cached",
    items: [],
    total: 8273,
    syncedAt: "2026-05-31T02:30:00.000Z",
    pagesFetched: 3,
    error: null,
    refreshNow: refreshNowMock,
  }),
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
    expect(screen.getByRole("group", { name: "\u793a\u4f8b\u9875\u4e3b\u64cd\u4f5c" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "\u793a\u4f8b\u9875\u7b5b\u9009\u4e0e\u6392\u5e8f" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "\u5168\u90e8" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("searchbox", { name: "\u641c\u7d22\u793a\u4f8b" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "\u6765\u6e90\u7b5b\u9009" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "\u6392\u5e8f\u5b57\u6bb5" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "\u5168\u90e8\u793a\u4f8b" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "\u5168\u90e8\u4e13\u9898" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "\u7acb\u5373\u5237\u65b0" })).toBeTruthy();
    expect(screen.queryByLabelText("YouMind \u540c\u6b65\u72b6\u6001")).toBeNull();
  });

  it("refreshes YouMind examples from the page header", () => {
    render(
      <MemoryRouter>
        <ExamplesPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "\u7acb\u5373\u5237\u65b0" }));

    expect(refreshNowMock).toHaveBeenCalledTimes(1);
  });

  it("opens the topics branch from the page header entry", async () => {
    render(
      <MemoryRouter>
        <ExamplesPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "\u5168\u90e8\u4e13\u9898" }));

    expect(await screen.findByRole("heading", { name: "\u5168\u90e8\u4e13\u9898" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "\u8fd4\u56de\u793a\u4f8b" })).toBeTruthy();
  });

  it("switches back to all examples from the page header entry", async () => {
    render(
      <MemoryRouter>
        <ExamplesPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "\u5168\u90e8\u4e13\u9898" }));
    expect(await screen.findByRole("heading", { name: "\u5168\u90e8\u4e13\u9898" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "\u5168\u90e8\u793a\u4f8b" }));
    expect(screen.queryByRole("heading", { name: "\u5168\u90e8\u4e13\u9898" })).toBeNull();
  });
});
