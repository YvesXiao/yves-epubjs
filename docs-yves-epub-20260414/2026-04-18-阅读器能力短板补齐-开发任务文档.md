# 阅读器能力短板补齐开发任务文档

## 1. 文档目标

本文档用于将《阅读器能力短板补齐需求文档》拆分为可执行开发任务，作为当前仓库补齐“阅读器平台能力”的顺序、边界和验收依据。

约束原则：

- 所有任务必须围绕现有自研 `parser + content model + hybrid renderer + unified navigation` 主线展开
- 不允许为了补能力而整体替换当前引擎底座
- 先补平台抽象，再补产品能力，不允许跳步
- 每个任务都必须同时明确代码输出、测试要求和交付标准
- 未完成当前阶段，不进入下一阶段

关联文档：

- [阅读器能力短板补齐需求文档](./2026-04-18-阅读器能力短板补齐需求文档.md)
- [Reader Capability Matrix](./2026-04-18-reader-capability-matrix.md)
- [阅读器中长期能力立项入口](./2026-04-18-阅读器中长期能力立项入口.md)
- [Canvas / DOM 渲染策略需求文档](./2026-04-18-canvas-dom-render-strategy-requirements.md)
- [Canvas / DOM 渲染策略开发任务文档](./2026-04-18-canvas-dom-render-strategy-开发任务文档.md)
- [真实 EPUB 交互测试结果](./2026-04-17-真实EPUB交互测试结果.md)

## 2. 总体执行规则

### 2.1 任务规则

- 每个任务必须有明确代码落点
- 每个任务必须同步考虑 `packages/core`、`packages/demo`、测试和文档影响
- 涉及公共 API 的任务必须先落类型与 contract，再落 runtime 行为
- 新能力不得绕开 `reader` 主状态层直接挂到 demo UI
- 新能力若影响 `canvas / dom` 两条路径，必须显式说明双路径行为

### 2.2 测试规则

- 每个任务至少包含单元测试
- 涉及 runtime 行为的任务必须补 reader 集成测试
- 涉及真实交互语义的任务必须补 demo 验证步骤或 e2e
- 涉及持久化与恢复的任务必须补 serialize / restore 对照测试
- 涉及 `canvas / dom` 共用能力的任务必须补双 backend 对照测试

### 2.3 完成定义

一个任务只有在以下条件都满足时才算完成：

- 代码完成
- 测试完成并通过
- 类型检查通过
- demo 或文档已同步
- 不破坏现有 `scroll / paginated / search / toc / navigation / diagnostics` 核心能力

## 3. 当前执行状态

记录时间：`2026-04-18`

当前阶段：

- `P0` 已完成
- `P1` 已完成
- `P2-T1` 已完成
- `P2-T2` 已完成

当前目标：

- 后续按 proposal 决定 `RTL Productization / FXL / Spread / TTS` 的下一轮实现顺序

## 4. 本轮范围与非范围

### 4.1 本轮范围

- 统一 locator / 书签 / 恢复定位
- 统一 decoration / annotation 抽象
- 统一 preferences / settings 抽象
- reader baseline 中的 publisher styles / i18n / accessibility 基础项
- 能力矩阵与后续 roadmap 文档

### 4.2 本轮非范围

- DRM / LCP 正式集成
- OPDS 产品化接入
- 完整 TTS 与 Media Overlay 实现
- 完整 FXL 双页阅读器产品化
- 大规模重写 demo 视觉层

## 5. 分阶段任务拆分

## P0. 平台基础抽象

### P0-T1. 收口统一 Locator Contract

状态：

- 已完成

目标：

- 为 `reader` 暴露稳定的统一定位模型
- 明确 `href / anchor / block / progress / cfi` 的层级关系和回退顺序
- 让搜索、TOC、书签、批注共享同一定位契约

代码输出：

- `packages/core/src/model/types.ts`
  - 收口 `Locator` 类型
- 新增 locator helper 模块
  - 序列化 / 反序列化
  - locator 归一化
  - locator 回退规则
- `packages/core/src/runtime/reader.ts`
  - 新增或补齐对外定位 API
- 必要时新增 locator diagnostics helper

测试要求：

- 单元测试覆盖 locator normalize / serialize / restore
- 集成测试覆盖：
  - TOC 跳转后导出 locator
  - 搜索跳转后导出 locator
  - 同一 locator 在 `canvas / dom` 两种章节中的恢复行为
- `pnpm typecheck`

交付标准：

- `Locator` 成为正式对外能力，而不是零散字段集合
- Demo 可显示当前 locator 关键信息

### P0-T2. 建立书签与恢复定位能力

状态：

