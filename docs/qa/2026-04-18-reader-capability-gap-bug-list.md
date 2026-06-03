# 阅读器能力短板补齐 Bug 清单

## 1. 文档目标

本文档用于把本轮代码扫查、需求对齐和真实 EPUB 交互回归中发现的问题，收敛成一份可执行 bug/backlog 清单。

这里明确区分两类事项：

- `Bug`：已有能力存在行为错误、交互缺口、错误反馈或工程结构风险
- `Gap`：需求文档中明确提出，但当前仍未闭环的能力缺口

处理原则：

1. 先修真实书已复现、影响用户交互闭环的问题
2. 再修会持续放大复杂度或重复代码的系统性问题
3. 最后补需求文档中的能力缺口

## 2. 当前结论

本轮结果：

- 真实 EPUB 打开、TOC 跳转、分页翻页主链路基本稳定
- 已修复 3 个已确认 bug，其中 1 个来自真实书回归
- 已识别 4 个需求未完全满足的 gap
- 已完成 2 个工程结构收口项

## 3. Bug / Gap 列表

| ID | 类型 | 优先级 | 状态 | 问题 |
| --- | --- | --- | --- | --- |
| B1 | Bug | P0 | Closed | `canvas` 书在真实搜索跳转后，search/annotation overlay 不稳定缺失 |
| B2 | Bug | P1 | Closed | Demo 缺少 locator/restore diagnostics 展示，定位问题成本高 |
| B3 | Bug | P1 | Closed | `reader.ts` 多处 `section.id -> index` 线性查找，热路径重复开销偏高 |
| G1 | Gap | P1 | Closed | `CFI` 仍停留在字段保留，没有恢复与定位闭环 |
| G2 | Gap | P1 | Closed | `DecorationStyle` 缺少 `underline`、margin marker / note icon 扩展口 |
| G3 | Gap | P1 | Closed | `Preferences` 缺少 `fontFamily / wordSpacing / letterSpacing`，也没有双持久化策略 |
| G4 | Gap | P2 | Closed | Demo 未展示 locator diagnostics，与需求文档验收标准不一致 |

## 4. 详细说明

### B1：Canvas 搜索跳转后的 overlay 闭环不稳定

- 类型：`Bug`
- 优先级：`P0`
- 状态：`Closed`

#### 现象

在真实书 `Introduction_to_Algorithms...epub` 上执行：

1. 打开图书
2. 通过 TOC 进入正文
3. 切换 `Paginated`
4. 搜索 `I Foundations`
5. 点击搜索结果
6. 点击 `Add Highlight`

结果：

- 搜索跳转成功
- 页码和当前位置更新成功
- 但 demo 没有出现 search overlay
- 也没有出现 annotation overlay

#### 影响

- 用户看到“跳了位置”，但看不到当前命中位置
- `search -> jump -> highlight` 这条真实阅读闭环不完整
- 目前 overlay 能力对 `dom` 路径更稳，对 `canvas` 路径不一致

#### 初步判断

更可能是系统性定位问题，而不是 demo 单点样式问题：

- `goToSearchResult()` 对 `canvas` 结果没有精确 realign
- `findPageForLocator()` 当前按页找 block 时只看页内顶层 block
- 对嵌套 `nav / list / table / definition-list` 中的叶子 block 不稳定

#### 修复方向

- 先从 core 修正“页是否包含某 block”的判断，支持嵌套 block
- 保证 `search result locator -> target page -> visible rect` 在 `canvas` 下闭环
- 不在 demo 层做针对个别书籍的 fallback 补丁

#### 验收

- 新增核心测试覆盖“嵌套 block 搜索结果 -> 正确页 -> 可见 rect”
- 真实书 `Introduction_to_Algorithms...epub` 复测后，search/annotation overlay 都可见

#### 修复结果

- core 侧补了“嵌套 leaf block -> renderable block / page membership / viewport rect” 的统一解析
- demo 没有再加个别书籍 fallback
- 重新跑 `/Users/xyf/Downloads/books` 下真实样本，`canvas`/`dom` 混合书都通过 smoke

### B2：Demo 缺少 locator / restore diagnostics

- 类型：`Bug`
- 优先级：`P1`
- 状态：`Closed`

#### 现象

core 已有：

- `getCurrentLocation()`
- `getLastLocationRestoreDiagnostics()`

但 demo 诊断面板没有展示：

- 当前 locator
- restore precision
- fallbackApplied
- restore reason

#### 影响

- 遇到定位问题时，调试成本高
- 与需求文档中“Demo 展示 locator 诊断”的验收标准不一致

#### 修复方向

- 在 demo snapshot 和 diagnostics panel 中加入 locator / restore diagnostics
- 控制展示粒度，避免把整份 JSON 生硬堆到 UI

#### 修复结果

- demo snapshot 已接入 `locator` 与 `lastLocationRestoreDiagnostics`
- diagnostics panel 现展示 `Locator / Restore / Restore Match / Restore Reason`
- 新增 smoke 用例覆盖 `Save Bookmark -> Restore Bookmark -> diagnostics 更新`

