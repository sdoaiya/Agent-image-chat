# 前端审计文本修订稿

> 适用范围：仅对前端审计中的“运行结论”做小范围修订。
> 保留项：`window.electronAPI` 契约、源码 `preload` 自洽、`dist-electron` `preload` 漂移。
> 修订依据：`dynamic-evidence-report.md`

## 1. 保留不变的静态结论

### 1.1 `window.electronAPI` 契约仍成立
前端渲染进程对 `window.electronAPI` 的使用，仍以 Electron preload 暴露的受限桥接接口为前提；这一源码级契约关系本次不改。现有静态分析仍可成立：若 preload 未按预期加载，渲染层依赖的 Electron 能力将不可用。

### 1.2 源码态 `preload` 自洽结论仍成立
源码目录下主进程对 preload 的候选解析与桥接设计仍是自洽的，前端关于“渲染层通过 preload 获取 Electron 能力”的静态判断保持有效，本次无需推翻。

### 1.3 `dist-electron` preload 漂移结论仍成立
`dist-electron` 下实际命中的 preload 文件与源码态约定之间存在“以构建产物为准”的漂移风险，这一点继续保留。并且动态证据已补强：

- `npm run dev` 实测命中 `dist-electron/preload.cjs`
- `npm run dev:electron` 实测命中 `dist-electron/preload.cjs`
- `npx electron dist-electron/main.js` 实测同样命中 `dist-electron/preload.cjs`

因此，前端审计中关于“运行时是否真正加载到源码 preload，不能只看源码声明，必须看构建产物与最终命中路径”的提醒应当保留，且现在已有日志支撑，不再只是静态推断。

## 2. 需要替换的运行结论

### 2.1 对 `npm run dev` 的表述应改为“已实测通过”
此前如果前端审计文本仅基于静态阅读推断 dev 模式下 preload / backend 联动成立，应改为以下更严格表述：

> 已有动态日志证据表明，`npm run dev` 模式下实际先启动 Vite，再触发 `npm run dev:electron`；Electron 运行时实际命中 `dist-electron/preload.cjs`，并成功拉起内嵌 backend，`GET /health` 返回 `200` 与 `{"status":"ok"}`。因此，对该模式下前端依赖的 preload 链路与本地 backend 可达性，可以下“已实测成立”结论，而不再只停留在静态推断层面。

### 2.2 对 `npm run dev:electron` 的表述应改为“已实测通过”
此前如果文本只从主进程/构建脚本推断该模式可正常支撑前端运行，应改为：

> `npm run dev:electron` 已完成动态补证。日志显示运行时实际命中 `dist-electron/preload.cjs`，内嵌 backend 成功监听在 `127.0.0.1:56550`，且 `GET /health` 返回 `200` 与 `{"status":"ok"}`。因此，该模式下前端对 preload 注入与本地 HTTP backend 的基本依赖链路已有实测支撑。

### 2.3 对 `npx electron dist-electron/main.js` 的强断言必须降级
此前若前端审计中存在类似以下绝对化判断，需要删除或改写：

- “直接执行 `npx electron dist-electron/main.js` 时前端一定无法启动/一定白屏”
- “该模式下 backend 正常运行，只是前端调用失败”
- “该模式已被验证为可完整复现正式运行行为”

建议替换为：

> `npx electron dist-electron/main.js` 已做动态实测，但证据边界仅能支持如下结论：Electron 主进程已启动，且实际命中 `dist-electron/preload.cjs`；同时主进程明确报错 `Backend binary not found`，说明该模式下 backend 二进制路径解析失败，未形成可供前端使用的本地 HTTP 服务。由于日志中没有出现成功监听端口，本次无法对该模式执行诚实的 `/health` 实测，因此不能再把该模式写成“backend 正常运行”或“前端故障后果已被完整验证”。更稳妥的表述应是：该模式存在高风险，阻塞点是 backend 未成功启动，而不是已被完整证明的前端渲染后果。

## 3. 建议直接替换到审计报告中的结论段

### 3.1 运行结论（修订版）
前端侧静态审计结论保持不变：`window.electronAPI` 仍依赖 preload 注入，源码态 preload 设计基本自洽，但运行时应以实际命中的构建产物为准，`dist-electron/preload.cjs` 与源码约定之间仍存在漂移风险。

动态补证后，可将运行结论修订为：`npm run dev` 与 `npm run dev:electron` 两种模式均已实际命中 `dist-electron/preload.cjs`，且对应内嵌 backend 已成功启动，`/health` 返回 `200`，因此这两种模式下前端所依赖的 preload 与本地 backend 基础链路具备日志与实测支撑。相对地，`npx electron dist-electron/main.js` 虽已实测命中同一 preload，但 backend 在该模式下报 `Backend binary not found`，未进入健康检查阶段；因此只能将其描述为“backend 路径解析失败导致前端运行风险升高/验证链路中断”，不能再对其前端运行后果作超出日志证据的绝对化断言。

### 3.2 风险结论（修订版）
前端当前真正成立的风险，不是“所有直接运行 `dist-electron/main.js` 的场景都已被证明发生相同前端故障”，而是：运行时 preload 实际绑定在 `dist-electron/preload.cjs`，若构建产物未与源码 preload 保持同步，前端可用的 `window.electronAPI` 契约就会受到构建漂移影响；同时，在 `npx electron dist-electron/main.js` 这一路径下，backend 二进制解析已被实测阻塞，导致前端依赖的本地服务链路无法完成验证。这应被表述为“已观察到的运行阻塞与构建漂移风险”，而非“已被完整实证的统一前端故障后果”。

## 4. 审计改写注意事项

1. 不要删除 preload/IPC 契约分析；这部分仍是成立的静态结论。
2. 不要再把 `npx electron dist-electron/main.js` 写成 backend 正常可用。
3. 不要从 “backend 未启动成功” 直接外推出确定性的前端白屏、接口报错全貌或 UI 失效范围，除非后续再补 UI 级运行证据。
4. 可以明确写入：前三种运行模式的 preload 命中结果都已有日志，其中前两种模式还具备 `/health` 实测支撑，第三种模式则止于 backend 启动失败这一阻塞事实。
