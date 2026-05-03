#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const profileDir = path.join(repoRoot, ".async", "tmp", "packaged-smoke-profile");
const statePath = path.join(profileDir, "Local Storage", "leveldb");

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(target));
    } else {
      files.push(target);
    }
  }
  return files;
}

async function main() {
  try {
    const files = await walk(statePath);
    const hits = [];
    for (const file of files) {
      const buf = await fs.readFile(file);
      const text = buf.toString("utf8");
      if (text.includes("gimg-settings") || text.includes("gpt-5.4") || text.includes("codex") || text.includes("baseUrl")) {
        hits.push({ file: path.relative(repoRoot, file).replace(/\\/g, "/"), preview: text.slice(0, 800) });
      }
    }
    console.log(JSON.stringify({ found: hits.length, hits }, null, 2));
  } catch (error) {
    console.error("inspect failed", error);
    process.exitCode = 1;
  }
}

main();
