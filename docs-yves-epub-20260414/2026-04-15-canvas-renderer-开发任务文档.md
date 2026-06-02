# 基于 Pretext 的 Canvas 渲染开发任务文档

## 1. 文档目标

本文档用于将《基于 Pretext 的 Canvas 渲染需求文档》进一步拆分为可执行开发任务，作为当前仓库从 DOM 正文渲染迁移到 `canvas` 正文渲染的实现顺序与验收依据。

约束原则：

- 所有任务合计必须覆盖 canvas 需求文档的全部 V1 范围
- 开发任务以当前仓库现状为起点，不重复规划已经完成的 EPUB 解析主链路
- 每个任务必须带测试要求
- 开发顺序默认从上到下执行
- 未完成前置任务，不进入后置任务

关联文档：

- [Canvas 渲染需求文档](./2026-04-15-canvas-renderer-requirements.md)
- [技术文档](./技术文档.md)
- [现有开发任务文档](./开发任务文档.md)

## 2. 总体执行规则

### 2.1 任务执行规则

- 每个任务完成后，必须先补测试，再进入下一个任务
- 每个任务必须提交可运行代码，不接受只有设计没有实现的完成态
- 每个任务必须同步检查对 `packages/core` 与 `packages/demo` 的影响
- 如果任务影响公开 API，必须同步更新 demo 或文档
- DOM backend 在迁移期作为对照实现保留，不允许直接删除，直到 canvas backend 完成回归对齐

### 2.2 测试执行规则

- 每个任务至少包含单元测试
- 涉及模块协作的任务必须补集成测试
- 涉及浏览器交互或用户可见行为的任务必须补端到端测试或 demo 验证步骤
- 涉及分页、滚动、定位的任务必须补稳定性测试
- 涉及异步图片、字体和 resize 的任务必须补晚到结果覆盖测试

### 2.3 完成定义

一个任务仅在以下条件都满足时才算完成：

- 代码完成
- 测试完成并通过
- 类型检查通过
- 相关文档或 demo 更新
- DOM backend 与 canvas backend 的关键行为对比结果可接受

### 2.4 当前执行进度

记录时间：`2026-04-15`

当前状态说明：

- 本文档仍然是 canvas backend 改造 backlog 主文档
- 当前仓库已经打通 `canvas` 主渲染链路，demo 已可展示 canvas 渲染结果
- 本节只记录真实进度，不调整原始任务拆分顺序

已完成任务：

- `A1`：已完成。`ReaderOptions`、runtime 分流、`renderBackend` 切换入口已落地
- `A2`：已完成。已建立 draw op 与 section display list 基础类型
- `A3`：已完成。已建立 interaction map 与 `hitTest` 返回模型
- `A4`：已完成。已引入 `renderVersion`，用于拦截旧版本渲染结果覆盖当前画面
- `B1`：已完成。`LayoutPretextBlock` 已可稳定转换为文本 draw ops
- `B2`：已完成。native block 已能转换为基础 draw ops，图片、引用、代码、列表、表格、分割线均有基础映射
- `B3`：已完成。已可构建 section 级 display list，并输出高度与 interaction 数据
- `C1`：已完成。`CanvasRenderer` 已支持 canvas 初始化与 HiDPI 适配
- `C2`：已完成。已支持文本、背景、高亮、下划线与链接样式绘制
- `C3`：已完成。基础块级绘制已成立，当前实现偏向 V1 可读版本
- `C4`：已完成。已支持图片占位、加载与受影响区域刷新
- `D1`：已完成。分页主路径已能消费统一 display list
- `D2`：已完成。分页模式已能提交 canvas，并复用现有翻页能力
- `D3`：已完成。分页定位、页码与当前高亮已能同步
- `E1`：已完成。scroll 模式已改为基于项目内坐标系同步位置
- `E2`：已完成。已支持 section 窗口化与 scroll canvas 提交
- `E3`：已完成。主题、字号、resize 触发后已能走 scroll 模式重排与重绘
- `F1`：已完成。已提供 `hitTest`
- `F2`：已完成。demo 已支持 canvas 模式下图片点击预览，链接与正文命中链路已接入 runtime
- `F3`：已完成。已支持搜索高亮与当前 block 高亮
- `F4`：已完成。已提供 `mapLocatorToViewport` 与 `mapViewportToLocator`
- `H1`：已完成。`open / render / destroy` 在 canvas backend 下已可正常工作
- `H3`：已完成。已暴露 `getRenderBackend / hitTest / getVisibleDrawBounds / getRenderMetrics`
- `J1`：已完成。demo 已默认进入 canvas 模式，并支持切换 `dom / canvas`

