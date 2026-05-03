#!/usr/bin/env node
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const exePath = path.join(repoRoot, "release", "win-unpacked", "GIMG.exe");
const outputDir = path.join(repoRoot, "public", "qa-screenshots", "packaged-persistence");
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

async function findAvailablePort(host = "127.0.0.1") {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, host, () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const { port } = address;
        server.close((error) => error ? reject(error) : resolve(port));
        return;
      }
      server.close(() => reject(new Error("无法分配调试端口")));
    });
    server.on("error", reject);
  });
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
  const remoteDebuggingPort = await findAvailablePort();
  const child = spawn(exePath, [`--remote-debugging-port=${remoteDebuggingPort}`, `--user-data-dir=${userDataDir}`], {
    cwd: path.dirname(exePath),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    logs.push(text);
    process.stdout.write(`[packaged-persist] ${text}`);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    logs.push(text);
    process.stderr.write(`[packaged-persist] ${text}`);
  });
  await waitForEndpoint(`http://127.0.0.1:${remoteDebuggingPort}/json/version`, 45000);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${remoteDebuggingPort}`);
  let context = browser.contexts()[0];
  const start = Date.now();
  while (!context && Date.now() - start < 15000) {
    await wait(500);
    context = browser.contexts()[0];
  }
  if (!context) throw new Error("未获取到 packaged 浏览器上下文");
  let page = context.pages()[0];
  while (!page && Date.now() - start < 15000) {
    await wait(500);
    page = context.pages()[0];
  }
  if (!page) throw new Error("未获取到 packaged 页面");

  const failures = [];
  const requestLog = [];
  const responseLog = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/health") || url.includes("/api/config")) {
      requestLog.push({
        method: request.method(),
        url,
        postData: request.postData() ?? null,
      });
    }
  });
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/health") || url.includes("/api/config")) {
      let body = null;
      try {
        body = await response.text();
      } catch {}
      responseLog.push({
        status: response.status(),
        url,
        body,
      });
    }
  });
  page.on("requestfailed", (request) => {
    failures.push({
      url: request.url(),
      method: request.method(),
      errorText: request.failure()?.errorText ?? "unknown",
    });
  });

  await page.waitForTimeout(2500);
  return { child, browser, page, failures, logs, remoteDebuggingPort, requestLog, responseLog };
}

async function closePackaged(browser, child) {
  await browser.close().catch(() => {});
  child.kill("SIGTERM");
  await wait(1500);
}

async function openSettings(page) {
  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByText("应用设置").waitFor();
}

async function readRuntimeContext(page) {
  return await page.evaluate(async () => {
    const electronAPI = window.electronAPI;
    const backendOrigin = await electronAPI?.getBackendOrigin?.().catch(() => null);
    const backendPort = await electronAPI?.getBackendPort?.().catch(() => null);
    return {
      href: location.href,
      hasElectronAPI: Boolean(electronAPI),
      hasGetBackendOrigin: Boolean(electronAPI?.getBackendOrigin),
      hasGetBackendPort: Boolean(electronAPI?.getBackendPort),
      backendOrigin,
      backendPort,
      localSettingsRaw: localStorage.getItem("gimg-settings"),
    };
  });
}

async function getComboboxTexts(page) {
  return await page.locator('[role="combobox"]').evaluateAll((elements) => elements.map((el) => el.textContent?.trim() ?? ""));
}

async function readModelTriggerText(page) {
  return await page.locator('[role="combobox"]').nth(1).innerText();
}

async function chooseModel(page, modelName) {
  const modelTrigger = page.locator('[role="combobox"]').nth(1);
  const before = await modelTrigger.innerText();
  const allBefore = await getComboboxTexts(page);
  await modelTrigger.click();
  const option = page.getByRole("option", { name: modelName, exact: true });
  const optionCount = await option.count();
  const optionBox = optionCount > 0 ? await option.first().boundingBox() : null;
  const activeBefore = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? document.activeElement?.tagName ?? null);
  await option.first().click();
  await page.waitForTimeout(400);
  const afterClick = await modelTrigger.innerText();
  await modelTrigger.click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const afterKeyboard = await modelTrigger.innerText();
  const activeAfter = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? document.activeElement?.tagName ?? null);
  const allAfter = await getComboboxTexts(page);
  return { before, afterClick, afterKeyboard, allBefore, allAfter, optionCount, optionBox, activeBefore, activeAfter };
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
    const { page, failures, logs, remoteDebuggingPort, requestLog, responseLog } = first;
    await openSettings(page);
    const runtimeBefore = await readRuntimeContext(page);
    const selection = await chooseModel(page, "gpt-image-2");
    await page.getByRole("button", { name: "保存" }).click();
    await page.locator("text=/设置已保存|本地设置已保存/").first().waitFor({ timeout: 18000 });
    const runtimeAfter = await readRuntimeContext(page);

    const saveShot = path.join(outputDir, "01-saved-model.png");
    await page.screenshot({ path: saveShot, fullPage: true });
    summary.firstRun = {
      debugPort: remoteDebuggingPort,
      runtimeBefore,
      selection,
      runtimeAfter,
      selectedModel: await readModelTriggerText(page),
      screenshot: relative(saveShot),
      requestFailures: failures,
      requestLog,
      responseLog,
      logTail: logs.slice(-20),
    };
  } finally {
    await closePackaged(first.browser, first.child);
  }

  const second = await launchPackaged();
  try {
    const { page, failures, logs, remoteDebuggingPort, requestLog, responseLog } = second;
    await openSettings(page);
    const runtimeAfterRelaunch = await readRuntimeContext(page);
    const reopenShot = path.join(outputDir, "02-reopened-model.png");
    await page.screenshot({ path: reopenShot, fullPage: true });
    summary.secondRun = {
      debugPort: remoteDebuggingPort,
      runtimeAfterRelaunch,
      selectedModel: await readModelTriggerText(page),
      screenshot: relative(reopenShot),
      requestFailures: failures,
      requestLog,
      responseLog,
      logTail: logs.slice(-20),
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
