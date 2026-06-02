# 架构工程化优化需求文档

## 1. 文档目标

本文档用于把当前 `yves-epub` 在架构分层和工程化约束上的主要问题，收敛成一份可执行、可验收的优化需求文档。

本文档解决的问题不是“继续增加阅读器能力”，而是：

- 让现有能力建立在更稳定的包边界和模块边界之上
- 避免 `core` 和 `demo` 继续向超级模块演化
- 把已经出现的重复领域逻辑收回共享模块
- 补齐当前阶段缺失的工程门禁，降低后续迭代回归成本

## 2. 背景与判断

经过本轮代码扫描，当前项目的主要问题不在“能力不够”，而在“能力增长方式不够受控”。

已经确认的结构性问题包括：

- `demo` 直接依赖 `packages/core/src/*` 源码，绕过了 `@yves-epub/core` 的正式导出边界
- `packages/core/src/runtime/reader.ts` 已承担过多平台职责，继续增长会放大回归面
- `locator / text-range / decoration-color` 相关纯函数已经在多个 runtime 文件中复制
- `packages/demo/src/use-reader-controller.ts` 混合了宿主适配、持久化、overlay 计算和 reader orchestration
- `lint / ci:check` 对 `tsx / js / 包边界` 的约束不足

当前阶段不适合直接做“大拆大重写”，否则会引入过高风险。更合理的做法是：

- 先恢复工程边界
- 再消除重复实现
- 再拆出明确的宿主层和共享领域层
- 最后补工程门禁，让后续结构恶化可以被及时发现

## 3. 当前问题定义

### 3.1 包边界失效

当前 `demo` 虽然已经声明依赖 `@yves-epub/core`，但实际仍直接从 `../../core/src/index` 导入类型和运行时能力。

这会导致两个问题：

- 包导出面形同虚设，`core` 的真正公共 API 不清晰
- `demo` 可以访问到包产物中不存在的内部实现，构建契约不可信

### 3.2 领域逻辑开始重复扩散

`collectBlockIdsInReadingOrder`、`normalizeTextRangeSelector`、`toTransparentHighlightColor` 等 helper 已在多个模块重复出现。

这类函数表面上是“小重复”，本质上是“领域语义没有收口”。继续放任下去，会出现：

- 选区与 annotation 语义在不同链路上逐渐漂移
- 修一个 bug 需要同步改多个 runtime 文件
- 测试通过但行为不再完全一致

### 3.3 Demo 宿主层职责混杂

`use-reader-controller.ts` 当前同时承担：

- `reader` 生命周期管理
- 浏览器宿主行为适配
- `localStorage` 持久化
- overlay 几何聚合
- 搜索 / 书签 / highlight 业务流程

这会让 demo 越来越难以作为“宿主接入参考”，因为外部使用者无法分辨哪些是必须能力，哪些只是 demo 选择。

### 3.4 工程门禁不足

当前工程化问题并不只是“lint 少扫几个文件”，而是缺少对关键边界的持续约束：

- `tsx / js` 不在 lint 主路径内
- 缺少“demo 不得引用 core 源码”的边界校验
- `ci:check` 没有纳入架构边界检查

如果不补这层门禁，前面做的结构优化很快会再次被绕开。

## 4. 总体目标

### 4.1 核心目标

- 恢复 `core -> package export -> demo` 的正式依赖边界
- 建立共享的 `reader domain utilities`，消除已出现的重复领域 helper
- 将 demo 宿主职责从单一 controller 中拆出清晰模块
- 提升 lint 和 CI 对结构边界的覆盖
- 在不破坏现有阅读能力的前提下完成本轮架构治理

### 4.2 非目标

本阶段不要求完成以下事项：

- 不要求一次性拆完 `reader.ts`
- 不要求把 `demo` 重构成完整设计系统
- 不要求引入新的构建工具或 monorepo 管理工具
- 不要求把所有 runtime 模块重新分层
- 不要求补全长期架构治理路线图中的所有项目

## 5. 本阶段需求范围

### 5.1 纳入范围