部分完成任务：

- `B4`：部分完成。当前已有 section 级重建与窗口级复用，但还没有独立的 display list cache 与显式缓存失效策略
- `G1`：部分完成。列表与引用已有基础可读绘制，marker、缩进、嵌套和引用细节仍需细化
- `G2`：部分完成。代码块和 inline code 已能绘制，长行策略、保真度与混排细节仍需补齐
- `G3`：部分完成。表格当前以文本可读为主，缺少真正的网格、padding 与 header 绘制
- `H2`：部分完成。配置变更已接入统一重渲染链路，异步图片、字体、resize 的覆盖测试矩阵仍不完整

未完成任务：

- `B4`：建立独立 display list 缓存，补缓存键、局部失效与复用测试
- `G1`：完善 list / quote 高保真绘制，补视觉快照与命中稳定性验证
- `G2`：完善 code block / inline code 绘制，补长行与换行策略测试
- `G3`：实现 table painter v1，补网格计算与定位稳定性测试
- `G4`：输出 fallback policy 与兼容性说明文档，并补 fallback 触发测试
- `H2`：补齐配置变更并发覆盖测试，确认 commit barrier 在晚到结果场景下稳定
- `I1`：建立 dual-backend 对照测试，形成 DOM / canvas 基线
- `I2`：建立长章节、多章节性能基线与指标记录文档
- `I3`：建立视觉快照与更完整的交互回归路径
- `J2`：更新 README 与 API 文档
- `J3`：输出 V1 验收清单，并留存逐项验收结果

建议下一批执行顺序：

1. `G1 -> G2 -> G3 -> G4`
2. `I1 -> I3`
3. `I2`
4. `J2 -> J3`

当前已完成验证：

- `pnpm.cmd --filter @yves-epub/core typecheck`
- `pnpm.cmd --filter @yves-epub/demo typecheck`
- `pnpm.cmd exec vitest run packages/core/test`
- `pnpm.cmd --filter @yves-epub/core build`
- `pnpm.cmd --filter @yves-epub/demo build`
- `pnpm.cmd lint`
- `pnpm.cmd exec playwright test packages/demo/e2e/smoke.spec.ts`

## 3. 任务分阶段拆分

## 阶段 A：渲染后端抽象与基础类型

### A1. 引入渲染后端配置与运行时分流

目标：

- 在 `ReaderOptions` 中引入 `renderBackend`
- 支持 `dom` 与 `canvas` 两种正文渲染后端
- 保持现有 API 调用方式不变

输出：

- 渲染后端枚举与配置项
- runtime 后端分流入口

测试要求：

- 单元测试覆盖默认后端与显式后端选择
- 集成测试验证两种后端都可完成 `open / render / destroy`

### A2. 定义统一 draw op 与 display list 类型

目标：

- 建立 `TextRunDrawOp`、`RectDrawOp`、`ImageDrawOp` 等统一绘制模型
- 为每个 draw op 附带 `sectionId / blockId / locator / bounds`

输出：

- draw ops 类型定义
- display list 基础结构

测试要求：

- 单元测试验证 draw op 序列化结构稳定
- 类型测试验证 runtime、renderer、hit test 可共享类型

### A3. 建立 interaction map 与命中结果模型

目标：

- 为链接、图片、文本片段、block 建立统一命中区域模型
- 定义 `hitTest` 返回结构

输出：

- interaction map 类型
- hit result 类型

测试要求：

- 单元测试覆盖点命中、空白区命中、边界命中
- 类型测试验证对外 API 返回值稳定

### A4. 建立渲染提交屏障与版本号模型

目标：

- 为字体、图片、resize、排版配置变更建立统一 commit barrier
- 用版本号或 token 避免晚到结果覆盖当前画面

输出：

- render commit manager
- layout/render version 模型

测试要求：

- 单元测试覆盖旧任务结果被丢弃
- 集成测试验证主题切换和 resize 并发时最终画面来自最新版本

