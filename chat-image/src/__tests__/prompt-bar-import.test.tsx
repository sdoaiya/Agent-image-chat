import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

describe("PromptBar local image import stability", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("仅附加图片也可提交，且清空后可重新选择同一文件", async () => {
    const onSubmit = vi.fn();
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-image");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const { PromptBar } = await import("@/app/canvas/prompt-bar");
    render(<PromptBar onSubmit={onSubmit} defaultQuality="auto" />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const firstFile = new File(["abc"], "ref.png", { type: "image/png", lastModified: 1 });
    fireEvent.change(fileInput, { target: { files: [firstFile] } });

    expect(screen.getByText(/引用图片（1\/4）/)).toBeTruthy();

    const submitButton = screen.getByRole("button", { name: "发送" });
    fireEvent.click(submitButton);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      "",
      [firstFile],
      expect.objectContaining({ quality: "auto", size: "1024x1024" }),
    );
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-image");

    const secondFile = new File(["abc"], "ref.png", { type: "image/png", lastModified: 1 });
    fireEvent.change(fileInput, { target: { files: [secondFile] } });
    expect(screen.getByText(/引用图片（1\/4）/)).toBeTruthy();

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("重复选择相同图片时应稳定提示且不重复追加", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-image");
    const infoSpy = (await import("sonner")).toast.info as ReturnType<typeof vi.fn>;

    const { PromptBar } = await import("@/app/canvas/prompt-bar");
    render(<PromptBar onSubmit={vi.fn()} defaultQuality="auto" />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["abc"], "ref.png", { type: "image/png", lastModified: 1 });

    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getAllByAltText("ref.png")).toHaveLength(1);
    expect(infoSpy).toHaveBeenCalledWith("所选图片已在引用区，无需重复添加");

    createObjectURL.mockRestore();
  });
});
