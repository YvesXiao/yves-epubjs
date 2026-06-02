# 基于 Pretext 的 Canvas/DOM 样式像素对齐需求文档

## 1. 文档目的

本文档定义一个新的渲染质量目标：对于已经走 `canvas` 渲染管线的正文内容，在相同输入、相同主题、相同字号、相同字体与相同 viewport 下，其最终视觉结果需要尽可能与本项目当前 `dom` 基线渲染结果保持像素级对齐。

这里的“像素级对齐”不是泛指“看起来差不多”，而是要求：

- 文本起始位置、块起始位置、段后距、内边距、列表缩进、引用边线、代码块留白、表格单元格 padding 等关键几何参数来自同一套样式基线
- `canvas` 与 `dom` 在支持范围内使用同一套排版 token，而不是两边各自写一套默认值
- `layout` 计算、display list 构建、最终绘制和 DOM 归一化样式必须一起收敛，不能只改 painter

本需求文档以“当前仓库中的 DOM 归一化渲染结果”为对齐基线，而不是直接以浏览器默认样式或第三方阅读器为基线。

## 2. 现状与问题

当前仓库已经具备：

- EPUB 解析与章节预处理
- `LayoutEngine` 对 text / heading 的 `pretext` 行布局
- `DisplayListBuilder` 与 `CanvasRenderer`
- `DomChapterRenderer` 与 DOM 章节归一化样式
- 章节级 `canvas/dom` fallback

但在样式一致性上仍然存在明显问题：

- `layout-engine`、`display-list-builder`、`dom-chapter-style`、demo CSS 中存在多套分散常量
- `canvas` 路径包含 DOM 不存在的“合成 section title”等附加内容
- 段后距、章节底部留白、块内 padding、引用边线偏移、列表缩进等在 `canvas` 与 `dom` 之间不一致
- 代码块、inline code、blockquote、table 等块级语义的默认视觉值不统一
- 当前缺少“对齐基线”诊断，难以在回归中确认 `canvas` 是否仍贴近 `dom`

结果是：虽然 `canvas` 已可读、可翻页、可交互，但和 DOM 基线相比仍存在可见偏差，无法满足“主路径切换后视觉保持稳定”的目标。

## 3. 目标定义

### 3.1 核心目标

建立统一的阅读样式基线，使 `canvas` 与 `dom` 在支持范围内共享以下内容：

- 章节内边距与底部留白
- 正文与标题的字号倍率、行高与段后距
- 链接色、代码块背景、inline code 背景、引用边线、表格边框、列表缩进
- native block 的估高策略与绘制几何参数
- demo 中 DOM 呈现所使用的样式变量

### 3.2 成功标准

达到以下条件，即视为本轮需求完成：

- `canvas` 主路径不再额外注入 DOM 基线不存在的正文内容
- `layout-engine` 与 `display-list-builder` 的关键几何参数来自统一 style profile
- `dom` 章节归一化 CSS 与 demo 里影响正文的样式统一消费同一套 CSS 变量
- 当前 `canvas` 主路径支持的内容类型在 demo 中与 DOM 基线的主要几何表现一致
- 建立自动化回归，覆盖 layout、display list、runtime 与 demo 级验证

## 4. 范围定义

### 4.1 本轮实现范围

本轮聚焦当前 `canvas` 主路径已经承担或部分承担的正文内容：

- `text`
- `heading`
- `quote`
- `code`
- `aside`
- `list`
- `image`
- `thematic-break`
- `table`

对齐维度包括：

- section 级 padding / gutter / bottom spacing
- block 级 margin / padding / border / accent bar
- 行高、字号倍率、代码字体、链接色
- 列表 marker 缩进与文本起始位
- 表格 cell padding 与边框
- 章节滚动与分页场景下的布局稳定性

### 4.2 本轮明确不做

以下内容本轮不作为“像素级对齐”完成标准：

