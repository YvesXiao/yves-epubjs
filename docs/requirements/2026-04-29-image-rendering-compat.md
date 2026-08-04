# 图片渲染兼容需求文档

## 背景

当前 yves-epub 有 Canvas 与 DOM 两条渲染路径。Canvas 路径通过解析后的 `SectionDocument`、`LayoutEngine`、`DisplayListBuilder` 自行排版图片。DOM 路径通过 `preprocessChapterDocument` 保留章节 DOM，再由 `DomChapterRenderer` 注入阅读器 normalization CSS 和出版方 CSS。

近期发现脚注引用里的小图标，例如“注”图片，在 DOM 路径中被渲染为独立块。直接原因是 `.epub-dom-section img` 统一设置了 `display: block`、`margin: 0 auto` 和大图最大高度。该规则适合正文插图，但覆盖了行内图片的浏览器默认行为。

epubjs 的参考价值在于边界划分：reader 控制资源解析、容器尺寸、分页和加载事件；图片的 inline/block 语义优先交给原始 XHTML、出版方 CSS 和浏览器默认排版。yves-epub 需要在此基础上兼顾 Canvas 路径的一致性，以及 DOM 分页、进度、定位、搜索、标注等模块的稳定性。

## 目标

建立统一的图片语义分类和渲染策略，使 DOM 与 Canvas 在主要图片场景下表现一致：

- 行内图片保持文本流排版，例如脚注图标、公式小图、badge、emoji-like image。
- 块级图片保持正文插图排版，例如独立 `img`、`figure` 内图片、段落中只有图片的内容。
- 展示型图片保持整页呈现，例如 cover、image-page。
- 固定布局图片尊重 FXL 页面原始布局，不套用 reflowable 大图规则。
- 图片资源异步解析和加载完成后，分页、页码、进度和定位能够收敛到稳定状态。

## 非目标

本需求不引入完整浏览器级 CSS layout 引擎。Canvas 路径继续基于当前模型和 Pretext rich-inline 能力做有限兼容。

本需求不解决所有出版方 CSS 兼容问题。范围聚焦图片 display、尺寸、资源就绪、分页和进度相关影响。

本需求不改变 EPUB 解析的安全边界。外部资源、`data:`、`blob:`、脚本和事件属性仍按现有安全策略处理。

## 图片分类

图片在渲染前应被归入以下类别。分类结果应尽量来自语义和上下文，而不是单纯依赖尺寸。

| 类别               | 典型来源                                                                                                                  | DOM 行为                                                      | Canvas 行为                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| Inline image       | `a.footnote img`、`a.noteref img`、`epub:type="noteref"`、`role="doc-noteref"`、`sup/sub/small img`、文本前后混排的 `img` | `inline-block`，随文字行内排版，尺寸以 `em` 或出版方 CSS 为主 | 作为 inline fragment 参与 Pretext 行布局          |
| Block image        | 独立 `img`、`p` 中只有图片、`figure > img`                                                                                | 块级居中，限制最大宽高                                        | 作为 native image block 或 figure image 绘制      |
| Presentation image | cover、image-page、单图章节                                                                                               | 填充展示 viewport，`object-fit: contain`                      | 使用 cover/image-page 专用布局                    |
| FXL image          | `rendition:layout=pre-paginated` 内图片                                                                                   | 保留出版方布局，整体页面缩放                                  | 以 DOM/FXL 展示优先，避免转成 reflowable 图片规则 |

### 分类优先级

1. `presentationRole` 为 `cover` 或 `image-page` 时，优先归为 Presentation image。
2. `renditionLayout` 为 `pre-paginated` 时，章节内图片优先归为 FXL image。
3. 图片处于脚注引用、上标、下标、小字号等明确 inline 上下文时，归为 Inline image。
4. 图片所在块只有图片或图片在 `figure` 结构中，归为 Block image。
5. 其余情况保留浏览器默认行为或当前解析路径的 inline/block 结果。

## 状态矩阵

| 渲染路径         | 图片状态                        | 用户操作       | 期望结果                                | 副作用                                   |
| ---------------- | ------------------------------- | -------------- | --------------------------------------- | ---------------------------------------- |
| DOM paginated    | 资源 URL 尚未解析               | 首次进入章节   | 使用原路径或占位 URL 渲染，避免空白崩溃 | 资源解析完成后 patch DOM                 |
| DOM paginated    | 图片未完成 load/decode          | 测量分页       | 等待就绪屏障或使用超时兜底              | 就绪后重新测量当前 section               |
| DOM paginated    | 行内图片加载完成                | 翻页或跳转     | 页码、offset、行框稳定                  | 更新 `pages` 与 `sectionEstimatedHeight` |
| DOM paginated    | 块级图片加载完成                | 翻页或定位     | 图片作为可读 media band 参与分页        | 避免把行内小图当成独立分页 band          |
| DOM scroll       | 图片晚加载                      | 滚动阅读       | scroll height 更新后保持当前位置语义    | 捕获并恢复 scroll anchor                 |
| Canvas paginated | inline 图片 intrinsic size 晚到 | 首次布局       | 使用 fallback em 尺寸布局               | intrinsic size 到达后清缓存并重绘        |
| Canvas paginated | block 图片 intrinsic size 晚到  | 翻页或进度计算 | 先用估算高度，后用真实尺寸收敛          | 重建 display list、pages、locator map    |
| FXL DOM          | 图片资源晚到                    | 打开固定版式页 | 保持页面 viewport 和 scale 不变         | 只 patch URL，不套用 reflowable 分页重排 |

