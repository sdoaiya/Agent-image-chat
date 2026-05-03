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

    const header = container.querySelector("header.titlebar-drag");
    expect(header).toBeTruthy();

    const noDragGroup = header?.querySelector(".titlebar-no-drag");
    expect(noDragGroup).toBeTruthy();

    const toggleButton = header?.querySelector("button");
    expect(toggleButton?.className).not.toContain("titlebar-drag");
    expect(toggleButton?.closest(".titlebar-no-drag")).toBeTruthy();

    const dragFillers = header?.querySelectorAll('[aria-hidden="true"]');
    expect(dragFillers?.length).toBeGreaterThanOrEqual(1);
  });
});
