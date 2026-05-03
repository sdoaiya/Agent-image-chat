# Evidence Collector 回归与证据报告

生成时间：2026-04-29

## 本轮实际执行
- `npm run test:e2e`
- `npm run test:packaged`
- `npm test -- src/__tests__/example-gallery.test.tsx src/__tests__/example-import-flow.test.tsx src/__tests__/prompt-bar-import.test.tsx src/__tests__/canvas-titlebar-drag.test.tsx src/__tests__/settings-save-chain.test.tsx src/app/canvas/page.generate-chain.test.tsx`
- 额外 Playwright 真实探测：
  - dev 形态本地图片导入/移除/重选单步验证
  - packaged 形态页面入口与 DOM 可见性验证

## 代码侧已落地的测试脚本修正
### 1. `scripts/run-gallery-workbench-e2e.mjs`
已修复自动化基线漂移的两处硬编码断言：
- `完整画廊当前收录 348 条案例，支持按分类浏览与一键引用` → 改为兼容当前实现的 `支持分类浏览与一键引用。`
- `专题展开` → 改为当前真实页面文案 `专题案例流`

并新增本地文件系统导入步骤草案：
- 选择本地图片
- 验证预览出现
- 验证提交前状态
- 移除图片
- 重选同一文件

### 2. `scripts/capture-packaged-smoke.mjs`
已补强 packaged 证据采集脚本目标：
- examples 截图
- topics 展开截图（仅当 packaged 形态实际进入 examples 时执行）
- workbench 首页截图
- workbench 本地导入截图
- settings 打开截图

但该脚本本轮**仍未稳定通过**，原因见下方失败项。

## 已通过证据
### 单元 / 组件 / 链路测试
命令：
`npm test -- src/__tests__/example-gallery.test.tsx src/__tests__/example-import-flow.test.tsx src/__tests__/prompt-bar-import.test.tsx src/__tests__/canvas-titlebar-drag.test.tsx src/__tests__/settings-save-chain.test.tsx src/app/canvas/page.generate-chain.test.tsx`

结果：6 个文件，19 个用例全部通过。

覆盖点：
- 模型保存链路
- 生成提交读取已保存设置
- 示例引用：提示词+图片 / 仅提示词 / 图片失败退化
- 本地导入稳定性（组件层）
- 工作台拖拽区不冲突
- topics 展开数量限制与文案一致性

## 已生成或复用的证据文件
### dev / gallery-e2e
- `public/qa-screenshots/gallery-e2e/01-examples-page.png`
- `public/qa-screenshots/gallery-e2e/02-topics-expanded.png`
- `public/qa-screenshots/gallery-e2e/03-workbench-full-import.png`
- `public/qa-screenshots/gallery-e2e/04-workbench-prompt-only.png`
- `public/qa-screenshots/gallery-e2e/05-workbench-image-only.png`
- `public/qa-screenshots/gallery-e2e/06-image-fallback-prompt-only.png`
- `public/qa-screenshots/gallery-e2e/test-results.json`
- `public/qa-screenshots/gallery-e2e/test-results.md`

### 历史 packaged 证据（本轮脚本失败前仍可参考）
- `public/qa-screenshots/packaged-smoke/packaged-examples.png`
- `public/qa-screenshots/packaged-smoke/packaged-smoke.json`

## 本轮发现的真实失败项
### 1. gallery-e2e 新增“本地文件系统导入图片”步骤仍失败
当前结果文件：
- `public/qa-screenshots/gallery-e2e/test-results.json`
- `public/qa-screenshots/gallery-e2e/test-results.md`

失败结论：
- 前 6 个步骤已通过
- 第 7 步“本地文件系统导入图片：预览 / 提交前状态 / 移除 / 重选”失败
- 失败错误：`本地文件导入后未看到预览或引用计数`

