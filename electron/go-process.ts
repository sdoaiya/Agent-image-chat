import { app } from "electron";
import fs from "fs";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import net from "net";
import http from "http";

let backendProcess: ChildProcess | null = null;
let backendPort: number | null = null;
let backendHost = "127.0.0.1";
let restartTimeout: ReturnType<typeof setTimeout> | null = null;
let shuttingDown = false;

export function getBackendPort(): number | null {
  return backendPort;
}

export function getBackendHost(): string {
  return backendHost;
}

export function isManagedBackend(): boolean {
  return backendProcess !== null;
}

function isWindows(): boolean {
  return process.platform === "win32";
}

function getBackendBinaryName(): string {
  return isWindows() ? "gimg-backend.exe" : "gimg-backend";
}

function getBackendResourceRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "resources");
  }

  return path.join(app.getAppPath(), "resources");
}

function getBackendDataRoot(): string {
  return path.join(getBackendResourceRoot(), "data");
}

export function getBackendPath(): string {
  const binaryName = getBackendBinaryName();
  const candidates = [
    path.join(getBackendResourceRoot(), binaryName),
    path.join(app.getAppPath(), "backend", binaryName),
    path.join(app.getAppPath(), "resources", binaryName),
  ];

  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolved) {
    throw new Error(`Backend binary not found. Tried: ${candidates.join(", ")}`);
  }

  console.log(`[gimg] Backend binary candidates: ${candidates.join(", ")}`);
  console.log(`[gimg] Using backend binary: ${resolved}`);
  return resolved;
}

export function findAvailablePort(host: string = "127.0.0.1"): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, host, () => {
      const addr = server.address();
      if (addr && typeof addr === "object" && "port" in addr) {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Failed to get port")));
      }
    });
    server.on("error", (err) => reject(err));
  });
}

function isLoopbackAddress(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

function normalizeBackendHost(value: string | undefined): string {
  if (!value) {
    return "127.0.0.1";
  }

  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "0.0.0.0" || trimmed === "::") {
    return "127.0.0.1";
  }

  return trimmed;
}

function normalizeBackendPort(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return null;
  }

  return parsed;
}

function canReuseExternalBackend(host: string, port: number): boolean {
  if (!isLoopbackAddress(host)) {
    console.warn(`[gimg] Ignoring GIMG_BACKEND_URL because host is not loopback: ${host}`);
    return false;
  }

  return true;
}

function getConfiguredExternalBackend(): { host: string; port: number } | null {
  const urlValue = process.env.GIMG_BACKEND_URL?.trim();
  if (urlValue) {
    try {
      const url = new URL(urlValue);
      const host = normalizeBackendHost(url.hostname);
      const port = normalizeBackendPort(url.port) ?? (url.protocol === "https:" ? 443 : 80);
      if (url.protocol !== "http:") {
        console.warn(`[gimg] Ignoring GIMG_BACKEND_URL with unsupported protocol: ${url.protocol}`);
        return null;
      }
      if (!canReuseExternalBackend(host, port)) {
        return null;
      }
      return { host, port };
    } catch (error) {
      console.warn(`[gimg] Ignoring invalid GIMG_BACKEND_URL: ${String(error)}`);
      return null;
    }
  }

  const host = normalizeBackendHost(process.env.GIMG_BACKEND_HOST);
  const port = normalizeBackendPort(process.env.GIMG_BACKEND_PORT);
  if (port === null) {
    return null;
  }
  if (!canReuseExternalBackend(host, port)) {
    return null;
  }
  return { host, port };
}

async function reuseExternalBackend(host: string, port: number): Promise<number> {
  backendHost = host;
  backendPort = port;
  backendProcess = null;
  console.log(`[gimg] Reusing external backend; Electron will not manage data_dir or resource_dir. target=http://${host}:${port}`);
  await waitForBackend(port, 30, host);
  console.log(`[gimg] Using external backend at http://${host}:${port}`);
  return port;
}

