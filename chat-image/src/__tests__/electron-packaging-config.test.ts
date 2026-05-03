import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")) as {
  build?: {
    extraResources?: Array<{ from?: string; to?: string }>;
    files?: string[];
  };
};

describe("electron packaged resources", () => {
  it("应将 gallery 图片目录声明为 extraResources", () => {
    const extraResources = packageJson.build?.extraResources ?? [];
    expect(extraResources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: "vendor/awesome-gpt-image-2-main/data/images",
        to: "vendor/awesome-gpt-image-2-main/data/images",
      }),
    ]));
  });

  it("应保留渲染端与 Electron 主进程产物", () => {
    expect(packageJson.build?.files ?? []).toEqual(expect.arrayContaining([
      "dist/**",
      "dist-electron/**",
      "package.json",
    ]));
  });
});
