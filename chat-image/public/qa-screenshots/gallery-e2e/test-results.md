# Gallery + Workbench E2E Evidence

- 状态：passed
- 生成时间：2026-04-29T13:04:54.745Z
- 基础地址：http://127.0.0.1:4173

## 步骤结果
### 1. examples 页面加载
- 状态：passed
- 证据：public/qa-screenshots/gallery-e2e/01-examples-page.png
- 观察：examples 页面成功加载；已展示精简后的总案例文案与推荐/专题切换

### 2. 推荐/专题切换 + 专题展开 + 来源点击
- 状态：passed
- 证据：public/qa-screenshots/gallery-e2e/02-topics-expanded.png
- 观察：已从推荐入口切换到全部专题；已切换 UI 分类并展开专题案例流；专题来源链接点击后打开新窗口
- popupUrl：https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery-part-1.md

### 3. 一键引用：gallery -> workbench
- 状态：passed
- 证据：public/qa-screenshots/gallery-e2e/03-workbench-full-import.png
- 观察：工作台 textarea 已接收提示词，长度 411；工作台显示 1 张已引用图片

### 4. 仅提示词：gallery -> workbench
- 状态：passed
- 证据：public/qa-screenshots/gallery-e2e/04-workbench-prompt-only.png
- 观察：工作台 textarea 已接收提示词，长度 2092；工作台当前引用图片区块数量 0

### 5. 仅参照图：workbench 内嵌示例区
- 状态：passed
- 证据：public/qa-screenshots/gallery-e2e/05-workbench-image-only.png
- 观察：工作台已挂载 1 张参照图；textarea 保持为空，符合仅参照图行为

### 6. 图片失败退化：工作台内嵌示例区
- 状态：passed
- 证据：public/qa-screenshots/gallery-e2e/06-image-fallback-prompt-only.png
- 观察：前端 error 事件触发后卡片进入图片不可用态；点击一键引用后退化为仅提示词，并出现 info toast

### 7. 本地文件系统导入图片：预览 / 提交前状态 / 移除 / 重选
- 状态：passed
- 证据：public/qa-screenshots/gallery-e2e/07-local-import-preview.png, public/qa-screenshots/gallery-e2e/08-local-import-removed.png, public/qa-screenshots/gallery-e2e/09-local-import-reselected.png
- 观察：本地文件系统图片已成功导入并显示预览；提交前发送按钮保持可用，引用图片区计数正确；移除后图片区消失，再次选择同一文件可重新挂载

### 8. 设置页打开与本地保存提示
- 状态：passed
- 证据：public/qa-screenshots/gallery-e2e/10-settings-save-feedback.png
- 观察：设置抽屉可正常打开；点击保存后出现明确反馈文案，而非静默失败

## 说明
- 证据仅基于当前仓库真实前端实现。
- examples -> workbench 导入链路通过 HashRouter 页面联动验证。
- 未宣称不存在的 markdown 运行时动态加载；示例数据来自仓库内已构建的数据模块。
- 捕获到 9 条浏览器 console error，请结合结果复核。
