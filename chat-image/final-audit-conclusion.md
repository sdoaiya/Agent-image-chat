# 最终审计收口版本（修订后）

## 1. 最终结论

**结论：NEEDS WORK**

本次终审不能给出 PASS，也不能沿用先前已被仓库事实和动态证据推翻的 backend 结论。当前更准确的收口是：

- **已实测通过**：`npm run dev`、`npm run dev:electron` 的最小启动闭环
- **已实测阻塞**：`npx electron dist-electron/main.js`
- **仍需补证**：renderer/UI 级验证、自动重启链路、外部 backend 复用链路、打包态 binary 命中情况

因此，系统不能被表述为“整体已验证通过”，只能表述为：**`npm run dev` 与 `npm run dev:electron` 已证实最小启动闭环 PASS；该证据范围仅覆盖 preload 命中、backend 启动、`/health` 可达，不覆盖 renderer/UI 运行结果。与此同时，直接以 `dist-electron/main.js` 启动的链路存在明确阻塞，且若干关键分支仍缺动态闭环证据，结论应为 NEEDS WORK。**

### 本轮证据边界声明

本轮动态证据**未覆盖 renderer/UI 级验证**，因此**不能外推**为 `window.electronAPI` 在运行时已被 renderer 成功消费、页面渲染已验证正常、或用户交互链路已验证通过。当前可确认的范围，仅限于 preload 命中、backend 启动以及 `/health` 可达这一最小启动闭环。

---

## 2. 已证实问题

### 问题 1：`npx electron dist-electron/main.js` 模式下 backend 无法启动
**状态**：FAIL（已证实问题）

**证据来源**：
- 动态日志：`dynamic-evidence-report.md:129-151`
- 源码：`dist-electron/go-process.js:24-29,36-50`

**证据内容**：
- 运行 `npx electron dist-electron/main.js` 时，主进程明确输出：
  - `Backend binary not found`
- 失败时尝试的路径落在：
  - `dist-electron/resources/gimg-backend.exe`
  - `dist-electron/backend/gimg-backend.exe`
- 同一模式下没有出现 backend 成功监听端口的日志，因此 `/health` 无法进入实测阶段，只能记为 **BLOCKED**。

**审计判断**：
这是一个**已被动态复现的启动阻塞问题**。失败边界应当被限定为：
**直接以 `dist-electron/main.js` 作为 app path 启动时，backend binary 的相对路径解析未命中，导致 backend 未启动成功。**

**不能再沿用的旧说法**：
- “该模式下 backend 已正常启动，只是 `/health` 未通”
- “该问题由 preload 漂移直接导致”
- “`dist-electron/go-process.js` 是旧版实现所以链路失效”

以上说法均已被源码与动态日志共同否定。

---

## 3. 已证实成立的事实

### 事实 1：`npm run dev` 链路已动态证实最小启动闭环成立
**状态**：PASS（最小启动闭环已实测）

**证据来源**：
- `package.json:7-10`
- `dynamic-evidence-report.md:19-66`
- `dist-electron/main.js:65-72`

**证据内容**：
- `npm run dev` 实际先启动 Vite，再由 `wait-on` 触发 `npm run dev:electron`
- Electron 命中 `dist-electron/preload.cjs`
- backend 成功启动于 `127.0.0.1:56531`
- `GET /health` 返回 `200` 与 `{"status":"ok"}`

**审计判断**：
该模式下 preload 命中、backend 启动、健康检查通过，已形成**最小启动闭环**，不能再写成“仅静态推断可能成立”。但本轮证据**不能上推**为 renderer/UI、`window.electronAPI` 运行时消费、页面渲染或用户交互也已验证通过。

### 事实 2：`npm run dev:electron` 链路已动态证实最小启动闭环成立
**状态**：PASS（最小启动闭环已实测）

**证据来源**：
- `dynamic-evidence-report.md:69-119`
- `dist-electron/go-process.js:146-168,234-267`

