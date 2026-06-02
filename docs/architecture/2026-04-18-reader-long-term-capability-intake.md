# 阅读器中长期能力立项入口

## 1. 文档目标

本文档用于为 `yves-epub` 下一阶段可能进入正式实现的中长期能力建立统一立项入口。

本文档不直接批准实现，而是先把每项能力的：

- 用户价值
- 当前缺口
- 技术影响面
- 对 `locator / decoration / preferences / accessibility` 基础层的依赖
- 新测试资源需求

固定下来，避免后续再次出现“边做边定义”的状态。

关联文档：

- [Reader Capability Matrix](./2026-04-18-reader-capability-matrix.md)
- [阅读器能力短板补齐需求文档](./2026-04-18-阅读器能力短板补齐需求文档.md)
- [阅读器能力短板补齐开发任务文档](./2026-04-18-阅读器能力短板补齐-开发任务文档.md)

## 2. 立项使用规则

- 本文档中的每项能力都必须先在 capability matrix 中有状态，再进入代码层任务拆分。
- `Next` 级能力可以基于本文档继续拆开发任务。
- `Later` 级能力只保留说明，不进入当前排期。
- `Not in current phase` 能力只记录边界，未经重新评审不得进入运行时代码。

## 3. 当前建议优先级

建议下一阶段按以下顺序考虑：

1. `RTL 产品化增强`
2. `FXL`
3. `Spread / Synthetic Spread`
4. `TTS / Read Aloud`
5. `Media Overlay`
6. `OPDS`
7. `DRM / LCP`

排序依据：

- 与当前 reader 核心链路耦合程度
- 是否已经具备基础能力前置条件
- 是否需要新的解析模型、测试资源或产品体系

## 4. 能力立项说明

### 4.1 RTL 产品化增强

矩阵状态：

- `Next`

用户价值：

- 让阿拉伯语、希伯来语等语言的阅读体验从“可展示”升级到“可产品化使用”
- 让页翻方向、阅读进度和交互语义与 RTL 用户习惯一致

当前缺口：

- 现在只有 `lang`、方向推断和 `experimentalRtl` 基线入口
- 还没有页翻方向、spine progression、导航顺序、手势语义的正式模型
- `canvas` 路径和 paginated 路径还没有经过系统 RTL 产品化验证

技术影响面：

- `reader` 导航与进度模型
- paginated page ordering
- scroll / paginated 的交互语义
- DOM / canvas 双路径对齐
- demo 与 diagnostics 的方向信息展示

基础依赖：

- 依赖 `preferences`
- 复用现有 `reading-language` 和 accessibility baseline
- 与 `locator` 语义有中度耦合，尤其是页翻方向和章节跳转

新测试资源需求：

- 需要新增多章节 RTL 样本，而不只是单章样本
- 需要至少一组 paginated RTL 导航测试
- 需要 DOM / canvas 双路径 focused retest

建议立项边界：

- 本轮只覆盖 reflowable RTL 产品化
- 不在本项中引入 FXL RTL 或混排高级排版特性

### 4.2 FXL

矩阵状态：

- `Next`

用户价值：

- 支持图文固定版式 EPUB，覆盖儿童书、漫画、教材和设计导向出版物
- 让 `yves-epub` 从 reflowable reader 扩展到更完整的 EPUB 形态

当前缺口：

- 当前 reader 主线仍以 reflowable 为核心
- 只有少量 `presentationRole` 入口，没有正式 FXL contract
- 没有 viewport fitting、page box、spread behavior、资源预加载策略

技术影响面：

- OPF / manifest / spine property 解析
- section render strategy
- viewport / zoom / pan
- page navigation 与 hit testing
- 资源加载和渲染缓存

基础依赖：

- 依赖 `preferences`，尤其是阅读模式和可能新增的 zoom / fit 策略
- 可部分复用 `locator`
- 与当前 `canvas` 文本布局主线弱耦合，更偏 DOM / scene container 策略

新测试资源需求：

- 需要新增真实 FXL EPUB 样本
- 需要 spread、横竖屏、不同 viewport 尺寸样本
- 需要视觉回归或手工验收步骤

建议立项边界：

- 第一阶段只做单页 FXL 打开、缩放和定位
- spread 可作为后续子项，而不是和 FXL 首轮绑定交付

### 4.3 Spread / Synthetic Spread

矩阵状态：

- `Next`

用户价值：

- 改善大屏、横屏和平板上的阅读体验
- 为 FXL 与特定教材场景提供更自然的双页阅读方式

当前缺口：

- 当前 paginated 只有单页模型
- 没有 spread 偏好、page pairing、blank page insertion、page progression contract

技术影响面：

- pagination data model
- page metrics 和 viewport partition
- current page / total pages 语义
- locator 到 spread 内页的映射
- TOC、搜索跳转和书签恢复后的落页行为

基础依赖：

- 强依赖 `preferences`
- 依赖 `locator`
- 与 FXL 强耦合，但也可先在 reflowable paginated 中建立 contract

