# Canvas / DOM 渲染策略开发任务文档

## 1. 文档目标

本文档将《Canvas / DOM 渲染策略需求文档》拆分为可执行任务，并严格按“任务 -> 测试 -> 交付”的顺序推进。

约束原则：

- 先做 `P0`，不跳步
- 每个任务完成后必须先补测试
- 未完成当前任务，不进入下一个任务
- 不接受“只有判断没有代码落点”的完成态

关联文档：

- [Canvas / DOM 渲染策略需求文档](./2026-04-18-canvas-dom-render-strategy-requirements.md)
- [基于 Pretext 的混合渲染需求文档](./2026-04-15-hybrid-renderer-requirements.md)
- [真实 EPUB 交互测试结果](./2026-04-17-真实EPUB交互测试结果.md)

## 2. 总体执行规则

### 2.1 任务规则

- 每个任务必须有明确代码输出
- 每个任务必须定义测试范围
- 每个任务完成后更新本文档状态
- 后续需求若涉及 renderer 归属，必须先引用本文档的 backend boundary

### 2.2 完成定义

一个任务只有在以下条件都满足时才算完成：

- 代码完成
- 测试完成并通过
- 类型检查通过
- 相关文档或 demo 已同步

## 3. 当前执行状态

记录时间：`2026-04-18`

当前阶段：

- `P2` 已完成

当前目标：

- 本轮 `Canvas / DOM` 渲染策略任务已完成，后续仅按新增证据再开新任务

## 4. 任务拆分

## P0. 边界显式化

### P0-T1. 建立 backend capability contract 并接入诊断输出

状态：

- 已完成

目标：

- 为 `canvas` / `dom` 定义显式能力模型
- 在 diagnostics 中输出布局权、几何来源、交互模型、流模型
- 让 demo 能直接看到这些信息

代码输出：

- `render-backend-capabilities` helper
- `RenderDiagnostics` / `VisibleSectionDiagnostics` 字段补齐
- demo 诊断面板更新

测试要求：

- 单元测试覆盖 `canvas` 和 `dom` 在 `scroll / paginated` 下的能力模型
- reader 集成测试覆盖 diagnostics 输出
- `pnpm typecheck`

交付标准：

- 不改变实际渲染行为
- 诊断输出可用于判断需求该落到哪条链路

### P0-T2. 收口 analyzer 边界说明并补反向测试

状态：

- 已完成

目标：

- 把“复杂 CSS 不再继续向 canvas 扩张”的策略落实到 analyzer 说明和测试
- 对高风险标签、复杂布局样式补反向断言，避免误回退

代码输出：

- analyzer 规则说明注释
- analyzer 测试补强

测试要求：

- 命中条件与未命中条件双向测试
- reader chapter routing 回归

交付标准：

- analyzer 收敛策略可读、可测、可解释

## P1. 补 DOM 阅读器能力

### P1-T1. 建立 DOM viewport mapping 适配层

状态：

- 已完成

目标：

- 为 DOM 章节建立显式 viewport mapping 入口
- 减少 DOM 路径完全依赖 canvas 思维兜底

测试要求：

- DOM 章节 locator -> viewport 映射测试
- TOC / 搜索跳转后的定位回归

交付标准：

- `reader` 对外 mapping API 在 DOM 章节不再空返回
- 不改变 canvas 章节的命中与 viewport 映射行为

### P1-T2. 补 DOM 搜索结果精确定位能力

状态：

- 已完成

目标：

- 让 DOM 章节搜索结果跳转不只依赖 progress 近似
- 尽可能落到真实命中附近

测试要求：

- 长 DOM 章节搜索跳转回归
- 真实 EPUB focused retest

当前进展：

- 搜索结果生成已改为优先返回最深命中 block
- DOM 章节搜索跳转已增加按真实渲染文本的二次对齐
- 自动化回归已补齐
- 真实 EPUB focused retest 已完成

交付结果：

- 新增 `search-results` helper，避免搜索结果长期停留在父级容器 block
- 新增 DOM 搜索结果二次对齐 helper，跳转后可按真实渲染文本重新收口位置
- 新增可参数化的外部 EPUB Playwright focused case

