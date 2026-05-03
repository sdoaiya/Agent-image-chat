# 动态证据采集包（最小补证）

采集时间：2026-04-25 00:08（本地终端输出时间）
工作目录：`E:\codex项目\img2\gimg`

## 目标
仅对以下三种运行模式补做最小动态证据采集，提供可复核的启动日志与 `/health` 实测结果：
1. `npm run dev`
2. `npm run dev:electron`
3. `npx electron dist-electron/main.js`

## 环境与方法
- 实际执行方式：通过持久终端会话启动命令并读取原始 stdout/stderr。
- `/health` 实测方式：对日志中实际出现的端口执行 HTTP GET。
- 说明：本次只补动态运行证据，不对 UI 行为、功能完整性作额外推断。

---

## 模式 1：`npm run dev`

### 启动命令
```cmd
npm run dev
```

### 主进程/编排日志（实测摘录）
```text
> gimg@0.1.0 dev
> concurrently -k "vite" "wait-on http://localhost:5173 && npm run dev:electron"

[0]   VITE v7.3.2 ready in 3065 ms
[0]   ➜  Local:   http://localhost:5173/
[1] > gimg@0.1.0 dev:electron
[1] > tsc -p tsconfig.node.json && electron .
```

### backend 启动日志（实测摘录）
```text
[1] [gimg] Backend binary candidates: E:\codex项目\img2\gimg\resources\gimg-backend.exe, E:\codex项目\img2\gimg\backend\gimg-backend.exe, E:\codex项目\img2\gimg\resources\gimg-backend.exe
[1] [gimg] Using backend binary: E:\codex项目\img2\gimg\resources\gimg-backend.exe
[1] [gimg] Starting embedded backend on http://127.0.0.1:56531: binary=E:\codex项目\img2\gimg\resources\gimg-backend.exe, resource_dir=E:\codex项目\img2\gimg\resources, data_dir=E:\codex项目\img2\gimg\resources\data, config_path=E:\codex项目\img2\gimg\resources\data\config.toml
[1] [backend:stdout] time=2026-04-25T00:08:00.022+08:00 level=INFO msg="gimg server listening" addr=127.0.0.1:56531
[1] [gimg] Backend ready on http://127.0.0.1:56531
```

### preload 实际命中路径
```text
[1] [gimg] Using preload script: E:\codex项目\img2\gimg\dist-electron\preload.cjs
```

### `/health` 实测
请求：`GET http://127.0.0.1:56531/health`

结果：`HTTP 200 OK`

响应头/体摘录：
```text
content-type: application/json

{"status":"ok"}
```

### 判定
- 状态：**PASS（已实测）**
- 事实边界：该模式实际先起 `vite`，再由 `wait-on` 触发 `npm run dev:electron`；Electron 管理了一个嵌入式 backend，`/health` 可达。

---

## 模式 2：`npm run dev:electron`

### 启动命令
```cmd
npm run dev:electron
```

### 主进程日志（实测摘录）
```text
> gimg@0.1.0 dev:electron
> tsc -p tsconfig.node.json && electron .
```

### backend 启动日志（实测摘录）
```text
[gimg] Backend binary candidates: E:\codex项目\img2\gimg\resources\gimg-backend.exe, E:\codex项目\img2\gimg\backend\gimg-backend.exe, E:\codex项目\img2\gimg\resources\gimg-backend.exe
[gimg] Using backend binary: E:\codex项目\img2\gimg\resources\gimg-backend.exe
[gimg] Starting embedded backend on http://127.0.0.1:56550: binary=E:\codex项目\img2\gimg\resources\gimg-backend.exe, resource_dir=E:\codex项目\img2\gimg\resources, data_dir=E:\codex项目\img2\gimg\resources\data, config_path=E:\codex项目\img2\gimg\resources\data\config.toml
[backend:stdout] time=2026-04-25T00:08:01.305+08:00 level=INFO msg="gimg server listening" addr=127.0.0.1:56550
[gimg] Backend ready on http://127.0.0.1:56550
```

### preload 实际命中路径
```text
[gimg] Using preload script: E:\codex项目\img2\gimg\dist-electron\preload.cjs
```