## 阶段 B：Display List 构建层

### B1. 将 `LayoutPretextBlock` 转换为文本绘制命令

目标：

- 把 `pretext` 行布局结果稳定映射为 `TextRunDrawOp`
- 输出行级、fragment 级坐标与可点击范围

输出：

- pretext block display list builder

测试要求：

- 单元测试覆盖 heading 与 text 的 draw op 生成
- 快照测试验证多行、多 fragment 输出稳定

### B2. 将 native block 转换为块级绘制命令

目标：

- 为 image、quote、code、list、table、thematic-break 建立 draw op 映射
- 保留块级边界、背景、边框和内部偏移信息

输出：

- native block display list builder

测试要求：

- 单元测试覆盖各类 block 的 draw op 生成
- 快照测试验证列表缩进、引用边线、代码块背景、表格网格

### B3. 实现 section 级 display list 汇总

目标：

- 汇总 block 级绘制命令为 section 级显示列表
- 输出 section 高度、可视边界和 locator 索引

输出：

- section display list builder

测试要求：

- 单元测试覆盖块 top 累积与 section 高度计算
- 快照测试验证 section display list 输出

### B4. 建立 display list 缓存机制

目标：

- 根据 section、viewport、typography、theme、资源版本生成缓存键
- 支持局部失效与重复复用

输出：

- display list cache

测试要求：

- 单元测试覆盖缓存命中、缓存失效和局部失效
- 集成测试验证同一输入下不会重复构建 display list

## 阶段 C：CanvasRenderer 基础绘制能力

### C1. 实现 canvas 初始化与 HiDPI 适配

目标：

- 管理 `canvas`、`2d context`、devicePixelRatio
- 处理容器尺寸与实际绘制尺寸同步

输出：

- canvas renderer 基础版

测试要求：

- 单元测试覆盖逻辑尺寸与物理尺寸换算
- 集成测试验证 resize 后画面不会模糊或拉伸

### C2. 实现文本与装饰绘制

目标：

- 支持文本、背景、高亮、下划线、链接样式绘制
- 支持 text align 与 line height 的视觉还原

输出：

- text painter

测试要求：

- 单元测试覆盖普通文本、链接、代码片段、高亮
- 视觉快照测试验证多语言文本在 canvas 中可读

### C3. 实现基础块级绘制

目标：

- 支持 list、quote、code、thematic-break 的 canvas 绘制
- 确保块边界与内部内容坐标一致

输出：

- block painter

测试要求：

- 集成测试验证块级视觉顺序正确
- 视觉快照测试验证典型块级内容输出

### C4. 实现图片占位、加载与局部重绘

目标：

- 为图片建立占位绘制
- 图片解码完成后只刷新受影响区域
- 防止图片晚到触发整书无界重绘

输出：

- image painter
- image refresh coordinator

测试要求：

- 集成测试验证图片加载前后 display list 行为正确
- 集成测试验证只刷新相关 section 或 page

## 阶段 D：分页模式接入 Canvas

### D1. 重构分页切片，使其消费统一 display list

目标：

- 分页引擎从 block 切片升级为 display list 或统一 block layout 切片
- page 结果保留 locator 与命中区域

输出：

- canvas-aware pagination engine

测试要求：

- 单元测试覆盖行边界切页与块边界切页
- 集成测试验证分页数量在相同输入下稳定

### D2. 实现分页模式 canvas 提交

目标：

- 分页模式下只绘制当前页 draw ops
- 复用现有 `next / prev / goToPage`

输出：

- paginated canvas renderer

测试要求：

- 集成测试验证分页模式下可正确绘制当前页
- 端到端测试验证翻页、跳页可用

### D3. 实现分页定位与高亮同步

目标：

- 翻页和跳转后同步 locator、页码、高亮区域
- 与现有 pagination info 保持一致

输出：

- pagination relocation coordinator

测试要求：

- 集成测试验证 `goToLocation`、`goToPage` 后高亮与页码一致
- 集成测试验证目录跳转后定位落到正确页

## 阶段 E：滚动模式接入 Canvas

### E1. 用项目内坐标系替代 DOM 高度回读

目标：

- 滚动定位不再依赖 `offsetTop / offsetHeight`
- 改为基于 section 高度、page 高度和 viewport 坐标同步位置

输出：

- scroll position model