**证据内容**：
- Electron 命中 `dist-electron/preload.cjs`
- backend 成功启动于 `127.0.0.1:56550`
- `GET /health` 返回 `200` 与 `{"status":"ok"}`
- 源码表明端口由 Electron 运行时分配并通过 `GIMG_PORT` 注入 backend，而不是固定写死

**审计判断**：
该模式下本地受管 backend 的**最小启动闭环可用性**已经被运行日志与 `/health` 实测共同证实；但同样**不能外推**为 renderer/UI 级功能已完成验证。

### 事实 3：三种模式下 preload 都实际命中 `dist-electron/preload.cjs`
**状态**：PASS（已证实事实）

**证据来源**：
- `dynamic-evidence-report.md:46-49,91-94,139-142`
- `dist-electron/main.js:10-20`

**审计判断**：
preload 的运行时命中结果已有日志支撑，前端关于“运行时应以构建产物实际命中路径为准”的审计提醒可以保留。

---

## 4. 待补证据

以下内容当前**不能写成已验证成立**，只能列为待补证据：

### 待补 1：backend 自动重启链路的实际效果
**当前状态**：NEEDS EVIDENCE

**证据来源**：
- 源码：`dist-electron/go-process.js:178-196`
- 动态证据缺口：`backend-audit-revision.md:58-65`

**现状说明**：
源码中确实存在 `Backend crashed, scheduling restart...` 与 `Restarting backend...` 的重启逻辑，但本轮没有 crash 注入测试，也没有采到重启成功或失败日志。

**审计判断**：
只能写“源码存在自动重启设计”，**不能写“自动恢复能力已实测通过”**。

### 待补 2：外部 backend 复用分支的动态闭环
**当前状态**：NEEDS EVIDENCE

**证据来源**：
- 源码：`dist-electron/go-process.js:98-145`
- 说明：`backend-audit-revision.md:90-91`

**现状说明**：
源码支持 `GIMG_BACKEND_URL`、`GIMG_BACKEND_HOST`、`GIMG_BACKEND_PORT`，但本轮动态补证未覆盖该分支。

**审计判断**：
不能写成“外部 backend 复用已验证可用”。

### 待补 3：打包态 `app.isPackaged === true` 的 binary 路径命中
**当前状态**：NEEDS EVIDENCE

**证据来源**：
- 源码：`dist-electron/go-process.js:24-29`
- 说明：`backend-audit-revision.md:93-94`

**现状说明**：
当前只有未打包场景下的运行证据；打包后的资源布局和 binary 命中仍缺实测。

**审计判断**：
不能把打包态运行成功写成既成事实。

---

## 5. 不可采纳的旧结论

以下旧结论已被仓库事实或动态补证推翻，**不得继续出现在最终审计稿中**：

### 不可采纳 1：`dist-electron/go-process.js` 是旧版残留实现
**驳回依据**：
- `backend-audit-revision.md:5-13`
- `dist-electron/go-process.js:36-50,138-200,234-267`
- `electron/go-process.ts` 的对照结论已由 backend 修订稿给出

**审计结论**：
该说法已不成立，必须撤回。

### 不可采纳 2：`npx electron dist-electron/main.js` 模式下 backend 实际正常
**驳回依据**：
- `dynamic-evidence-report.md:131-147`

**审计结论**：
动态日志已明确是 `Backend binary not found`，没有成功监听端口，也没有 `/health` 可测目标，不能再写成 backend 正常可用。

### 不可采纳 3：只要 preload 命中正常，就能推出 backend 正常
**驳回依据**：
- `dynamic-evidence-report.md:131-147`
- `frontend-audit-revision.md:45-55`

**审计结论**：
第三种模式已构成反例：preload 命中成立，但 backend 仍失败。

### 不可采纳 4：第三种模式已被完整证明会导致确定性的前端白屏或全量 UI 故障
**驳回依据**：
- `frontend-audit-revision.md:36-55`