export async function startBackend(): Promise<number> {
  if (backendProcess && backendPort) {
    return backendPort;
  }

  const external = getConfiguredExternalBackend();
  if (external) {
    return reuseExternalBackend(external.host, external.port);
  }

  const host = "127.0.0.1";
  const port = await findAvailablePort(host);
  const backendPath = getBackendPath();
  const backendResourceRoot = getBackendResourceRoot();
  const backendDataDir = getBackendDataRoot();

  fs.mkdirSync(backendDataDir, { recursive: true });

  backendHost = host;
  backendPort = port;
  shuttingDown = false;

  console.log(
    `[gimg] Starting embedded backend on http://${host}:${port}: binary=${backendPath}, resource_dir=${backendResourceRoot}, data_dir=${backendDataDir}`,
  );

  backendProcess = spawn(backendPath, [], {
    cwd: backendResourceRoot,
    env: {
      ...process.env,
      GIMG_HOST: host,
      GIMG_PORT: String(port),
      GIMG_DATA_DIR: backendDataDir,
      GIMG_RESOURCE_DIR: backendResourceRoot,
      GIMG_MANAGED_BY_ELECTRON: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  backendProcess.stdout?.on("data", (data: Buffer) => {
    console.log(`[backend:stdout] ${data.toString().trim()}`);
  });

  backendProcess.stderr?.on("data", (data: Buffer) => {
    console.error(`[backend:stderr] ${data.toString().trim()}`);
  });

  backendProcess.on("error", (err) => {
    console.error(`[gimg] Backend process error: ${err.message}`);
  });

  backendProcess.on("exit", (code, signal) => {
    console.log(`[gimg] Backend exited with code ${code}, signal ${signal}`);

    const shouldRestart = !shuttingDown && code !== 0 && code !== null;
    backendProcess = null;

    if (shouldRestart) {
      console.log("[gimg] Backend crashed, scheduling restart...");
      if (restartTimeout) clearTimeout(restartTimeout);
      restartTimeout = setTimeout(async () => {
        console.log("[gimg] Restarting backend...");
        backendPort = null;
        try {
          await startBackend();
        } catch (err) {
          console.error(`[gimg] Failed to restart backend: ${err}`);
        }
      }, 3000);
      return;
    }

    backendPort = null;
  });

  await waitForBackend(port, 30, host);
  return port;
}

export function stopBackend(): Promise<void> {
  return new Promise((resolve) => {
    shuttingDown = true;

    if (restartTimeout) {
      clearTimeout(restartTimeout);
      restartTimeout = null;
    }

    if (!backendProcess) {
      backendPort = null;
      resolve();
      return;
    }

    const proc = backendProcess;
    backendProcess = null;

    let forceKillTimeout: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      clearTimeout(forceKillTimeout);
      backendPort = null;
      resolve();
    };

    proc.once("exit", cleanup);

    proc.kill(isWindows() ? undefined : "SIGTERM");

    forceKillTimeout = setTimeout(() => {
      console.log("[gimg] Force killing backend process");
      proc.kill(isWindows() ? undefined : "SIGKILL");
      proc.off("exit", cleanup);
      backendPort = null;
      resolve();
    }, 5000);
  });
}

export function waitForBackend(
  port: number,
  maxRetries: number = 30,
  host: string = backendHost,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const tryConnect = () => {
      const req = http.get(`http://${host}:${port}/health`, (res) => {
        if (res.statusCode === 200) {
          res.resume();
          console.log(`[gimg] Backend ready on http://${host}:${port}`);
          resolve();
        } else {
          res.resume();
          retry();
        }
      });

      req.on("error", () => {
        retry();
      });

      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      attempts++;
      if (attempts >= maxRetries) {
        reject(new Error(`Backend did not become ready at http://${host}:${port} after ${maxRetries} attempts`));
        return;
      }
      setTimeout(tryConnect, 500);
    };

    tryConnect();
  });
}