- 浏览器默认字体与系统字体差异导致的跨设备完全一致
- fixed-layout EPUB
- SVG / MathML / audio / video
- DOM fallback 复杂块的跨页拆分
- 浏览器原生选区与 Canvas 选区的完全一致

## 5. 对齐基线说明

本项目中“DOM 基线”定义为：

- `DomChapterRenderer` 输出的正文结构
- `buildDomChapterNormalizationCss()` 提供的章节级归一化样式
- `reader` 容器上注入的主题与样式 CSS 变量
- demo 中作用于正文的阅读样式规则

这意味着：

- 后续任何对 DOM 基线样式的变更，必须同步评估对 `canvas` 的影响
- `canvas` 的样式常量不允许继续独立演化

## 6. 需求详情

### 6.1 统一样式 Profile

系统必须新增统一 style profile，至少包含：

- section side padding
- section bottom padding
- paragraph spacing
- heading margin bottom
- heading scale / heading line height
- link color
- quote accent width / gap / color
- aside accent width / gap / background
- code block padding / radius / background / font
- inline code padding / radius / background / color
- table border color / border width / cell padding
- list indent / marker gap
- highlight / active colors

这套 profile 必须同时服务：

- `layout-engine`
- `display-list-builder`
- `dom-chapter-style`
- `reader` 注入的 CSS variables
- demo 中影响正文的样式规则

### 6.2 Layout 对齐

`layout-engine` 必须纳入对齐范围，至少包括：

- text / heading 的段后距计算改为基于 style profile，而不是硬编码比例
- native block 的估高策略与 DOM 样式保持同一套 padding / line-height / border 规则
- image / list / quote / code / table 的内容宽度计算与 DOM 可视宽度一致
- 章节总体高度包含与 DOM 基线一致的底部留白

### 6.3 Display List 与 Painter 对齐

`display-list-builder` 和 `canvas-renderer` 必须统一消费 style profile：

- block 背景、圆角、accent bar、cell border、marker 位置不能再使用分散魔法数
- `canvas` 文字颜色、链接颜色、代码色、inline code 背景与 DOM 基线一致
- `canvas` 不得再绘制 DOM 基线中不存在的合成 section title

### 6.4 DOM 与 Demo 对齐

为了避免 DOM 基线本身分裂，必须做到：

- `dom-chapter-style` 与 demo CSS 不再维护两套独立阅读样式常量
- `reader` 在容器上注入的 CSS variables 可以同时驱动 DOM 和 demo 正文样式
- demo 中对 blockquote / pre / code / table / link 的阅读样式必须回收进统一 profile

### 6.5 诊断与回归

系统必须建立“样式对齐”回归能力，至少覆盖：

- style profile 稳定性测试
- layout 估高与 block spacing 测试
- display list 关键几何参数测试
- DOM 归一化 CSS 输出测试
- runtime / scroll 稳定性测试
- demo smoke 验证

## 7. 验收标准

本轮验收以以下标准为准：

1. 当前 `canvas` 主路径支持的正文内容在 demo 中可正常运行。
2. `canvas` 与 DOM 基线共享统一 style profile。
3. `layout-engine` 的关键估高、段后距和章节底部留白与 DOM 基线一致。
4. `DisplayListBuilder` 不再注入 DOM 不存在的合成 section title。
5. 自动化测试覆盖 style profile、layout、renderer、reader 与 demo，且全部通过。

## 8. 与现有文档关系

本需求文档是以下文档的增量补充：

- [Canvas 渲染需求文档](./2026-04-15-canvas-renderer-requirements.md)
- [混合渲染需求文档](./2026-04-15-hybrid-renderer-requirements.md)
- [Reflowable EPUB 兼容增强需求文档](./2026-04-15-reflowable-compat-requirements.md)

这里新增的是“视觉一致性与 layout 对齐”要求，而不是替换这些文档中已定义的解析、兼容与渲染主流程。
