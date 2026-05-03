import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("sonner", () => ({
  Toaster: () => null,
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import App from "@/App";

describe("App routing", () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = "#/examples";
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("renders the examples route directly without the lazy loading fallback", () => {
    render(<App />);

    expect(screen.queryByText("页面加载中…")).toBeNull();
    expect(screen.getByRole("tab", { name: "全部" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "全部专题" })).toBeTruthy();
  });
});
