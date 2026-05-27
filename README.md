# GIMG

GIMG is a desktop image-generation workbench built with React, Electron, and a local Go backend. The app provides a canvas workflow for prompt-driven image generation, an example gallery, provider settings, and packaged Windows desktop builds.

GIMG 是一个桌面端 AI 图像生成工作台，使用 React、Electron 和本地 Go 后端构建。它提供提示词画布、示例库、模型与供应商设置，以及 Windows 桌面端打包能力。

## Features / 功能

- Image generation workspace with prompt, negative prompt, size, quality, and reference-image controls.
- 图像生成工作台，支持正向提示词、反向提示词、尺寸、质量和参考图控制。
- Example gallery backed by the bundled `awesome-gpt-image-2` image/prompt dataset.
- 内置示例库，基于随包携带的 `awesome-gpt-image-2` 图像与提示词数据集。
- Local settings drawer for provider, model, API key, proxy, and theme preferences.
- 本地设置面板，支持配置供应商、模型、API Key、代理和主题。
- Electron-managed Go backend with health checks, dynamic port allocation, and packaged resource handling.
- Electron 管理本地 Go 后端，支持健康检查、动态端口分配和打包资源路径处理。
- OpenAI-compatible backend endpoints for image generation, model listing, and settings.
- 后端提供兼容 OpenAI 风格的图像生成、模型列表和设置接口。

## Stack / 技术栈

- Frontend / 前端：React 19, React Router, Vite, TypeScript, Tailwind CSS, Radix UI, Zustand.
- Desktop shell / 桌面壳：Electron 35, electron-builder.
- Backend / 后端：Go HTTP server, TOML configuration.
- Tests / 测试：Vitest, React Testing Library, Go tests, Playwright-based packaged smoke scripts.

## Project Layout / 目录结构

```text
backend/      Go backend, API handlers, config loading, outbound proxy support
electron/     Electron main process, preload script, backend process launcher
src/          React application source
resources/    Runtime resources and default backend config
scripts/      Build, sync, packaged smoke, and utility scripts
vendor/       Bundled gallery image/prompt source data
dist/         Vite build output and Windows unpacked package output
```

```text
backend/      Go 后端、API 处理、配置加载、出站代理支持
electron/     Electron 主进程、preload 脚本、后端进程启动器
src/          React 应用源码
resources/    运行时资源和默认后端配置
scripts/      构建、同步、打包冒烟测试和工具脚本
vendor/       随包携带的示例图库与提示词数据
dist/         Vite 构建产物和 Windows 目录版打包产物
```

## Prerequisites / 环境要求

- Node.js 22 or newer / Node.js 22 或更高版本。
- npm 10 or newer / npm 10 或更高版本。
- Go 1.25 or newer / Go 1.25 或更高版本。
- Windows is required for the current packaged desktop target / 当前桌面端打包目标为 Windows。

## Install / 安装依赖

```powershell
npm ci
```

## Development / 开发启动

Run the Vite dev server and Electron app together:

同时启动 Vite 开发服务器和 Electron 应用：

```powershell
npm run dev
```

Electron starts the embedded Go backend automatically. The backend listens on a free loopback port and exposes that port to the frontend through the Electron preload layer.

Electron 会自动启动内置 Go 后端。后端会监听一个可用的本地回环端口，并通过 Electron preload 层把端口暴露给前端。

To reuse an external backend instead, set `GIMG_BACKEND_URL` before starting Electron:

如果要复用外部后端，在启动 Electron 前设置 `GIMG_BACKEND_URL`：

```powershell
$env:GIMG_BACKEND_URL = "http://127.0.0.1:8080"
npm run dev
```

## Configuration / 配置

Default config lives in:

默认配置文件位置：

```text
resources/data/config.toml
```

Important fields:

关键字段：

- `app.base_url`: upstream image provider base URL / 上游图像供应商地址。
- `app.api_key`: provider API key / 供应商 API Key。
- `chatgpt.model`: default image model / 默认图像模型。
- `server.host` and `server.port`: backend defaults when not managed by Electron / 非 Electron 管理时的后端默认监听地址和端口。
- `proxy.enabled` and `proxy.url`: outbound proxy settings / 出站代理配置。

During packaged or Electron-managed runs, Electron injects runtime paths and ports with environment variables such as `GIMG_HOST`, `GIMG_PORT`, `GIMG_DATA_DIR`, and `GIMG_RESOURCE_DIR`.

在打包运行或 Electron 托管运行时，Electron 会通过 `GIMG_HOST`、`GIMG_PORT`、`GIMG_DATA_DIR`、`GIMG_RESOURCE_DIR` 等环境变量注入运行时路径和端口。

## Scripts / 常用脚本

```powershell
npm run dev                 # Start Vite and Electron in development mode / 启动开发模式
npm run build               # Build frontend and Electron main process / 构建前端和 Electron 主进程
npm run build:electron      # Build Go backend, frontend, and Electron main process / 构建 Go 后端、前端和 Electron 主进程
npm run dist:dir            # Build Windows unpacked directory package / 生成 Windows 目录版
npm run dist                # Build installer/package artifacts / 生成安装包或发布产物
npm run lint                # Type-check TypeScript / TypeScript 类型检查
npm test                    # Run Vitest unit tests / 运行单元测试
npm run test:e2e            # Run gallery workbench e2e script / 运行示例库工作台端到端脚本
npm run test:packaged       # Run packaged smoke script / 运行打包产物冒烟测试
```

## Packaging / 打包

Create a Windows unpacked directory build:

生成 Windows 目录版：

```powershell
npm run dist:dir
```

The unpacked app is written to:

目录版产物位置：

```text
dist/win-unpacked/
```

Run the packaged app with:

运行打包后的应用：

```powershell
.\dist\win-unpacked\GIMG.exe
```

## Verification / 验证

Recommended checks before committing code changes:

提交代码改动前建议运行：

```powershell
npm run lint
npm test
cd backend
go test ./...
```

For packaged-app changes, also run the relevant packaged smoke script:

涉及打包应用的改动，还应运行对应的打包冒烟测试：

```powershell
npm run test:packaged
```
