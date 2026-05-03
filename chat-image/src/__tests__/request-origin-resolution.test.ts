import { beforeEach, describe, expect, it, vi } from "vitest";

const healthResponses = new Map<string, boolean>();
const electronOriginMock = vi.fn<() => Promise<string | null>>();
const electronPortMock = vi.fn<() => Promise<number | null>>();

vi.mock("axios", () => {
  const instance = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };

  return {
    default: {
      create: vi.fn(() => instance),
      isAxiosError: vi.fn(() => false),
    },
  };
});

describe("request runtime origin resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    healthResponses.clear();
    electronOriginMock.mockReset();
    electronPortMock.mockReset();

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const raw = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      const normalized = raw.replace(/\/health$/, "");
      return {
        ok: healthResponses.get(normalized) ?? false,
      };
    }));

    localStorage.clear();
  });

  it("Electron 下优先采用 getBackendOrigin，避免误落到 dev server origin", async () => {
    vi.stubGlobal("window", {
      electronAPI: {
        getBackendOrigin: electronOriginMock,
        getBackendPort: electronPortMock,
      },
      location: {
        protocol: "http:",
        origin: "http://localhost:5173",
      },
    } as unknown as Window & typeof globalThis);

    electronOriginMock.mockResolvedValue("http://127.0.0.1:19090");
    electronPortMock.mockResolvedValue(19090);
    healthResponses.set("http://127.0.0.1:19090", true);

    const { resolveElectronBaseURL, getBaseURL } = await import("@/lib/request");
    await expect(resolveElectronBaseURL()).resolves.toBe("http://127.0.0.1:19090");
    await expect(getBaseURL()).resolves.toBe("http://127.0.0.1:19090");
  });

  it("当 getBackendOrigin 不可达时，应退回 getBackendPort", async () => {
    vi.stubGlobal("window", {
      electronAPI: {
        getBackendOrigin: electronOriginMock,
        getBackendPort: electronPortMock,
      },
      location: {
        protocol: "file:",
        origin: "file://",
      },
    } as unknown as Window & typeof globalThis);

    electronOriginMock.mockResolvedValue("http://127.0.0.1:19999");
    electronPortMock.mockResolvedValue(18080);
    healthResponses.set("http://127.0.0.1:18080", true);

    const { resolveElectronBaseURL } = await import("@/lib/request");
    await expect(resolveElectronBaseURL()).resolves.toBe("http://127.0.0.1:18080");
  });

  it("非 Electron 下应跳过 dev server origin，优先用户配置的 baseUrl", async () => {
    vi.stubGlobal("window", {
      electronAPI: undefined,
      location: {
        protocol: "http:",
        origin: "http://localhost:5173",
      },
    } as unknown as Window & typeof globalThis);

    localStorage.setItem("gimg-settings", JSON.stringify({
      state: {
        baseUrl: "http://127.0.0.1:28080/",
      },
    }));
    healthResponses.set("http://127.0.0.1:28080", true);

    const { resolveFallbackBaseURL, getBaseURL } = await import("@/lib/request");
    await expect(resolveFallbackBaseURL()).resolves.toBe("http://127.0.0.1:28080");
    await expect(getBaseURL()).resolves.toBe("http://127.0.0.1:28080");
  });
});
