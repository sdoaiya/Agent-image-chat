#!/usr/bin/env bash
set -euo pipefail

echo "[1/2] Building Go backend..."
cd "$(dirname "$0")/../backend"
go build -o ../resources/gimg-backend .

echo "[2/2] Starting dev environment..."
cd "$(dirname "$0")/.."
npx concurrently -k \
  "go run ./backend" \
  "npx vite"