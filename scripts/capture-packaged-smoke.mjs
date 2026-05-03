#!/usr/bin/env node
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const distExePath = path.join(repoRoot, "dist", "win-unpacked", "GIMG.exe");
const releaseExePath = path.join(repoRoot, "release", "win-unpacked", "GIMG.exe");
const outputDir = path.join(repoRoot, "public", "qa-screenshots", "packaged-smoke");
const remoteDebuggingPort = 9223;
const userDataDir = path.join(repoRoot, ".async", "tmp", "packaged-smoke-profile");
const localImportImagePath = path.join(repoRoot, "vendor", "awesome-gpt-image-2-main", "data", "images", "case1.jpg");

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForEndpoint(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await wait(500);
  }
  throw new Error(`等待调试端点超时：${url}`);
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

async function resolveExePath() {
  if (await exists(distExePath)) {
    return distExePath;
  }
  if (await exists(releaseExePath)) {
    return releaseExePath;
  }
  return distExePath;
}

async function main() {
  await ensureDir(outputDir);
  await ensureDir(userDataDir);

  const exePath = await resolveExePath();

  if (!(await exists(exePath))) {
    throw new Error(`未找到打包产物：${relative(exePath)}`);
  }

  const child = spawn(exePath, [`--remote-debugging-port=${remoteDebuggingPort}`, `--user-data-dir=${userDataDir}`], {
    cwd: path.dirname(exePath),
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[packaged] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[packaged] ${chunk}`));

  let browser;
  try {
    await waitForEndpoint(`http://127.0.0.1:${remoteDebuggingPort}/json/version`, 45000);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${remoteDebuggingPort}`);
    let context = browser.contexts()[0];
    const start = Date.now();
    while (!context && Date.now() - start < 15000) {
      await wait(500);
      context = browser.contexts()[0];
    }
    if (!context) {
      throw new Error("未获取到 packaged 应用的浏览器上下文");
    }

    let targetPage = context.pages()[0];
    while (!targetPage && Date.now() - start < 15000) {
      await wait(500);
      targetPage = context.pages()[0];
    }
    if (!targetPage) {
      throw new Error("未获取到 packaged 应用窗口页面");
    }

    await targetPage.waitForTimeout(2500);
    const currentUrl = targetPage.url();
    const currentHash = (() => {
      try {
        return new URL(currentUrl).hash || "";
      } catch {
        return "";
      }
    })();
    const startsOnWorkbench = currentHash === "#/" || currentHash === "" || currentHash === "#";
    const startsOnExamples = currentUrl.includes("#/examples");
    if (!startsOnExamples) {
      await targetPage.evaluate(() => {
        if (!location.hash.includes("/examples")) {
          location.hash = "/examples";
        }
      }).catch(() => {});
      await targetPage.waitForTimeout(2500);
    }

    const examplesUrl = targetPage.url();
    const examplesHash = (() => {
      try {
        return new URL(examplesUrl).hash || "";
      } catch {
        return "";
      }
    })();
    const initialShotName = startsOnWorkbench ? "packaged-workbench-entry.png" : "packaged-examples-entry.png";
    const examplesShot = path.join(outputDir, initialShotName);
    await targetPage.screenshot({ path: examplesShot, fullPage: true });

    const examplesBody = await targetPage.locator("body").innerText().catch(() => "");
    const packagedOnWorkbench = !examplesUrl.includes("#/examples") && examplesBody.includes("工作台") && (examplesBody.includes("开始创作") || examplesBody.includes("输入提示词"));
    const packagedOnExamples = examplesUrl.includes("#/examples") && examplesBody.includes("全部专题") && examplesBody.includes("人像");

    let examplesEntryShot = null;
    let topicsShot = null;
    if (packagedOnExamples) {
      examplesEntryShot = examplesShot;
      const topicEntry = targetPage.getByRole("button", { name: "全部专题" });
      await topicEntry.waitFor();
      await topicEntry.click();
      await targetPage.getByRole("heading", { name: "全部专题" }).waitFor();
      const topicToggle = targetPage.locator('button[aria-label^="打开专题："]').first();
      await topicToggle.click();
      await targetPage.getByRole("button", { name: "返回专题" }).waitFor();
      await targetPage.getByRole("region", { name: "专题详情" }).waitFor();
      topicsShot = path.join(outputDir, "packaged-topics-expanded.png");
      await targetPage.screenshot({ path: topicsShot, fullPage: true });

      const workbenchNav = targetPage.getByRole("link", { name: "工作台" });
      await workbenchNav.waitFor();
      await workbenchNav.click();
      await targetPage.waitForTimeout(2500);

      const postNavUrl = targetPage.url();
      const postNavHash = await targetPage.evaluate(() => location.hash).catch(() => "");
      const postNavTitle = await targetPage.title().catch(() => "");
      const postNavBody = await targetPage.locator("body").innerText().catch(() => "");
      const postNavSelectors = await targetPage.evaluate(() => ({
        promptTextarea: !!document.querySelector('textarea[placeholder="输入提示词..."]'),
        uploadButton: !!document.querySelector('button[aria-label="上传图片"]'),
        fileInput: !!document.querySelector('input[type="file"]'),
        settingsButton: !!document.querySelector('button[aria-label="打开设置"]'),
      })).catch(() => ({
        promptTextarea: false,
        uploadButton: false,
        fileInput: false,
        settingsButton: false,
      }));
      const failedNavShot = path.join(outputDir, "packaged-workbench-nav-debug.png");
      await targetPage.screenshot({ path: failedNavShot, fullPage: true }).catch(() => {});

      await fs.writeFile(
        path.join(outputDir, "packaged-workbench-nav-debug.json"),
        `${JSON.stringify({
          currentUrl,
          currentHash,
          examplesUrl,
          examplesHash,
          hash: postNavHash,
          title: postNavTitle,
          selectors: postNavSelectors,
          bodyPreview: postNavBody.slice(0, 800),
          screenshot: relative(failedNavShot),
        }, null, 2)}\n`,
        "utf8",
      );

      await targetPage.getByPlaceholder("输入提示词...").waitFor({ timeout: 15000 });
      await targetPage.getByRole("button", { name: "上传图片" }).waitFor({ timeout: 15000 });
      await targetPage.locator('input[type="file"]').waitFor({ state: "attached", timeout: 15000 });
    }

    const currentWorkbenchUrl = targetPage.url();
    const workbenchShot = path.join(outputDir, currentWorkbenchUrl.includes("#/examples") ? "packaged-workbench-after-nav.png" : "packaged-workbench-home.png");
    await targetPage.screenshot({ path: workbenchShot, fullPage: true });

    const workbenchFileInput = targetPage.locator('input[type="file"]');
    await targetPage.getByPlaceholder("输入提示词...").waitFor({ timeout: 15000 });
    await targetPage.getByRole("button", { name: "上传图片" }).waitFor({ timeout: 15000 });
    await workbenchFileInput.waitFor({ state: "attached", timeout: 15000 });
    await workbenchFileInput.setInputFiles(localImportImagePath);
    await targetPage.getByText(/引用图片（1\/4）/).waitFor();
    const importShot = path.join(outputDir, "packaged-workbench-import.png");
    await targetPage.screenshot({ path: importShot, fullPage: true });

    await targetPage.getByRole("button", { name: "打开设置" }).click();
    await targetPage.getByText("应用设置").waitFor();
    const settingsShot = path.join(outputDir, "packaged-settings-open.png");
    await targetPage.screenshot({ path: settingsShot, fullPage: true });

    const bodyText = await targetPage.locator("body").innerText().catch(() => "");
    const screenshots = [
      ...(examplesEntryShot ? [relative(examplesEntryShot)] : []),
      ...(!examplesEntryShot ? [relative(examplesShot)] : []),
      ...(topicsShot ? [relative(topicsShot)] : []),
      relative(workbenchShot),
      relative(importShot),
      relative(settingsShot),
    ];
    const summary = {
      capturedAt: new Date().toISOString(),
      exePath: relative(exePath),
      screenshots,
      checks: {
        examplesLoaded: packagedOnExamples,
        topicsExpanded: !!topicsShot,
        workbenchLoaded: true,
        localImportPreviewVisible: true,
        settingsOpened: true,
        packagedStartedOnWorkbench: packagedOnWorkbench,
      },
      bodyPreview: bodyText.slice(0, 400),
      targetUrl: targetPage.url(),
    };

    await fs.writeFile(path.join(outputDir, "packaged-smoke.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error("[packaged-smoke] FAILED", error);
  process.exitCode = 1;
});
