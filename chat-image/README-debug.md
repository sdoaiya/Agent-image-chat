# GIMG 调试说明

本文聚焦 Electron 与 backend 集成调试，说明三种运行模式下 backend 来源、数据目录、资源目录、preload 路径，以及排错入口。

## 1. backend 启动规则

### 默认行为：Electron 内嵌 backend
未设置外部 backend 环境变量时，Electron 主进程会：

1. 从资源候选路径中寻找 backend 可执行文件；
2. 绑定 `127.0.0.1` 上的一个空闲端口；
3. 以受管方式启动 backend，并注入：
   - `GIMG_HOST=127.0.0.1`
   - `GIMG_PORT=<随机空闲端口>`
   - `GIMG_DATA_DIR=<资源目录>/data`
   - `GIMG_RESOURCE_DIR=<资源目录>`
   - `GIMG_MANAGED_BY_ELECTRON=1`
4. 轮询 `GET /health`，健康检查成功后再让前端使用该端口。

### 显式外部 backend 覆盖
若设置以下任一环境变量，Electron 将**不再拉起内嵌 backend**，而是直接复用外部 backend：

- `GIMG_BACKEND_URL=http://127.0.0.1:8080`
- 或组合：
  - `GIMG_BACKEND_HOST=127.0.0.1`
  - `GIMG_BACKEND_PORT=8080`

限制：

- 仅允许 loopback 地址：`127.0.0.1`、`localhost`、`::1`
- `GIMG_BACKEND_URL` 仅支持 `http:`
- 若 host 为 `0.0.0.0`、`::`，Electron 会归一化为 `127.0.0.1`
- 外部 backend 模式下，Electron 不负责其 `data_dir` / `resource_dir`

## 2. 三种模式矩阵

| 模式 | backend 来源 | 数据目录 data_dir | 资源目录 resource_dir | preload 路径 |
| --- | --- | --- | --- | --- |
| Electron dev | Electron 启动内嵌 backend；若设置 `GIMG_BACKEND_URL` / `GIMG_BACKEND_HOST` + `GIMG_BACKEND_PORT` 则改为外部 backend | 内嵌时为 `<workspace>/resources/data`，通过 `GIMG_DATA_DIR` 注入；外部时由外部 backend 自行决定 | 内嵌时为 `<workspace>/resources`，通过 `GIMG_RESOURCE_DIR` 注入；外部时由外部 backend 自行决定 | 优先 `dist-electron/preload.cjs`，其次 `dist-electron/preload.js`，dev 下额外回退 `<workspace>/electron/preload.cjs` |
| 纯 Vite + 外部 backend | Electron 不参与；必须手工启动外部 backend | 默认 `./data`，或由外部进程的 `GIMG_DATA_DIR` 指定 | 默认 backend 进程当前工作目录，或由 `GIMG_RESOURCE_DIR` 指定 | 不适用 |
| 打包运行 | Electron 启动内嵌 backend；若显式设置外部 backend 环境变量则改为复用外部 backend | 内嵌时为 `<process.resourcesPath>/resources/data` | 内嵌时为 `<process.resourcesPath>/resources` | `dist-electron/preload.cjs` 或 `dist-electron/preload.js`（打包后位于 app 内） |

## 3. 关键路径约定

### Electron 主进程 `electron/main.ts`
- preload 候选路径：
  - `path.join(__dirname, "preload.cjs")`
  - `path.join(__dirname, "preload.js")`
  - dev 回退：`path.join(app.getAppPath(), "electron", "preload.cjs")`
- 启动时会打印最终采用的 preload 路径

### Electron backend 启动器 `electron/go-process.ts`
- 资源目录：
  - 打包：`path.join(process.resourcesPath, "resources")`
  - 开发：`path.join(app.getAppPath(), "resources")`
- backend 二进制候选：
  - `<resource_root>/gimg-backend(.exe)`
  - `<app_path>/backend/gimg-backend(.exe)`
  - `<app_path>/resources/gimg-backend(.exe)`
- 数据目录：`<resource_root>/data`

