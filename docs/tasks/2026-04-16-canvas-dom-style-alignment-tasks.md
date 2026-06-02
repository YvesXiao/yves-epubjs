# 基于 Pretext 的 Canvas/DOM 样式像素对齐开发任务文档

## 1. 文档目标

本文档用于将《基于 Pretext 的 Canvas/DOM 样式像素对齐需求文档》拆分为可执行开发任务，作为当前仓库提升 `canvas` 主路径视觉一致性的实现顺序与验收依据。

约束原则：

- 所有任务合计必须覆盖样式像素对齐需求文档的全部范围
- 任务必须同时考虑 `layout`、`display list`、`canvas painter`、`dom baseline` 与 demo
- 每个任务完成后，必须先补自动化测试，再进入下一个任务
- 每个任务都必须给出明确的完成定义

关联文档：

- [Canvas/DOM 样式像素对齐需求文档](./2026-04-16-canvas-dom-style-alignment-requirements.md)
- [Canvas 渲染需求文档](./2026-04-15-canvas-renderer-requirements.md)
- [混合渲染需求文档](./2026-04-15-hybrid-renderer-requirements.md)
- [Canvas 渲染开发任务文档](./2026-04-15-canvas-renderer-开发任务文档.md)

## 2. 总体执行规则

### 2.1 任务执行规则

- 每个任务完成后，必须先跑该任务对应的自动化测试
- 测试通过后，才能进入下一个任务
- 任务涉及公共样式基线时，必须同步检查 `packages/core` 与 `packages/demo`
- 任务影响公开类型或诊断信息时，必须同步更新导出和 demo

### 2.2 完成定义

一个任务仅在以下条件都满足时才算完成：

- 代码完成
- 自动化测试完成并通过
- 类型检查通过
- 相关 demo 行为未回退

## 3. 分阶段任务

## 阶段 A：文档与对齐基线抽象

### A1. 新增样式对齐需求文档与开发任务文档

目标：

- 将“Canvas 与 DOM 样式像素级对齐”落成正式文档
- 明确 DOM 基线、对齐范围、layout 责任与验收标准

测试要求：

- 无单独代码测试
- 文档需纳入仓库并可被后续任务引用

### A2. 建立统一 reading style profile

目标：

- 新增统一 style profile 模块
- 输出 section、text、heading、quote、code、table、list 等关键样式 token

测试要求：

- 单元测试覆盖 profile 默认值与 typography/theme 映射

## 阶段 B：DOM 基线收口

### B1. DOM 章节归一化样式改为使用统一 profile

目标：

- `buildDomChapterNormalizationCss()` 改为消费统一 profile
- DOM 章节使用同一套 quote / code / table / list / link token

测试要求：

- 单元测试验证生成的 CSS 包含 profile 对应值

### B2. Reader 容器 CSS 变量与 demo 阅读样式对齐

目标：

- `reader` 在容器上注入统一 CSS variables
- demo 中影响正文的样式规则改为消费这些变量

测试要求：

- 单元测试验证容器 CSS variables 注入
- demo smoke 不回退

## 阶段 C：Layout 对齐

### C1. text / heading 的段后距与章节底部留白对齐

目标：

- `layout-engine` 的 text / heading 估高改为消费统一 profile
- section 级 display list 高度包含与 DOM 一致的底部留白

测试要求：

- 单元测试覆盖 paragraph spacing、heading spacing、section bottom padding

### C2. native block 估高对齐

目标：

- `code`、`quote`、`aside`、`list`、`table`、`image` 的估高与内容宽度规则收口到统一 profile

测试要求：

- 单元测试覆盖各类 native block 的估高与宽度计算

## 阶段 D：Canvas 绘制对齐

### D1. DisplayListBuilder 改为消费统一 profile

目标：

- block 背景、accent、padding、marker、cell border 等不再写死魔法数
- 链接、代码、inline code、blockquote、table 等颜色与几何统一

测试要求：

- 单元测试验证 quote / code / list / table draw ops 与 profile 一致

### D2. 移除 DOM 基线不存在的合成 section title

目标：

- `canvas` 路径不再额外插入 `section.title` 作为正文标题

测试要求：

- 单元测试验证仅凭 `section.title` 不会额外生成 draw op

## 阶段 E：诊断与 demo 验收

### E1. 新增样式对齐诊断信息

目标：

- 将当前对齐基线信息暴露到 runtime 或 demo 诊断层
- 让 demo 可观测“当前正文使用共享 profile”

测试要求：

- 单元测试验证诊断信息稳定返回

### E2. 全量回归与 demo 验收

目标：

- 跑完整 `typecheck / test / build / test:e2e`
- 确认 demo 可正常运行

测试要求：

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e`

## 4. 当前执行顺序

按以下顺序执行，不跳步：

1. `A1`
2. `A2`
3. `B1`
4. `B2`
5. `C1`
6. `C2`
7. `D1`
8. `D2`
9. `E1`
10. `E2`
