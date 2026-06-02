# 基于 Pretext 的 Canvas 渲染需求文档

## 1. 文档目的

本文档定义一个新的渲染目标：在保留当前 EPUB 解析、资源管理、定位、分页和搜索主干的前提下，把最终渲染后端从浏览器 DOM/CSS 流式排版切换为 `pretext + canvas`。

这里的“绕过浏览器”需要精确定义：

- 浏览器仍然提供 `Canvas API`、字体加载、图片解码、事件分发和宿主容器
- 项目自行负责文本排版、块级布局、分页切片、滚动窗口、命中测试和最终绘制
- 浏览器 DOM 不再承担正文排版与最终视觉结果的决定权

目标是把当前项目从“`pretext` 负责文本行布局，浏览器负责最终渲染”演进为“`pretext` 负责文本布局，项目自己的 `CanvasRenderer` 负责最终渲染”。

## 2. 现状与问题

当前实现已经完成以下链路：

- EPUB 容器解析
- OPF、NAV、NCX、XHTML 解析
- `SectionDocument` 内容模型构建
- `LayoutEngine` 对 text 和 heading 的 `pretext` 行布局
- `EpubReader` 的 scroll / paginated 模式、TOC、搜索、主题和字号切换

当前瓶颈也很明确：

- 最终正文仍通过 `innerHTML` 写入容器，由浏览器 DOM 完成绘制
- scroll 模式依赖 `offsetTop`、`offsetHeight`、`scrollTop` 进行位置同步
- native block 和 pretext block 走两套渲染路径，视觉与定位模型不统一
- 图片异步到达后会触发 DOM 二次更新，最终视觉结果受浏览器排版细节影响
- 后续如果要做更强的分页稳定性、虚拟化、批注层、命中测试和多端一致性，DOM 仍然是主要约束

## 3. 目标定义

### 3.1 核心目标

构建一个 `CanvasRenderer`，使项目具备以下能力：

- 以 section layout 为输入生成稳定的 display list
- 在 `canvas` 上绘制正文、标题、列表、引用、代码块、分隔线、图片等基础块
- 在 scroll 和 paginated 两种模式下复用同一套布局结果与定位模型
- 用项目自己的命中测试结果驱动链接跳转、搜索跳转、选区高亮和翻页定位
- 让主题、字号、行高、容器尺寸变化触发可控重排，而不是交给 DOM 回流决定结果

### 3.2 成功标准

达到以下条件，即视为需求完成：

- 默认正文渲染路径使用 `canvas`
- 相同输入、相同字体、相同 viewport 下，分页结果稳定
- scroll 与 paginated 共用统一 locator 语义
- TOC、搜索跳转、上一页、下一页、指定页跳转在 canvas 模式可用
- 图片、链接、基础高亮在 canvas 模式可用
- DOM 仅承担宿主壳层与辅助 overlay，不承担正文主绘制

## 4. 路线选择

### 4.1 可选路线

| 路线 | 描述 | 优点 | 成本与风险 |
| --- | --- | --- | --- |
| A. 纯 Canvas | 所有正文块都绘制到 canvas，交互完全依赖命中测试 | 渲染模型最统一，后续扩展空间最大 | 首期实现成本最高，表格、选区、可访问性压力最大 |
| B. Canvas First + 有界兼容层 | 主路径全部走 canvas；个别复杂块在首期走受控 fallback；fallback 结果参与统一定位模型 | 能在保持方向正确的前提下压缩首期复杂度 | 需要定义 fallback 边界，避免重新回到 DOM 主导 |
| C. 继续 DOM，仅增加 pretext 占比 | 维持当前模式，继续把更多块交给 DOM 渲染 | 短期改动最小 | 最终渲染仍被浏览器控制，无法解决核心目标 |

### 4.2 推荐路线

推荐采用路线 B。

原因有三点：

1. 目标是夺回最终渲染控制权，路线 B 可以做到“canvas 成为默认主路径”。
2. 当前项目已有 `SectionDocument`、`LayoutEngine` 和分页模型，适合先补 display list 与 canvas painter，而不是立即重写全部语义块。
3. 复杂块如大型表格、复杂富文本、后续批注选区，需要先有统一布局坐标系，再逐步提升绘制保真度。路线 B 的演进阻力最小。

