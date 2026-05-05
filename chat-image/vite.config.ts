import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import type { IncomingMessage, ServerResponse } from "node:http";

const YOUMIND_TARGET = "https://youmind.com";
const YOUMIND_PROMPTS_REFERER = "https://youmind.com/zh-CN/gpt-image-2-prompts";
const YOUMIND_PROMPTS_PROXY_PATH = "/youhome-api/prompts";

function removeCrossorigin() {
  return {
    name: "remove-crossorigin",
    transformIndexHtml(html: string) {
      return html.replace(/ crossorigin/g, "");
    },
  };
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function youMindPromptProxy() {
  return {
    name: "youmind-prompt-proxy",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const requestPath = req.url?.split("?")[0];
        if (requestPath !== YOUMIND_PROMPTS_PROXY_PATH) {
          next();
          return;
        }

        if (req.method !== "POST") {
          sendJson(res, 405, { error: "method not allowed" });
          return;
        }

        try {
          const body = await readRequestBody(req);
          const upstream = await fetch(`${YOUMIND_TARGET}${YOUMIND_PROMPTS_PROXY_PATH}`, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Origin: YOUMIND_TARGET,
              Referer: YOUMIND_PROMPTS_REFERER,
            },
            body,
          });
          const text = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/json; charset=utf-8");
          res.end(text);
        } catch (error) {
          sendJson(res, 502, {
            error: error instanceof Error ? error.message : "YouMind prompt proxy failed",
          });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const backendTarget = env.VITE_BACKEND_URL || "http://127.0.0.1:8080";

  return {
    plugins: [youMindPromptProxy(), react(), tailwindcss(), removeCrossorigin()],
    base: "./",
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        "/v1": backendTarget,
        "/api": backendTarget,
        "/health": backendTarget,
      },
    },
  };
});

/// <reference types="vitest" />