验证结果：

- `pnpm test packages/core/test/search-results.test.ts packages/core/test/reader-hybrid-search.test.ts packages/core/test/reader-hybrid-navigation.test.ts packages/core/test/reader-chapter-render-routing.test.ts`
- `pnpm typecheck`
- 真实 EPUB focused retest：
  - 书籍：`这书能让你戒烟`
  - 查询：`戒烟`
  - 结果索引：`80`
  - 实际落点：`第2章 轻松戒烟法`，`Page 31 / 157`
  - `reader-root.scrollTop = 14387`

### P1-T3. 收口 DOM 章节基础交互模型

状态：

- 已完成

目标：

- 显式定义 DOM 章节当前支持的交互范围
- 清理“只有 click 兜底但无 contract”的状态

测试要求：

- link、chapter progress、anchor click 场景测试

交付结果：

- 新增 `dom-interaction-model`，把 DOM 章节支持的点击交互显式收口为：
  - `link`
  - `anchored-fragment`
  - `chapter-progress`
- `reader.handleDomClick()` 已改为消费这套 contract
- DOM 非链接点击已复用 `mapDomPointToLocator()`，不再单独维护一套 progress 计算逻辑

验证结果：

- `pnpm test packages/core/test/dom-interaction-model.test.ts packages/core/test/reader-hybrid-navigation.test.ts packages/core/test/reader-chapter-render-routing.test.ts`
- `pnpm typecheck`

## P2. 收缩 Canvas 非核心责任面

### P2-T1. 审计并冻结 canvas 复杂 CSS backlog

状态：

- 已完成

目标：

- 不再把复杂 CSS fidelity 需求默认记到 canvas backlog
- 输出一份明确的“不会继续做”的边界清单

测试要求：

- 无新增产品行为
- 文档与 analyzer 路由对齐校验

交付结果：

- 新增 `canvas-backlog-boundary` 单一事实来源
- analyzer 已直接复用这份冻结边界，不再维护独立的高风险标签/复杂样式名单
- 新增 [Canvas 复杂 CSS Backlog 冻结清单](./2026-04-18-canvas-complex-css-freeze-list.md)
- 新增边界对齐测试，确保文档边界与 analyzer 路由不漂移

验证结果：

- `pnpm test packages/core/test/canvas-backlog-boundary.test.ts packages/core/test/chapter-render-analyzer.test.ts packages/core/test/reader-chapter-render-routing.test.ts`
- `pnpm typecheck`

### P2-T2. 评估是否上调 DOM fallback 收敛力度

状态：

- 已完成

目标：

- 根据真实 EPUB 与 smoke 结果评估是否需要上调 DOM fallback 阈值

测试要求：

- 真实 EPUB 样本与 chapter routing 回归

交付结果：

- 新增 [DOM Fallback 阈值评估结论](./2026-04-18-dom-fallback-threshold-evaluation.md)
- 明确结论：`domThreshold = 20` 保持不变，不上调 DOM fallback 收敛力度
- 新增阈值策略测试，显式锁住以下边界：
  - 单个高风险标签 `20` 直接走 `dom`
  - 单个冻结复杂样式信号 `15` 仍留在 `canvas`
  - 两个冻结复杂样式信号 `30` 走 `dom`

验证结果：

- `pnpm test packages/core/test/chapter-render-threshold-policy.test.ts packages/core/test/canvas-backlog-boundary.test.ts packages/core/test/chapter-render-analyzer.test.ts packages/core/test/reader-chapter-render-routing.test.ts`
- `pnpm typecheck`
- 真实 EPUB 样本依据：
  - [真实 EPUB 交互测试结果](./2026-04-17-真实EPUB交互测试结果.md)
  - `S1 国家为什么会破产...epub` 的复杂出版社样式章节已稳定进入 `dom`

## 5. 当前推荐执行顺序

1. `P0-T1`
2. `P0-T2`
3. `P1-T1`
4. `P1-T2`
5. `P1-T3`
6. `P2-T1`
7. `P2-T2`
