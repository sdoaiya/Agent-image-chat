import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { SettingsDrawer } from "@/components/settings/settings-drawer";
import { EditModal } from "@/app/canvas/edit-modal";

describe("UI semantic regression guards", () => {
  it("设置面板只暴露单一 generations 能力语义，不再展示旧 provider 选项", () => {
    render(<SettingsDrawer open onOpenChange={() => {}} />);

    expect(screen.getByText("应用设置")).toBeTruthy();
    expect(screen.getByText(/当前仅保留统一生图链路配置/)).toBeTruthy();
    expect(screen.getByText("Base URL")).toBeTruthy();

    expect(screen.queryByText(/codex/i)).toBeNull();
    expect(screen.queryByText(/openai/i)).toBeNull();
    expect(screen.queryByText(/provider/i)).toBeNull();
    expect(screen.queryByText(/access token/i)).toBeNull();
  });

  it("编辑弹窗只提示能力下线，不再暗示 mask/局部编辑可用", () => {
    render(<EditModal open onClose={() => {}} />);

    expect(screen.getByText("功能已下线")).toBeTruthy();
    expect(screen.getByText(/reference_images 作为参考图提交/)).toBeTruthy();
    expect(screen.getByText(/不再提供遮罩或局部编辑工作流/)).toBeTruthy();
    expect(screen.queryByText(/继续编辑/)).toBeNull();
  });
});
