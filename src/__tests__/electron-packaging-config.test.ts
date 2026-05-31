import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")) as {
  build?: {
    icon?: string;
    extraResources?: Array<{ from?: string; to?: string }>;
    files?: string[];
    win?: {
      icon?: string;
    };
    nsis?: {
      installerIcon?: string;
      uninstallerIcon?: string;
    };
  };
};
const electronMainSource = fs.readFileSync(path.resolve(process.cwd(), "electron", "main.ts"), "utf8");
const electronPreloadSource = fs.readFileSync(path.resolve(process.cwd(), "electron", "preload.cjs"), "utf8");
const packagedConfigSource = fs.readFileSync(path.resolve(process.cwd(), "resources", "data", "config.toml"), "utf8");
const electronBuilderSource = fs.readFileSync(path.resolve(process.cwd(), "electron-builder.yml"), "utf8");
const viteConfigSource = fs.readFileSync(path.resolve(process.cwd(), "vite.config.ts"), "utf8");

describe("electron packaged resources", () => {
  it("declares gallery images as packaged extra resources", () => {
    const extraResources = packageJson.build?.extraResources ?? [];
    expect(extraResources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: "vendor/awesome-gpt-image-2-main/data/images",
        to: "vendor/awesome-gpt-image-2-main/data/images",
      }),
    ]));
    expect(electronBuilderSource).toContain("from: vendor/awesome-gpt-image-2-main/data/images");
  });

  it("keeps renderer and Electron main artifacts in package files while excluding QA/build leftovers", () => {
    expect(packageJson.build?.files ?? []).toEqual(expect.arrayContaining([
      "dist/**/*",
      "dist-electron/**/*",
      "package.json",
      "!dist/qa-screenshots/**",
      "!dist/win-unpacked/**",
      "!dist/*.exe",
    ]));
    expect(electronBuilderSource).toContain("!dist/qa-screenshots/**");
    expect(electronBuilderSource).toContain("!dist/win-unpacked/**");
  });

  it("declares a shared Windows app and installer icon", () => {
    expect(packageJson.build?.icon).toBe("resources/icon.ico");
    expect(packageJson.build?.win?.icon).toBe("resources/icon.ico");
    expect(packageJson.build?.nsis?.installerIcon).toBe("resources/icon.ico");
    expect(packageJson.build?.nsis?.uninstallerIcon).toBe("resources/icon.ico");
    expect(electronMainSource).toContain("resolveAppIconPath()");
  });

  it("registers gallery-image as a safe fetchable protocol", () => {
    expect(electronMainSource).toContain("protocol.registerSchemesAsPrivileged");
    expect(electronMainSource).toContain('scheme: "gallery-image"');
    expect(electronMainSource).toContain("supportFetchAPI: true");
    expect(electronMainSource).toContain("corsEnabled: true");
  });

  it("removes the legacy YouMind prompt bridge and Vite proxy from the main path", () => {
    expect(electronMainSource).not.toContain('ipcMain.handle("fetch-youmind-prompts"');
    expect(electronMainSource).not.toContain("https://youmind.com/youhome-api/prompts");
    expect(electronPreloadSource).not.toContain("fetchYouMindPrompts");
    expect(viteConfigSource).not.toContain("/youhome-api/prompts");
  });

  it("exposes a runtime backend auth token without storing it in packaged resources", () => {
    expect(electronMainSource).toContain('ipcMain.handle("get-backend-auth-token"');
    expect(electronMainSource).toContain("GIMG_AUTH_KEY");
    expect(electronPreloadSource).toContain("getBackendAuthToken");
    expect(packagedConfigSource).toContain('api_key = ""');
    expect(packagedConfigSource).not.toContain("sk-");
  });

  it("keeps the remote image fetch preload bridge matched by a main-process handler", () => {
    expect(electronMainSource).toContain('ipcMain.handle("fetch-image-bytes"');
    expect(electronMainSource).toContain("assertFetchableImageUrl");
    expect(electronMainSource).toContain("REMOTE_IMAGE_ALLOWED_HOSTS");
    expect(electronMainSource).toContain("cms-assets.youmind.com");
    expect(electronPreloadSource).toContain("fetchImageBytes");
    expect(electronPreloadSource).toContain('ipcRenderer.invoke("fetch-image-bytes"');
  });

  it("keeps packaged defaults limited to image-capable models", () => {
    expect(packagedConfigSource).toContain('available_models = ["gpt-image-2"]');
    expect(packagedConfigSource).not.toContain("agent-mode");
    expect(packagedConfigSource).not.toContain("research");
    expect(packagedConfigSource).not.toContain("o3");
  });
});