本需求文档以路线 B 为基线。

## 5. 范围定义

### 5.1 V1 范围

V1 聚焦可读、可翻页、可定位、可扩展：

- 支持 `reflowable EPUB`
- 支持 `scroll` 和 `paginated`
- 支持 text、heading、list、quote、code、image、thematic-break 的 canvas 绘制
- 支持基础 table 绘制，采用简化单元格布局策略
- 支持链接点击、TOC 跳转、搜索跳转、指定位置跳转
- 支持主题、字号、行高、容器宽高变更后的重排与重绘
- 支持图片异步加载后的局部刷新
- 支持搜索命中高亮与当前定位高亮
- 保留宿主侧工具栏、目录面板、搜索面板等普通 DOM UI

### 5.2 V1 明确收敛项

V1 采用以下收敛策略：

- CSS 兼容策略以“结构化映射 + 白名单样式”为主
- 文字选择先支持“块内文本命中与范围高亮”，完整原生选区语义放到后续阶段
- 大型复杂表格以可读优先，保真度逐步提升
- 无障碍朗读、语义树导出、批注编辑器放到后续阶段
- Fixed Layout EPUB、音视频、MathML、SVG 高保真渲染放到后续阶段

## 6. 用户价值

对最终产品与工程体系，CanvasRenderer 带来四类直接收益：

- 分页和滚动的稳定性提升。项目自己控制绘制和切片逻辑，结果更可预测。
- 虚拟化成本下降。绘制与布局按 section 和 page 粒度缓存，避免正文全量 DOM 节点常驻。
- 交互扩展空间增大。搜索高亮、批注层、命中测试、阅读热区都可以围绕同一套坐标系展开。
- 多端一致性增强。未来迁移到离屏 canvas、WebWorker 预处理或其他宿主时，核心布局模型可延续。

## 7. 需求详情

### 7.1 渲染流水线

系统需要把当前链路扩展为以下流水线：

`EPUB -> Book/SectionDocument -> LayoutEngine -> Block Layout -> Display List -> CanvasRenderer -> Interaction Map -> Viewport Commit`

新增约束如下：

- `LayoutEngine` 继续负责 text-like block 的行布局
- 新增 `DisplayListBuilder`，把 `LayoutBlock` 转为可绘制命令序列
- 新增 `CanvasRenderer`，负责背景、文本、图片、装饰线、命中区域的绘制
- 新增 `InteractionMap`，保存 block、line、fragment、link、image 的可点击区域
- 新增 `ViewportCommitBarrier`，在字体、图片和布局状态满足条件前，禁止旧布局提交到可视层

### 7.2 渲染模型

渲染模型以“显示列表”作为中间层，避免 layout 直接依赖 canvas API。

建议的显示对象：

- `TextRunDrawOp`
- `RectDrawOp`
- `ImageDrawOp`
- `BorderDrawOp`
- `UnderlineDrawOp`
- `HighlightDrawOp`
- `ClipDrawOp`

每个 draw op 至少包含：

- `sectionId`
- `blockId`
- `zIndex`
- `paintBounds`
- `visualBounds`
- `locator`
- `payload`

### 7.3 块级绘制要求

不同 block 的 V1 绘制要求如下：

| Block 类型 | V1 要求 |
| --- | --- |
| heading | 使用 `pretext` 行布局，支持字号倍率、对齐和基础高亮 |
| text | 使用 `pretext` 行布局，支持链接、代码片段、搜索高亮 |
| list | 支持有序、无序列表，项目自行绘制 marker 与缩进 |
| quote | 支持引用边线、内边距和内部 block 递归绘制 |
| code | 支持等宽字体、背景色、滚动内收敛策略 |
| image | 支持占位、异步替换、尺寸约束和局部重绘 |
| table | 支持基础网格、单元格 padding、header 样式；复杂 CSS 收敛 |
| thematic-break | 支持单线或渐变线绘制 |

### 7.4 交互与命中测试

Canvas 模式下，正文交互不能依赖 DOM 节点。

