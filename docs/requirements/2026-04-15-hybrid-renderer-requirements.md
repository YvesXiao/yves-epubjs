# 基于 Pretext 的混合渲染需求文档

## 1. 文档目标

本文档定义当前项目下一阶段的渲染演进目标：在保留现有 `pretext + canvas` 主路径的前提下，引入“按章节区分渲染方式”的混合渲染能力，让阅读器在章节进入渲染前自动判断该章节更适合 `canvas` 还是 `dom`。

本文档聚焦三个问题：

- 为什么当前项目需要从“单一路径渲染”演进到“章节级混合渲染”
- 章节级 fallback 的目标范围、判断规则、数据流和验收标准是什么
- 块级 fallback 的后续演进方向是什么，以及它在本阶段为什么只进入需求文档、不进入开发任务拆分

本文档的当前实现范围是“章节级 fallback”。本文档同时记录“块级 fallback”的后续需求，但该部分仅作为待开发需求，不纳入本轮任务拆分与验收。

## 2. 现状与问题

当前仓库已经完成以下主干能力：

- EPUB ZIP 容器解析
- OPF、NAV、NCX、XHTML 解析
- `SectionDocument` 内容模型与样式白名单解析
- `LayoutEngine`、`DisplayListBuilder`、`CanvasRenderer`
- `EpubReader` 的 `scroll / paginated / search / toc / hitTest` 主链路
- 对常见 `reflowable EPUB` 文本书的基础兼容增强

当前项目也已经具备明确的 `canvas` 主渲染路径，但问题仍然存在：

- 某些章节会出现复杂表格、复杂样式、未知高风险标签、结构深度异常等内容
- 这些章节即使正文内容不丢失，也不一定适合继续强行走 `canvas` 布局
- 一旦在 `canvas` 主链路中硬吃所有复杂章节，复杂度会迅速转移到分页、测高、命中测试和兼容兜底上
- 如果直接进入“同章内 Canvas + DOM 混合”的块级方案，会立即引入同页双渲染层协调、复杂块测高、跨页和统一交互等高风险问题

结论是：当前仓库已经需要一条更稳的兼容路线，让系统能够优先保住主阅读流和产品稳定性，而不是把所有复杂情况都压在 `canvas` 一条路径上。

## 3. 目标定义

### 3.1 核心目标

本阶段目标是：

- 在章节进入渲染前，引入复杂度分析器，为每个章节输出 `canvas` 或 `dom` 的渲染模式
- 建立章节级 fallback 渲染链路：简单章节整章走 `canvas`，复杂章节整章走 `dom`
- 保持 `scroll / paginated / toc / search / progress / hitTest` 等阅读器主能力对外语义稳定
- 让 `canvas` 和 `dom` 两种章节渲染方式都接入统一的阅读状态层
- 为后续块级 fallback 保留中间模型与职责边界，但本阶段不进入块级混合实现

### 3.2 成功标准

达到以下条件，即视为本阶段需求完成：

- 章节渲染前可以稳定产出 `RenderMode = "canvas" | "dom"`
- 常见线性正文章节默认走 `canvas`
- 命中复杂结构的章节可自动降级为整章 `dom`
- 阅读器在章节切换、目录跳转、搜索跳转和进度同步上不因渲染模式切换而失效
- `dom` 章节不会重新夺回整个阅读器的状态主导权，只承担该章节的正文渲染
- 整体兼容率提升且不破坏当前 `canvas` 主路径

## 4. 范围定义

### 4.1 本阶段目标范围

本阶段明确支持：

- `reflowable EPUB`
- 章节级 `canvas/dom` 二选一
- 复杂度分析器、章节渲染模式判定与模式缓存
- `canvas` 章节复用现有 `LayoutEngine -> DisplayListBuilder -> CanvasRenderer` 主路径
- `dom` 章节通过受控 DOM 渲染路径展示正文
- 两种模式共享统一阅读状态层
- TOC、搜索、进度、当前章节、章节跳转和基础点击行为在两种模式下可用

### 4.2 本阶段明确收敛项

本阶段暂不实现：

- 同一章节内的块级混合渲染
- 同页同时存在 `canvas` 正文与 `dom` fallback block 的分页排版
- DOM block 跨页拆分
- 统一原生选区系统
- DOM 与 canvas 片段级统一批注模型
- Fixed Layout EPUB

收敛原则：

- 本阶段只做章节级切换，不做块级混合
- 如果某章复杂度过高，优先整章走 `dom`，不在本阶段继续向块级 fallback 下钻

## 5. 路线选择

### 5.1 可选路线

| 路线 | 描述 | 优点 | 风险 |
| --- | --- | --- | --- |
| A. 全量继续走 Canvas | 所有章节尽量原生化，不引入 DOM fallback | 架构最纯粹 | 对复杂章节兼容成本最高 |
| B. 章节级 fallback | 每章二选一：`canvas` 或 `dom` | 风险最低，最容易先跑稳 | 复杂章节仍失去统一页感 |
| C. 直接块级 fallback | 同一章内部同时存在 `canvas` 与 `dom` block | 长期灵活性最高 | 首期复杂度过高 |