注意：我额外用独立 Playwright 探针验证过，在 dev 单步场景下：
- `input[type="file"]` 存在
- `setInputFiles(case1.jpg)` 后页面文本可见 `引用图片（1/4）`
- 图片名 `case1.jpg` 可见
- 移除后计数消失
- 重选同一文件后再次恢复

因此这里更像是：
- **E2E 脚本串行步骤后的状态污染 / 时序问题**，不是组件导入能力本身完全失效。
- 但在脚本未稳定前，**不能报绿**。

### 2. packaged 形态关键路径仍未闭环
`npm run test:packaged` 本轮失败，且暴露出 packaged 真实形态与目录/dev 形态不一致：

观察到的 packaged 现象：
- 应用启动后默认落在 `#/` 工作台
- body 文本中可见工作台与内嵌示例区
- 但显示的是 **12 项工作台示例区**，不是完整画廊 `推荐入口 / 全部专题`
- 因此 packaged 与目录版的入口态不一致

脚本失败点：
- 先前失败：`#example-view-tab-topics` 不存在
- 后续失败：`input[type="file"]` 在 packaged 脚本时序下等待超时

这说明 packaged 形态至少还有两类风险：
1. **入口态差异**：不是 examples 完整画廊，而是 workbench 内嵌示例区
2. **自动化可见性/时序不稳定**：同样的工作台 DOM，在脚本里并不稳定可抓

### 3. packaged 证据链不满足“已补齐”标准
按验收要求，应补齐：
- examples/gallery 布局
- topics 展开
- 设置页
- 工作台导入

当前实际状态：
- 旧的 `packaged-examples.png` 存在，但属于历史证据
- 本轮脚本未能稳定产出新的 packaged 全套截图
- 因此 **packaged 关键路径证据链仍未闭环**

## 对验收标准的逐项结论
### 1. 修复 `gallery-e2e` 断言基线漂移
- **部分完成**
- 文案漂移已修：examples 文案断言、topics 展开文案断言已对齐当前实现
- 但新增本地导入步骤未稳定，整套 e2e 仍失败

### 2. 本地文件系统导入图片端到端证据链
- **部分完成**
- 组件层与独立 Playwright 探针已证明确实可导入 / 预览 / 移除 / 重选
- 但正式 `gallery-e2e` 结果文件里该步骤仍失败，故不能算完全闭环

### 3. 严格功能回归覆盖
- **大部分完成**
- 已有通过证据覆盖：模型保存、生成提交、示例引用、仅提示词、仅图片、图片失败退化、专题展开、工作台拖拽不冲突
- 标签栏显示问题本轮主要依赖源码与截图侧复核，未新增独立自动化断言

### 4. 目录版 / packaged 关键截图与记录
- **未完成**
- 目录/dev 形态已有较完整截图
- packaged 本轮脚本未稳定通过，缺少新的闭环证据

### 5. 产出新的测试结果文件与截图证据
- **部分完成**
- 已产生新的 `gallery-e2e/test-results.json` 与 `.md`，且明确写出失败步骤
- packaged 未能产生新的完整结果文件链

## 真实结论
本轮不能口头报绿。

可确认通过：
- 断言文案基线中的两处明显漂移已修正
- dev/目录版下 examples → workbench 主链路 6 步通过
- 单元/组件/请求链路共 19 个用例通过

仍然失败：
- `gallery-e2e` 新增本地文件导入步骤未稳定
- packaged 形态关键路径脚本未稳定
- packaged 与目录/dev 入口态不一致，存在真实回归风险

## 建议下一步
1. 把 `gallery-e2e` 的本地导入步骤拆成独立脚本或独立 browser context，避免前置步骤污染。
2. 单独为 packaged 形态建立 `#/` 工作台基线，而不是复用 examples 基线假设。
3. packaged 中先固定验证：
   - 工作台首页
   - 本地导入
   - 设置页打开
   再决定是否补做 examples/topics，因为当前启动入口并不一致。
4. 若要正式验收通过，必须补出 **新的 packaged 截图+json 结果文件**，而不是沿用旧图。
