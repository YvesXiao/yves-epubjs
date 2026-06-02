# 阅读器能力短板补齐需求文档

## 1. 文档目标

本文档用于把当前 `yves-epub` 与市面成熟 EPUB 阅读器引擎对比后暴露出来的能力短板，收敛成一份可执行的需求文档。

本文档回答四个问题：

- 我们当前真正缺什么
- 哪些缺口必须优先补
- 哪些能力适合继续沿用现有自研架构补齐
- 后续如何验收“已经补齐”，而不是只停留在概念层

本文档不讨论是否替换现有引擎底座。当前结论已经明确：

- 继续保留自研 `parser + content model + hybrid renderer + unified navigation` 主线
- 不整体切换到 `epub.js` 或 `Readium`
- 重点吸收成熟方案在 `locator / annotations / preferences / accessibility baseline / reader platform capability` 上的方法论

## 2. 背景与判断

基于本轮对 `epub.js`、`Readium`、`Foliate-js`、`Paged.js`、`Vivliostyle` 的调研，以及当前仓库现状，得到以下判断：

- 我们当前强项已经不是“能打开 EPUB”
- 我们的真正优势是：
  - 自有解析层
  - 自有结构化内容模型
  - `canvas / dom` 混合渲染决策
  - 跨 backend 的统一搜索、定位、TOC 跳转和阅读状态同步
- 当前主要短板不在“基础展示”，而在“阅读器平台能力”

这里的“阅读器平台能力”特指成熟方案普遍具备，但我们当前还不完整或尚未产品化的能力：

- 标准化 locator / CFI / 持久化书签
- 面向高亮、批注、搜索命中的统一 decoration / annotation 能力
- 系统化的用户偏好与阅读设置模型
- reflowable EPUB 的 accessibility / i18n / publisher-style baseline
- 更完整的 reader capability 面，例如 RTL、FXL、TTS、Media Overlay、OPDS、DRM/LCP 等

## 3. 当前能力基线

当前仓库已经具备的核心能力包括：

- EPUB 容器、OPF、NAV/NCX、XHTML、CSS 解析
- 结构化块级内容模型，而不是直接依赖浏览器黑盒排版
- `canvas` 主路径下的确定性布局、分页、hit test、viewport mapping、长章节切片虚拟化
- 按章节复杂度在 `canvas` 与 `dom` 之间切换的混合渲染策略
- 跨 backend 的搜索结果跳转、TOC 跳转、页码与位置同步
- 真实 EPUB 样本兼容性测试与真实交互 smoke 覆盖

这意味着：

- 我们不缺“阅读器内核雏形”
- 我们缺的是“面向成熟产品的外围能力与标准化接口”

## 4. 问题定义

如果当前阶段不把这些短板显式落成需求，后续会出现三个问题：

1. 自研能力继续增长，但对外接口仍不稳定  
   结果是内部能力越来越多，外部却很难沉淀成可靠的 reader API。

2. 阅读器具备展示和跳转能力，但缺少标准 locator 和 annotation 语义  
   结果是后续做书签、高亮、批注、同步时，需要重复返工。

3. DOM fallback 已经承担复杂内容保真，但缺少成熟阅读器应有的偏好、可访问性和格式能力基线  
   结果是系统会停留在“工程 demo 很强”，但距离真正可复用平台还有明显差距。

因此，本阶段要解决的不是“继续加渲染特性”，而是：

- 把阅读器平台能力短板补成正式需求
- 按优先级分阶段补齐
- 用统一接口承载这些能力，而不是散落在 UI 或局部逻辑里

## 5. 总体目标

### 5.1 核心目标

- 建立统一、可持久化、可扩展的 `Locator` 能力模型
- 建立统一的 `Decoration / Annotation` 能力模型
- 建立统一的 `Preferences / Settings` 能力模型
- 建立 reflowable EPUB 的 `accessibility / i18n / publisher-style` 基线
- 明确中长期阅读器能力 roadmap，避免后续能力扩张失控

### 5.2 非目标

本阶段不要求一次性完成以下事项：

- 不要求立刻支持全部 EPUB 生态能力
- 不要求立刻实现 DRM/LCP
- 不要求立刻重做整套 UI
- 不要求替换现有 hybrid 架构
- 不要求为了兼容全部复杂 CSS 而继续扩大 canvas 责任面

## 6. 需求范围

### 6.1 本阶段纳入范围

- 标准 locator 与持久化定位
- 书签 / 高亮 / 批注 / 搜索命中装饰层
- 用户阅读设置与生效规则
- accessibility / i18n / publisher styles 基线
- 能力矩阵与中长期扩展路线

### 6.2 本阶段不纳入范围

- DRM/LCP 正式集成
- OPDS 书库产品能力
- 有声书、漫画、PDF 多格式统一引擎
- 完整 FXL 双页铺开产品化体验