### Go backend `backend/main.go`
- host：优先 `GIMG_HOST`，否则配置文件 `server.host`
- port：优先 `GIMG_PORT`，否则配置文件 `server.port`
- data_dir：优先 `GIMG_DATA_DIR`，否则 `./data`
- resource_dir：优先 `GIMG_RESOURCE_DIR`，否则当前工作目录
- 启动日志会打印：
  - `addr`
  - `data_dir`
  - `resource_dir`
  - `config_path`

## 4. 推荐调试方式

### 4.1 Electron dev + 内嵌 backend
```bash
npm run build
npm run dev
```

说明：
- `npm run build` 会生成 `dist-electron/main.js` 和复制 `electron/preload.cjs` 到 `dist-electron/preload.cjs`
- `npm run dev` 会启动 Vite，并在 5173 可访问后启动 Electron

### 4.2 Electron dev + 外部 backend
先启动 backend，例如：

```bash
set GIMG_DATA_DIR=%CD%\resources\data
set GIMG_RESOURCE_DIR=%CD%\resources
set GIMG_HOST=127.0.0.1
set GIMG_PORT=8080
backend\gimg.exe
```

然后再启动 Electron：

```bash
set GIMG_BACKEND_URL=http://127.0.0.1:8080
npm run dev
```

若使用 PowerShell：

```powershell
$env:GIMG_DATA_DIR = "$PWD/resources/data"
$env:GIMG_RESOURCE_DIR = "$PWD/resources"
$env:GIMG_HOST = "127.0.0.1"
$env:GIMG_PORT = "8080"
./backend/gimg.exe
```

另开一个 PowerShell：

```powershell
$env:GIMG_BACKEND_URL = "http://127.0.0.1:8080"
npm run dev
```

### 4.3 纯 Vite + 外部 backend
此模式用于只调前端网络调用，不验证 Electron preload / 主进程逻辑。

1. 手工启动 backend
2. 单独运行 Vite
3. 前端应指向该 backend 地址

## 5. 排错入口

### A. 先看 Electron 主进程日志
重点日志：
- `[gimg] Using preload script: ...`
- `[gimg] Backend binary candidates: ...`
- `[gimg] Using backend binary: ...`
- `[gimg] Starting embedded backend on http://127.0.0.1:<port>: binary=..., resource_dir=..., data_dir=..., config_path=...`
- `[gimg] Reusing external backend; Electron will not manage data_dir or resource_dir. target=http://...`
- `[gimg] Backend ready on http://...`

若出现：
- `Preload script not found`：说明 `dist-electron/preload.cjs` 未生成或路径不一致
- `Backend binary not found`：说明 `resources/` 或 `backend/` 下缺少目标二进制
- `Backend did not become ready`：说明 backend 进程已启动但 `/health` 未就绪，需继续看 backend 日志

### B. 再看 backend stdout/stderr
Electron 会转发：
- `[backend:stdout] ...`
- `[backend:stderr] ...`

Go backend 关键日志：
- `gimg server listening`：确认 `addr`、`data_dir`、`resource_dir`、`config_path`
- `port in use`：端口冲突
- `failed to ensure config directory`：数据目录不可写
- `failed to load config`：配置损坏或 TOML 非法

### C. 健康检查
可手工验证：

```bash
curl http://127.0.0.1:<port>/health
```

预期返回 200。

## 6. 一致性结论

当前约定已统一为：

- Electron 只连接 loopback backend，避免误连远端地址
- 内嵌 backend 的 host 固定为 `127.0.0.1`
- 端口由 Electron 分配并通过 `GIMG_PORT` 注入给 Go backend
- 数据目录统一由 `GIMG_DATA_DIR` 指向 `<resource_root>/data`
- 资源目录统一由 `GIMG_RESOURCE_DIR` 指向 `<resource_root>`
- Go backend 启动日志显式打印 `data_dir` / `resource_dir` / `config_path`

这保证了 Electron dev 与打包运行两种内嵌模式的路径语义一致；纯 Vite 模式则明确为“外部 backend 自行负责路径”。
