import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

describe("Canvas titlebar drag zones", () => {
  it("makes the app shell draggable while keeping controls no-drag", async () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const { CanvasPage } = await import("@/app/canvas/page");
    const { AppShell } = await import("@/app/layout");
    const { container } = render(
      <AppShell>
        <CanvasPage />
      </AppShell>,
    );

    expect(container.querySelector(".app-window-drag")).toBeTruthy();
    expect(container.querySelector("header.titlebar-drag")).toBeNull();

    const sidebarTitlebar = container.querySelector(".titlebar-drag");
    expect(sidebarTitlebar).toBeTruthy();

    const toggleButton = sidebarTitlebar?.querySelector("button");
    const createButton = sidebarTitlebar?.querySelectorAll("button")[1];
    expect(toggleButton).toBeTruthy();
    expect(createButton).toBeTruthy();
    expect(toggleButton?.className).not.toContain("titlebar-drag");
    expect(toggleButton?.closest(".titlebar-no-drag")).toBeTruthy();
    expect(createButton?.closest(".titlebar-no-drag")).toBeTruthy();
  });
});
