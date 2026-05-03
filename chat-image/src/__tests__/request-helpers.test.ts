import { describe, expect, it } from "vitest";
import { getReadableErrorMessage, selectAuthToken } from "@/lib/request";

describe("request auth and error helpers", () => {
  it("统一链路鉴权优先级：apiKey > authKey", () => {
    expect(selectAuthToken({
      apiKey: "sk-openai",
      authKey: "auth-fallback",
    })).toBe("sk-openai");

    expect(selectAuthToken({
      authKey: "auth-fallback",
    })).toBe("auth-fallback");
  });

  it("缺失主凭证时应返回 undefined", () => {
    expect(selectAuthToken({ apiKey: "", authKey: "" })).toBeUndefined();
    expect(selectAuthToken(undefined)).toBeUndefined();
  });

  it("应将常见后端报错转成一致中文文案", () => {
    expect(getReadableErrorMessage(new Error("prompt is required"))).toBe("请输入提示词后再提交");
    expect(getReadableErrorMessage(new Error("at least one image is required"))).toBe("请至少选择 1 张图片");
    expect(getReadableErrorMessage(new Error("invalid api key"))).toBe("鉴权失败，请检查 API Key 或本地鉴权 Key");
    expect(getReadableErrorMessage(new Error("native upscale is not supported"))).toBe("当前模型或模式不支持放大，请切换支持放大的服务后再试");
  });
});