这些能力需要先进入 roadmap，不在本需求文档内要求立即交付。

## 7. 核心短板需求

## 7.1 R1：统一 Locator / CFI / 书签能力

### 问题

当前项目已有 `Locator` 结构和跨 backend 的位置同步，但从仓库现状看：

- `cfi` 字段存在于类型中，但没有形成完整对外能力闭环
- 还没有成熟的 locator 持久化规范
- 还没有清晰的“重开书后恢复到原位置”的稳定契约
- 还没有书签模型与书内引用模型

### 目标

建立稳定的阅读位置模型，满足以下场景：

- 打开同一本书后恢复阅读位置
- 搜索结果、高亮、批注、书签都复用同一定位模型
- 在 `canvas` 和 `dom` backend 下都能尽量得到一致定位语义
- 当某种精确定位失效时，有明确的回退链路

### 需求

- 定义标准 `Locator` 分层
  - `publication-level`
  - `spine / href-level`
  - `block / anchor-level`
  - `progress-level`
  - `cfi-level`
- 明确 locator 的优先级与回退顺序
  - 优先精确锚点
  - 再回退 block
  - 再回退 section progress
  - 必要时回退 href / spine
- 提供位置序列化与反序列化能力
- 提供恢复定位失败时的诊断输出
- 提供书签实体模型
  - `id`
  - `locator`
  - `label`
  - `createdAt`
  - 可选 excerpt

### 验收标准

- 同一本书重开后可恢复到稳定阅读位置
- TOC、搜索结果、书签都基于统一 locator 模型
- 至少有一组 `canvas` / `dom` 对照测试验证恢复能力
- Demo 中能展示当前 locator 诊断信息

## 7.2 R2：统一 Decoration / Annotation 能力

### 问题

当前项目已经有搜索高亮、命中测试和部分高亮绘制能力，但还没有形成正式的 decoration / annotation 平台层。

当前缺口包括：

- 搜索命中高亮是局部能力，不是统一装饰系统
- 没有正式的高亮、下划线、批注、当前朗读标记等抽象
- 没有统一的 annotation 持久化模型
- 没有明确区分“视觉装饰”和“用户数据”

### 目标

建立统一的装饰层，使以下能力可以共享底层机制：

- 搜索结果高亮
- 用户文本高亮
- 批注标记
- 当前 active block / current reading target
- 未来的 TTS 跟读高亮

### 需求

- 定义 `Decoration` 模型
  - `id`
  - `group`
  - `locator`
  - `style`
  - `extras`
- 定义 `DecorationStyle`
  - `highlight`
  - `underline`
  - `active`
  - `search-hit`
  - 预留 margin marker / note icon
- 定义 `Annotation` 模型
  - `id`
  - `locator`
  - `quote`
  - `note`
  - `color`
  - `createdAt`
  - `updatedAt`
- `canvas` 与 `dom` 都必须支持统一 decorations 接口
- 搜索高亮迁入统一 decoration group
- 明确装饰绘制与数据存储解耦

### 验收标准

- 搜索命中、高亮、active block 至少三类装饰共用同一套接口
- `canvas` / `dom` 两条路径都能渲染基础 highlight
- 注释数据可以序列化存储，不依赖 UI 状态
- 有集成测试覆盖装饰添加、更新、移除

## 7.3 R3：统一 Preferences / 阅读设置能力

### 问题

当前项目已有 theme、fontSize、lineHeight、paragraphSpacing 及共享 style variables，但仍存在明显不足：

- 设置项仍偏实现导向，不是正式用户偏好模型
- 缺少“偏好值”和“最终生效值”的区分
- 缺少可持久化、可迁移的设置结构
- 缺少“某设置是否当前有效”的规则系统

### 目标

建立统一 Preferences 系统，支持：

- 设置持久化
- 设置恢复
- 不同出版物之间的共享与隔离
- 后续扩展 `fontFamily`、`publisherStyles`、`spread`、`scrollMode`、`theme profile`

### 需求

- 定义 `ReaderPreferences`
  - `theme`
  - `fontSize`
  - `lineHeight`
  - `paragraphSpacing`
  - `fontFamily`
  - `publisherStyles`
  - `scrollMode`
  - `spreadMode`
  - 预留 `wordSpacing`、`letterSpacing`
- 定义 `ReaderSettings`
  - 表示实际生效值
- 提供：
  - `submitPreferences`
  - `getSettings`
  - `serializePreferences`
  - `restorePreferences`
- 支持至少两类持久化策略
  - 全局共享设置
  - 单书局部设置
- Demo 层改为围绕 preferences 驱动，而不是直接散调 runtime 方法

### 验收标准

- 设置变更通过统一 preferences 接口提交
- 设置能序列化和恢复
- 能区分“用户偏好”和“当前实际生效设置”
- 有测试覆盖设置恢复和跨模式切换

## 7.4 R4：Reflowable Accessibility / I18N / Publisher Styles 基线