## DOM 路径需求

### Normalization CSS

DOM normalization CSS 应遵循低侵入原则：

- 普通 `.epub-dom-section img` 保留大图兜底：最大宽度、最大高度、`object-fit: contain`。
- 行内语义图片应有后置覆盖规则，恢复 `inline-block` 行内排版。
- Presentation image 继续由 `.epub-dom-presentation-image` 控制。
- FXL section 下应避免套用 reflowable 大图居中规则。若保留通用规则，应提供 FXL override 保护。
- CSS selector 应低 specificity，便于出版方 CSS 覆盖。

当前已落地的最小兼容规则：

```css
.epub-dom-section
  :where(
    a.footnote,
    a.noteref,
    a[epub\:type~="noteref"],
    a[role="doc-noteref"],
    sup,
    sub,
    small
  )
  img {
  display: inline-block;
  max-width: 1.5em;
  max-height: 1.5em;
  margin: 0 0.05em;
  vertical-align: -0.18em;
}
```

后续增强方向：识别文本前后混排的 `img`，但需避免把链接包裹的大图误判为行内图片。

### 资源就绪屏障

DOM 路径需要显式区分两个阶段：

1. Resource URL ready：`RenderableResourceManager.resolveUrl` 已将内部资源解析为可用 URL。
2. Image layout ready：`HTMLImageElement.complete` 为 true，或 `decode()` 成功，或 load/error 事件完成。

分页测量应在 Image layout ready 后执行。若超过上限时间，应使用当前布局兜底，并在晚到 load/error 后触发当前 section 重新测量。

### DOM 分页测量

`ReaderDomPaginationService.measurePaginatedDomPageOffsets` 当前会把所有 `img` 作为 media element 收集。该逻辑需要按图片类别调整：

- Block image、figure、object、video、canvas 继续作为独立 media band。
- Inline image 不应作为独立 media band 重复计入，因为它已经包含在文本 range line bands 中。
- Presentation image 和 FXL section 跳过普通 DOM 分页同步。

### 进度与定位

DOM paginated 的进度依赖 `pages`、`offsetInSection`、`sectionEstimatedHeight`。图片加载导致高度变化时，应满足：

- 当前页定位优先使用 locator 或当前 section/page 语义，而不是旧 offset 的绝对数值。
- 重新分页后 `pageNumber` 连续递增。
- `totalPagesInSection` 与 section 实测高度一致。
- 已存在的 anchor、TOC 跳转、搜索结果跳转仍落到正确 section 和可见页。

## Canvas 路径需求

### Inline image

Canvas 路径中，`LayoutEngine` 已支持 inline image 作为 Pretext fragment。后续需求：

- inline image 的默认尺寸以当前字体大小为 fallback。
- 有 `width/height`、出版方 CSS `width/height`、intrinsic size 时，按优先级计算真实尺寸。
- 行内图片应携带 href 上下文，使脚注图标点击区域与文本链接行为一致。
- inline image 参与 line height，但不扩大为 block height。

### Block image

Canvas block image 继续使用 `resolveImageLayout`。后续需求：

- 与 DOM 大图兜底保持同一组约束：最大高度比例、最大像素高度、可用宽度。
- 图片 intrinsic size 晚到时，清理 `LayoutEngine` 相关缓存，重新估算 block height。
- cover/image-page 使用展示型逻辑，避免被普通 block image 规则二次缩放。

### 资源和重绘

`RenderableResourceManager` 已在 canvas resource resolved 后触发 `onCanvasResourceResolved`。后续需求：

- canvas 资源完成时，应区分 image URL ready 与 intrinsic size ready。
- intrinsic size 变化会影响布局时，应触发 layout cache invalidation。
- 仅 URL 从 path patch 到 blob 且尺寸不变时，只需重绘，无需重排。

## 出版方 CSS 策略

当 `publisherStyles` 为 `enabled`：

- 出版方 CSS 应优先表达图片 display、尺寸、vertical-align、margin。
- reader normalization 只提供兜底和安全约束。
- 对 inline image 的 reader 规则应使用低 specificity，且避免 `!important`。

当 `publisherStyles` 为 `disabled`：

