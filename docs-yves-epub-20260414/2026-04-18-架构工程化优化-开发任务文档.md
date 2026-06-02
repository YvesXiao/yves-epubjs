# 架构工程化优化开发任务文档

## 1. 文档目标

本文档将《架构工程化优化需求文档》拆分为当前阶段可执行、可完成、可验证的任务列表，作为本轮交付的实现顺序与验收依据。

关联文档：

- [架构工程化优化需求文档](./2026-04-18-架构工程化优化需求文档.md)

## 2. 本轮执行原则

- 只做本轮可闭环完成的结构优化
- 先恢复边界，再提炼共享层，再拆宿主层，最后补门禁
- 不做大规模无验收口径的重构
- 每个任务必须有明确代码落点和测试动作
- 每个任务完成后立即验证，不积压到最后一起测试

## 3. 当前执行状态

记录时间：`2026-04-18`

当前阶段：

- `A1` 已完成
- `A2` 已完成
- `A3` 已完成
- `A4` 已完成

## 4. 任务拆分

## A1. 恢复 demo -> core 包边界

状态：

- 已完成

目标：

- 清理 `packages/demo` 中对 `../../core/src/index` 的直接依赖
- 改为通过 `@yves-epub/core` 使用正式公共导出

代码输出：

- `packages/demo/src/use-reader-controller.ts`
- `packages/demo/src/reader-ui.tsx`
- `packages/demo/src/toc-active.ts`
- 如有必要，补充 `packages/core/src/index.ts` 导出

测试要求：

- `pnpm --filter @yves-epub/demo typecheck`
- `pnpm --filter @yves-epub/demo build`

完成标准：

- demo 不再引用 core 源码路径
- 包边界整改不影响 demo 运行构建

## A2. 抽取共享 reader domain utilities

状态：

- 已完成

目标：

- 把 locator / annotation / decoration 中已确认重复的 helper 收口到共享模块

代码输出：

- 新增共享模块：
  - `packages/core/src/runtime/reader-domain.ts`
- 迁移下列 helper：
  - `collectBlockIdsInReadingOrder`
  - `normalizeTextRangeSelector`
  - `toTransparentHighlightColor`
- 更新调用方：
  - `packages/core/src/runtime/locator.ts`
  - `packages/core/src/runtime/annotation.ts`
  - `packages/core/src/runtime/dom-decoration.ts`
  - `packages/core/src/runtime/reader.ts`

测试要求：

- `pnpm test packages/core/test/reader-annotation.test.ts packages/core/test/dom-decoration.test.ts packages/core/test/locator.test.ts packages/core/test/reader-runtime-navigation.test.ts`
- `pnpm --filter @yves-epub/core typecheck`

完成标准：

- 重复 helper 从调用方模块移除
- 相关定位、选区、高亮行为不回退

## A3. 拆分 demo 宿主模块

状态：

- 已完成

目标：

- 将 `use-reader-controller.ts` 中的宿主适配、副作用和 overlay 聚合拆到独立模块

代码输出：

- 新增：
  - `packages/demo/src/reader-host-actions.ts`
  - `packages/demo/src/reader-storage.ts`
  - `packages/demo/src/reader-overlays.ts`
- 更新：
  - `packages/demo/src/use-reader-controller.ts`

测试要求：

- `pnpm --filter @yves-epub/demo typecheck`
- `pnpm --filter @yves-epub/demo build`
- `pnpm test packages/core/test/reader-annotation.test.ts packages/core/test/reader-runtime-navigation.test.ts`

完成标准：

- controller 仍是单一宿主入口，但宿主副作用明显外移
- overlay、外链、持久化逻辑不再内嵌在 controller 主体中

## A4. 补齐工程门禁

状态：

- 已完成

目标：

- 扩大 lint 覆盖面
- 把包边界检查加入标准校验链路

代码输出：

- 调整：
  - `package.json`
  - `.eslintrc.cjs`
- 新增：
  - `scripts/check-package-boundaries.mjs`

测试要求：

- `pnpm lint`
- `node scripts/check-package-boundaries.mjs`
- `pnpm ci:check`

完成标准：

- `ts / tsx / js` 都进入 lint 主路径
- `ci:check` 包含边界检查
- 当前仓库在新门禁下可通过

## 5. 最终回归测试

在 `A1-A4` 全部完成后，执行一轮最终回归：

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test packages/core/test/reader-annotation.test.ts packages/core/test/dom-decoration.test.ts packages/core/test/locator.test.ts packages/core/test/reader-runtime-navigation.test.ts packages/core/test/reader-publisher-styles.test.ts`
- `pnpm --filter @yves-epub/demo build`

如环境允许且不引入额外不稳定性，可追加：

- `pnpm test:e2e -- packages/demo/e2e/smoke.spec.js`

## 6. 交付标准

本轮只有在以下条件全部满足时才交付：

- 文档完成
- `A1-A4` 完成
- 每个任务完成后执行了对应测试
- 最终回归测试完成
- 不破坏当前阅读器主要能力