### `/health` 实测
请求：`GET http://127.0.0.1:56550/health`

结果：`HTTP 200 OK`

响应头/体摘录：
```text
content-type: application/json

{"status":"ok"}
```

### 额外运行现象（不外推，只记录）
```text
[27432:0425/000801.958:ERROR:cache_util_win.cc(20)] Unable to move the cache: 拒绝访问。 (0x5)
[27432:0425/000801.959:ERROR:disk_cache.cc(216)] Unable to create cache
[27432:0425/000810.030:ERROR:backing_store.cc(195)] Failed to open LevelDB database from C:\Users\zdy25\AppData\Roaming\gimg\IndexedDB\http_localhost_5173.indexeddb.leveldb,IO error: ... Access denied.
```
说明：这些是 Electron/Chromium 运行期缓存与 IndexedDB 锁文件权限相关报错；本次证据采集仅记录现象，不对其根因与影响范围作超出日志的推断。

### 判定
- 状态：**PASS（已实测）**
- 事实边界：该模式能独立拉起 Electron 主进程、命中 `dist-electron/preload.cjs`、启动嵌入式 backend，并使 `/health` 返回 200。

---

## 模式 3：`npx electron dist-electron/main.js`

### 启动命令
```cmd
npx electron dist-electron/main.js
```

### 主进程日志（实测摘录）
```text
[gimg] Failed to start backend: Error: Backend binary not found. Tried: E:\codex项目\img2\gimg\dist-electron\resources\gimg-backend.exe, E:\codex项目\img2\gimg\dist-electron\backend\gimg-backend.exe, E:\codex项目\img2\gimg\dist-electron\resources\gimg-backend.exe
[gimg] Using preload script: E:\codex项目\img2\gimg\dist-electron\preload.cjs
```

### backend 启动日志
- 无成功启动日志。
- 已有失败证据：主进程明确报 `Backend binary not found`。

### preload 实际命中路径
```text
[gimg] Using preload script: E:\codex项目\img2\gimg\dist-electron\preload.cjs
```

### `/health` 实测
- 状态：**BLOCKED**
- 原因：该运行模式下 backend 未成功启动，日志中没有出现可探测端口；因此不存在可诚实实测的 `/health` 目标地址。
- 缺失的执行能力：无额外平台能力缺失；阻塞来自运行结果本身，即 `dist-electron` 相对路径下找不到 backend binary，导致无法进入健康检查阶段。

### 判定
- 状态：**BLOCKED（实测失败，非静态推断）**
- 事实边界：该模式下 Electron 主进程已启动并命中 preload，但 backend 解析路径失败，未形成可用 HTTP 服务。

---

## 汇总结论

| 模式 | 是否实际执行 | preload 命中 | backend 结果 | `/health` 结果 | 结论 |
|---|---|---|---|---|---|
| `npm run dev` | 是 | `dist-electron/preload.cjs` | 成功启动，端口 `56531` | `200 OK`, `{"status":"ok"}` | PASS |
| `npm run dev:electron` | 是 | `dist-electron/preload.cjs` | 成功启动，端口 `56550` | `200 OK`, `{"status":"ok"}` | PASS |
| `npx electron dist-electron/main.js` | 是 | `dist-electron/preload.cjs` | 启动失败：`Backend binary not found` | BLOCKED | BLOCKED |

## 可供后续角色直接引用的事实点
1. 三种模式均已实际执行，不存在用静态阅读冒充运行结论。
2. 前两种模式都实际命中 `E:\codex项目\img2\gimg\dist-electron\preload.cjs`。
3. 前两种模式都由 Electron 启动嵌入式 backend，且 `/health` 返回 `200` 与 `{"status":"ok"}`。
4. `npx electron dist-electron/main.js` 模式下，backend 未启动成功；失败日志明确是 backend binary 查找路径落在 `dist-electron\resources` / `dist-electron\backend` 下但未命中，不应再声称该模式下 backend 正常可用。
5. 本证据包只覆盖“启动—命中 preload—backend 日志—`/health` 实测”这条最小链路。