### 5.2 本阶段推荐路线

本阶段采用路线 B。

原因如下：

1. 当前仓库已经具备稳定的 `canvas` 主链路，适合继续让简单正文章节走主路径。
2. 章节级 fallback 可以先解决复杂章节兼容问题，而不引入同页双渲染层协调问题。
3. 章节级方案可以先沉淀复杂度分析器、统一状态层和受控 DOM 渲染接口，为块级 fallback 打基础。

本文档所有当前任务都以路线 B 为基线。

## 6. 章节级 Fallback 需求

### 6.1 渲染模式定义

系统需要在章节渲染前输出：

```ts
type RenderMode = "canvas" | "dom"
```

该结果必须是显式决策结果，不允许在渲染过程中临时隐式切换。

### 6.2 章节级判断目标

章节级判断需要解决两个问题：

- 哪些章节继续交给 `canvas` 主路径，保证分页与绘制控制力
- 哪些章节整章降级为 `dom`，避免复杂结构把 `canvas` 兼容成本推高

判断结果必须可缓存、可测试、可解释，至少应附带：

- `mode`
- `score`
- `reasons`

建议的内部结果结构：

```ts
type ChapterRenderDecision = {
  mode: RenderMode
  score: number
  reasons: string[]
}
```

### 6.3 直接判定为 DOM 的情况

以下情况应优先直接判定为 `dom`：

- 出现 `table` 且复杂度超过基础表格能力边界
- 出现 `svg`
- 出现 `math`
- 出现 `iframe`
- 出现未知高风险标签
- 出现复杂内联样式
- 出现 `float`、`position`、`flex`、`grid` 等复杂布局声明
- 图片密度过高
- 章节结构嵌套过深
- 节点数超过阈值

### 6.4 优先判定为 Canvas 的情况

以下情况应优先继续走 `canvas`：

- 主要由 `p / h1-h4 / blockquote / ul / ol / li / img / span / a / strong / em` 组成
- 样式主要集中在字号、行高、颜色、边距、缩进、对齐
- 图片数量少，结构线性
- 章节节点结构稳定，无高风险标签和高复杂度样式

### 6.5 复杂度评分

系统应建立可调的复杂度评分模型，用于辅助章节决策。

建议采用加权累计方式，例如：

```text
score = table*20 + svg*20 + math*20 + iframe*20 + float*15 + position*15 + flex*15 + grid*15 + complexStyle*10 + imageDense*8 + deepNest*5 + unknownRiskTag*20
```

要求：

- 规则必须集中在独立 analyzer 模块
- 阈值应可配置或至少可集中维护
- 分析器输出必须可用于测试断言

### 6.6 预处理与归一化

章节在进入 analyzer 前，需要完成受控预处理：

- 归一化章节 DOM 结构
- 归一化 class、inline style 与基础标签信息
- 过滤无意义空节点
- 统一分析所需的节点遍历能力

要求：

- 预处理仅服务于判断与渲染输入，不改变原始正文语义
- `canvas` 与 `dom` 两种章节路径都应尽量消费同一份归一化章节结果

## 7. 章节级混合渲染架构

### 7.1 目标数据流

本阶段目标数据流如下：

`EPUB Section -> 章节预处理 -> 复杂度分析器 -> RenderMode -> Canvas 章节路径 或 DOM 章节路径 -> 统一阅读状态层`

### 7.2 Canvas 章节路径

当章节判定为 `canvas` 时，继续沿用当前主链路：

- `SectionDocument`
- `LayoutEngine`
- `DisplayListBuilder`
- `CanvasRenderer`

要求：

- 现有 `canvas` 路径的缓存、分页、滚动和命中测试能力保持稳定
- 章节级 fallback 的引入不能让简单章节退回 DOM 主导模式

### 7.3 DOM 章节路径

当章节判定为 `dom` 时，需要提供受控 DOM 渲染路径。

要求：

- DOM 章节只承担该章节正文绘制
- 进入 DOM 章节前必须完成样式归一化，不能直接把原始复杂 EPUB DOM 整体原样注入为最终 UI 逻辑层
- DOM 章节的字体、字号、行高和主题应尽可能与当前阅读器保持一致
- DOM 章节也必须输出可用于定位、跳转和进度同步的章节级信息

### 7.4 DOM 路径的约束

DOM fallback 必须是受控兼容层，而不是重新回到“浏览器主导全部正文行为”的旧模式。

要求：

- DOM fallback 只作为复杂章节兜底
- DOM fallback 不改变阅读器的全局状态主导权
- 阅读器的章节切换、目录、搜索、进度和定位语义仍由 runtime 层统一驱动

## 8. 统一阅读状态层需求

### 8.1 状态统一目标

