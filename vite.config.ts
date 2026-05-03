import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

function removeCrossorigin() {
  return {
    name: "remove-crossorigin",
    transformIndexHtml(html: string) {
      return html.replace(/ crossorigin/g, "");
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const backendTarget = env.VITE_BACKEND_URL || "http://127.0.0.1:8080";

  return {
    plugins: [react(), tailwindcss(), removeCrossorigin()],
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