import { describe, it, expect } from "vitest";

describe("retryTurn missing source_images guard", () => {
  function canRetry(turn: { mode: string; source_images?: File[] }): { canRetry: boolean; reason?: string } {
    if (turn.mode === "edit" && !turn.source_images?.length) {
      return { canRetry: false, reason: "页面刷新后源图已丢失，请重新选择图片后提交" };
    }
    return { canRetry: true };
  }

  it("should block retry for edit turn without source_images", () => {
    const turn = { mode: "edit" as const, source_images: undefined };
    const result = canRetry(turn);
    expect(result.canRetry).toBe(false);
    expect(result.reason).toContain("源图已丢失");
  });

  it("should block retry for edit turn with empty source_images array", () => {
    const turn = { mode: "edit" as const, source_images: [] };
    const result = canRetry(turn);
    expect(result.canRetry).toBe(false);
  });

  it("should allow retry for generate turn (no files needed)", () => {
    const turn = { mode: "generate" as const };
    const result = canRetry(turn);
    expect(result.canRetry).toBe(true);
  });

  it("should allow retry for edit turn with source_images present", () => {
    const turn = { mode: "edit" as const, source_images: [new File([], "test.png")] };
    const result = canRetry(turn);
    expect(result.canRetry).toBe(true);
  });
});

describe("normalizeTurns error message", () => {
  function normalizeTurn(turn: { status: string; error?: string; source_images?: unknown; mask_file?: unknown }) {
    if (turn.status !== "pending" && turn.status !== "generating") return turn;
    return {
      ...turn,
      status: "error",
      error: turn.error || "页面刷新后任务中断，请重试",
      source_images: undefined,
      mask_file: undefined,
    };
  }

  it("should add default error message for pending turn without error", () => {
    const turn = { status: "pending" };
    const result = normalizeTurn(turn);
    expect(result.status).toBe("error");
    expect(result.error).toBe("页面刷新后任务中断，请重试");
  });

  it("should preserve existing error message for error turn", () => {
    const turn = { status: "error", error: "API error" };
    const result = normalizeTurn(turn);
    expect(result.error).toBe("API error");
  });

  it("should use existing error for generating turn that already has one", () => {
    const turn = { status: "generating", error: "timeout" };
    const result = normalizeTurn(turn);
    expect(result.error).toBe("timeout");
  });

  it("should not modify done turn", () => {
    const turn = { status: "done" };
    const result = normalizeTurn(turn);
    expect(result.status).toBe("done");
  });

  it("should clear source_images on pending/generating turns", () => {
    const turn = { status: "generating", source_images: [1], mask_file: {} };
    const result = normalizeTurn(turn);
    expect(result.source_images).toBeUndefined();
    expect(result.mask_file).toBeUndefined();
  });
});