系统必须提供：

- `hitTest(x, y)`：返回 section、block、line、fragment、link、image 等命中结果
- `mapLocatorToViewport(locator)`：把定位信息映射到 viewport 坐标
- `mapViewportToLocator(x, y)`：把点击位置映射为阅读定位
- 链接点击区域计算
- 搜索结果命中框计算
- 当前阅读位置高亮区域计算

首期交互要求：

- 单击链接可跳转
- 单击图片可触发宿主预览
- 单击正文可更新当前 locator
- 翻页、目录跳转、搜索跳转后，当前高亮与进度条同步更新

### 7.5 分页与滚动

scroll 与 paginated 模式继续共用一本书、同一套 locator 语义，但提交方式不同。

paginated 模式要求：

- page 切片基于统一 display list 或 block layout
- 当前页只绘制当前 page 的 draw ops
- 页面切换后，不重新计算整本书 locator 语义

scroll 模式要求：

- section 级窗口化继续保留
- 窗口内 section 才生成或提交 draw ops
- 未激活 section 使用估算高度占位
- 滚动位置同步基于项目维护的 section/page 坐标，不依赖 DOM 内容高度回读

### 7.6 字体与资源就绪屏障

这是本项目的强约束。

在以下任一条件变化后，系统都必须经过显式屏障，再提交新画面：

- 字号变化
- 行高变化
- 字体族变化
- 容器尺寸变化
- 图片加载完成
- 主题变化导致绘制参数变化

屏障规则：

- 新布局未 ready 前，旧布局继续保留
- 新布局 ready 后，一次性提交新 display list 和 interaction map
- 图片晚到时，只允许更新相关 section 或相关 page，禁止整本书无界重排

## 8. 状态 × 操作 → 结果矩阵

| 状态 | 用户操作 / 系统事件 | 结果 | 约束 |
| --- | --- | --- | --- |
| `idle` | `open(file)` | 进入 `opening` | 清空旧缓存和旧命中图 |
| `opening` | EPUB 解析完成 | 进入 `layout-pending` | 暂不提交正文画面 |
| `layout-pending` | 字体与基础资源 ready | 进入 `paint-ready` | 生成 display list 和 interaction map |
| `paint-ready` | `render()` | 首次画面提交 | 当前 locator 初始化 |
| `paint-ready` | `next/prev/goToPage/goToLocation` | 进入 `relocating` | 复用已有 layout，优先避免全量重排 |
| `relocating` | 目标页或目标 section 准备完成 | 回到 `paint-ready` | 位置高亮、进度、TOC 同步刷新 |
| `paint-ready` | `setTypography/setTheme/resize` | 进入 `relayout-pending` | 旧画面继续显示 |
| `relayout-pending` | 新 layout ready | 回到 `paint-ready` | 原子替换 display list |
| `paint-ready` | 图片异步到达 | 进入 `partial-refresh-pending` | 仅更新受影响区域 |
| `partial-refresh-pending` | 局部 draw ops ready | 回到 `paint-ready` | 当前阅读位置保持稳定 |
| 任意状态 | `destroy()` | 进入 `destroyed` | 释放图片、字体引用与缓存 |

## 9. 接口与模块变化

### 9.1 Reader API 变化

建议新增以下配置：

```ts
type RenderBackend = "dom" | "canvas"

type ReaderOptions = {
  container?: HTMLElement
  canvas?: HTMLCanvasElement
  mode?: "scroll" | "paginated"
  renderBackend?: RenderBackend
  theme?: Partial<Theme>
  typography?: Partial<TypographyOptions>
}
```

建议新增以下只读能力：

- `getRenderBackend()`
- `hitTest(point)`
- `getVisibleDrawBounds()`
- `getRenderMetrics()`

### 9.2 新增模块

建议新增以下模块：

- `renderer/canvas-renderer.ts`
- `renderer/display-list-builder.ts`
- `renderer/hit-test-map.ts`
- `renderer/draw-ops.ts`
- `runtime/render-commit-manager.ts`

职责边界：

