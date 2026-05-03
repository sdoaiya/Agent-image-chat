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
      "Make the aspect ratio 1:1,",
      [firstFile],
      expect.objectContaining({ aspectRatio: "1:1", n: 1, quality: "auto", size: "1024x1024" }),
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

  it("应提供画面比例、张数与输出尺寸参数，并随提交传出", async () => {
    const onSubmit = vi.fn();

    const { PromptBar } = await import("@/app/canvas/prompt-bar");
    render(<PromptBar onSubmit={onSubmit} defaultN={1} defaultQuality="auto" />);

    fireEvent.click(screen.getByRole("button", { name: "选择画面比例 竖版 2:3" }));
    fireEvent.change(screen.getByLabelText("生成张数"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "2K 高清" }));
    fireEvent.change(screen.getByPlaceholderText("输入提示词，可只传图片让模型参考生成..."), {
      target: { value: "一张产品海报" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(onSubmit).toHaveBeenCalledWith(
      "Make the aspect ratio 2:3,\n一张产品海报",
      undefined,
      expect.objectContaining({
        aspectRatio: "2:3",
        n: 3,
        quality: "medium",
        size: "1024x1536",
      }),
    );
  });

  it("张数滑杆应跟随设置默认张数更新", async () => {
    const { PromptBar } = await import("@/app/canvas/prompt-bar");
    const { rerender } = render(<PromptBar onSubmit={vi.fn()} defaultN={1} defaultQuality="auto" />);

    expect((screen.getByLabelText("生成张数") as HTMLInputElement).value).toBe("1");

    rerender(<PromptBar onSubmit={vi.fn()} defaultN={4} defaultQuality="auto" />);

    expect((screen.getByLabelText("生成张数") as HTMLInputElement).value).toBe("4");
  });

  it("生成中发送按钮应切换为停止并触发取消", async () => {
    const onCancel = vi.fn();

    const { PromptBar } = await import("@/app/canvas/prompt-bar");
    render(<PromptBar onSubmit={vi.fn()} onCancel={onCancel} disabled defaultQuality="auto" />);

    const stopButton = screen.getByRole("button", { name: "停止生成" }) as HTMLButtonElement;
    expect(stopButton.disabled).toBe(false);

    fireEvent.click(stopButton);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