### B3：Section 索引查询在热路径重复线性扫描

- 类型：`Bug`
- 优先级：`P1`
- 状态：`Closed`

#### 现象

`reader.ts` 多处存在：

- `this.book.sections.findIndex((section) => section.id === sectionId)`

分布在：

- DOM 装饰同步
- hit test
- visible diagnostics
- section lookup

#### 影响

- 当前规模还能接受
- 但随着 visible section 数量、search/decorations 数量增加，会持续放大重复开销
- 也让逻辑分散，容易出现“同一个 section lookup 写多遍”

#### 修复方向

- 收口成统一 `sectionId -> spineIndex` 索引访问
- 保证 book 切换或直接赋值时仍安全工作

#### 修复结果

- `reader.ts` 已增加统一 `sectionIndexById` 索引访问
- `open()` 时会主动重建索引
- 查询 helper 还带线性兜底与缓存回写，兼容测试和直接注入 `book` 的内部路径

### G1：CFI 仍未闭环

- 类型：`Gap`
- 优先级：`P1`
- 状态：`Closed`

#### 现状

- `Locator` 上有 `cfi`
- precision 也支持 `cfi`
- 但没有 CFI 解析、恢复、定位映射、失败诊断链路

#### 影响

- `R1 Locator / CFI / Bookmark` 只能算部分完成

#### 修复结果

- `locator` 恢复链路已支持 `cfi-only` 输入，不再要求必须同时带 `href / spineIndex`
- `Bookmark` / `Annotation` 持久化时会显式生成 best-effort `CFI`
- `CFI` 恢复会优先尝试 qualifier 对应的 `anchor / block`，失败后再按 reading-order step 回退
- demo 书签恢复诊断已升级到 `cfi -> cfi`

### G2：DecorationStyle 谱系不完整

- 类型：`Gap`
- 优先级：`P1`
- 状态：`Closed`

#### 现状

当前只有：

- `highlight`
- `search-hit`
- `active`

文档里要求但未落地：

- `underline`
- margin marker / note icon 扩展口
- `extras`

#### 修复结果

- `Decoration` 模型已补 `extras`
- `DecorationStyle` 已补 `underline`
- DOM decorations 已支持 `underline`，并为 `margin-marker / note-icon` 保留正式 hint class
- canvas 路径已支持 `underline` decoration 输出到 draw op

### G3：Preferences 未达到完整需求范围

- 类型：`Gap`
- 优先级：`P1`
- 状态：`Closed`

#### 现状

已完成：

- `mode`
- `publisherStyles`
- `experimentalRtl`
- `spreadMode`
- `theme`
- `typography`

未完成：

- `fontFamily`
- `wordSpacing`
- `letterSpacing`
- “全局共享 + 单书局部”两类持久化策略

#### 修复结果

- `ReaderPreferences / ReaderSettings` 已补 `fontFamily / letterSpacing / wordSpacing`
- reader 容器、DOM baseline 和 CSS variables 已接入这些字段
- demo 已新增 `Font Family / Letter Spacing / Word Spacing` 控件
- demo 持久化已拆成“全局共享 theme+typography”与“单书局部 mode+spread+publisherStyles+rtl”

### G4：Demo locator diagnostics 验收未满足

- 类型：`Gap`
- 优先级：`P2`
- 状态：`Closed`

说明：

- 本项与 `B2` 有关联
- 若 `B2` 修复完成，本项可一并关闭

## 5. 修复顺序

### 第一批

- `B1 canvas overlay 闭环`

### 第二批

- `B2 demo locator diagnostics`
- `B3 section index 结构收口`

### 第三批

- `G2 decoration style 谱系`
- `G3 preferences 完整字段与持久化策略`

## 6. 本轮执行记录

- `2026-04-18`：建立清单，开始处理 `B1`
- `2026-04-18`：完成 `B1`，新增嵌套 block canvas 搜索回归，并复测真实书 `Introduction_to_Algorithms...epub`
- `2026-04-18`：完成 `B2` / `G4`，demo diagnostics 接入 `locator / restore diagnostics`，新增 bookmark restore smoke
- `2026-04-18`：完成 `B3`，把 `reader.ts` 的 section 索引查找收口为统一 helper，并补上直接注入 `book` 场景的 lazy fallback
- `2026-04-18`：重跑 `/Users/xyf/Downloads/books` 下 6 本真实 EPUB smoke，全部通过，无新增 console/page error
- `2026-04-18`：完成 `G1`，补齐 `CFI` 恢复链路与持久化生成，并补过 `locator/bookmark/annotation/demo smoke` 回归
- `2026-04-18`：完成 `G2`，补齐 `underline / extras / hint reserve`，并补过 `decoration manager / dom / canvas / reader` 回归
- `2026-04-18`：完成 `G3`，补齐 typography 扩展字段与 demo 双持久化策略，并补过 `preferences / typecheck / demo build / smoke`