测试要求：

- 单元测试覆盖 section 边界与进度换算
- 集成测试验证滚动中 locator 更新稳定

### E2. 实现 section 窗口化与 canvas 提交

目标：

- scroll 模式只激活视口附近 section 的 display list
- 未激活 section 使用估算高度占位

输出：

- scroll canvas renderer
- virtualization manager v2

测试要求：

- 集成测试验证多 section 下只提交窗口内绘制内容
- 集成测试验证占位高度与真实 section 切换后滚动位置稳定

### E3. 实现滚动模式下的局部刷新与重排

目标：

- 字号、主题、resize、图片晚到时支持窗口级重排与重绘
- 避免滚动过程中闪烁和回跳

输出：

- scroll relayout coordinator

测试要求：

- 集成测试验证滚动中调整字号后当前位置保持稳定
- 端到端测试验证 demo 中 resize 与主题切换后画面持续可读

## 阶段 F：命中测试与阅读交互

### F1. 实现 `hitTest` 基础能力

目标：

- 支持 block、line、fragment、link、image 的命中测试
- 输出统一命中结果供 runtime 使用

输出：

- hit test engine

测试要求：

- 单元测试覆盖文本区、链接区、图片区、空白区
- 集成测试验证 canvas 点击可还原到正确 block 或链接

### F2. 实现链接、图片与正文点击交互

目标：

- 单击链接触发跳转
- 单击图片触发宿主预览
- 单击正文更新当前 locator

输出：

- canvas interaction controller

测试要求：

- 集成测试验证链接点击与图片点击
- 端到端测试验证 demo 中点击行为可用

### F3. 实现搜索高亮与当前定位高亮

目标：

- 在 canvas 上绘制搜索命中高亮
- 同步当前阅读位置高亮

输出：

- highlight painter

测试要求：

- 集成测试验证搜索命中高亮区域与命中结果一致
- 端到端测试验证搜索跳转后高亮可见

### F4. 实现 locator 与 viewport 双向映射

目标：

- 提供 `mapLocatorToViewport`
- 提供 `mapViewportToLocator`

输出：

- locator mapping module

测试要求：

- 单元测试覆盖章节内、跨章节、跨页映射
- 集成测试验证 TOC、搜索、点击三条链路结果一致

## 阶段 G：复杂块与兼容收敛

### G1. 完善 list 与 quote 的视觉细节

目标：

- 优化 marker、缩进、嵌套列表与引用边线
- 保证复杂文本块在 canvas 中可读

输出：

- list / quote painter refinement

测试要求：

- 视觉快照测试覆盖嵌套列表与多段引用
- 集成测试验证命中区域仍然正确

### G2. 完善 code block 与 inline code 绘制

目标：

- 支持等宽字体、背景色、长行策略
- 确保 inline code 与 text fragment 混排可用

输出：

- code painter refinement

测试要求：

- 单元测试覆盖长代码行与换行策略
- 视觉快照测试验证 code block 与 inline code 输出

### G3. 实现基础 table canvas 绘制

目标：

- 支持基础行列、单元格 padding、header 区分
- 对复杂 CSS 表格采取收敛策略

输出：

- table painter v1

测试要求：

- 单元测试覆盖行列尺寸与网格计算
- 集成测试验证基础表格可读且定位不漂移

### G4. 明确 fallback 边界与兼容策略

目标：

- 识别首期不能高保真支持的块或样式
- 为这些情况定义收敛规则，而不是让 DOM 重新主导正文渲染

输出：

- fallback policy
- 兼容性说明文档

测试要求：

- 单元测试覆盖 fallback 触发条件
- 集成测试验证 fallback 后仍维持统一 locator 与 display list 语义

## 阶段 H：运行时状态一致性与公开 API

### H1. 对齐 `open / render / destroy` 生命周期

目标：

- canvas backend 与 dom backend 生命周期语义一致
- 保证 destroy 后资源释放完整

输出：

- runtime lifecycle alignment

测试要求：

- 单元测试覆盖重复打开、销毁后重建、异常中断
- 集成测试验证两种 backend 生命周期行为一致

### H2. 对齐 `setTheme / setTypography / setMode`

目标：

- 配置变更统一走 commit barrier
- 避免旧布局结果覆盖新画面

输出：

- config change coordinator

测试要求：

