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
        size: "1368x2048",
      }),
    );
  });

  it("2K 与 4K 输出尺寸应传出不同的实际像素尺寸", async () => {
    const onSubmit = vi.fn();

    const { PromptBar } = await import("@/app/canvas/prompt-bar");
    render(<PromptBar onSubmit={onSubmit} defaultN={1} defaultQuality="auto" />);

    fireEvent.change(screen.getByPlaceholderText("输入提示词，可只传图片让模型参考生成..."), {
      target: { value: "方形头像" },
    });
    fireEvent.click(screen.getByRole("button", { name: "2K 高清" }));
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    fireEvent.change(screen.getByPlaceholderText("输入提示词，可只传图片让模型参考生成..."), {
      target: { value: "方形头像" },
    });
    fireEvent.click(screen.getByRole("button", { name: "4K 高清" }));
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(onSubmit).toHaveBeenNthCalledWith(
      1,
      "Make the aspect ratio 1:1,\n方形头像",
      undefined,
      expect.objectContaining({ quality: "medium", size: "2048x2048" }),
    );
    expect(onSubmit).toHaveBeenNthCalledWith(
      2,
      "Make the aspect ratio 1:1,\n方形头像",
      undefined,
      expect.objectContaining({ quality: "high", size: "4096x4096" }),
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

  it("工作台布局应把输入区放入右侧设置面板底部", async () => {
    const { PromptBar } = await import("@/app/canvas/prompt-bar");
    const { container } = render(<PromptBar onSubmit={vi.fn()} layout="workspace" defaultQuality="auto" />);

    const panel = container.querySelector('aside.canvas-control-panel[aria-label="图片生成设置"]');
    expect(panel).toBeTruthy();
    expect(panel?.querySelector(".prompt-bar-shell--workspace-settings")).toBeTruthy();
    expect(panel?.querySelector(".prompt-bar-shell--workspace-composer")).toBeTruthy();
    expect(screen.getByLabelText("负面提示词")).toBeTruthy();
    expect(screen.getByLabelText("正向提示词")).toBeTruthy();
    expect(container.querySelector(".canvas-composer-panel")).toBeNull();
  });

  it("工作台引用图片后应自动滚到生成按钮所在输入区", async () => {
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-image");

    const { PromptBar } = await import("@/app/canvas/prompt-bar");
    const { container } = render(<PromptBar onSubmit={vi.fn()} layout="workspace" defaultQuality="auto" />);

    const scrollRoot = container.querySelector(".canvas-control-panel-scroll") as HTMLElement;
    Object.defineProperty(scrollRoot, "scrollHeight", { configurable: true, value: 1234 });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["abc"], "ref.png", { type: "image/png", lastModified: 1 });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(scrollRoot.scrollTop).toBe(1234);
    expect(screen.getByRole("button", { name: "生成" })).toBeTruthy();

    requestFrame.mockRestore();
    cancelFrame.mockRestore();
  });

  it("工作台负面提示词应随正向提示词一起提交", async () => {
    const onSubmit = vi.fn();
    const { PromptBar } = await import("@/app/canvas/prompt-bar");
    render(<PromptBar onSubmit={onSubmit} layout="workspace" defaultQuality="auto" />);

    fireEvent.change(screen.getByLabelText("负面提示词"), {
      target: { value: "低清晰度，畸形手指" },
    });
    fireEvent.change(screen.getByLabelText("正向提示词"), {
      target: { value: "赛博少女海报" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成" }));

    expect(onSubmit).toHaveBeenCalledWith(
      "Make the aspect ratio 1:1,\n赛博少女海报\n\n负面提示词：\n低清晰度，畸形手指",
      undefined,
      expect.objectContaining({
        aspectRatio: "1:1",
        negativePrompt: "低清晰度，畸形手指",
      }),
    );
  });
});
