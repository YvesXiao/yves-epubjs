# Engineering and Functional Optimization Tasks

执行依据：`docs/2026-08-04-engineering-functional-optimization-review.md` 与 `plan.md`。

状态说明：`[ ]` 待执行，`[~]` 执行中，`[x]` 已完成，`[!]` 评估后保留现状并附证据。

## Task 1：建立计划与基线

- [x] 创建分支 `chore/engineering-functional-optimization`。
- [x] 生成 `plan.md` 和 `task.md`。
- [x] 运行 `pnpm ci:check`：96 个测试文件、464 个测试通过；core ESM 671.16 KB，CJS 679.69 KB，DTS 114.40 KB；demo JS 933.25 KB，gzip 270.26 KB。
- [x] 运行 `pnpm test:e2e`：本地 fixture 6 个通过；3 个依赖外部书源的用例按环境条件跳过。
- [x] 计划与审查文档纳入分支交付提交。

验收：计划包含状态矩阵、错误处理、测试矩阵、回归风险和完成标准。

## Task 2：TDD 实现 publication operation epoch

目标文件：

- Create: `packages/core/src/runtime/reader-operation-session.ts`
- Modify: `packages/core/src/runtime/reader.ts`
- Modify: `packages/core/src/runtime/reader-runtime-controller.ts`
- Modify: `packages/core/src/runtime/reader-runtime-api-controller.ts`
- Test: `packages/core/test/reader-lifecycle.test.ts`

步骤：

- [x] 写 `latest open wins` 失败测试。
- [x] 运行 `pnpm exec vitest run packages/core/test/reader-lifecycle.test.ts`，确认旧 open 覆盖新 open。
- [x] 写 `destroy invalidates pending open/render` 失败测试。
- [x] 实现内部 operation session、version capture 和 current check。
- [x] 在 `open()` 两个 await 后、状态提交前检查 version。
- [x] 在 `render()` 和 `applyPreferences()` 字体 await 后检查 publication version。
- [x] `destroy()` invalidates publication version。
- [x] 运行 lifecycle、preferences、render、navigation focused suites：9 个文件、69 个测试通过。
- [x] lifecycle 变更纳入分支交付提交。

测试逻辑：只断言 public book、events、container 和 render 调用。旧 operation 不得 emit 或提交状态。

## Task 3：TDD 实现 resource generation

目标文件：

- Modify: `packages/core/src/runtime/renderable-resource-manager.ts`
- Test: `packages/core/test/renderable-resource-manager.test.ts`

步骤：

- [x] 写 revoke 后 deferred resource 晚到测试并确认失败。
- [x] 写相同 path 跨 generation 测试并确认旧代结果会污染当前缓存。
- [x] 写 stale DOM patch 测试，覆盖旧代 consumer 复用风险。
- [x] 实现 generation capture、双重 stale check 和 generation scoped consumer cleanup。
- [x] 运行 resource manager 与 reader image focused suites：22 个测试通过；关联 focused 集合合计 69 个测试通过。
- [x] resource generation 变更纳入分支交付提交。

测试逻辑：用 deferred Promise 控制完成顺序，mock `URL.createObjectURL` 和 `URL.revokeObjectURL`，检查回调、URL 和 DOM 属性。

## Task 4：修复 package focused test

目标文件：

- Modify: `packages/core/package.json`
- Modify: `packages/demo/package.json`

步骤：

- [x] 修改 core test 为从根目录执行 `vitest run packages/core/test`。
- [x] 修改 demo test 为从根目录执行 `vitest run packages/demo/src`。
- [x] 运行两个 filtered test：core 95 个文件、470 个测试；demo 1 个文件、2 个测试。
- [x] 运行 root `pnpm test`：96 个文件、473 个测试通过。
- [x] focused test script 变更纳入分支交付提交。

## Task 5：统一格式与生成产物规则

目标文件：

- Modify: `.prettierrc.json`
- Create: `.prettierignore`
- Modify: `.gitignore`
- Modify: `package.json`
- Mechanical format: 维护中的源码、测试、配置和本轮文档

步骤：