无论章节走 `canvas` 还是 `dom`，都必须接入统一阅读状态层。

该状态层至少负责：

- 当前章节
- 当前页或当前滚动位置
- 目录跳转
- 搜索命中与跳转
- 书签
- 阅读进度同步

### 8.2 状态层约束

要求如下：

- `canvas` 章节与 `dom` 章节不得维护两套互相独立的阅读进度语义
- 当前章节定位必须对外保持统一 API
- 切换章节渲染模式不得破坏 `goToTocItem / goToHref / search / getProgress` 等核心行为

### 8.3 搜索与索引要求

搜索系统不应依赖具体渲染层实现。

要求：

- 搜索索引基于预处理阶段的章节文本模型构建
- 搜索命中结果可以映射到章节级定位
- 后续块级 fallback 演进时，索引模型应可继续扩展到 block 级 text range

## 9. DOM Fallback 视觉一致性要求

### 9.1 一致性目标

DOM fallback 虽然是兼容兜底，但不能让视觉风格完全脱离阅读器。

要求：

- 统一字体栈
- 统一字号和行高映射
- 统一主题色和背景色映射
- 对原书中花哨但非必要的复杂样式做归一化处理

### 9.2 允许的差异

本阶段允许：

- DOM 章节在复杂结构保真度上优先于视觉一致性
- DOM 章节与 canvas 章节在极少数复杂段落上的局部排版存在差异

本阶段不要求：

- DOM 与 canvas 在像素级视觉一致
- DOM 章节具备与 canvas 完全一致的片段级命中结果

## 10. 状态 × 操作 → 结果矩阵

| 状态 | 操作 / 事件 | 结果 | 约束 |
| --- | --- | --- | --- |
| `idle` | `open(file)` | 进入 `opening` | 清空旧决策缓存与旧渲染结果 |
| `opening` | 章节解析完成 | 进入 `analyzing` | 暂不提交章节正文 |
| `analyzing` | analyzer 输出 `canvas` | 进入 `canvas-render-pending` | 记录章节决策结果 |
| `analyzing` | analyzer 输出 `dom` | 进入 `dom-render-pending` | 记录章节决策结果 |
| `canvas-render-pending` | layout 与 display list ready | 进入 `ready` | 提交 canvas 章节画面 |
| `dom-render-pending` | dom model ready | 进入 `ready` | 提交 dom 章节画面 |
| `ready` | `goToHref / toc / search` | 进入 `relocating` | 定位行为不依赖章节渲染类型 |
| `relocating` | 目标章节 ready | 回到 `ready` | 当前章节、进度与高亮同步更新 |
| `ready` | `setTheme / setTypography / resize` | 进入 `rerender-pending` | 重新决策或复用已有模式 |
| `rerender-pending` | 新章节结果 ready | 回到 `ready` | 原子替换章节渲染结果 |
| 任意状态 | `destroy()` | 进入 `destroyed` | 释放 canvas 与 dom 章节资源 |

## 11. 需求拆分范围

### 11.1 本轮实现需求

本轮只实现：

- 章节预处理与归一化
- 章节复杂度分析器
- 章节级 `canvas/dom` 渲染模式决策
- 章节级 DOM fallback 渲染路径
- 统一阅读状态层接入与行为对齐

### 11.2 待开发需求：块级 Fallback

块级 fallback 是下一阶段需求，本轮不开发、不拆任务。

块级 fallback 的目标是：

- 一章中大部分内容继续走 `canvas`
- 个别复杂 block 进入 `dom_fallback`
- 分页器同时处理“可精确计算高度的 canvas block”和“需要预先测量的 dom fallback block”

建议的后续 block 类型：

```ts
type ChapterBlock =
  | { kind: "canvas_text_group" }
  | { kind: "canvas_image" }
  | { kind: "canvas_quote" }
  | { kind: "canvas_list" }
  | { kind: "dom_fallback"; html: string; reason: string }
```

该阶段的主要难点包括：

- 同章双渲染层协调
- DOM fallback block 测高
- 分页时复杂 block 的整块移动或整章降级策略
- DOM 与 canvas 的统一命中、选区和批注模型

后续阶段建议优先采用：

- DOM fallback block 先整块挪页
- 无法安全分页的复杂块可触发整章 DOM 降级
- 首版不做 DOM block 跨页拆分

本阶段仅记录这些需求，不进入任务拆分与验收。

## 12. 验收要求

本阶段验收至少包括：

- analyzer 单元测试
- `canvas/dom` 决策集成测试
- `canvas` 章节和 `dom` 章节的阅读状态一致性测试
- TOC、搜索、跳转、进度同步回归测试
- demo 验证至少覆盖一个 `canvas` 章节和一个 `dom` 章节

验收结论必须能够说明：

- 章节级 fallback 已可稳定工作
- `canvas` 主路径未被破坏
- 复杂章节已能通过 DOM fallback 稳定展示
- 块级 fallback 需求已记录，但未进入本轮实现
