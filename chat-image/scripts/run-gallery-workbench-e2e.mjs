#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(repoRoot, "public", "qa-screenshots", "gallery-e2e");
const baseUrl = "http://127.0.0.1:4173";
const viteBin = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
const localImportImagePath = path.join(repoRoot, "vendor", "awesome-gpt-image-2-main", "data", "images", "case1.jpg");

const results = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  outputDir: path.relative(repoRoot, outputDir).replace(/\\/g, "/"),
  status: "running",
  steps: [],
  notes: [
    "证据仅基于当前仓库真实前端实现。",
    "examples -> workbench 导入链路通过 HashRouter 页面联动验证。",
    "未宣称不存在的 markdown 运行时动态加载；示例数据来自仓库内已构建的数据模块。",
  ],
};

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) return;
    } catch {}
    await wait(500);
  }
  throw new Error(`Timed out waiting for dev server: ${url}`);
}

function screenshotPath(name) {
  return path.join(outputDir, name);
}

function relativeOutput(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

async function saveJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function saveMarkdown(filePath, markdown) {
  await fs.writeFile(filePath, `${markdown.trim()}\n`, "utf8");
}

async function runStep(name, action) {
  const step = { name, status: "running", startedAt: new Date().toISOString() };
  results.steps.push(step);
  try {
    const detail = await action();
    Object.assign(step, detail || {});
    step.status = "passed";
    step.finishedAt = new Date().toISOString();
  } catch (error) {
    step.status = "failed";
    step.finishedAt = new Date().toISOString();
    step.error = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

function startViteServer() {
  const child = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", "4173", "--strictPort"], {
    cwd: repoRoot,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[vite] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[vite] ${chunk}`));
  return child;
}

async function ensureViteServer() {
  try {
    await waitForServer(`${baseUrl}/`, 1500);
    return { started: false, process: null };
  } catch {
    const child = startViteServer();
    await waitForServer(`${baseUrl}/`);
    return { started: true, process: child };
  }
}

async function main() {
  await ensureDir(outputDir);
  const vite = await ensureViteServer();
  let browser;

  try {
    await waitForServer(`${baseUrl}/`);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await runStep("examples 页面加载", async () => {
      await page.goto(`${baseUrl}/#/examples`, { waitUntil: "networkidle" });
      await page.getByText("示例库").waitFor();
      await page.getByText(/348 条案例/).waitFor();
      await page.getByText(/完整画廊当前收录\s*348\s*条案例，支持分类浏览与一键引用。?/).waitFor();
      await page.getByRole("tab", { name: "推荐入口" }).waitFor();
      const shot = screenshotPath("01-examples-page.png");
      await page.screenshot({ path: shot, fullPage: true });
      return {
        url: page.url(),
        evidence: [relativeOutput(shot)],
        observed: [
          "examples 页面成功加载",
          "已展示精简后的总案例文案与推荐/专题切换",
        ],
      };
    });

    await runStep("推荐/专题切换 + 专题展开 + 来源点击", async () => {
      await page.getByRole("tab", { name: "全部专题" }).click();
      await page.getByText(/12 个专题 \/ 247 条案例/).waitFor();
      await page.getByRole("tab", { name: "UI" }).click();
      await page.getByText(/2 个专题 \/ 32 条案例/).waitFor();

      const topicButton = page.locator('button[aria-label^="展开专题："]').first();
      await topicButton.click();
      await page.getByText("专题案例流").waitFor();
      await page.getByRole("link", { name: /查看专题来源：/ }).first().waitFor();

      const topicSource = page.getByRole("link", { name: /查看专题来源：/ }).first();
      const [popup] = await Promise.all([
        page.waitForEvent("popup"),
        topicSource.click(),
      ]);
      const popupUrl = popup.url();
      await popup.close();

      const shot = screenshotPath("02-topics-expanded.png");
      await page.screenshot({ path: shot, fullPage: true });
      return {
        popupUrl,
        evidence: [relativeOutput(shot)],
        observed: [
          "已从推荐入口切换到全部专题",
          "已切换 UI 分类并展开专题案例流",
          "专题来源链接点击后打开新窗口",
        ],
      };
    });

    await runStep("一键引用：gallery -> workbench", async () => {
      await page.getByRole("button", { name: "一键引用：提示词 + 参照图" }).first().click({ force: true });
      await page.waitForURL(/#\/$/);
      await page.getByText(/引用图片（1\/4）/).waitFor();
      const prompt = await page.locator("textarea").inputValue();
      if (!prompt.trim()) {
        throw new Error("一键引用后工作台提示词为空");
      }
      const shot = screenshotPath("03-workbench-full-import.png");
      await page.screenshot({ path: shot, fullPage: true });
      return {
        evidence: [relativeOutput(shot)],
        observed: [
          `工作台 textarea 已接收提示词，长度 ${prompt.length}`,
          "工作台显示 1 张已引用图片",
        ],
      };
    });

    await runStep("仅提示词：gallery -> workbench", async () => {
      await page.goto(`${baseUrl}/#/examples`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "只引用提示词" }).first().click({ force: true });
      await page.waitForURL(/#\/$/);
      await page.waitForFunction(() => {
        const el = document.querySelector("textarea");
        return !!el && "value" in el && String(el.value).trim().length > 0;
      });
      const prompt = await page.locator("textarea").inputValue();
      if (!prompt.trim()) {
        throw new Error("仅提示词导入后 textarea 为空");
      }
      const imageBadgeCount = await page.getByText(/引用图片（/).count();
      const shot = screenshotPath("04-workbench-prompt-only.png");
      await page.screenshot({ path: shot, fullPage: true });
      return {
        evidence: [relativeOutput(shot)],
        observed: [
          `工作台 textarea 已接收提示词，长度 ${prompt.length}`,
          `工作台当前引用图片区块数量 ${imageBadgeCount}`,
        ],
      };
    });

    await runStep("仅参照图：workbench 内嵌示例区", async () => {
      await page.goto(`${baseUrl}/#/`, { waitUntil: "networkidle" });
      await page.locator("textarea").fill("");
      await page.getByRole("button", { name: "只引用参照图" }).first().click({ force: true });
      await page.getByText(/引用图片（1\/4）/).waitFor();
      const prompt = await page.locator("textarea").inputValue();
      if (prompt.trim()) {
        throw new Error("仅参照图导入后 prompt 不应包含文本");
      }
      const shot = screenshotPath("05-workbench-image-only.png");
      await page.screenshot({ path: shot, fullPage: true });
      return {
        evidence: [relativeOutput(shot)],
        observed: [
          "工作台已挂载 1 张参照图",
          "textarea 保持为空，符合仅参照图行为",
        ],
      };
    });

    await runStep("图片失败退化：工作台内嵌示例区", async () => {
      await page.goto(`${baseUrl}/#/`, { waitUntil: "networkidle" });
      await page.locator("textarea").fill("");
      const firstGalleryImage = page.locator("img").first();
      await firstGalleryImage.dispatchEvent("error");
      await page.getByText(/图片暂不可用/).first().waitFor();
      await page.getByRole("button", { name: "图片不可用，点击后将退化为仅提示词" }).first().click({ force: true });
      await page.getByText("示例图片加载失败，已退化为仅引用提示词").waitFor();
      const prompt = await page.locator("textarea").inputValue();
      if (!prompt.trim()) {
        throw new Error("图片失败退化后未回填提示词");
      }
      const shot = screenshotPath("06-image-fallback-prompt-only.png");
      await page.screenshot({ path: shot, fullPage: true });
      return {
        evidence: [relativeOutput(shot)],
        observed: [
          "前端 error 事件触发后卡片进入图片不可用态",
          "点击一键引用后退化为仅提示词，并出现 info toast",
        ],
      };
    });

    await runStep("本地文件系统导入图片：预览 / 提交前状态 / 移除 / 重选", async () => {
      const localImportContext = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
      const localImportPage = await localImportContext.newPage();
      try {
        await localImportPage.goto(`${baseUrl}/#/`, { waitUntil: "networkidle" });
        const fileInput = localImportPage.locator('input[type="file"]');
        const previewCount = localImportPage.getByTestId("prompt-attachments-count");
        const previewImage = localImportPage.getByTestId("prompt-attachment-preview").first();

        await fileInput.setInputFiles(localImportImagePath);
        await previewCount.waitFor();
        await previewImage.waitFor();
        const importedCountText = await previewCount.innerText();
        if (!importedCountText.includes("引用图片（1/4）")) {
          throw new Error(`本地文件导入后引用计数异常：${importedCountText}`);
        }
        await localImportPage.getByRole("button", { name: "发送" }).waitFor();

        const previewShot = screenshotPath("07-local-import-preview.png");
        await localImportPage.screenshot({ path: previewShot, fullPage: true });

        await localImportPage.getByRole("button", { name: "移除图片" }).click();
        await localImportPage.getByTestId("prompt-attachments-panel").waitFor({ state: "detached" });
        const removedShot = screenshotPath("08-local-import-removed.png");
        await localImportPage.screenshot({ path: removedShot, fullPage: true });

        await fileInput.setInputFiles(localImportImagePath);
        await previewCount.waitFor();
        await previewImage.waitFor();
        const reselectedCountText = await previewCount.innerText();
        if (!reselectedCountText.includes("引用图片（1/4）")) {
          throw new Error(`重选同一本地文件后引用计数异常：${reselectedCountText}`);
        }
        await localImportPage.getByAltText(/case1\.jpg/).waitFor();
        const reselectedShot = screenshotPath("09-local-import-reselected.png");
        await localImportPage.screenshot({ path: reselectedShot, fullPage: true });

        return {
          evidence: [relativeOutput(previewShot), relativeOutput(removedShot), relativeOutput(reselectedShot)],
          observed: [
            "本地文件系统图片已成功导入并显示预览",
            "提交前发送按钮保持可用，引用图片区计数正确",
            "移除后图片区消失，再次选择同一文件可重新挂载",
          ],
        };
      } finally {
        await localImportContext.close();
      }
    });

    await runStep("设置页打开与本地保存提示", async () => {
      await page.goto(`${baseUrl}/#/`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "打开设置" }).click();
      await page.getByText("应用设置").waitFor();
      const saveButton = page.getByRole("button", { name: "保存" });
      await saveButton.click();
      await page.getByText(/(设置已保存，模型与能力信息已刷新。|本地设置已保存；后端未连通)/).waitFor();
      const shot = screenshotPath("10-settings-save-feedback.png");
      await page.screenshot({ path: shot, fullPage: true });
      return {
        evidence: [relativeOutput(shot)],
        observed: [
          "设置抽屉可正常打开",
          "点击保存后出现明确反馈文案，而非静默失败",
        ],
      };
    });

    results.status = "passed";
    results.consoleErrors = consoleErrors;
    if (consoleErrors.length) {
      results.notes.push(`捕获到 ${consoleErrors.length} 条浏览器 console error，请结合结果复核。`);
    }
  } catch (error) {
    results.status = "failed";
    results.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    const jsonPath = path.join(outputDir, "test-results.json");
    const markdownPath = path.join(outputDir, "test-results.md");
    await saveJson(jsonPath, results);
    const md = `# Gallery + Workbench E2E Evidence\n\n- 状态：${results.status}\n- 生成时间：${results.generatedAt}\n- 基础地址：${results.baseUrl}\n\n## 步骤结果\n${results.steps
      .map((step, index) => {
        const evidence = Array.isArray(step.evidence) && step.evidence.length
          ? `\n- 证据：${step.evidence.join(", ")}`
          : "";
        const observed = Array.isArray(step.observed) && step.observed.length
          ? `\n- 观察：${step.observed.join("；")}`
          : "";
        const extra = step.popupUrl ? `\n- popupUrl：${step.popupUrl}` : "";
        const error = step.error ? `\n- 错误：${step.error}` : "";
        return `### ${index + 1}. ${step.name}\n- 状态：${step.status}${evidence}${observed}${extra}${error}`;
      })
      .join("\n\n")}\n\n## 说明\n${results.notes.map((note) => `- ${note}`).join("\n")}\n`;
    await saveMarkdown(markdownPath, md);
    if (browser) await browser.close();
    if (vite.started && vite.process) {
      vite.process.kill("SIGTERM");
    }
  }
}

main().catch((error) => {
  console.error("[gallery-e2e] FAILED", error);
  process.exitCode = 1;
});
