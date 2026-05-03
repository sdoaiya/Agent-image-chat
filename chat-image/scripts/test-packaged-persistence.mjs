#!/usr/bin/env node
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const exePath = path.join(repoRoot, "release", "win-unpacked", "GIMG.exe");
const outputDir = path.join(repoRoot, "public", "qa-screenshots", "packaged-persistence");
const remoteDebuggingPort = 9224;
const userDataDir = path.join(repoRoot, ".async", "tmp", "packaged-persistence-profile");

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

async function launchPackaged() {
  const child = spawn(exePath, [`--remote-debugging-port=${remoteDebuggingPort}`, `--user-data-dir=${userDataDir}`], {
    cwd: path.dirname(exePath),
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[packaged-persist] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[packaged-persist] ${chunk}`));
  await waitForEndpoint(`http://127.0.0.1:${remoteDebuggingPort}/json/version`, 45000);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${remoteDebuggingPort}`);
  const context = browser.contexts()[0];
  const start = Date.now();
  while ((!context || context.pages().length === 0) && Date.now() - start < 15000) {
    await wait(500);
  }
  const page = context.pages()[0];
  if (!page) throw new Error("未获取到 packaged 页面");
  await page.waitForTimeout(2500);
  return { child, browser, page };
}

async function closePackaged(browser, child) {
  await browser.close().catch(() => {});
  child.kill("SIGTERM");
  await wait(1500);
}

async function main() {
  await ensureDir(outputDir);
  await ensureDir(userDataDir);

  if (!(await exists(exePath))) {
    throw new Error(`未找到打包产物：${relative(exePath)}`);
  }

  const summary = { capturedAt: new Date().toISOString() };

  const first = await launchPackaged();
  try {
    const { page } = first;
    await page.getByRole("button", { name: "打开设置" }).click();
    await page.getByText("应用设置").waitFor();

    const modelTrigger = page.locator('[role="combobox"]').nth(1);
    await modelTrigger.click();
    await page.getByText("gpt-image-2").click();
    await page.getByRole("button", { name: "保存" }).click();
    await page.getByText(/设置已保存|本地设置已保存/).waitFor({ timeout: 12000 });

    const saveShot = path.join(outputDir, "01-saved-model.png");
    await page.screenshot({ path: saveShot, fullPage: true });
    summary.firstRun = {
      selectedModel: await page.locator('[role="combobox"]').nth(1).innerText(),
      screenshot: relative(saveShot),
    };
  } finally {
    await closePackaged(first.browser, first.child);
  }

  const second = await launchPackaged();
  try {
    const { page } = second;
    await page.getByRole("button", { name: "打开设置" }).click();
    await page.getByText("应用设置").waitFor();
    const reopenShot = path.join(outputDir, "02-reopened-model.png");
    await page.screenshot({ path: reopenShot, fullPage: true });
    summary.secondRun = {
      selectedModel: await page.locator('[role="combobox"]').nth(1).innerText(),
      screenshot: relative(reopenShot),
    };
  } finally {
    await closePackaged(second.browser, second.child);
  }

  await fs.writeFile(path.join(outputDir, "packaged-persistence.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error("[packaged-persistence] FAILED", error);
  process.exitCode = 1;
});
