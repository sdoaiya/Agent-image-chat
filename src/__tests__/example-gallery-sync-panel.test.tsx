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

describe("ExampleGallery sync refresh control", () => {
  it("keeps the YouMind refresh action in the gallery toolbar without rendering the old status panel", () => {
    render(
      <MemoryRouter>
        <ExampleGallery mode="gallery" />
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText("YouMind \u540c\u6b65\u72b6\u6001")).toBeNull();
    expect(screen.queryByText("\u516c\u5f00\u793a\u4f8b\u540c\u6b65")).toBeNull();
    expect(screen.queryByText("YouMind README")).toBeNull();
    expect(screen.getByRole("button", { name: "\u7acb\u5373\u5237\u65b0" })).toBeTruthy();
  });

  it("triggers a manual refresh from the toolbar", () => {
    render(
      <MemoryRouter>
        <ExampleGallery mode="gallery" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "\u7acb\u5373\u5237\u65b0" }));

    expect(refreshNowMock).toHaveBeenCalledTimes(1);
  });
});
