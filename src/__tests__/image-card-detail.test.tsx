import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageCard, imageSrc } from "@/app/canvas/image-card";

describe("ImageCard detail view", () => {
  it("keeps BLT-style data URLs in b64_json renderable", () => {
    expect(imageSrc({ url: "", b64_json: "data:image/png;base64,abc" })).toBe("data:image/png;base64,abc");
    expect(imageSrc({ url: "", b64_json: "abc" })).toBe("data:image/png;base64,abc");
  });

  it("opens a generated image detail view with prompt and reference actions", () => {
    const prompt = "用暖色电影光照生成一张产品海报";
    const onReference = vi.fn();
    const onPromptReference = vi.fn();
    const onImageReference = vi.fn();

    render(
      <ImageCard
        image={{ url: "data:image/png;base64,abc", width: 1024, height: 1024 }}
        prompt={prompt}
        fileName="generated.png"
        meta={{
          created_at: 1_700_000_000_000,
          model: "gpt-image-2",
          mode: "generate",
          size: "1024x1024",
        }}
        onReference={onReference}
        onPromptReference={onPromptReference}
        onImageReference={onImageReference}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "查看图片详情" }));

    expect(screen.getByRole("region", { name: "图片详情" })).toBeTruthy();
    expect(screen.getByText("图片提示词")).toBeTruthy();
    expect(screen.getByText(prompt)).toBeTruthy();
    expect(screen.getByRole("button", { name: "一键引用：提示词 + 图片" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "只引用提示词" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "只引用图片" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "只引用提示词" }));
    fireEvent.click(screen.getByRole("button", { name: "只引用图片" }));

    expect(onPromptReference).toHaveBeenCalledTimes(1);
    expect(onImageReference).toHaveBeenCalledTimes(1);
  });
});