新测试资源需求：

- 需要双页 paginated 样本
- 需要章节边界与奇偶页测试
- 需要恢复定位和跳转对照测试

建议立项边界：

- 先建立 spread mode contract
- 再决定是否同时覆盖 reflowable + FXL

### 4.4 TTS / Read Aloud

矩阵状态：

- `Next`

用户价值：

- 提升可访问性
- 支持伴随阅读、学习和辅助理解场景
- 为后续 Media Overlay 和 active reading 提供平台能力

当前缺口：

- 虽然已有 decorations 和 accessibility snapshot，但还没有语义分段朗读 contract
- 没有朗读队列、当前朗读单元、暂停恢复和 active decoration 规则
- 没有宿主语音能力适配边界

技术影响面：

- accessibility snapshot 的消费模型
- `reader` 事件与状态机
- decorations active group
- locator 与当前朗读位置同步
- demo 控制入口与诊断

基础依赖：

- 强依赖 `locator`
- 强依赖 `decoration`
- 强依赖 `accessibility`
- 对 `preferences` 有轻度依赖，例如语速、声音、自动滚动

新测试资源需求：

- 需要语义分段样本，覆盖 heading、figure caption、footnote、definition list
- 需要朗读位置同步测试
- 需要 mock speech API 或 host adapter 测试桩

建议立项边界：

- 第一阶段只做 `Read Aloud contract + active decoration + locator sync`
- 不把浏览器或平台语音兼容问题全部塞进首轮

### 4.5 Media Overlay

矩阵状态：

- `Later`

用户价值：

- 支持音频与文本同步阅读
- 对教育出版、童书和有声增强内容有明确价值

当前缺口：

- 没有 SMIL / media overlay 解析
- 没有 timeline、cue、音频同步和播放控制模型
- 当前 accessibility/TTS 链路只能提供文本侧基础能力

技术影响面：

- parser 扩展
- 时间轴状态机
- 资源装载
- active decoration / locator sync
- demo 播放控制

基础依赖：

- 依赖 `locator`
- 依赖 `decoration`
- 可复用部分 TTS 的 active reading 能力

新测试资源需求：

- 需要带 SMIL/media overlay 的真实 EPUB 样本
- 需要时间轴同步对照测试
- 需要音频资源管理测试

建议立项边界：

- 应在 TTS contract 稳定后再进入实现
- 不建议与 FXL、OPDS 同期推进

### 4.6 OPDS

矩阵状态：

- `Later`

用户价值：

- 支持在线目录发现、下载和分发
- 为书架和内容入口产品能力提供标准协议基础

当前缺口：

- 当前仓库只聚焦 reader core 和 demo 打开能力
- 没有网络、认证、下载、书架或本地索引层
- 与当前核心阅读链路并不是同一层问题

技术影响面：

- 网络层
- 认证与会话
- 下载管理
- 本地存储
- 书架 UI / metadata ingestion

基础依赖：

- 与 `locator / decoration / preferences` 只有弱耦合
- 更依赖未来的产品壳层，而不是当前 core runtime

新测试资源需求：

- 需要 OPDS feed fixture
- 需要认证和失败路径测试
- 需要下载与导入流程验证

建议立项边界：

- 不建议先在 `packages/core` 中实现
- 更适合作为上层产品或独立 package 的提案

### 4.7 DRM / LCP

矩阵状态：

- `Not in current phase`

用户价值：

- 对受保护内容发行、商业分发和机构场景有价值

当前缺口：

- 当前仓库没有解密、license、密钥管理和安全边界
- 也没有合法可用于自动化测试的受保护样本体系
- 产品和合规前提都还不存在

技术影响面：

- 资源读取链路
- 容器访问
- license / passphrase 流程
- 安全边界与密钥处理
- 测试、发布与合规流程

基础依赖：

- 与 `locator / decoration / preferences` 并非首要关系
- 更依赖独立安全模型和产品决策

新测试资源需求：

- 需要合法的 LCP 测试资产
- 需要受保护内容 CI 策略
- 需要安全与合规评审流程

建议立项边界：

- 仅保留记录，不进入当前实现排期
- 后续若状态变更，必须先完成独立产品和合规评审

## 5. 推荐下一步

如果下一轮继续推进实现，建议按以下顺序选题：

1. `RTL 产品化增强`
2. `FXL`
3. `Spread / Synthetic Spread`
4. `TTS / Read Aloud`

原因：

- 这四项与当前 reader 核心最相关
- 其中前三项直接影响阅读器主交互模型
- `TTS` 已经有 `locator / decoration / accessibility` 三层前置能力

不建议当前直接进入的项：

- `Media Overlay`
- `OPDS`
- `DRM / LCP`

## 6. 完成定义

当后续某项能力准备进入开发时，至少需要再补一层文档：

- 需求范围
- 公共 contract
- runtime 落点
- demo 入口
- 测试资源清单

只有完成这一步，才允许从“立项入口”进入“开发任务”。 