**审计结论**：
当前证据只能证明 backend 阻塞与验证链路中断，不能外推出完整前端后果全貌。

---

## 6. 交叉纠偏后的综合审计判断

### backend 侧
backend 修订稿已经纠正此前最关键的误判：
- `dist-electron/go-process.js` 不是旧版残留
- `npm run dev` / `npm run dev:electron` 已有 backend 启动与 `/health` 实测闭环
- `npx electron dist-electron/main.js` 的失败点是 binary 路径解析失败
- 自动重启只能写“源码存在”，不能写“本轮已动态验证成功”

上述修订与仓库源码、动态日志一致，可采纳。

### frontend 侧
前端修订稿保留了应当保留的静态契约分析：
- `window.electronAPI` 契约仍成立
- 源码态 preload 设计仍自洽
- `dist-electron/preload.cjs` 的运行时漂移风险仍成立

同时也正确收敛了运行结论：
- 前两种模式已被动态证实通过
- 第三种模式不能再绝对化外推前端后果

上述修订与动态证据一致，可采纳。

---

## 7. 问题分层清单

### 7.1 已证实阻塞问题

1. **直接运行 `npx electron dist-electron/main.js` 时 backend binary 路径解析失败**
   - 证据：`dynamic-evidence-report.md:129-151`，`dist-electron/go-process.js:24-29,36-50`
   - 性质：已证实阻塞问题
   - 说明：主进程已明确报出 `Backend binary not found`，属于当前唯一被动态证实的明确阻塞项。

### 7.2 影响最终放行的证据缺口

1. **renderer/UI 级运行结果缺少动态验证证据**
   - 证据边界：当前仅有 preload 命中、backend 启动、`/health` 可达
   - 性质：关键证据缺口
   - 说明：尚未补证 `window.electronAPI` 的运行时消费、页面渲染结果与用户交互链路。

2. **自动重启链路没有动态验证证据**
   - 证据：`dist-electron/go-process.js:178-196`，`backend-audit-revision.md:58-65`
   - 性质：关键运行证据缺口

3. **外部 backend 复用分支没有动态验证证据**
   - 证据：`dist-electron/go-process.js:98-145`，`backend-audit-revision.md:90-91`
   - 性质：关键运行证据缺口

4. **打包态 binary 命中没有动态验证证据**
   - 证据：`dist-electron/go-process.js:24-29`，`backend-audit-revision.md:93-94`
   - 性质：发布相关证据缺口

---

## 8. 最终可采纳表述

> 最终审计结论应修订为 **NEEDS WORK**。当前仓库不能再沿用“`dist-electron/go-process.js` 为旧版实现”或“`npx electron dist-electron/main.js` 下 backend 正常可用”等已被源码与动态日志推翻的旧结论。基于动态补证，`npm run dev` 与 `npm run dev:electron` 两种模式下，Electron 均实际命中 `dist-electron/preload.cjs`，并成功启动嵌入式 backend，`/health` 实测返回 `200` 与 `{"status":"ok"}`；这些证据只能支持两条开发态链路的**最小启动闭环 PASS**，覆盖范围限于 preload 命中、backend 启动与 `/health` 可达，不能外推为 renderer/UI、`window.electronAPI` 运行时消费、页面渲染或用户交互已验证通过。相对地，`npx electron dist-electron/main.js` 模式下主进程明确报 `Backend binary not found`，backend 未形成可探测端口，因此该模式应记为已实测阻塞，失败边界为 binary 路径解析失败，而非 preload 漂移、旧版 `go-process.js` 或 backend 已启动但健康检查失败。对于 renderer/UI 级验证、自动重启、外部 backend 复用及打包态 binary 命中，当前仅能确认部分源码分支存在或最小启动闭环成立，仍缺动态闭环证据，不宜写成已验证成立。综合判断，本轮终审应收口为：开发态两条链路达到最小启动闭环 PASS，直接运行 `dist-electron/main.js` 的链路失败，整体状态为 NEEDS WORK。 
