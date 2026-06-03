# 基于 Pretext 的 Reflowable EPUB 兼容增强需求文档

## 1. 文档目标

本文档定义当前项目下一阶段的兼容性目标：在保留现有 `pretext + canvas` 渲染主架构的前提下，引入成熟的第三方 HTML/CSS 解析能力，提升对常见 `reflowable EPUB` 文本书的兼容率，目标覆盖约 `90%` 的常见正文型 EPUB 内容。

本文档聚焦三个问题：

- 当前项目在 HTML/CSS 兼容层面的主要缺口是什么
- 为什么需要引入第三方库，而不是继续完全手写解析
- “覆盖 90% 常见 reflowable EPUB 文本书”在本项目中的具体范围与验收标准是什么

本文档不追求“兼容 EPUB 所有标签”或“实现浏览器级 CSS 引擎”，而是为当前仓库定义一个明确、可交付、可测试的兼容增强目标。

## 2. 现状与问题

当前仓库已经具备以下主干能力：

- EPUB ZIP 容器解析
- OPF、NAV、NCX 解析
- 基础 XHTML 内容解析
- `SectionDocument` 内容模型
- 基于 `pretext` 的文本布局
- 基于 `canvas` 的正文渲染、分页、滚动、搜索和命中测试

当前兼容问题也很明确：

- 章节 XHTML 解析仍以少量白名单标签为主，未识别标签容易被忽略或拍平成纯文本
- 章节内容使用 `fast-xml-parser` 直接映射对象，缺少 DOM 层，导致父子关系、兄弟关系、继承关系和选择器匹配能力不足
- CSS 目前没有正式进入渲染主链路，只保留了极少量结构化样式映射空间
- 列表、表格、代码块、`figure`、`aside` 等结构仍偏向可读兜底，而非稳定结构化渲染
- 遇到常见 EPUB 书籍中的 `span/class` 样式、脚注、嵌套列表、基础表格、图片标题等内容时，兼容性不稳定

结果是：当前项目可以正确打开部分简单 EPUB，但距离“常见正文型 reflowable EPUB 稳定可读”仍有明显差距。

## 3. 目标定义

### 3.1 核心目标

本阶段目标是：

- 引入成熟的第三方库，建立稳定的 HTML/XHTML 解析和 CSS 解析基础设施
- 将章节内容解析从“少量标签白名单映射”升级为“DOM 中间层 + 结构化内容模型”
- 建立一套面向 EPUB 文本书的 CSS 白名单兼容策略
- 在现有 `layout + canvas renderer` 主架构下，提升常见正文型 EPUB 的结构保真度和可读性
- 让未知标签和超出支持范围的样式进入“可控降级”路径，而不是直接丢失内容

### 3.2 成功标准

达到以下条件，即视为本阶段需求完成：

- 默认可以正确打开和阅读常见 reflowable EPUB 文本书
- 常见块级结构和行内结构不再依赖少量硬编码白名单
- CSS 能够支持正文型书籍所需的基础样式子集
- 列表、表格、代码块、图片、脚注跳转具备稳定可读的渲染结果
- 未知标签不会导致正文内容无声丢失
- 新引入的解析与样式层有对应单元测试、集成测试和真实 EPUB 样本回归

## 4. 范围定义

### 4.1 本阶段目标范围

本阶段明确支持：

- `reflowable EPUB`
- 以正文阅读为主的文本书、小说、教材、轻量文档书
- 章节内容中的常见 XHTML 结构
- 本地 CSS、字体和图片资源
- 内部链接、脚注/尾注跳转、目录跳转

本阶段的目标内容类型包括：

- 标题、段落、分节容器
- 强调、加粗、超链接、代码片段、换行
- 列表、嵌套列表、引用、代码块
- 表格、图片、图注、简单说明块
- 脚注引用、尾注引用、锚点跳转

### 4.2 本阶段明确收敛项

本阶段暂不追求：

- Fixed Layout EPUB
- 浏览器级完整 CSS 兼容
- `audio`、`video`、`canvas`、`iframe`、`form`、`script`
- 高保真 `MathML` 和复杂 `SVG`
- `flex`、`grid`、`float`、`position` 等复杂布局系统
- 复杂交互控件和脚本驱动内容
- 完整竖排、复杂双向文本和完整 ruby 排版

对上述内容，本阶段采用“显式不支持或结构化降级”的策略。

## 5. 技术路线与库选型