- `demo` 对 `core` 的导入边界整改
- 已确认重复 helper 的共享化抽取
- demo 宿主层的最小拆分
- lint / CI / 边界校验增强
- 配套需求文档、任务文档和测试补齐

### 5.2 暂不纳入范围

- `reader.ts` 的全面服务化拆分
- 新的运行时事件总线
- 全量 e2e 门禁改造
- 对 `packages/core` 全目录做强制 barrel-only 导出治理

这些事项仍然重要，但属于下一阶段架构治理内容，不在本次交付范围内。

## 6. 核心需求

## 6.1 R1：恢复包导出边界

### 目标

- `demo` 只能通过 `@yves-epub/core` 使用 `core` 的正式公共 API
- `packages/core/src/index.ts` 成为唯一公共导出入口
- 后续新增公共 API 时，必须经过显式导出面

### 需求

- 清理 `packages/demo` 中对 `../../core/src/*` 的直接依赖
- 补充缺失导出，使 demo 无需再访问源码路径
- 增加自动化校验，阻止该问题再次出现

### 验收标准

- `packages/demo/src` 与 `packages/demo/e2e` 中不再存在 `../../core/src` 引用
- `demo build`、`demo typecheck` 正常通过
- 有自动化边界检查覆盖该规则

## 6.2 R2：收口共享领域工具层

### 目标

- 把已确认重复的 locator / text-range / decoration-color 相关 helper 统一到共享模块
- 避免 `reader`、`annotation`、`dom-decoration`、`locator` 各自维护一份近似逻辑

### 需求

- 新增共享领域 helper 模块
- 至少收口以下能力：
  - block reading order 收集
  - text range normalize
  - transparent highlight color normalize
- 原有调用方改为依赖共享实现

### 验收标准

- 已确认的重复 helper 从调用方模块中移除
- 共享 helper 有直接单元测试或由现有测试覆盖
- 相关 reader / annotation / decoration 回归测试通过

## 6.3 R3：拆分 demo 宿主职责

### 目标

- 把 demo 中“宿主能力”和“reader orchestration”分开
- 让外部更容易理解哪些逻辑属于宿主接入层

### 需求

- 从 `use-reader-controller.ts` 中拆出：
  - 持久化模块
  - 宿主动作模块
  - overlay 聚合模块
- `use-reader-controller` 保留组合与状态协调职责

### 验收标准

- `use-reader-controller.ts` 的宿主副作用明显减少
- 新增模块职责清晰，命名与边界可读
- 现有搜索、书签、highlight、外链和 overlay 行为不回退

## 6.4 R4：补齐工程门禁

### 目标

- 让工程校验覆盖 `ts / tsx / js`
- 把包边界检查纳入本地标准校验链路

### 需求

- 调整 `lint` 脚本覆盖 `ts / tsx / js`
- 调整 ESLint 配置以匹配对应文件
- 增加包边界校验脚本
- `ci:check` 纳入该校验

### 验收标准

- `pnpm lint` 覆盖 `tsx / js`
- `pnpm ci:check` 包含边界检查
- 本轮新增脚本在当前仓库能通过

## 7. 测试与完成定义

### 7.1 任务级测试

每个任务完成后必须立即验证对应影响面：

- 包边界整改：`demo typecheck`、`demo build`
- 共享 helper 抽取：相关 core 单元 / 集成测试
- demo 宿主拆分：`demo typecheck`、`demo build`、受影响 reader 流程测试
- 工程门禁：`lint`、边界检查脚本

### 7.2 最终完成定义

本轮只有在以下条件全部满足时才算完成：

- 需求文档已落地
- 开发任务文档已落地
- 所有任务按顺序完成
- 每个任务完成后已执行对应测试
- 最终完成回归测试
- 不破坏当前 `scroll / paginated / search / toc / bookmark / highlight / diagnostics` 核心能力

## 8. 交付物

本轮交付物包括：

- 架构工程化优化需求文档
- 架构工程化优化开发任务文档
- 包边界整改代码
- 共享领域 helper 模块
- demo 宿主拆分代码
- 工程门禁增强脚本与配置
- 对应测试与回归结果
