# Backend 审计定向修订（仅修正启动链路事实边界）

## 1. 对既有误判的明确校正

### 校正 1：`dist-electron/go-process.js` 不能再表述为“仍是旧版实现”
此前该表述不成立。当前仓库中的 `dist-electron/go-process.js` 已包含与源码 `electron/go-process.ts` 一致的现行启动逻辑，而非“旧版残留实现”。至少有以下可直接核对的对应事实：

- 二进制候选路径解析存在于 `dist-electron/go-process.js:36-50`，与 `electron/go-process.ts:46-62` 一致。
- 外部 backend 复用逻辑（`GIMG_BACKEND_URL` / `GIMG_BACKEND_HOST` / `GIMG_BACKEND_PORT`）存在于 `dist-electron/go-process.js:98-145`，与 `electron/go-process.ts:120-170` 一致。
- Electron 注入 `GIMG_HOST`、`GIMG_PORT`、`GIMG_DATA_DIR`、`GIMG_RESOURCE_DIR` 的受管启动逻辑存在于 `dist-electron/go-process.js:156-168`，与 `electron/go-process.ts:185-200` 一致。
- `/health` 探活与非零退出后的延迟重启逻辑存在于 `dist-electron/go-process.js:178-200,234-267`，与 `electron/go-process.ts:214-239,282-323` 一致。

**修订结论**：`dist-electron/go-process.js` 反映的是当前编译产物中的有效实现；此前把它定性为“旧版实现”属于错误归因，应撤回。

---

## 2. backend 启动链路的修订判断

以下只重写 `dist-electron/go-process.js`、binary 路径、端口注入、探活、重启链路相关结论，并严格区分“已证实事实 / 高风险假设 / 待补证据”。

### 2.1 已证实事实

#### 事实 A：`npm run dev` 实际走的是“Vite 就绪后触发 Electron，再由 Electron 启动受管 backend”链路
证据：

- `package.json:7-10`：`npm run dev` 实际执行 `concurrently -k "vite" "wait-on http://localhost:5173 && npm run dev:electron"`，而 `dev:electron` 为 `tsc -p tsconfig.node.json && electron .`。
- `dynamic-evidence-report.md:28-35`：运行日志确认 `vite` 启动后，再触发 `npm run dev:electron`。
- `dist-electron/main.js:65-72`：`app.whenReady()` 后先 `await startBackend()`，再 `await createWindow()`。
- `dynamic-evidence-report.md:39-43`：实测日志显示 Electron 选择 `resources\gimg-backend.exe` 并在 `127.0.0.1:56531` 启动嵌入式 backend。
- `dynamic-evidence-report.md:52-60`：`GET http://127.0.0.1:56531/health` 返回 `200` 与 `{"status":"ok"}`。

**修订判断**：该模式下 backend 启动成功已被动态证据证实，不能再写成“仅静态推断可能可用”。

#### 事实 B：`npm run dev:electron` 能独立完成 backend 启动、端口注入与健康检查
证据：

- `dist-electron/go-process.js:146-168`：未配置外部 backend 时，会先在 `127.0.0.1` 上找空闲端口，再以环境变量注入方式启动 backend，其中包含 `GIMG_PORT`、`GIMG_DATA_DIR`、`GIMG_RESOURCE_DIR`。
- `dynamic-evidence-report.md:84-89`：实测日志显示 backend 在 `127.0.0.1:56550` 启动，并输出 `gimg server listening`。
- `dynamic-evidence-report.md:97-105`：`GET http://127.0.0.1:56550/health` 返回 `200` 与 `{"status":"ok"}`。
- `dist-electron/go-process.js:234-267`：主进程通过轮询 `GET /health` 判断就绪。

**修订判断**：端口不是硬编码或仅来源于配置文件，而是由 Electron 在运行时分配空闲端口后，通过 `GIMG_PORT` 注入 backend；backend readiness 已有实测闭环支撑。

#### 事实 C：`npx electron dist-electron/main.js` 下失败点是 binary 路径解析，而不是 `/health`、端口注入或 preload 漂移
证据：

- `dist-electron/go-process.js:36-50`：backend binary 候选路径为：
  1. `<resource_root>/gimg-backend(.exe)`
  2. `<app_path>/backend/gimg-backend(.exe)`
  3. `<app_path>/resources/gimg-backend(.exe)`
- `dist-electron/go-process.js:24-29`：未打包时 `resource_root = path.join(app.getAppPath(), "resources")`。
- 当使用 `npx electron dist-electron/main.js` 直接启动时，`app.getAppPath()` 落在 `dist-electron`，因此候选路径实际变为 `dist-electron/resources/...` 与 `dist-electron/backend/...`。
- `dynamic-evidence-report.md:131-147`：实测日志明确报错 `Backend binary not found`，尝试路径正是 `E:\codex项目\img2\gimg\dist-electron\resources\gimg-backend.exe`、`...\dist-electron\backend\gimg-backend.exe`；由于 backend 未成功启动，因此 `/health` 无法诚实实测，只能记为 BLOCKED。
- `dynamic-evidence-report.md:132,141`：同一模式下 preload 仍命中 `dist-electron/preload.cjs`。

