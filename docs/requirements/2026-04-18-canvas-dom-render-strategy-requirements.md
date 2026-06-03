# Canvas / DOM 渲染策略需求文档

## 1. 文档目标

本文档用于回答一个已经进入工程决策层的问题：

- 当前项目是否还值得继续扩大 `canvas` 渲染管线的责任面
- 哪些能力必须继续留在 `canvas`
- 哪些能力应该明确迁回或只保留在 `dom`
- 接下来如何把这件事拆成可执行任务，而不是继续在实现层模糊扩张

本文档不重新讨论“要不要做 hybrid”。当前仓库已经是 hybrid，本阶段要解决的是“如何约束 hybrid 的边界”。

## 2. 当前判断

基于当前代码、测试和真实 EPUB 回归，结论如下：

- `canvas` 仍然有明显收益，但收益集中在“阅读器内核能力”
- `canvas` 对复杂出版社 CSS fidelity 的边际收益已经很低
- 当前最合理方向不是继续扩张 `canvas` 的兼容范围，而是明确 `canvas` 与 `dom` 的职责边界

这里的“阅读器内核能力”特指：

- 稳定分页
- 几何级定位与命中测试
- locator 与 viewport 的双向映射
- 长章节滚动虚拟化
- 对 simple / pretext / reflowable 内容的确定性布局

## 3. 现状

当前仓库已经形成两条渲染链路：

- `canvas`：
  - `LayoutEngine`
  - `DisplayListBuilder`
  - `CanvasRenderer`
  - `scroll-render-plan`
  - `paginated-render-plan`
- `dom`：
  - `DomChapterRenderer`
  - `dom-render-input-factory`
  - 资源 patch 与 anchor realign 适配

当前状态的几个事实：

- `canvas` 承担了分页、hit test、viewport mapping、长章节 slice 虚拟化等重能力
- `dom` 已经是复杂章节的主要 fallback 路线
- analyzer 已明确把 `table`、`svg`、`math`、`iframe`、`float`、`text-indent`、`position`、`flex`、`grid` 等高风险内容推向 `dom`
- 真实 EPUB 修复工作也证明：复杂样式章节继续强压在 `canvas` 上，不划算
- 冻结清单已单独沉淀在 [Canvas 复杂 CSS Backlog 冻结清单](./2026-04-18-canvas-complex-css-freeze-list.md)

## 4. 问题定义

如果不收敛边界，后续会出现两个问题：

1. `canvas` 继续吞掉更多复杂 CSS 兼容逻辑，维护成本快速膨胀
2. `dom` 虽然已经承担复杂章节 fallback，但它缺少明确的阅读器能力边界，导致“能显示”和“能作为阅读器后端稳定工作”之间仍有落差

因此，本阶段需要的不是“再证明一次 hybrid 有必要”，而是：

- 显式定义 backend capability contract
- 把 canvas 与 dom 的职责写进代码和诊断
- 后续所有需求都必须先判断应该落在哪条链路

## 5. 目标

### 5.1 核心目标

- 明确 `canvas` 的职责只覆盖“阅读器内核能力”
- 明确 `dom` 的职责只覆盖“复杂内容保真与原生排版能力”
- 禁止后续需求在未经过职责判断前，继续向 `canvas` 扩复杂 CSS 兼容
- 为后续 backlog 提供分阶段任务边界

### 5.2 成功标准

达到以下条件，即视为本阶段需求满足：

- `RenderDiagnostics` 中可直接看出当前 backend 的布局、几何、交互和流模型职责
- 文档中存在稳定的 backend capability matrix
- 至少一项 runtime / demo 诊断输出已经接入这个能力模型
- 后续任务文档能按 `P0 / P1 / P2` 明确区分“该留在 canvas”与“该迁去 dom”

## 6. Backend 能力矩阵

### 6.1 必须继续留在 Canvas 的能力

| 能力 | 原因 |
| --- | --- |
| 稳定分页 | 当前页片模型已经成熟，且 DOM 侧没有等价实现 |
| 几何级 hit test | 现有交互区域模型建立在 display list 和 interaction map 上 |
| locator 与 viewport 双向映射 | 当前 API 主要依赖 canvas interaction regions |
| 长章节 scroll slice 虚拟化 | 当前 scroll 性能策略建立在 canvas 切片与复用上 |
| simple / pretext 内容的确定性布局 | 当前这类内容在 canvas 上收益最高、风险最低 |

### 6.2 应优先落到 DOM 的能力

| 能力 | 原因 |
| --- | --- |
| 复杂出版社 CSS fidelity | 浏览器原生排版收益更高 |
| table / svg / math / iframe 高保真显示 | 不值得继续扩 canvas 兼容面 |
| float / text-indent / flex / grid / position 复杂布局 | 当前 analyzer 已经把它们视为高风险 DOM 路径 |
| 复杂图文混排的原生结构保真 | DOM 更自然，也更容易和真实 EPUB 行为对齐 |

### 6.3 暂时保留 Hybrid，但不建议继续扩张的灰区

| 能力 | 当前状态 |
| --- | --- |
| DOM 章节精确 viewport mapping | 有基础能力，但不够显式和统一 |
| DOM 章节搜索结果精确定位 | 目前更多依赖 locator/progress 回退 |
| DOM 章节 richer hit test | 目前主要是 link + progress 兜底 |
| 用 canvas 继续补复杂 CSS | 明确不建议继续扩张 |

## 7. 需求范围

### 7.1 本阶段纳入范围

- backend capability contract
- diagnostics 字段补齐
- demo 诊断信息同步
- 任务文档与优先级拆分

### 7.2 本阶段不纳入范围

- 一次性重写 DOM 命中测试系统
- 一次性移除 canvas 主路径
- 重做 analyzer 大策略
- 改写现有用户交互语义

## 8. 分阶段执行要求

### P0：先把边界写进代码

目标：

- 明确 backend capability contract
- runtime / demo 诊断输出可见
- 建立“后续需求必须先判责”的工程基线

### P1：补 DOM 还缺的阅读器能力

目标：

- 补 DOM 章节在 viewport mapping、搜索跳转、基础命中上的能力短板
- 让 DOM fallback 不只是“能显示”，而是“能稳定参与阅读器语义”

### P2：压缩 Canvas 的非核心责任面

目标：

- 停止向 canvas 扩复杂 CSS 兼容
- 必要时提高 analyzer 收敛力度
- 逐步让 canvas 专注于 simple / pretext / deterministic pipeline

## 9. 验收标准

### P0 验收

- `RenderDiagnostics` 新增 backend 能力字段
- demo 诊断面板可见这些字段
- 单元测试与 reader 集成测试覆盖至少一组 `canvas` / `dom` 对照

### P1 验收

- DOM 章节定位、搜索跳转和基础交互的关键短板被测试覆盖
- 至少有一条真实交互 smoke 覆盖 DOM 路径

### P2 验收

- 复杂 CSS 兼容不再默认进入 canvas backlog
- analyzer 与任务文档都能反映新的收敛策略

## 10. 关联文档

- [基于 Pretext 的混合渲染需求文档](./2026-04-15-hybrid-renderer-requirements.md)
- [基于 Pretext 的混合渲染开发任务文档](./2026-04-15-hybrid-renderer-开发任务文档.md)
- [真实 EPUB 交互测试计划](./2026-04-17-真实EPUB交互测试计划.md)
- [真实 EPUB 交互测试结果](./2026-04-17-真实EPUB交互测试结果.md)
