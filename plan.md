# Engineering and Functional Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在保持 `EpubReader` 公开 API、EPUB 输入方式、渲染路由、locator 语义和 demo 使用方式不变的前提下，封闭异步竞态并统一工程质量门禁。

**Architecture:** 使用 publication operation epoch 隔离跨书异步提交，使用 resource generation 隔离 object URL 晚到回调。工程侧让根配置成为测试和 CI 的唯一事实来源，并增加发布物与体积验证。runtime 只进行可由现有测试完整证明的低风险收敛，状态所有权重构留在独立批次。

**Tech Stack:** TypeScript 5.9、Vitest 1.6、Playwright、pnpm workspace、GitHub Actions、Prettier、tsup、Vite。

---

## 1. 实施范围

本轮实施 `docs/2026-08-04-engineering-functional-optimization-review.md` 中能够保持行为兼容并形成自动化验收的内容：

1. P0-1 reader publication lifecycle epoch。
2. P0-2 renderable resource generation。
3. P1-1 package focused test 隔离。
4. P1-2 CI 复用 `ci:check` 并增加本地 fixture E2E job。
5. P1-4 集中 lifecycle 测试入口，本轮只增加测试 seam，不迁移全部历史测试。
6. P1-5 统一格式规则、ignore 和 format check。
7. P1-6 停止跟踪临时 QA 产物和 tsbuildinfo，保留本地文件。
8. P2-1 发布物 ESM、CJS、types、文件清单 smoke。
9. P2-3 构建体积预算。
10. P1-3 runtime 只处理纯委派和不安全 host cast。若 focused test 无法隔离证明，则保留现状并在 task 中记录边界。

P2-2 Worker、lazy parse、cooperative search yield 和 P2-4 major 依赖升级会改变调度、性能或依赖行为。本轮只建立测量与预算入口，不改变执行策略和依赖版本。

## 2. 行为不变量

实施后以下行为必须保持：

1. `new EpubReader(options)`、`open()`、`render()`、`next()`、`prev()`、`setMode()`、搜索、书签、批注的公开签名不变。
2. 默认简单章节继续走 Canvas，复杂章节继续按现有 analyzer 路由 DOM。
3. 顺序执行 `await open(A); await render()` 的事件、book、locator 和页面行为不变。
4. scroll 和 paginated 的翻页、TOC、搜索跳转、模式切换锚点保持现有测试结果。
5. root exports 和 package exports 不收缩。
6. 本地 fixture 和外部书籍环境变量的 Playwright 使用方式不变。
7. 生成产物停止被 Git 跟踪，但本地文件保留。

## 3. 状态模型

### 3.1 Publication operation epoch

Reader 内部增加单调递增 `publicationVersion`：

| 当前状态                  | 操作        | 状态迁移                    | 提交规则                                       |
| ------------------------- | ----------- | --------------------------- | ---------------------------------------------- |
| idle/opened               | `open(A)`   | version + 1，进入 opening A | 只有 A 捕获的 version 仍为 current 时才能提交  |
| opening A                 | `open(B)`   | version + 1，B 成为 current | A 可以完成纯计算，A 禁止提交 reader 状态和事件 |
| opening/render waiting    | `destroy()` | version + 1                 | 全部旧 operation 失效                          |
| opened A                  | `render()`  | 捕获当前 version            | fonts ready 后再次确认 version                 |
| preferences waiting fonts | `open(B)`   | publication version 改变    | A 的 preferences 禁止触发 render 和事件        |

过期 operation 抛出内部 `ReaderOperationCancelledError`。该错误不加入 root exports。正常顺序调用没有新增错误路径。

### 3.2 Resource generation

`RenderableResourceManager` 持有 generation：

| 当前状态                      | 操作             | 结果                                      |
| ----------------------------- | ---------------- | ----------------------------------------- |
| generation N resource pending | `revokeAll()`    | generation 变为 N+1，缓存与 consumer 清空 |
| stale resource resolve        | Promise fulfill  | 丢弃 binary，不 patch DOM，不调度 render  |
| stale URL 已创建              | generation check | 立即 revoke URL                           |
| 新旧 generation 同 path       | 任意完成顺序     | 只有新 generation 可写入 cache            |

## 4. 错误处理

1. 取消属于控制流，不记录为 EPUB 解析失败。
2. demo 只允许最新 `openFile()` 更新 loading、error、bookmark 和 highlight 状态。
3. 真正的输入、ZIP、parser 错误继续使用现有错误展示。
4. resource read rejection 继续降级为原始 path，generation 清理不能删除新请求的 pending consumer。
5. 发布 smoke 或体积预算失败时使用非零退出码并打印精确文件和实际值。

## 5. 测试逻辑

### 5.1 TDD 规则

每个行为修改遵循：先写可观察行为测试，运行确认失败，再写最小实现，最后运行 focused suite。测试避免断言私有字段，允许通过集中 harness 注入 deferred parser/resource 依赖。

### 5.2 P0 测试矩阵

| 用例                         | 安排                              | 操作                           | 断言                                     |
| ---------------------------- | --------------------------------- | ------------------------------ | ---------------------------------------- |
| latest open wins             | A、B parser 使用 deferred Promise | B 先 resolve，A 后 resolve     | current book、opened event 均属于 B      |
| destroy invalidates open     | open 等待 parser                  | destroy 后 resolve             | container 为空，无 opened/rendered event |
| render invalidated by open   | render 等待 fonts                 | open B 后 fonts ready          | A 不触发 render                          |
| stale resource after revoke  | resource deferred                 | revoke 后 resolve              | callback 0 次，cache not ready           |
| same path across generations | 两代同 path                       | 新代先 resolve，旧代后 resolve | cache 保留新代 URL，旧 URL 被 revoke     |
| stale DOM patch              | container 换成新 DOM              | 旧资源 resolve                 | 新 DOM 属性不变                          |

### 5.3 工程命令测试

1. `pnpm test` 收集全部 core 与 demo unit tests。
2. `pnpm --filter @yves-epub/core test` 只收集 core。
3. `pnpm --filter @yves-epub/demo test` 只收集 demo unit tests。
4. `pnpm format:check` 在干净格式基线上通过。
5. `pnpm ci:check` 调用所有非浏览器门禁。
6. `pnpm test:e2e` 运行本地 fixture smoke。
7. `pnpm check:package` 验证 tarball ESM、CJS、types 和文件清单。
8. `pnpm check:bundle-size` 对当前体积加 5% 预算执行。

## 6. 回归风险

1. 取消错误若泄漏到 demo，会被错误展示为打开失败。通过 demo latest request token 和错误分类测试控制。
2. generation check 位置过晚会创建短命 URL。实现需要在 binary resolve 后、createObjectURL 前检查，并在创建后再次检查。
3. Prettier 基线会产生大面积机械 diff。独立提交并在格式化后运行完整门禁。
4. CI E2E 需要安装 Chromium。独立 job 避免影响 unit job。
5. runtime 删除纯委派层可能扩大构造依赖。接口成本没有下降时停止，不以行数为唯一目标。

## 7. 完成标准

1. `task.md` 中实施任务全部完成或以证据标明“评估后保留”。
2. P0 新测试经历 red 和 green。
3. `pnpm ci:check` exit 0。
4. `pnpm test:e2e` 本地 fixture 全部通过。
5. package 和 bundle checks exit 0。
6. `git diff --check` exit 0。
7. 只有计划内文件发生变化，`.codegraph/` 保持未跟踪且不进入提交。
