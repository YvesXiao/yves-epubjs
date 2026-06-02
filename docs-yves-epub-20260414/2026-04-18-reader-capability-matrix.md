# Reader Capability Matrix

## 1. 文档目标

本文档用于把 `yves-epub` 当前已经进入正式能力范围、下一阶段准备纳入、以及明确不在当前阶段实现的阅读器能力，统一收口到一份 capability matrix 中。

本文档解决三个问题：

- 当前哪些能力已经是正式能力，而不是 demo 行为
- 哪些能力应该在下一阶段进入立项，而不是继续漂浮在讨论层
- 后续新能力在进入实现前，必须先挂到矩阵的哪个状态

关联文档：

- [阅读器能力短板补齐需求文档](./2026-04-18-阅读器能力短板补齐需求文档.md)
- [阅读器能力短板补齐开发任务文档](./2026-04-18-阅读器能力短板补齐-开发任务文档.md)
- [阅读器中长期能力立项入口](./2026-04-18-阅读器中长期能力立项入口.md)

## 2. 状态定义

本矩阵统一使用以下四个状态：

- `Now`
  - 已经进入当前正式能力范围
  - 已经有代码 contract、runtime 行为和测试矩阵
  - 后续只能在既有 contract 上演进，不能再退回临时实现
- `Next`
  - 下一阶段应立项的能力
  - 当前基础依赖已基本就绪，但还没有正式实现或尚未形成产品闭环
  - 进入实现前必须先补简版立项说明
- `Later`
  - 已确认有价值，但不进入下一阶段排期
  - 依赖额外产品决策、测试资源或较大技术改造
- `Not in current phase`
  - 当前阶段明确不做
  - 只记录边界，不允许隐性进入代码

## 3. 当前能力判断

截至 `2026-04-18`，`yves-epub` 的能力状态判断如下：

- 平台基础层已经补齐：`locator / bookmark / decoration / annotation / preferences`
- 阅读系统基线已经补齐：`publisher styles / baseline stylesheet / lang+RTL 入口 / accessibility baseline`
- 下一阶段不应继续零散补功能，而应先明确中长期能力的立项边界

这意味着：

- `Now` 不是“已经完美”，而是“已经成为正式平台能力”
- `Next` 不是“马上写代码”，而是“先补立项入口，再决定实现顺序”

## 4. 能力矩阵

| 能力 | 状态 | 当前仓库判断 | 用户价值 | 技术影响面 | 基础依赖 |
| --- | --- | --- | --- | --- | --- |
| Unified Locator / Restore / Bookmark | `Now` | 已有正式 contract、恢复诊断、书签模型和 demo 最小闭环 | 稳定恢复阅读位置，统一 TOC/搜索/书签/批注定位 | `types`、`runtime/locator`、`reader`、demo 持久化 | `locator` 自身是基础层 |
| Decoration / Annotation | `Now` | 已有 decorations group、annotation 数据模型、`canvas/dom` 基础接线 | 统一搜索高亮、批注、高亮和后续 active/TTS 标记 | `reader`、`canvas` 渲染、DOM decorations、搜索链路 | 依赖 `locator` |
| Preferences / Settings | `Now` | 已有偏好值与生效值 contract，demo 已通过 preferences 驱动 | 稳定管理主题、字号、阅读模式、publisher styles 等设置 | `types`、`runtime/preferences`、`reader`、demo 持久化 | 独立基础层 |
| Publisher Styles | `Now` | 已成为正式设置项，DOM/canvas 都遵守同一策略 | 给复杂 EPUB 提供可解释的样式保留与覆盖行为 | `reader`、DOM render input、content model style 清洗 | 依赖 `preferences` |
| Reader Baseline Stylesheet | `Now` | 已有 `default-reflowable` baseline profile 和双路径样式基线 | 保证弱样式 EPUB 也具备最小可读性 | `reading-style-profile`、DOM baseline CSS、canvas profile | 依赖 `preferences` |
| Lang / RTL Baseline | `Now` | 已有 `lang` 暴露、方向推断、`experimentalRtl` 开关和测试样本 | 让非拉丁文本和 RTL 不再停留在隐性需求 | parser、chapter preprocess、reader、DOM wrapper/style | 依赖 `preferences`，与 baseline 紧耦合 |
| Accessibility Baseline | `Now` | 已有 section/publication accessibility snapshot 和搜索一致性测试 | 让语义阅读顺序、alt/caption/footnote/dl 成为正式平台输出 | `runtime/accessibility`、`reader`、搜索一致性 | 依赖 `locator`，后续服务 `annotation/TTS` |
| RTL Productization | `Next` | 已有方向基线，但还没有 page progression、导航语义和 paginated 产品化 contract | 让 RTL 从“可显示”升级到“可稳定使用” | 导航、分页、交互方向、DOM/canvas 对齐 | 依赖 `preferences`，复用 `reading-language` 和 `locator` |
| Fixed Layout (FXL) | `Next` | 当前仅有 `presentationRole` 等少量入口，没有正式 FXL reader contract | 支持图文固定版式出版物和更完整 EPUB 生态 | 解析层、viewport/layout 策略、DOM sandbox、分页与手势 | 依赖 `preferences`，部分复用 `locator` |
| Spread / Synthetic Spread | `Next` | 目前只具备单页 paginated，未形成 spread model | 提升大屏阅读和 FXL/横屏场景体验 | pagination model、viewport metrics、navigation、settings | 依赖 `preferences`，与 FXL 强关联 |
| TTS / Read Aloud | `Next` | 当前只有 decorations 和 accessibility 入口，还没有朗读 contract | 提升可访问性和伴随阅读能力 | 语义读取、朗读队列、active decoration、事件模型 | 强依赖 `locator`、`decoration`、`accessibility` |
| Media Overlay | `Later` | 当前没有 SMIL/media overlay 解析与时间轴同步能力 | 支持音频与文本同步阅读 | parser、timeline、resource loading、同步定位 | 依赖 `locator`、`decoration`，与 TTS 相关但不同源 |
| OPDS | `Later` | 当前只聚焦本地/输入级打开，不包含书库能力 | 支持目录发现、下载与分发流程 | 网络层、认证、下载、书架与元数据管理 | 与当前 reader 核心弱耦合 |
| DRM / LCP | `Not in current phase` | 当前明确不纳入实现范围 | 对受保护内容发行有价值，但成本和风险高 | 解密链路、license、资源访问、测试资产、产品合规 | 需要独立安全与产品决策，不能直接挂现有 reader |

## 5. 进入规则

后续新能力进入实现前，必须先满足以下规则：

1. 先在本矩阵中挂到 `Now / Next / Later / Not in current phase` 之一。
2. 如果状态是 `Next`，必须补一份简版立项说明，再进入代码任务拆分。
3. 如果状态是 `Later` 或 `Not in current phase`，不得以“顺手支持”的形式隐性进入运行时代码。
4. 如果某项能力改变状态，必须先更新本矩阵，再更新需求文档或开发任务文档。

## 6. 下一步建议

基于当前矩阵，推荐下一步按以下顺序推进：

1. 基于已完成的 proposal 文档，在 `RTL Productization / FXL / Spread / TTS` 中选定下一轮实现项。
2. 优先考虑 `RTL Productization / FXL / Spread`，因为它们直接影响阅读器主交互模型。
3. `TTS` 适合在主交互模型稳定后进入，因为它已经具备 `locator / decoration / accessibility` 三层前置能力。
4. `Media Overlay / OPDS` 继续保持 `Later`，先不进入实现。
5. `DRM / LCP` 继续保持 `Not in current phase`，避免在没有产品和合规决策的情况下进入代码。