- reader 需要提供可读默认值。
- 行内脚注图片仍应按 inline 语义渲染。
- 块级图片仍应受 viewport 约束，避免溢出页面。

可选增强：为 reader normalization 使用 CSS cascade layer，使出版方普通规则自然覆盖 reader 兜底。该方案需要单独确认浏览器支持范围和测试成本。

## 模块影响

| 模块                 | 文件                                                                         | 影响                                                               |
| -------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| XHTML 解析           | `packages/core/src/parser/xhtml-parser.ts`                                   | 保留 inline image 元信息，必要时补充脚注语义元数据                 |
| DOM 预处理           | `packages/core/src/runtime/chapter-preprocess.ts`                            | 保留安全属性，如 `class`、`role`、`epub:type`，供 DOM CSS 分类使用 |
| DOM 输入             | `packages/core/src/runtime/dom-render-input-factory.ts`                      | 资源 URL 解析、出版方 CSS 开关、presentation image 输入            |
| DOM 渲染             | `packages/core/src/renderer/dom-chapter-renderer.ts`                         | DOM 序列化、normalization CSS 注入顺序                             |
| DOM 样式             | `packages/core/src/renderer/dom-chapter-style.ts`                            | 图片分类 CSS、FXL override、presentation image 规则                |
| 资源管理             | `packages/core/src/runtime/renderable-resource-manager.ts`                   | DOM patch、load/decode 监听、layout change 触发                    |
| DOM 分页             | `packages/core/src/runtime/reader-dom-pagination-service.ts`                 | 图片 band 过滤、重新测量、页码收敛                                 |
| 布局引擎             | `packages/core/src/layout/layout-engine.ts`                                  | inline image 尺寸、缓存 key、intrinsic size 变化                   |
| Canvas display       | `packages/core/src/renderer/display-list-text.ts`、`display-list-builder.ts` | inline/block 图片绘制与交互区域                                    |
| 图片布局             | `packages/core/src/utils/image-layout.ts`                                    | block image 与 DOM 大图兜底参数对齐                                |
| Reader orchestration | `packages/core/src/runtime/reader.ts`                                        | 资源晚到后的重排、重绘、scroll anchor 恢复                         |

## 验收标准

### 行为验收

- 脚注图标类图片在 DOM paginated 与 DOM scroll 中保持行内显示。
- 普通正文大图在 DOM 与 Canvas 中保持居中、等比缩放、不超出阅读区域。
- cover 和 image-page 不受行内图片规则影响。
- FXL 页面图片布局由页面整体 scale 控制，不被 reflowable 大图规则打散。
- 图片晚加载后，当前页码、总页数、进度、TOC 跳转和搜索跳转最终一致。
- 用户在图片加载中翻页、返回、切换章节时，晚到结果只作用于仍然有效的 render version。

### 测试验收

需要覆盖以下测试：

- `dom-chapter-renderer.test.ts`：normalization CSS 顺序、inline image override、presentation image 不受影响。
- `reader-dom-pagination-service.test.ts`：inline image 不作为独立 media band 重复分页，block image 仍参与分页。
- `pretext-layout.test.ts`：Canvas inline image 尺寸、margin、vertical-align、点击区域。
- `reader-image.test.ts`：图片资源晚到后 DOM patch 与 Canvas redraw 行为。
- `reader-hybrid-navigation.test.ts`：图片加载后翻页、locator、TOC 跳转稳定。
- demo e2e：用包含脚注小图、正文大图、cover、FXL 页的 fixture 做 smoke。

### 回归风险

- 将所有 `a img` 视作 inline 会误伤可点击大图。分类应优先使用 footnote/noteref 语义。
- DOM 图片 load 后重复触发分页，可能造成页码抖动。需要 render version 或 section version 屏障。
- Canvas intrinsic size 晚到后只重绘不重排，会导致命中区域、页高、进度不一致。
- 出版方 CSS 与 reader normalization 优先级冲突，会导致不同 EPUB 表现不稳定。
- FXL 页面套用 reflowable 图片规则，会破坏固定版式。

## 建议实施顺序

1. 固化图片分类模型和测试 fixture。
2. 完成 DOM inline image CSS 与 FXL override。
3. 调整 DOM 分页 media band 收集，过滤 inline image。
4. 增加 DOM 图片 load/decode 就绪屏障和 section 级重新分页。
5. 对齐 Canvas inline/block image 尺寸和资源晚到重排逻辑。
6. 补齐导航、进度、搜索、标注相关回归测试。

## 开放问题

- 是否允许在 `PreprocessedChapterNode` 上添加 reader 私有属性或 data attribute 来显式标记图片分类。
- 是否引入 CSS cascade layer 作为 reader normalization 的长期方案。
- DOM 路径图片 decode 等待上限取值需要实测，建议从 300ms 到 800ms 区间验证。
- Canvas 路径是否需要支持更多出版方 CSS 图片属性，例如 `vertical-align`、`max-width`、`max-height`。