### 问题

与成熟方案相比，当前项目对 reflowable EPUB 的可访问性和国际化能力还没有形成系统基线。

主要短板包括：

- 缺少明确的 publisher styles 开关策略
- 缺少系统化的 reflowable baseline stylesheet 目标
- 对 hyphenation、断行、语言、RTL、阅读辅助字体等能力还没有正式需求定义
- 当前 accessibility 更多体现在 UI 层 aria，而不是阅读器内容层基线

### 目标

建立一套最小但正式的 reflowable 阅读基线，使项目从“能渲染”升级到“具备阅读系统基本素质”。

### 需求

- 定义 `publisherStyles` 策略
  - 默认行为
  - 关闭时哪些样式被抑制
  - 哪些作者样式必须保留
- 定义 reader baseline stylesheet 目标
  - 默认未样式化书籍的可读性
  - 超链接、代码、表格、图片、引用、注释的最小视觉一致性
- 纳入语言与国际化需求
  - `lang` 继承与暴露
  - RTL 进入正式需求池
  - 非拉丁文本阅读基线进入需求范围
- 纳入基础可访问性要求
  - 可提取阅读顺序文本
  - 图片 `alt`、表格 caption、脚注结构继续纳入搜索和语义
  - 提供内容级 accessibility metadata 输出接口的预留点

### 验收标准

- `publisherStyles` 成为正式设置项
- 至少有一套 reader baseline style 规则固化到代码和测试
- 至少新增一组 RTL 或非拉丁文本测试样本
- accessibility / i18n 基线写入测试矩阵

## 7.5 R5：中长期阅读器能力矩阵与 Roadmap

### 问题

当前项目中有一些行业常见能力尚未进入正式产品需求层，例如：

- RTL
- FXL / spread
- TTS / Media Overlay
- OPDS
- DRM / LCP

如果这些能力不进入 roadmap，后续会持续以零散方式进入代码，造成边界失控。

### 目标

明确哪些能力属于：

- 当前必须补齐
- 下一阶段要纳入
- 暂时只记录，不立即实现

### 需求

- 建立 reader capability matrix
- 对以下能力逐项定义状态：
  - `Now`
  - `Next`
  - `Later`
  - `Not in current phase`
- 至少覆盖：
  - RTL
  - FXL
  - spread
  - TTS
  - Media Overlay
  - OPDS
  - DRM/LCP
- 每项能力必须注明：
  - 用户价值
  - 技术影响面
  - 是否依赖 locator / decorations / preferences 基础层

### 验收标准

- 存在正式 capability matrix 文档或文档章节
- 所有新增需求必须先挂到能力矩阵上
- 不再允许“边做边决定是否算正式能力”

当前矩阵文档：

- [Reader Capability Matrix](./2026-04-18-reader-capability-matrix.md)

当前立项入口文档：

- [阅读器中长期能力立项入口](./2026-04-18-阅读器中长期能力立项入口.md)

## 8. 优先级分阶段

## P0：先补平台基础抽象

本阶段必须完成：

- `R1 Locator / CFI / Bookmark`
- `R2 Decoration / Annotation`
- `R3 Preferences / Settings`

原因：

- 这三项是后续所有阅读器能力的基础层
- 如果不先补，后面每新增一个功能都会重复发明接口

## P1：补阅读系统基线

本阶段重点完成：

- `R4 Accessibility / I18N / Publisher Styles baseline`

原因：

- 这一步决定项目是否能从“阅读引擎 demo”升级成“可复用阅读器底座”

## P2：补中长期能力规划

本阶段重点完成：

- `R5 Capability Matrix / Roadmap`
- 并为 RTL、FXL、TTS 等能力形成正式立项入口

原因：

- 这一步是为了控制后续演进，不让需求继续碎片化进入代码

## 9. 交付物要求

本需求文档对应的后续交付物至少包括：

- 一份开发任务文档
- 一份测试矩阵补充文档
- 对应的 runtime API 设计或类型设计变更
- demo 接入与诊断展示变更

## 10. 验收总标准

当以下条件同时满足时，可认为“当前短板已正式进入可执行状态”：

- 已有独立的 `Locator / Decoration / Preferences` API 设计
- 已形成对应开发任务拆分
- 已形成测试矩阵补充项
- Demo 能展示关键能力状态
- 后续 reader 新能力不再绕开这三层基础抽象直接落地

## 11. 关联文档

- [Canvas / DOM 渲染策略需求文档](./2026-04-18-canvas-dom-render-strategy-requirements.md)
- [DOM Fallback 阈值评估结论](./2026-04-18-dom-fallback-threshold-evaluation.md)
- [真实 EPUB 交互测试计划](./2026-04-17-真实EPUB交互测试计划.md)
- [真实 EPUB 交互测试结果](./2026-04-17-真实EPUB交互测试结果.md)