- [x] 将 Prettier 与项目无分号、双引号规则对齐。
- [x] ignore 构建、报告、临时 QA、tsbuildinfo、lockfile 和二进制 fixture。
- [x] 增加 `format:check`。
- [x] 独立运行 Prettier write；源码、测试、配置和文档为机械格式，恢复 lockfile 与 fixture 的非目标改动。
- [x] 通过 `pnpm ci:check` 运行 `format:check`、typecheck、lint、test。
- [x] 搜索文档对 `tmp/`、`artifacts/` 资产的引用；确认两项 QA 证据仍被引用。
- [x] 将两项证据迁入 `docs/qa/assets/`；其余生成产物仅从 Git 索引停止跟踪，本地文件保留。
- [x] 格式基线和生成产物规则纳入分支交付提交。

## Task 6：统一 CI 门禁

目标文件：

- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`

步骤：

- [x] 将主 job 的重复命令替换为 `pnpm ci:check`。
- [x] 将 `format:check` 纳入 `ci:check`。
- [x] 增加 Chromium 安装与 `pnpm test:e2e` 独立 job，并设置 15 分钟 timeout。
- [x] 通过 Prettier 验证 YAML 格式；本地等价命令留待 Task 10 完整验证。
- [x] CI 门禁变更纳入分支交付提交。

## Task 7：增加发布物 smoke

目标文件：

- Create: `scripts/check-package-artifact.mjs`
- Modify: `package.json`

步骤：

- [x] 先写脚本验收清单：exports 文件存在、ESM import、CJS require、types 文件、tarball files。
- [x] 实现临时目录 pack 和离线消费验证，finally 清理临时目录。
- [x] 增加 `check:package` script。
- [x] 运行 `pnpm build && pnpm check:package`：tarball 8 个文件，ESM/CJS/types 通过。
- [x] package artifact smoke 纳入分支交付提交。

## Task 8：增加构建体积预算

目标文件：

- Create: `scripts/check-bundle-size.mjs`
- Modify: `package.json`

步骤：

- [x] 以审查基线加 5% 设置 core ESM 705000 B、demo entry raw 980000 B、gzip 284000 B 上限。
- [x] 输出 actual、limit 和 delta。
- [x] 增加 `check:bundle-size` 并在 `ci:check` 的 build 后执行。
- [x] 通过场景实际为 690375 B、946376 B、270692 B；临时 1 B 阈值按预期以退出码 1 失败。
- [x] bundle size budget 纳入分支交付提交。

## Task 9：评估 runtime 纯委派层收敛

目标文件：

- Evaluate: `packages/core/src/runtime/reader.ts`
- Evaluate: `packages/core/src/runtime/reader-runtime-controller.ts`
- Evaluate: `packages/core/src/runtime/reader-runtime-*-controller.ts`

步骤：

- [x] 实际调用层级为 `EpubReader` → `ReaderRuntimeController` → 专业 controller；其中 open/render 最终进入 `ReaderRuntimeApiController`。
- [x] 测算结果：`ReaderRuntimeHost` 约 290 个成员，`EpubReader` 有 223 个 facade 委派，二级 controller 有 89 个委派；删除中转层还需迁移 6 个 controller 所有权。
- [!] 单独删除中转层只减少 89 个调用点，仍保留 290 成员 host 和 223 个 facade 方法，接口收益低于跨全部行为域的回归成本。
- [!] 本批次不迁移行为域，避免在竞态、格式基线和发布门禁之外叠加大范围 runtime 结构变更。
- [!] 保留现状；后续应先设计每个不超过 30 个成员的窄 port，再单域迁移。

验收：禁止为了行数继续拆模块。公开 API 和 root exports 必须保持。

## Task 10：完整验证与交付复核

- [x] `pnpm --filter @yves-epub/core test`：95 个文件、471 个测试通过。
- [x] `pnpm --filter @yves-epub/demo test`：1 个文件、2 个测试通过。
- [x] `pnpm ci:check`：96 个文件、473 个测试及全部工程门禁通过。
- [x] `pnpm test:e2e`：6 个本地 fixture 用例通过，3 个外部书源用例按环境条件跳过。
- [x] `pnpm check:package`：8 个 tarball 文件，ESM/CJS/types 消费通过。
- [x] `pnpm check:bundle-size`：690468 B、946423 B、270702 B，均低于预算。
- [x] `git diff --check`。
- [x] 检查公开 API surface、事件顺序和状态矩阵；public API surface 测试通过，竞态事件测试通过。
- [x] 更新本文件全部任务状态和实际测试结果。
- [x] 执行 code review verification gate：复核 open、render、preferences、destroy、resource consumer 与 demo 请求链。
