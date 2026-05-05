import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")) as {
  build?: {
    extraResources?: Array<{ from?: string; to?: string }>;
    files?: string[];
  };
};
const electronMainSource = fs.readFileSync(path.resolve(process.cwd(), "electron", "main.ts"), "utf8");
const electronPreloadSource = fs.readFileSync(path.resolve(process.cwd(), "electron", "preload.cjs"), "utf8");
const packagedConfigSource = fs.readFileSync(path.resolve(process.cwd(), "resources", "data", "config.toml"), "utf8");

describe("electron packaged resources", () => {
  it("declares gallery images as packaged extra resources", () => {
    const extraResources = packageJson.build?.extraResources ?? [];
    expect(extraResources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: "vendor/awesome-gpt-image-2-main/data/images",
        to: "vendor/awesome-gpt-image-2-main/data/images",
      }),
    ]));
  });

  it("keeps renderer and Electron main artifacts in package files", () => {
    expect(packageJson.build?.files ?? []).toEqual(expect.arrayContaining([
      "dist/**",
      "dist-electron/**",
      "package.json",
    ]));
  });

  it("registers gallery-image as a safe fetchable protocol", () => {
    expect(electronMainSource).toContain("protocol.registerSchemesAsPrivileged");
    expect(electronMainSource).toContain('scheme: "gallery-image"');
    expect(electronMainSource).toContain("supportFetchAPI: true");
    expect(electronMainSource).toContain("corsEnabled: true");
  });

  it("exposes a background YouMind prompt fetch bridge for silent upstream sync", () => {
    expect(electronMainSource).toContain('ipcMain.handle("fetch-youmind-prompts"');
    expect(electronMainSource).toContain("https://youmind.com/youhome-api/prompts");
    expect(electronPreloadSource).toContain("fetchYouMindPrompts");
    expect(electronPreloadSource).toContain('ipcRenderer.invoke("fetch-youmind-prompts"');
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

  it("normalizes YouMind sync payloads to the documented upstream request fields", () => {
    const payloadTypeMatch = electronMainSource.match(/interface YouMindPromptsRequestPayload \{(?<body>[\s\S]*?)\n\}/);
    expect(payloadTypeMatch?.groups?.body).toBeDefined();
    const payloadTypeBody = payloadTypeMatch?.groups?.body ?? "";

    expect(payloadTypeBody).toContain("model?: string");
    expect(payloadTypeBody).toContain("page?: number");
    expect(payloadTypeBody).toContain("limit?: number");
    expect(payloadTypeBody).toContain("locale?: string");
    expect(payloadTypeBody).toContain("q?: string");
    expect(payloadTypeBody).toContain("categories?: string");
    expect(payloadTypeBody).toContain("campaign?: string");
    expect(payloadTypeBody).toContain("filterMode?: string");
    expect(payloadTypeBody).toContain("searchMode?: string");
    expect(payloadTypeBody).toContain("sortBy?: string");
    expect(payloadTypeBody).toContain("sortOrder?: string");
    expect(electronMainSource).toContain("typeof value === \"string\"");
  });

  it("keeps packaged defaults limited to image-capable models", () => {
    expect(packagedConfigSource).toContain('available_models = ["gpt-image-2"]');
    expect(packagedConfigSource).not.toContain("agent-mode");
    expect(packagedConfigSource).not.toContain("research");
    expect(packagedConfigSource).not.toContain("o3");
  });
});