### 5.1 路线选择

本阶段采用以下路线：

- 保留现有 `BookParser -> SectionDocument -> LayoutEngine -> DisplayListBuilder -> CanvasRenderer` 主链路
- 仅替换和增强“章节 XHTML 解析”和“CSS 样式解析/匹配”能力
- 使用成熟第三方库承担 HTML/XHTML 解析、CSS 解析和选择器匹配
- 继续由项目自己负责 EPUB 内容模型、样式白名单、布局与 canvas 渲染

### 5.2 引入第三方库

推荐引入以下库：

| 库 | 作用 | 在本项目中的职责 |
| --- | --- | --- |
| `htmlparser2` | HTML/XML 解析 | 解析章节 XHTML，构建稳定 DOM 树 |
| `domhandler` | DOM 节点模型 | 为章节内容建立统一节点结构 |
| `css-select` | CSS 选择器匹配 | 将 CSS 规则匹配到 DOM 节点 |
| `css-tree` | CSS 解析与遍历 | 解析样式表、遍历声明、提取白名单样式 |

### 5.3 不由第三方库负责的部分

必须明确：

- EPUB ZIP 解包仍由当前资源层负责
- OPF、NAV、NCX 继续沿用当前 XML 解析主链路
- CSS 规则是否被接受，仍由本项目白名单控制
- 最终内容模型、布局算法和 canvas 绘制，仍由本项目负责

结论：第三方库只用于补强“解析与样式匹配”，不会替代当前阅读器主引擎。

## 6. 兼容目标定义

### 6.1 HTML/XHTML 结构兼容目标

本阶段应优先支持以下块级标签：

- `body`
- `section`、`article`、`main`、`div`
- `h1` 到 `h6`
- `p`
- `blockquote`
- `pre`
- `ul`、`ol`、`li`
- `dl`、`dt`、`dd`
- `figure`、`figcaption`
- `img`
- `table`、`thead`、`tbody`、`tfoot`、`tr`、`th`、`td`、`caption`
- `aside`
- `nav`
- `hr`

本阶段应优先支持以下行内标签：

- `span`
- `a`
- `em`、`i`
- `strong`、`b`
- `code`
- `br`
- `sub`、`sup`
- `small`
- `mark`
- `del`、`ins`
- inline `img`

### 6.2 降级策略

必须建立明确降级规则：

- 未识别块级标签：默认递归解析其子节点，不直接丢内容
- 未识别行内标签：默认按 `span` 处理，并继续保留子节点内容
- 不支持的 CSS 声明：忽略声明，不影响其余内容渲染
- 不支持的复杂内容：保留文本和基础结构，必要时输出受控 fallback

### 6.3 90% 覆盖的定义

“覆盖 90% 常见 reflowable EPUB 文本书”在本项目中的含义是：

- 面向常见小说、非公式密集教材、一般文档型 EPUB，正文内容可稳定阅读
- 常见结构在解析后不会明显缺失、错序或无法跳转
- 样式允许一定程度降级，但整体阅读结构和语义需要保真
- 少量高级排版能力可以不做，但不能影响主阅读流

这一定义是基于目标书籍类型的工程收口，而不是对全部 EPUB 规范能力做百分比承诺。

## 7. CSS 兼容需求

### 7.1 CSS 输入来源

系统必须支持：

- 解析 manifest 中声明的 CSS 资源
- 读取章节关联的样式表
- 读取节点内联 `style`
- 识别常见 `class`、`id` 和元素选择器

### 7.2 CSS 选择器支持范围

本阶段应支持：

- 元素选择器
- 类选择器
- ID 选择器
- 后代选择器
- 简单组合选择器

本阶段可不支持：

- 复杂伪类
- 伪元素
- 属性选择器全量语义
- 高复杂度组合器和动态状态选择器

### 7.3 CSS 白名单

本阶段应优先支持以下声明：

- `display`
- `margin-top`、`margin-bottom`、`margin-left`、`margin-right`
- `padding-top`、`padding-bottom`、`padding-left`、`padding-right`
- `font-size`
- `font-weight`
- `font-style`
- `line-height`
- `color`
- `background-color`
- `text-align`
- `text-decoration`
- `white-space`
- `width`、`max-width`
- `border`、`border-color`、`border-width`
- `vertical-align`

### 7.4 样式合并规则

系统必须支持以下样式优先级：

- 默认样式
- 外链 CSS
- 内联 `style`