- 已完成

目标：

- 基于统一 locator 增加书签模型
- 支持同一本书的阅读位置恢复
- 明确“恢复失败”的回退链路和诊断输出

代码输出：

- 书签类型与序列化模型
- `reader` 级书签创建 / 恢复接口
- demo 层基础书签操作入口
- 恢复定位失败时的 diagnostics 输出

测试要求：

- 单元测试覆盖 bookmark serialize / deserialize
- 集成测试覆盖：
  - 保存当前位置
  - 重开后恢复位置
  - anchor/block 失效时回退到 progress / href
- demo 手工验证步骤

交付标准：

- 书签与恢复定位都基于 `Locator`
- 不新增第二套位置模型

### P0-T3. 建立统一 Decoration Contract

状态：

- 已完成

目标：

- 为搜索命中、高亮、active block 等能力提供统一 decoration 抽象
- 区分“视觉装饰”和“用户 annotation 数据”
- 为后续批注和 TTS 跟读预留统一接口

代码输出：

- `Decoration`
- `DecorationStyle`
- decoration group / 生命周期管理接口
- `reader` 级 decorations API
- `canvas` 路径 decoration 渲染适配
- `dom` 路径 decoration 渲染适配

测试要求：

- 单元测试覆盖 decoration add / update / remove
- 集成测试覆盖：
  - 搜索高亮迁入 decoration 后行为不回退
  - active block decoration 正常更新
  - `canvas / dom` 两条路径都能显示基础 highlight
- `pnpm typecheck`

交付标准：

- 搜索高亮不再是特殊逻辑分支
- decoration 成为统一平台层能力

### P0-T4. 建立 Annotation 数据模型

状态：

- 已完成

目标：

- 在 decoration 之上建立 annotation 数据模型
- 支持高亮附注、quote、颜色与时间戳等基础字段
- 与 UI 展示解耦

代码输出：

- `Annotation` 类型
- annotation serialize / restore helper
- annotation 与 decoration 的映射关系
- demo 层最小 annotation 展示或调试入口

测试要求：

- 单元测试覆盖 annotation 数据模型稳定性
- 集成测试覆盖 annotation -> decoration 映射
- 至少一条恢复 annotation 的回归测试

交付标准：

- annotation 数据存储不依赖瞬时 UI 状态
- 后续批注产品能力可以直接挂接

### P0-T5. 建立统一 Preferences / Settings Contract

状态：

- 已完成

目标：

- 把当前 `theme / fontSize / lineHeight / paragraphSpacing / mode` 等设置，收口为正式 preferences 能力
- 明确“用户偏好值”和“运行时实际生效值”的区分
- 为 publisher styles、spread、font family 等扩展项建立入口

代码输出：

- `ReaderPreferences`
- `ReaderSettings`
- preferences submit / restore / serialize API
- runtime 中 preferences 到实际渲染行为的映射层
- demo 层改为通过 preferences 驱动

测试要求：

- 单元测试覆盖 preferences normalize / merge / restore
- 集成测试覆盖：
  - 切换主题与字号
  - 切换 scroll / paginated
  - 恢复设置后 reader 状态一致
- `pnpm typecheck`

交付标准：

- demo 不再直接散调多个 runtime setter
- settings 与 preferences 边界清晰

## P1. 阅读系统基线补齐

### P1-T1. 引入 Publisher Styles 正式策略

状态：

- 已完成

目标：

- 把 `publisherStyles` 从概念变成正式设置项
- 明确作者样式保留与覆盖边界
- 为复杂 EPUB 提供可解释的样式行为

代码输出：

- `publisherStyles` 设置项
- baseline 样式覆盖策略
- DOM / canvas 共同遵守的样式优先级约束
- demo 控制项与诊断展示

测试要求：

- 单元测试覆盖 publisher styles 开 / 关
- 集成测试覆盖：
  - 链接、代码、表格、引用、图片等基础元素行为
  - legacy 样式书籍在开 / 关状态下的差异
- 真实 EPUB focused retest

交付标准：

- 样式行为可解释、可切换、可测试

### P1-T2. 建立 Reader Baseline Stylesheet

状态：

- 已完成

目标：

- 为未充分样式化或样式质量差的 EPUB 建立最小可读性基线
- 统一链接、代码、表格、注释、图片、引用等基础阅读视觉

代码输出：

- baseline style profile 或等价实现
- DOM 路径样式注入策略
- canvas 路径对应 style profile 补齐
- demo 诊断中暴露当前 baseline profile

测试要求：

- 单元测试覆盖 style profile 输出
- 集成测试覆盖基础元素视觉相关行为
- 回归测试验证不破坏当前兼容样本