- 解析层继续输出 `Book` 与 `SectionDocument`
- 布局层继续输出 `LayoutBlock`
- 渲染层把 `LayoutBlock` 转为 draw ops 并提交到 canvas
- runtime 负责状态流、缓存和异步屏障

## 10. 非功能需求

### 10.1 性能

性能要求以项目已有 `test-fixtures` 为基线集，建立统一 benchmark。

V1 目标：

- 中等体量、纯文本为主的 EPUB，在桌面浏览器中应快速进入可阅读状态
- 字号、行高调整后的当前 section 重排应保持可感知流畅
- scroll 模式只维护可视窗口附近 section 的活跃 draw ops
- 单次翻页与跳转以增量提交为主，减少整书级重绘

### 10.2 稳定性

- 相同输入和 viewport 下，分页结果稳定
- 图片晚到、字体晚到、窗口 resize 时，当前定位不漂移
- scroll 与 paginated 的 locator 语义一致

### 10.3 可维护性

- display list 是唯一绘制输入
- hit test 与 draw op 共用同一坐标系
- DOM backend 与 canvas backend 可并存一段时间，用于回归比对

### 10.4 可测试性

至少需要以下测试层次：

- `LayoutBlock -> DrawOp` 单元测试
- 命中测试单元测试
- 分页稳定性测试
- 搜索跳转与 TOC 跳转集成测试
- 图片异步加载后的局部刷新测试
- demo 级 smoke test，验证 canvas 模式下打开、翻页、切主题、搜索、目录跳转

## 11. 验收标准

满足以下条目即可进入可交付状态：

1. 宿主可通过配置启用 `renderBackend: "canvas"`。
2. 打开 EPUB 后，正文默认绘制到 canvas，正文 DOM 节点数量不再随书籍内容线性增长。
3. `scroll` 和 `paginated` 模式下，目录跳转、上一页、下一页、指定页跳转可用。
4. 搜索结果点击后可定位到对应 section/block，并可见高亮。
5. 字号、行高、主题切换后，画面刷新和当前定位保持一致。
6. 图片加载完成后，仅发生受影响区域刷新，当前阅读进度保持稳定。
7. 在同一 fixture 上，canvas backend 与 dom backend 的章节顺序、页码总量和 locator 结果保持可比对。
8. 关键路径具备自动化测试，demo 中可手工验证。

## 12. 分阶段落地建议

### Phase 1：建立 Canvas 主路径

- 引入 `renderBackend`
- 建立 draw ops 与 display list
- 先支持 heading、text、image、thematic-break
- 打通 paginated 模式

### Phase 2：补齐 scroll 与交互

- scroll 窗口化切到 canvas 提交
- 接入 hit test
- 打通 TOC、搜索、高亮、图片预览

### Phase 3：补齐复杂块和兼容层

- list、quote、code、table 细化绘制
- 处理复杂资源和更细的文本范围映射
- 评估批注、文本选择、无障碍层

## 13. 风险与待决问题

当前最重要的风险有五项：

- `pretext` 的测量结果与 canvas 实际绘制结果需要持续校准，尤其是字体加载前后
- 图片和字体属于异步资源，ready barrier 设计直接决定定位稳定性
- table、复杂 inline 样式、长代码块会持续拉高首期复杂度
- canvas 文本选择与可访问性需要后续补 overlay 方案
- HiDPI、缩放、容器 resize 会放大缓存与重绘策略的成本

需要后续尽快定板的问题：

1. V1 是否接受“基础 table + 样式收敛”策略。
2. 文本选择首期是采用自研选区模型，还是只交付搜索高亮与点击定位。
3. canvas backend 是否直接替换 demo 默认路径，还是先与 dom backend 并行一段时间。

## 14. 结论

这个需求的本质，不是把 DOM 节点换成 `canvas` 标签，而是把“正文最终视觉结果的控制权”从浏览器排版系统收回到项目自身。

对当前仓库，最短路径是：

- 保留现有 EPUB 解析与 `LayoutEngine`
- 新增 display list、canvas painter、interaction map 和 commit barrier
- 先完成 `Canvas First` 主路径，再逐步消化复杂块与高级交互

这条路线工程成本可控，方向也足够清晰。
