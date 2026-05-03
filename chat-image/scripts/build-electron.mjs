import { execSync } from "child_process";
import { copyFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";
const backendBin = isWin ? "gimg-backend.exe" : "gimg-backend";

console.log("[1/3] Building Go backend...");
execSync(`go build -o ../resources/${backendBin} .`, {
  cwd: path.join(root, "backend"),
  stdio: "inherit",
});

console.log("[2/3] Building frontend...");
execSync("npx vite build", { cwd: root, stdio: "inherit" });

console.log("[3/3] Compiling Electron main process...");
execSync("npx tsc -p tsconfig.node.json --outDir dist-electron", {
  cwd: root,
  stdio: "inherit",
});
copyFileSync(path.join(root, "electron", "preload.cjs"), path.join(root, "dist-electron", "preload.cjs"));

console.log("Build complete! Binary at resources/" + backendBin);