**修订判断**：该模式的失败边界应限定为“直接以 `dist-electron/main.js` 作为 app path 启动时，binary 查找相对基准变为 `dist-electron`，导致候选路径未命中”；不能再归因为 `dist-electron/go-process.js` 过旧、preload 错位、或 backend 已成功启动但健康检查失败。

#### 事实 D：当前源码确实存在“崩溃后尝试重启”的链路，但本轮没有动态证据证明它已成功执行过
证据：

- `dist-electron/go-process.js:178-196`：backend 以非零退出码退出且不在 `shuttingDown` 状态时，会记录 `Backend crashed, scheduling restart...`，3 秒后再次调用 `startBackend()`。
- `dist-electron/go-process.js:203-232`：正常退出/窗口关闭路径会走 `stopBackend()`，并抑制误重启。
- 本次动态证据中，`dynamic-evidence-report.md` 未出现 `Backend crashed, scheduling restart...` 或 `Restarting backend...` 日志。

**修订判断**：可以确认“源码具备自动重启设计”，但**不能**把它表述成“已实测验证自动恢复正常”。

### 2.2 高风险假设

以下说法若继续写入终审，风险较高：

1. **“`dist-electron/go-process.js` 还是旧版，所以运行时和源码不一致。”**  
   已被 `dist-electron/go-process.js` 与 `electron/go-process.ts` 的逐段对照直接否定。

2. **“`npx electron dist-electron/main.js` 模式下 backend 实际已启动，只是健康检查没打通。”**  
   已被 `dynamic-evidence-report.md:131-147` 的 `Backend binary not found` 直接否定；此模式没有出现成功监听端口日志。

3. **“端口来自固定配置或前端写死值。”**  
   已被 `dist-electron/go-process.js:147-168` 与两次实测的不同端口（`56531`、`56550`）否定。

4. **“preload 命中正常即可推出 backend 一定正常。”**  
   第三种模式已经反例证明：`dynamic-evidence-report.md:132,141` 显示 preload 命中 `dist-electron/preload.cjs`，但 backend 仍因 binary 路径未命中而启动失败。

### 2.3 待补证据

以下内容当前不应写成确定结论，只能列为待补：

1. **自动重启链路的实际效果**  
   源码存在，但本轮未制造 backend crash，也未采到重启成功/失败日志。

2. **外部 backend 复用分支的动态闭环**  
   `dist-electron/go-process.js:98-145` 明确支持 `GIMG_BACKEND_URL` 与 `GIMG_BACKEND_HOST`/`GIMG_BACKEND_PORT`，但本轮动态证据只覆盖内嵌 backend 与直接执行 `dist-electron/main.js` 失败场景，未覆盖外部 backend 成功复用。

3. **打包态 `app.isPackaged === true` 时的 binary 路径实际命中**  
   当前仅从源码确认打包态会转向 `process.resourcesPath/resources`；本轮未采集打包产物运行日志，不能把打包态成功与否写成已实测事实。

---

## 3. 建议替换进终审的 backend 结论

可直接替换为以下表述：

> backend 审计应修订为：当前仓库中的 `dist-electron/go-process.js` 并非旧版残留，而是与 `electron/go-process.ts` 对齐的现行编译产物，已包含 binary 候选路径解析、运行时端口注入、`/health` 探活以及异常退出后的延迟重启逻辑（见 `dist-electron/go-process.js:36-50,138-200,234-267`；对应源码 `electron/go-process.ts:46-62,162-239,282-323`）。动态证据显示，`npm run dev` 与 `npm run dev:electron` 两种模式下，Electron 均成功选择 `resources\gimg-backend.exe`，分别在 `127.0.0.1:56531`、`127.0.0.1:56550` 启动嵌入式 backend，且 `/health` 实测均返回 `200` 与 `{"status":"ok"}`（见 `dynamic-evidence-report.md:39-60,84-105`）。另一方面，`npx electron dist-electron/main.js` 的失败边界应限定为 binary 路径解析：该模式下 `app.getAppPath()` 基准落在 `dist-electron`，实际尝试 `dist-electron\resources\gimg-backend.exe` / `dist-electron\backend\gimg-backend.exe` 未命中，主进程明确报 `Backend binary not found`，因此 backend 未形成可探测端口，`/health` 只能记为 BLOCKED，而不能反推为 backend 已正常启动（见 `dynamic-evidence-report.md:131-151`）。对于自动重启与外部 backend 复用，当前只能确认源码具备相应分支，尚缺本轮动态实测闭环，不宜写成已验证成立。 

---

## 4. 本次 backend 修订的边界

本修订**仅**纠正以下 backend 相关事实边界：

- `dist-electron/go-process.js` 的版本归因
- backend binary 候选路径与 `app.getAppPath()` 基准
- 端口分配与 `GIMG_PORT` 注入机制
- `/health` 探活是源码事实且前两种模式已有实测
- 自动重启链路“源码存在”与“动态已验证”之间的边界

其余已成立结论（如 preload 命中 `dist-electron/preload.cjs`）不在此文重做，只在需要时作为 backend 链路背景引用。