系统必须支持以下样式传播行为：

- 适合继承的文本样式可继承
- 块级盒模型样式不错误继承到子块
- 白名单外声明不进入最终计算样式

## 8. 内容模型与布局要求

### 8.1 内容模型要求

系统需要把章节内容解析为比当前更完整的中间模型，至少满足：

- 节点保留 `tagName`
- 保留 `id`、`class`、`style`、`lang`、`dir`
- 行内节点与块级节点可携带计算样式
- 图片、表格、图注、脚注引用可保留结构语义
- 未知节点可进入统一降级分支

### 8.2 布局要求

在现有 `pretext + canvas` 架构下，本阶段必须补齐：

- `br` 真换行
- `pre` 保留空白
- `sub`、`sup` 的基础字号和基线偏移
- 列表 marker、缩进和嵌套层级
- 表格的基础网格布局
- `figure` 与 `figcaption` 的上下排布
- `aside`、`blockquote` 的块级样式化绘制
- inline `img` 的占位和行内布局能力

## 9. 阅读行为要求

系统必须保证以下能力在兼容增强后仍然可用：

- TOC 跳转
- 内部链接跳转
- 脚注与尾注跳转
- 搜索结果定位
- 分页模式与滚动模式切换
- 主题和字号切换后的重新布局

系统还必须保证：

- 新引入的 DOM/样式解析不会破坏当前 locator 语义
- 复杂结构不会导致搜索或命中测试直接失效

## 10. 性能与缓存要求

### 10.1 性能要求

引入第三方库后，系统仍需保持可接受的打开与重排性能：

- 章节解析应可缓存，不因重复渲染反复构建 DOM
- CSS 解析结果应缓存，不重复解析同一资源
- 计算样式应支持按章节或按节点复用
- 布局与渲染不应退回到全量 DOM 排版

### 10.2 缓存分层要求

建议建立以下缓存分层：

- 原始 XHTML 文本缓存
- DOM 中间树缓存
- CSS AST 缓存
- 计算样式缓存
- `SectionDocument` 缓存
- layout / display list 缓存

## 11. 测试与验收要求

### 11.1 测试要求

本阶段必须覆盖以下测试层级：

- HTML/XHTML 解析单元测试
- CSS 解析和白名单样式单元测试
- 章节到 `SectionDocument` 的集成测试
- `layout + canvas` 的集成测试
- demo 或 e2e 的真实 EPUB 行为测试

### 11.2 样本书籍要求

必须建立一组面向 reflowable 文本书的样本集，至少覆盖：

- 小说型章节正文
- 带脚注或尾注的章节
- 带嵌套列表的章节
- 带简单表格的章节
- 带 `figure + figcaption` 的章节
- 带基础 CSS class 样式的章节

### 11.3 验收标准

本阶段完成验收时，至少应满足：

- 新增真实 EPUB 样本在 demo 中可稳定阅读
- 常见结构不再依赖单一白名单 case 才能显示
- 不支持的内容进入明确降级路径
- `pnpm typecheck`、`pnpm test`、`pnpm build` 通过
- 关键兼容样本的回归测试稳定

## 12. 与现有模块的关系

### 12.1 保留不动的主链路

以下主链路继续保留：

- `container.xml / OPF / NAV / NCX` 解析
- 资源路径解析
- `EpubReader` 主状态机
- `LayoutEngine`
- `DisplayListBuilder`
- `CanvasRenderer`

### 12.2 重点改造区域

本阶段重点改造：

- `packages/core/src/parser/xhtml-parser.ts`
- `packages/core/src/parser/inline-parser.ts`
- 新增 HTML DOM 和 CSS 样式处理模块
- `packages/core/src/model/types.ts`
- `packages/core/src/layout/layout-engine.ts`
- `packages/core/src/renderer/display-list-builder.ts`
- `packages/core/src/runtime/reader.ts` 的文本提取、定位和命中辅助逻辑

## 13. 非目标声明

为了保持目标清晰，以下事项不属于本阶段完成标准：

- 全规范 EPUB 阅读器认证级兼容
- 浏览器级 CSS 兼容性
- 通用网页渲染引擎
- 所有 HTML5 交互元素支持
- 多媒体和脚本化 EPUB 内容支持

本阶段的核心成功标准只有一个：让当前项目在现有架构下，稳定覆盖绝大多数常见 reflowable EPUB 文本书。
