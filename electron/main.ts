import { app, BrowserWindow, dialog, ipcMain, protocol } from "electron";
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { fileURLToPath } from "url";
import { startBackend, stopBackend, getBackendPort, getBackendHost, isManagedBackend } from "./go-process.js";
import { extractGalleryImageRelativePath, getGalleryImageContentType, resolveGalleryImageFilePath } from "./gallery-image.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_VENDOR_IMAGES_DIR_CANDIDATES = [
  path.resolve(app.getAppPath(), "vendor", "awesome-gpt-image-2-main", "data", "images"),
  path.resolve(process.resourcesPath, "vendor", "awesome-gpt-image-2-main", "data", "images"),
];
const YOUMIND_PROMPTS_ENDPOINT = "https://youmind.com/youhome-api/prompts";
const YOUMIND_PROMPTS_REFERER = "https://youmind.com/zh-CN/gpt-image-2-prompts";
const YOUMIND_PROMPTS_MAX_LIMIT = 100;
const REMOTE_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
const REMOTE_IMAGE_FETCH_TIMEOUT_MS = 15000;
const REMOTE_IMAGE_ALLOWED_HOSTS = new Set(["cms-assets.youmind.com"]);

let mainWindow: BrowserWindow | null = null;
const backendAuthToken = randomBytes(32).toString("hex");

const darkOverlay = { color: "#1a1816", symbolColor: "#a8a29e" };
const lightOverlay = { color: "#fcfaf9", symbolColor: "#57534e" };

interface YouMindPromptsRequestPayload {
  model?: string;
  page?: number;
  limit?: number;
  locale?: string;
  q?: string;
  categories?: string;
  campaign?: string;
  filterMode?: string;
  searchMode?: string;
  sortBy?: string;
  sortOrder?: string;
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "gallery-image",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function resolvePreloadPath(): string {
  const candidates = [path.join(__dirname, "preload.cjs"), path.join(__dirname, "preload.js")];

  if (!app.isPackaged) {
    candidates.push(path.join(app.getAppPath(), "electron", "preload.cjs"));
  }

  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolved) {
    throw new Error(`Preload script not found. Tried: ${candidates.join(", ")}`);
  }

  console.log(`[gimg] Using preload script: ${resolved}`);
  return resolved;
}

