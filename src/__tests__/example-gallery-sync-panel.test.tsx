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
    error: "HTTP 504",
    refreshNow: refreshNowMock,
  }),
}));

import { ExampleGallery } from "@/components/examples/example-gallery";

describe("ExampleGallery sync panel", () => {
  it("shows the upstream source, sync status, totals, and last sync time in gallery mode", () => {
    render(
      <MemoryRouter>
        <ExampleGallery mode="gallery" />
      </MemoryRouter>,
    );

    expect(screen.getByText("\u516c\u5f00\u793a\u4f8b\u540c\u6b65")).toBeTruthy();
    expect(screen.getByText("YouMind README")).toBeTruthy();
    expect(screen.getByText("\u7f13\u5b58\u53ef\u7528")).toBeTruthy();
    expect(screen.getByText("8,273")).toBeTruthy();
    expect(screen.getByText((content) => /^2026-05-31 \d{2}:30$/.test(content))).toBeTruthy();
    expect(screen.getByText("\u5426\uff0cREADME \u5df2\u4e3a\u4e3b\u8def\u5f84")).toBeTruthy();
    expect(screen.getByText("HTTP 504")).toBeTruthy();
    expect(screen.getByRole("button", { name: "\u7acb\u5373\u5237\u65b0" })).toBeTruthy();
  });

  it("triggers a manual refresh from the sync panel", () => {
    render(
      <MemoryRouter>
        <ExampleGallery mode="gallery" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "\u7acb\u5373\u5237\u65b0" }));

    expect(refreshNowMock).toHaveBeenCalledTimes(1);
  });
});