交付标准：

- baseline 样式成为正式能力，不再散落在局部实现中

### P1-T3. 补语言、断行与 RTL 基础能力

状态：

- 已完成

目标：

- 明确 `lang` 的继承与暴露
- 把 RTL 拉进正式测试范围
- 为非拉丁文本与断行策略建立基础能力边界

代码输出：

- `lang` 相关 runtime 暴露
- RTL capability 标志位或实验开关
- 必要的 style / layout 适配入口
- 新增测试样本或 fixture

测试要求：

- 单元测试覆盖 `lang` 传递
- 集成测试覆盖至少一组 RTL 或非拉丁文本章节
- 测试矩阵补充相关条目

交付标准：

- RTL 不再停留在“以后再说”的隐性需求
- 至少有一套正式测试样本进入仓库

### P1-T4. 建立内容级 Accessibility 基线

状态：

- 已完成

目标：

- 把当前 parser/content model 已有的语义能力进一步沉淀为阅读器 accessibility 基线
- 明确哪些语义必须对搜索、导出、阅读顺序和后续辅助能力可见

代码输出：

- 内容级 accessibility diagnostics 或导出接口
- 语义结构最小约束说明
- 与 annotation / TTS 后续能力兼容的语义读取入口

测试要求：

- 单元测试覆盖：
  - alt text
  - figure caption
  - table caption
  - footnote / aside
  - definition list
- 集成测试覆盖搜索与语义输出一致性

交付标准：

- accessibility 基线写入测试，不再只停留在 UI aria

## P2. 能力矩阵与后续路线

### P2-T1. 建立 Reader Capability Matrix

状态：

- 已完成

目标：

- 把尚未正式实现的行业常见能力纳入统一矩阵
- 明确 `Now / Next / Later / Not in current phase`

代码输出：

- 独立能力矩阵文档或纳入现有文档章节
- 能力状态定义
- 新需求挂载规则

测试要求：

- 文档任务，无运行测试
- 需与现有需求文档、开发任务文档交叉校对

交付标准：

- 后续新能力进入实现前，必须先出现在 capability matrix

### P2-T2. 为 RTL / FXL / TTS / Media Overlay / OPDS / DRM-LCP 建立立项入口

状态：

- 已完成

目标：

- 为中长期能力建立正式立项模板，避免后续零散进入代码

代码输出：

- 每项能力的简版立项说明
  - 用户价值
  - 技术影响面
  - 对 locator / decoration / preferences 的依赖
  - 是否需要新测试资源

测试要求：

- 文档任务，无运行测试

交付标准：

- 后续路线清晰，不再出现边做边定义的状态

## 6. 推荐执行顺序

推荐严格按以下顺序推进：

1. `P0-T1 Locator Contract`
2. `P0-T2 书签与恢复定位`
3. `P0-T3 Decoration Contract`
4. `P0-T4 Annotation 数据模型`
5. `P0-T5 Preferences / Settings Contract`
6. `P1-T1 Publisher Styles`
7. `P1-T2 Baseline Stylesheet`
8. `P1-T3 Lang / RTL`
9. `P1-T4 Accessibility baseline`
10. `P2-T1 Capability Matrix`
11. `P2-T2 中长期能力立项入口`

说明：

- `P0` 是平台基础层，不能跳过
- `P1` 是阅读器系统基线，依赖 `P0`
- `P2` 是路线控制层，适合在 `P0/P1` 初步稳定后补齐

## 7. 交付物清单

本任务文档对应的后续交付物至少包括：

- `packages/core` 中新增或调整的公共类型与 helper
- `packages/core/test` 中新增的单元测试与 reader 集成测试
- `packages/demo` 中新增的最小能力入口与诊断展示
- 一份测试矩阵补充文档
- 一份 reader capability matrix 文档

## 8. 验收总标准

当以下条件同时满足时，可认为“阅读器能力短板补齐”进入稳定实施阶段：

- `Locator / Decoration / Preferences` 三层基础抽象已落地
- 搜索、TOC、书签、批注不再各自维护独立状态模型
- demo 已通过统一 API 消费这些能力
- accessibility / i18n / publisher styles 基线已进入测试矩阵
- 中长期能力已纳入 capability matrix，不再隐性漂移进代码

## 9. 后续建议

执行上建议按两轮推进：

- 第一轮只做 `P0`
- 第二轮再做 `P1 + P2`

原因：

- 当前项目已经有较强 runtime 主体能力
- 现在最需要的是平台层 contract 收口
- 如果 `P0` 不先完成，`P1` 很容易再次落成局部 patch，而不是稳定能力