- 集成测试验证连续切主题、调字号、切模式后最终状态正确
- 集成测试验证中间态不会污染最终画面

### H3. 扩展公开 API 与事件系统

目标：

- 暴露 `getRenderBackend / hitTest / getVisibleDrawBounds / getRenderMetrics`
- 保持现有事件系统向后兼容

输出：

- API 扩展
- 事件 payload 扩展

测试要求：

- 单元测试覆盖新增公开方法
- 类型测试验证外部消费体验稳定

## 阶段 I：性能、回归与对照验证

### I1. 建立 dual-backend 对照测试

目标：

- 在同一 fixture 上同时跑 dom backend 与 canvas backend
- 对比章节顺序、页码总量、locator、搜索跳转结果

输出：

- backend comparison suite

测试要求：

- 集成测试验证主要行为差异在允许范围内
- 输出对照基线说明

### I2. 建立长章节与多章节性能基线

目标：

- 量化 scroll 窗口化、分页切换、重排和局部刷新成本
- 监控 canvas 模式是否出现全量重绘退化

输出：

- benchmark fixtures
- 性能基线文档

测试要求：

- 手工或自动记录关键耗时指标
- 集成测试验证多章节下活跃 draw ops 数量受控

### I3. 建立视觉快照与交互回归

目标：

- 为核心 block 类型和典型页面建立视觉快照
- 为目录跳转、搜索跳转、图片加载、resize 建立回归路径

输出：

- visual regression baseline

测试要求：

- 视觉快照测试覆盖至少一组中英混排内容
- 端到端测试覆盖打开、翻页、搜索、目录跳转、主题切换

## 阶段 J：Demo、文档与发布准备

### J1. 升级 demo，默认提供 canvas 模式

目标：

- demo 支持切换 `dom / canvas`
- 默认展示 canvas 模式

输出：

- demo UI 更新

测试要求：

- 端到端测试验证 demo 默认进入 canvas 模式
- 端到端测试验证可手动切回 dom 模式

### J2. 更新 README 与 API 文档

目标：

- 说明 `renderBackend`、canvas 依赖条件、已支持块类型、兼容收敛项
- 明确宿主仍负责普通 DOM UI

输出：

- README 更新
- API 文档更新

测试要求：

- 文档中的示例代码应可通过类型检查

### J3. 输出 V1 验收清单

目标：

- 将需求文档中的 V1 验收标准转成可执行验证清单
- 作为发布前最终 gate

输出：

- canvas renderer V1 checklist

测试要求：

- 按清单逐项验证并留存结果

## 4. 需求覆盖矩阵

### 4.1 Canvas 需求文档覆盖关系

- 渲染流水线与显示列表：A1-A4、B1-B4
- canvas 绘制能力：C1-C4、G1-G3
- 分页与滚动：D1-D3、E1-E3
- 交互与命中测试：F1-F4
- 状态屏障与运行时一致性：A4、H1-H2
- API 与宿主集成：H3、J1-J2
- 非功能需求：I1-I3、J3

### 4.2 V1 对应任务

Canvas V1 完成的最小任务集合：

- A1-A4
- B1-B4
- C1-C4
- D1-D3
- E1-E3
- F1-F4
- G1-G4
- H1-H3
- I1-I3
- J1-J3

说明：

- `G3` table 绘制只要求基础可读版本
- 文本选择、批注编辑器、无障碍层、Fixed Layout EPUB 不属于本轮 V1

## 5. 执行建议

推荐实际开发顺序：

1. A -> B -> C
2. D -> H1-H2
3. E -> F
4. G -> H3
5. I -> J

原因：

- 不先建立 draw op、interaction map 和 commit barrier，后续分页、滚动、交互都没有统一坐标系
- 先打通 paginated canvas 主路径，能最快验证“最终渲染后端切换”这件事已经成立
- scroll 模式迁移复杂度更高，适合在分页主路径稳定后推进
- dual-backend 对照测试必须在功能接近可用时尽快建立，否则迁移会失去基线

## 6. 交付要求

每完成一个任务，应至少产出：

- 代码实现
- 测试实现
- 变更说明
- 若涉及公开行为，则更新 demo 或文档

如果后续要严格按任务推进，可以直接以本文件为 canvas backend 改造 backlog 主文档，逐项勾选执行。
