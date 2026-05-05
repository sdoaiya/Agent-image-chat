import { describe, it, expect } from "vitest";
import { selectAuthToken } from "@/lib/request";

describe("Auth token priority", () => {
  it("应优先使用 apiKey", () => {
    expect(selectAuthToken({
      apiKey: "sk-test",
      authKey: "auth-test",
    })).toBe("sk-test");
  });

  it("缺失 apiKey 时不再回退到本地鉴权 Key", () => {
    expect(selectAuthToken({
      authKey: "auth-test",
    })).toBeUndefined();
  });

  it("accessToken 不在统一链路鉴权范围内", () => {
    expect(selectAuthToken({
      apiKey: "",
      authKey: "",
      // @ts-expect-error legacy field should be ignored by selector
      accessToken: "tok-fallback",
    })).toBeUndefined();
  });

  it("空状态应返回 undefined", () => {
    expect(selectAuthToken(undefined)).toBeUndefined();
  });
});
