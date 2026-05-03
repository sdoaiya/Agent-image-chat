import { app, BrowserWindow, dialog, ipcMain, protocol } from "electron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { startBackend, stopBackend, getBackendPort, getBackendHost } from "./go-process.js";
import { extractGalleryImageRelativePath, getGalleryImageContentType, resolveGalleryImageFilePath } from "./gallery-image.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_VENDOR_IMAGES_DIR_CANDIDATES = [
  path.resolve(app.getAppPath(), "vendor", "awesome-gpt-image-2-main", "data", "images"),
  path.resolve(process.resourcesPath, "vendor", "awesome-gpt-image-2-main", "data", "images"),
];

let mainWindow: BrowserWindow | null = null;

const darkOverlay = { color: "#1a1816", symbolColor: "#a8a29e" };
const lightOverlay = { color: "#fcfaf9", symbolColor: "#57534e" };

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

ipcMain.on("update-theme", (_event, theme: "light" | "dark") => {
  if (!mainWindow) return;
  const overlay = theme === "dark" ? darkOverlay : lightOverlay;
  mainWindow.setTitleBarOverlay(overlay);
  mainWindow.setBackgroundColor(theme === "dark" ? "#1a1816" : "#fcfaf9");
});

app.whenReady().then(async () => {
  try {
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