function resolveGalleryImagesDir(): string | null {
  return GALLERY_VENDOR_IMAGES_DIR_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function registerGalleryImageProtocol(): void {
  protocol.handle("gallery-image", async (request) => {
    try {
      const relativePath = extractGalleryImageRelativePath(request.url);
      if (!relativePath) {
        return new Response("Bad Request", { status: 400 });
      }

      const imagesDir = resolveGalleryImagesDir();
      if (!imagesDir) {
        console.error("[gimg] Gallery image directory not found", GALLERY_VENDOR_IMAGES_DIR_CANDIDATES);
        return new Response("Not Found", { status: 404 });
      }

      const absolutePath = resolveGalleryImageFilePath(relativePath, imagesDir);
      if (!absolutePath) {
        return new Response("Not Found", { status: 404 });
      }

      const buffer = await fs.promises.readFile(absolutePath);
      return new Response(buffer, {
        status: 200,
        headers: {
          "Content-Type": getGalleryImageContentType(absolutePath),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch (error) {
      console.error("[gimg] Failed to serve gallery image:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  });
}

function readStringField(source: Record<string, unknown>, key: keyof YouMindPromptsRequestPayload): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readPositiveIntegerField(source: Record<string, unknown>, key: keyof YouMindPromptsRequestPayload): number | undefined {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function normalizeYouMindPromptsPayload(payload: unknown): YouMindPromptsRequestPayload {
  const source = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  const page = readPositiveIntegerField(source, "page") ?? 1;
  const rawLimit = readPositiveIntegerField(source, "limit");
  const limit = rawLimit
    ? Math.min(rawLimit, YOUMIND_PROMPTS_MAX_LIMIT)
    : YOUMIND_PROMPTS_MAX_LIMIT;

  return {
    model: readStringField(source, "model") ?? "gpt-image-2",
    page,
    limit,
    locale: readStringField(source, "locale") ?? "zh-CN",
    q: readStringField(source, "q"),
    categories: readStringField(source, "categories"),
    campaign: readStringField(source, "campaign"),
    filterMode: readStringField(source, "filterMode"),
    searchMode: readStringField(source, "searchMode"),
    sortBy: readStringField(source, "sortBy"),
    sortOrder: readStringField(source, "sortOrder"),
  };
}

function assertFetchableImageUrl(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Image URL must be a string");
  }

  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only HTTP(S) image URLs can be fetched");
  }
  if (!REMOTE_IMAGE_ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`Unsupported remote image host: ${url.hostname}`);
  }

  return url.toString();
}

async function readLimitedResponseBytes(response: Response): Promise<number[]> {
  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > REMOTE_IMAGE_MAX_BYTES) {
      throw new Error("Remote image is too large");
    }
    return Array.from(new Uint8Array(arrayBuffer));
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    totalBytes += value.byteLength;
    if (totalBytes > REMOTE_IMAGE_MAX_BYTES) {
      await reader.cancel();
      throw new Error("Remote image is too large");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return Array.from(bytes);
}

async function createWindow() {
  const { nativeTheme } = await import("electron");
  const initialTheme = nativeTheme.shouldUseDarkColors ? "dark" : "light";
  const overlay = initialTheme === "dark" ? darkOverlay : lightOverlay;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: "hidden",
    titleBarOverlay: overlay,
    backgroundColor: initialTheme === "dark" ? "#1a1816" : "#fcfaf9",
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || (!app.isPackaged ? "http://localhost:5173" : undefined);
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

ipcMain.handle("get-backend-port", () => getBackendPort());
ipcMain.handle("get-backend-auth-token", () => (isManagedBackend() ? backendAuthToken : null));
ipcMain.handle("get-backend-origin", () => {
  const port = getBackendPort();
  if (!port) return null;
  return `http://${getBackendHost()}:${port}`;
});

ipcMain.handle("save-image", async (_event, payload: { defaultPath?: string; bytes: number[] }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: payload.defaultPath || "gimg-export.png",
    filters: [{ name: "PNG 图片", extensions: ["png"] }],
  });
  if (canceled || !filePath) {
    return { saved: false };
  }
  await fs.promises.writeFile(filePath, Buffer.from(payload.bytes));
  return { saved: true, path: filePath };
});

ipcMain.handle("fetch-youmind-prompts", async (_event, payload: unknown) => {
  const body = normalizeYouMindPromptsPayload(payload);
  const response = await fetch(YOUMIND_PROMPTS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "GIMG/0.1 YouMind prompt sync",
      Referer: YOUMIND_PROMPTS_REFERER,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`YouMind prompt sync failed: HTTP ${response.status}`);
  }

  return response.json();
});

ipcMain.handle("fetch-image-bytes", async (_event, rawUrl: unknown) => {
  const imageUrl = assertFetchableImageUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_IMAGE_FETCH_TIMEOUT_MS);
  const response = await fetch(imageUrl, {
    headers: {
      "User-Agent": "GIMG/0.1 image reference fetch",
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
    },
    redirect: "error",
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeout);
  });

  if (!response.ok) {
    throw new Error(`Image fetch failed: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`Unsupported image content type: ${contentType}`);
  }

  const contentLength = Number.parseInt(response.headers.get("content-length") || "0", 10);
  if (Number.isFinite(contentLength) && contentLength > REMOTE_IMAGE_MAX_BYTES) {
    throw new Error("Remote image is too large");
  }

  const bytes = await readLimitedResponseBytes(response);

  return {
    bytes,
    contentType,
  };
});

ipcMain.on("update-theme", (_event, theme: "light" | "dark") => {
  if (!mainWindow) return;
  const overlay = theme === "dark" ? darkOverlay : lightOverlay;
  mainWindow.setTitleBarOverlay(overlay);
  mainWindow.setBackgroundColor(theme === "dark" ? "#1a1816" : "#fcfaf9");
});

app.whenReady().then(async () => {
  try {
    process.env.GIMG_AUTH_KEY = backendAuthToken;
    registerGalleryImageProtocol();
    await startBackend();
  } catch (err) {
    console.error(`[gimg] Failed to start backend: ${err}`);
  }
  await createWindow();
});

app.on("window-all-closed", async () => {
  await stopBackend();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  await stopBackend();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
