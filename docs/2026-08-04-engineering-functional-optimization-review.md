# 工程化与功能优化审查报告

审查日期：2026-08-04

## 1. 审查目标与边界

本次审查覆盖 `packages/core`、`packages/demo`、根级构建配置、测试配置、CI 和仓库产物管理。目标是在保持现有功能范围、公开 API、调用方式和阅读行为的前提下，降低竞态风险、回归风险和维护成本。

本报告只提出优化建议，没有修改功能代码。以下方向不在建议范围内：新增阅读能力、改变 EPUB 输入类型、改变 `EpubReader` 的公开方法签名、调整 Canvas 与 DOM 的路由语义、缩减现有 root exports、修改书签和 locator 的持久化格式。

审查的完整主路径为：

`new EpubReader()` → `open()` → `render()` → 翻页、滚动、TOC、搜索、偏好设置、批注 → 再次打开文件或中断 → `destroy()`。

重点追踪了以下异步副作用：文件读取、EPUB 解析、字体就绪、图片资源读取、object URL 创建、DOM 资源回填、延迟重渲染、模式切换、React effect 清理。

## 2. 当前基线

### 2.1 已验证结果

| 检查项                               | 结果       | 说明                                                             |
| ------------------------------------ | ---------- | ---------------------------------------------------------------- |
| `pnpm ci:check`                      | 通过       | typecheck、包边界、lint、Vitest、build 均成功                    |
| Vitest                               | 通过       | 96 个测试文件，464 个测试通过                                    |
| `pnpm test:e2e`                      | 通过       | 6 个本地 fixture 场景通过，3 个依赖外部书籍路径的场景跳过        |
| `pnpm check:boundaries`              | 通过       | demo 没有直接引用 core 源码相对路径                              |
| `pnpm --filter @yves-epub/demo test` | 失败       | 2 个单测通过，4 个 Playwright suite 被 Vitest 错误收集并失败     |
| Prettier check                       | 失败       | 对主要源码和配置执行检查时报告 180 个文件不符合当前配置          |
| core build                           | 通过       | ESM 671.16 kB，CJS 679.69 kB，声明文件 114.40 kB                 |
| demo build                           | 通过并告警 | 单个 JS chunk 933.25 kB，gzip 270.26 kB，超过 Vite 500 kB 告警线 |

### 2.2 正向机制

项目已有较完整的严格 TypeScript 配置、单元测试、混合渲染测试、真实 fixture、包边界检查、资源大小限制、DOM sanitizer、render version、scroll coordinator 和 session state。这些机制适合作为优化时的行为护栏。

当前主要问题集中在异步操作的跨生命周期隔离、运行时拆分后的接口成本、各类工程门禁的一致性。继续增加功能模块或继续按文件拆分 runtime，收益低于先收敛这些边界。

## 3. Findings

### P0-1. `open()` 缺少 latest-operation-wins 屏障，晚到解析结果可以覆盖新书

#### 事实

`ReaderRuntimeApiController.open()` 在 `packages/core/src/runtime/reader-runtime-api-controller.ts:63` 开始执行，先等待输入标准化，再在第 76 行等待完整解析。两个 await 之后直接从第 81 行开始提交 document、navigation、render、selection 和 decoration 状态。

当前实现没有 open operation id、AbortSignal 或串行队列。demo 的文件输入在 `packages/demo/src/App.tsx:199` 附近持续可交互，`openFile()` 在 `packages/demo/src/use-reader-controller.ts:438` 依次等待 `reader.open(file)` 和 `reader.render()`，也没有请求序号。

因此下面的真实行为成立：

1. 用户选择 A，`open(A)` 开始读取或解析。
2. 用户随后选择 B，`open(B)` 开始读取或解析。
3. B 先完成并提交为当前书籍。
4. A 后完成，并再次执行 `resetForOpen()`，当前书籍回退为 A。
5. demo 中两条 `openFile()` 后续链路还会分别恢复偏好和书签，最终状态由完成顺序决定。

`renderVersion` 只保护 render 提交，覆盖范围从 `resetForOpen()` 后开始，无法阻止旧 open 提交整套 document state。

#### 影响

这是功能一致性问题。快速换书、慢磁盘、大 EPUB、低性能移动设备都能提高触发概率。风险包括标题与正文错配、A 的书签状态覆盖 B、旧 open 在组件清理后重新提交状态。

#### 建议方案

在 core 内建立单一生命周期 epoch，保持公开 API 不变：

1. `EpubReader` 或独立的内部 `ReaderOperationSession` 持有递增的 `lifecycleVersion` 和 `destroyed` 状态。
2. 每次 `open()` 开始时递增版本并捕获本次版本。
3. 在 `normalizeEpubInput()` 和 `parseDetailed()` 的每个 await 后调用 `assertCurrent(version)`。
4. 只有当前版本可以执行 `documentSession.resetForOpen()` 及后续状态提交。
5. `destroy()` 递增版本并标记 disposed，使全部在途 open、render、preferences 和资源回调失效。
6. 旧操作以内部取消错误结束。demo 将该错误视为正常中断，只显示最新操作的状态。现有顺序调用仍保持原返回值和使用方式。

建议先实现 epoch，再考虑 AbortController。EPUB 解析当前主要由同步解压和内存解析组成，AbortController 只能中断部分读取；epoch 可以先保证状态正确性。

#### 必须补充的测试

1. 使用 deferred Promise 构造 `open(A)` 和 `open(B)`，让 B 先完成，断言最终 `getBook()` 为 B。
2. A 晚到后不得触发 A 的 `opened` 事件，不得清空 B 的 decorations、locator 和资源。
3. `open()` 等待期间执行 `destroy()`，Promise 结束后 container 保持清空，listener 和 object URL 保持释放。
4. demo 连续选择两个文件，最终标题、TOC、书签和正文统一属于第二个文件。

#### 验收标准

相同 reader 实例上的异步提交遵循 latest-operation-wins。任意晚到结果都无法改变新书或已销毁 reader 的可观察状态。

### P0-2. `RenderableResourceManager.revokeAll()` 只清缓存，无法隔离晚到资源

#### 事实

`packages/core/src/runtime/renderable-resource-manager.ts:47` 为 `readBinary` 注册 Promise 回调。回调在第 66 行写入 `objectUrls`，并可能 patch 当前 container 中的 DOM 或触发 Canvas 重渲染。

`revokeAll()` 从第 84 行开始撤销当前已知 URL 并清空 Map。它无法取消此前已经启动的 Promise，也没有 generation 校验。

`open()` 和 `destroy()` 都会调用 `revokeObjectUrls()`。如果旧书资源读取在清理之后完成，回调仍会创建新的 object URL。若新书恰好使用相同资源路径，例如 `OPS/images/cover.jpg`，旧二进制还可能写入新书的 DOM 节点。

当前 `renderable-resource-manager.test.ts` 覆盖正常 resolve、DOM patch 和 missing resource，尚未覆盖 revoke 后晚到、同路径跨书、destroy 后晚到。

#### 影响

风险链路包括：

`旧书资源 pending` → `open 新书或 destroy` → `revokeAll 清 Map` → `旧 Promise resolve` → `创建旧 blob URL` → `patch 新 DOM 或调度 render`。

结果可能表现为封面串书、图片短暂错位、销毁后重新创建 blob URL、额外 render、内存泄漏。

#### 建议方案

给资源管理器增加内部 generation，保持 `resolveUrl()` 和 `revokeAll()` 的签名不变：

1. `revokeAll()` 先递增 generation，再撤销 URL、清理 consumers。
2. `resolveUrl()` 捕获请求 generation。
3. Promise resolve 后先比较 generation。
4. generation 已变化时直接丢弃结果。若 object URL 已创建，立即 revoke，不写 Map，不 patch DOM，不触发刷新。
5. rejection 只清理属于同一 generation 的 pending consumer，避免旧请求删除新请求的记录。
6. pending key 最好使用 `{ generation, path }` 语义，防止相同 path 跨书冲突。

#### 必须补充的测试

1. `resolveUrl()` 后立即 `revokeAll()`，随后 resolve deferred binary，断言 `isReady()` 为 false，回调计数为 0。
2. generation 1 和 generation 2 请求相同 path，先完成 generation 2，再完成 generation 1，最终 URL 指向 generation 2。
3. 旧 DOM 节点和新 DOM 节点使用相同 path，旧资源完成时新 DOM 不发生 patch。
4. stale object URL 被立即 revoke。

#### 验收标准

资源回调只能影响创建它的 publication generation。`revokeAll()` 返回后，该 generation 不再产生任何可观察副作用。

### P1-1. demo 的包级测试命令会混跑 Playwright 文件

#### 事实

`packages/demo/package.json:10` 定义 `"test": "vitest run"`。该命令从 `packages/demo` 作为 cwd 启动，无法使用根级 `vitest.config.ts` 中的 `include: ["packages/**/*.test.ts"]`，于是 Vitest 默认收集 `e2e/*.spec.js`。

实际执行 `pnpm --filter @yves-epub/demo test` 的结果为：

1. `src/toc-active.test.ts` 的 2 个测试通过。
2. 4 个 Playwright suite 被 Vitest 收集。
3. Playwright 的 `test()` 和 `test.skip()` 在 Vitest 上下文中报错。
4. 命令退出码为 1。

core 的包级 test 又通过 `cd ../.. && vitest run` 执行整个工作区，无法实现真正的 core focused test。

#### 建议方案

选择一个测试配置入口，推荐保留根配置，并让包级脚本回到仓库根目录后传入明确的测试路径：

```json
{
  "scripts": {
    "test": "cd ../.. && vitest run packages/demo/src"
  }
}
```

core 对应使用明确路径：

```json
{
  "scripts": {
    "test": "cd ../.. && vitest run packages/core/test"
  }
}
```

已在仓库根目录验证 `pnpm exec vitest run packages/demo/src` 只收集 1 个 demo 测试文件和 2 个测试。如果后续 Vitest major 升级改变 CLI 路径过滤行为，则在根配置导出 shared config，再为两个 package 增加极薄的 `vitest.config.ts`，分别设置 include。不要复制 setup 和 coverage 配置。

#### 验收标准

1. `pnpm test` 继续运行全部 464 个现有测试。
2. `pnpm --filter @yves-epub/core test` 只收集 core tests。
3. `pnpm --filter @yves-epub/demo test` 只收集 `src/**/*.test.ts(x)`。
4. 任何 Vitest 命令都不收集 `e2e/*.spec.js`。

### P1-2. GitHub Actions 复制了 `ci:check`，导致门禁已经漂移

#### 事实

根级 `ci:check` 包含 `typecheck → check:boundaries → lint → test → build`。`.github/workflows/ci.yml` 逐项重复执行命令，当前漏掉 `check:boundaries`。Actions 也没有执行本地 fixture 的 Playwright smoke。

本地 `pnpm test:e2e` 已验证 6 个 fixture 场景稳定通过，另外 3 个外部书籍场景会根据环境变量自动跳过，适合作为独立 CI job。

#### 建议方案

1. GitHub Actions 的主质量 job 直接运行 `pnpm ci:check`，让 package.json 成为唯一门禁定义。
2. 增加独立 `e2e-smoke` job，安装 Chromium 后运行 `pnpm test:e2e`。
3. 对外部书籍场景继续保持环境变量控制，不把私有或大体积书籍加入 CI。
4. 给两个 job 配置 timeout，避免浏览器或 dev server 异常时长期占用 runner。
5. 后续新增门禁时只修改 `ci:check`，CI workflow 只负责编排环境和 job。

建议命令结构：

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm ci:check

# 独立 job
- run: pnpm exec playwright install --with-deps chromium
- run: pnpm test:e2e
```

#### 验收标准

本地和 CI 的主门禁完全一致。破坏 demo 到 core 的包边界时，本地与 CI 都会失败；6 个本地 EPUB smoke 在每个 PR 上执行。

### P1-3. runtime 拆分后的接口成本已经高于内聚收益

#### 事实

当前关键文件规模为：

| 文件                                                | 行数 |
| --------------------------------------------------- | ---: |
| `reader.ts`                                         | 1953 |
| `reader-runtime-controller.ts`                      | 1853 |
| `reader-runtime-selection-annotation-controller.ts` | 1215 |
| `reader-runtime-render-controller.ts`               | 1171 |
| `reader-runtime-interaction-controller.ts`          |  993 |
| `reader-runtime-scroll-controller.ts`               |  935 |
| `reader-runtime-api-controller.ts`                  |  851 |

`ReaderRuntimeHost` 从 `reader-runtime-controller.ts:108` 延续到 class 开始前的第 609 行，约 500 行。它暴露 session、renderer、service、可变字段和大量方法。`ReaderRuntimeController` 构造函数接收 `unknown`，在第 619 行强制转换为 `ReaderRuntimeHost`，编译器无法证明 `EpubReader` 真的满足该接口。

同一公开动作通常经过三层：

`EpubReader.open()` → `ReaderRuntimeController.open()` → `ReaderRuntimeApiController.open()`。

render、navigation、selection、scroll 的内部方法也在 `reader.ts` 和 `reader-runtime-controller.ts` 形成大量同名转发。接口数量增加，但状态仍由同一个 host 广泛读写。这个结构提高了修改一项状态时的同步成本，也促使测试大量使用 `as unknown as` 注入内部字段。

#### 建议方案

当前阶段停止继续按功能增加 controller 文件，先做接口成本收敛。推荐分两步，且每步保持公开 API 和行为不变：

第一步，删除纯中转层：

1. `EpubReader` 直接持有 `ReaderRuntimeApiController` 和现有专业 controller。
2. 公开方法直接委派给对应专业 controller。
3. 删除 `ReaderRuntimeController` 中与专业 controller 一一对应的 pass-through 方法。
4. 保留 `EpubReader` 作为唯一 public facade。

第二步，缩小 host：

1. 为每个专业 controller 定义它实际需要的最小 port，例如 `RenderRuntimePort`、`ScrollRuntimePort`。
2. 优先把状态读写集中到现有 session 对象，controller 通过 session 的语义方法完成状态迁移。
3. 避免把另一个 controller 的全部方法重新暴露进 port。跨域操作通过少数明确的 orchestration callback 完成。
4. 构造函数接收具名 port，移除 `unknown as ReaderRuntimeHost`。

这项优化的目标是减少接口和重复委派，目标值可以设为：host port 单个不超过 30 个成员，公开动作最多经过 facade 和一个实现 controller 两层。行数只是观察指标，不能作为单独拆分依据。

#### 回归控制

1. 先用现有 464 个测试固定行为。
2. 每移除一组 pass-through，运行对应 focused tests，再运行 `pnpm ci:check`。
3. scroll、paginated、DOM、Canvas、模式切换、selection 分批迁移，避免一次性改写全部 controller。
4. 继续用 public API surface test 锁定 root exports。

#### 验收标准

公开 API、事件顺序、locator、分页和渲染结果保持一致。运行时内部不存在 `unknown as ReaderRuntimeHost`，同一动作不再经过两个纯委派层。

### P1-4. 测试大量穿透 `EpubReader` 私有状态，重构保护强于行为保护

#### 事实

`reader-image.test.ts`、`pretext-layout.test.ts`、`reader-spread.test.ts`、`reader-annotation.test.ts` 等文件反复使用 `reader as unknown as { ... }` 写入 book、resources、pages、render 方法和 session 状态。

这种测试可以细查复杂渲染行为，但它把 facade 的内部字段名变成隐性测试 API。runtime 收敛时，行为保持不变也会产生大面积测试修改；同时并发 open、destroy、资源晚到等公开生命周期行为覆盖较薄。`reader-lifecycle.test.ts` 当前只有 listener 对称释放一个测试。

#### 建议方案

1. 保留布局、parser、service 的纯单元测试。
2. 为 reader 集成测试建立内部专用 harness，由一个文件集中提供 `openFixtureBook()`、`setViewport()`、`deferResource()`、`flushRender()` 等能力。
3. 测试文件通过 harness 表达前置状态，内部类型转换只保留在 harness。
4. 新增生命周期契约测试，优先覆盖公开方法的可观察结果和事件顺序。
5. 重构期间逐文件迁移，避免一次性改写全部测试。

#### 验收标准

reader 私有字段变化主要影响单个 harness 文件。open、render、destroy、资源晚到、快速偏好切换都有公开行为测试。

### P1-5. 格式规则存在三个事实来源，当前 Prettier 基线不可执行

#### 事实

仓库 `AGENTS.md` 约定无分号，`.prettierrc.json` 配置为 `semi: true`、双引号。源码当前存在两种风格。对主要源码和配置执行 Prettier check 时，180 个文件报告不符合配置。

根脚本只有 `format: prettier --write .`，CI 没有 `format:check`。直接运行 format 会产生大范围改动，也会扫描当前已跟踪的临时脚本、快照说明和其他非源码内容。

#### 建议方案

1. 先确定唯一规则。根据现有 `.prettierrc.json` 和多数旧代码，建议更新 `AGENTS.md` 与 Prettier 一致；如果团队明确选择无分号，则改 Prettier 配置。两者只能保留一个结论。
2. 增加 `.prettierignore`，至少覆盖 `dist/`、`coverage/`、`playwright-report/`、`test-results/`、`tmp/`、`_temp/`、`artifacts/`、`*.tsbuildinfo`、二进制 fixture。
3. 增加 `format:check`，范围限定为维护中的源码、配置和文档。
4. 格式化基线单独提交，不和功能修改混合。
5. 基线提交完成后把 `pnpm format:check` 加入 `ci:check`。

#### 验收标准

规则文档、Prettier 配置、现有源码一致。`format:check` 在干净工作区通过，新提交无法引入新的格式漂移。

### P1-6. 临时 QA 产物和 TypeScript 构建缓存被 Git 跟踪

#### 事实

当前 Git 索引包含 `artifacts/*.png`、大量 `tmp/qa-*` 和 `tmp/pagination-*` 截图、临时调试脚本、压力测试 JSON，以及 `packages/demo/tsconfig.tsbuildinfo`。

`.gitignore` 已忽略 `.tmp/`，但没有覆盖 `tmp/`、`_temp/`、`artifacts/` 和 `*.tsbuildinfo`。这些路径与 `docs/qa` 中的长期测试记录语义混在一起。

#### 建议方案

1. 明确长期证据目录，例如只保留 `docs/qa/assets/` 中经过筛选且被文档引用的截图和 JSON。
2. 将临时运行结果统一写入已忽略的 `.tmp/` 或 `test-results/`。
3. 把 `tmp/`、`_temp/`、`artifacts/`、`*.tsbuildinfo` 加入 `.gitignore`。
4. 先生成清单，迁移仍被文档引用的少量资产，再从 Git 索引移除其余产物。
5. 不删除开发者本地文件。使用 `git rm --cached` 只停止跟踪，待确认后再处理磁盘文件。

#### 验收标准

运行测试、typecheck、真实书籍 QA 后，`git status --short` 不出现生成产物。仓库保留的截图均有对应 QA 文档引用。

### P2-1. demo 使用 core 源码 alias，发布产物缺少真实消费者验证

#### 事实

`packages/demo/tsconfig.json` 和 `packages/demo/vite.config.ts` 都把 `@yves-epub/core` 指向 `../core/src/index.ts`。这有利于本地联调，也意味着 demo build 不会验证 `packages/core/package.json` 的 `exports`、ESM、CJS 和声明文件能否被真实消费者加载。

core build 成功只能证明 tsup 生成了文件。当前 CI 没有执行 `pnpm pack` 后的安装或 import/require smoke。

#### 建议方案

增加独立的发布物 smoke，不改变 demo 的开发方式：

1. 构建 core。
2. `pnpm pack` 生成 tarball 到临时目录。
3. 创建最小 ESM 消费者，安装 tarball，执行 `import { EpubReader } from "@yves-epub/core"`。
4. 创建最小 CJS 消费者，执行 `require("@yves-epub/core")`。
5. 对最小 TypeScript 消费者运行 `tsc --noEmit`。
6. 检查 tarball 文件清单，只包含 package.json、README、LICENSE 和 dist 等预期文件。

#### 验收标准

发布物在 ESM、CJS 和 TypeScript 三种消费方式下通过，且 demo 继续使用现有源码联调方式。

### P2-2. 主线程打开与搜索缺少性能基线，现有实现具备长任务条件

#### 事实与影响链

打开链路为：

`File.arrayBuffer()` 全量读取 → `unzipSync()` 同步解压 → 所有 spine item `Promise.all()` → 全章节预处理 → 提交 Book。

资源限制已经存在，但默认最大压缩大小 512 MiB、单 entry 256 MiB、总解压 1 GiB。这些上限适合安全兜底，无法作为浏览器交互流畅度保证。`unzipSync()` 和章节解析仍可能形成明显长任务。

搜索链路在 `reader-runtime-api-controller.ts:293` 遍历所有 section，构建完整结果和 decoration，然后同步重渲染。方法虽然声明为 async，循环内部没有 await，因此仍在一个主线程任务中完成。

当前缺少可持续比较的指标，直接切 Worker、懒解析或限制结果数都可能改变行为和接口成本，因此先建立测量基线。

#### 建议方案

第一阶段只测量：

1. 选择 minimal fixture、中型真实书、大型真实书三档。
2. 记录 input bytes、entry count、uncompressed bytes、section count。
3. 分段记录 normalize、unzip、metadata parse、section parse、chapter preprocess、first render、search 耗时。
4. 记录 open 峰值内存、首次可见时间、搜索长任务时长。
5. 在固定 Chrome 版本和固定机器上保存 JSON 基线，避免跨环境绝对值比较。

第二阶段根据数据选择最小改动：

1. 搜索长任务超标时，在 section 边界做 cooperative yield，并使用 search epoch 丢弃旧查询结果。结果集合和公开 API 保持不变。
2. 解压成为主要瓶颈时，再评估 Worker。`open()` 仍返回同一 Promise 类型，worker 只作为内部执行器。
3. 章节预处理成为主要瓶颈时，先检查重复解析和缓存命中，再评估 lazy strategy。lazy strategy 会影响首跳延迟，需要独立行为矩阵和回归测试。

#### 验收标准

任何性能优化都附带改前和改后完整链路数据。优化后结果数、定位、事件顺序和公开调用方式保持一致。

### P2-3. 构建体积只有工具默认告警，缺少可执行预算

#### 事实

当前 demo 生产构建生成单个 933.25 kB JS chunk，gzip 270.26 kB。Vite 给出超过 500 kB 的告警。core 的 ESM 输出为 671.16 kB，但依赖仍以 import 保留，不能直接把这个数字等同于消费者最终下载体积。

直接配置 `manualChunks` 只能改变 chunk 形状，无法证明下载字节或初始化成本下降。

#### 建议方案

1. 在 CI 记录 demo entry gzip、总 JS gzip、core ESM 文件大小和声明文件大小。
2. 先以当前值加 5% 作为回归预算，只阻止继续增长。
3. 使用浏览器性能记录区分下载、parse、evaluate 和 first render 成本。
4. 只有当首屏 evaluate 或下载成为瓶颈时，再评估在选择文件后动态加载 core。调用入口和 UI 操作保持不变。
5. 不把调整 `chunkSizeWarningLimit` 作为优化完成标准。

#### 验收标准

CI 能报告每次变更的体积差异，超预算时失败。任何拆包方案同时给出总 gzip、首屏请求和运行时指标。

### P2-4. 依赖升级需要分风险层处理

#### 事实

`pnpm outdated -r` 当前报告 28 个依赖存在更新，其中 TypeScript、Vite、Vitest、React 生态包含 major version 跨越。一次性升级会同时改变构建器、测试 runner、类型定义和运行时，回归定位成本较高。

#### 建议方案

1. patch 和 minor 依赖按小批次升级，每批运行 `pnpm ci:check` 与 Playwright smoke。
2. parser、zip、CSS 相关生产依赖单独成批，使用 EPUB fixtures 验证解析、资源路径和 DOM sanitizer。
3. Vitest、Vite、TypeScript major 各自独立提交，先修测试配置隔离，再升级 runner。
4. React 19 与 demo UI 独立评估，core 不依赖 React，无需绑定升级。
5. CI 增加定期 audit 或 Renovate/Dependabot PR，但自动化只负责提 PR，合并仍以现有门禁和人工审查为准。

#### 验收标准

每次依赖变更都能归因到一个工具域或运行时域，失败时可以单批回退。升级不改变 package public API 和 demo 使用方式。

## 4. 状态 × 操作 → 结果矩阵

以下矩阵既是实现约束，也是并发回归测试清单。

| 当前状态                  | 用户或宿主操作       | 目标结果             | 允许的副作用                      | 必须阻止的副作用                    |
| ------------------------- | -------------------- | -------------------- | --------------------------------- | ----------------------------------- |
| idle                      | `open(A)`            | 进入 opening A       | 读取、解析 A                      | 提前提交半成品状态                  |
| opening A                 | `open(B)`            | B 成为最新 operation | A 可完成计算，B 可提交            | A 在 B 之后提交任何 reader 状态     |
| opening                   | `destroy()`          | 进入 disposed        | listener、timer、URL 全部释放     | open 晚到后 emit、render、patch DOM |
| opened                    | `render()`           | 当前书首次渲染       | 等待字体、提交当前 render version | 旧 publication render               |
| render waiting fonts      | `open(B)`            | render A 失效        | B 的 open 和后续 render           | 字体 ready 后重新渲染 A             |
| resource pending A        | `open(B)`            | generation 切换到 B  | B 资源创建 URL                    | A patch B 的 DOM 或触发 B 刷新      |
| resource pending          | `destroy()`          | generation 失效      | stale URL 立即 revoke             | destroy 后新增 URL、timer、DOM      |
| preferences waiting fonts | 再次修改 preferences | 最新设置生效         | 旧任务结束计算                    | 旧任务发出与当前设置不一致的事件    |
| search A running          | search B             | B 结果最终可见       | A 可分段退出                      | A 的 decoration 和结果覆盖 B        |
| mounted demo              | 连续选择 A、B        | UI 全部展示 B        | A 显示 loading 的短暂状态         | 标题、TOC、书签、正文跨书混合       |

## 5. 推荐实施顺序

### 阶段 1：先封闭竞态

1. 增加 reader lifecycle epoch 与 disposed guard。
2. 增加 resource generation。
3. 补 open、destroy、resource late result 的 deferred Promise 测试。
4. 运行 focused tests、`pnpm ci:check` 和 `pnpm test:e2e`。

这一步优先级最高。它直接收敛数据源与副作用执行器之间的就绪屏障。

### 阶段 2：修复工程门禁

1. 修复两个 package 的 Vitest 配置和 focused scripts。
2. CI 改为调用 `pnpm ci:check`。
3. 增加 Playwright smoke job。
4. 统一格式规则，建立一次性格式基线，再启用 `format:check`。
5. 清理 Git 索引中的生成产物并补 ignore。

### 阶段 3：收敛 runtime 接口成本

1. 删除 `ReaderRuntimeController` 纯委派层。
2. 把 500 行 host 拆成按 controller 使用的窄 port。
3. 建立 reader test harness，逐步收敛测试中的私有字段穿透。
4. 每一批只迁移一个行为域，并执行对应完整主路径回归。

### 阶段 4：建立发布与性能预算

1. 增加 packed artifact smoke。
2. 建立 open、search、bundle 基线。
3. 根据数据选择 cooperative yield、Worker 或动态加载。
4. 分批升级依赖。

## 6. 每阶段统一验证清单

每个实施 PR 至少执行：

```text
pnpm --filter @yves-epub/core test
pnpm --filter @yves-epub/demo test
pnpm ci:check
pnpm test:e2e
git status --short
```

涉及异步屏障时，额外验证 deferred Promise 的乱序完成；涉及 runtime 收敛时，额外核对公开 API surface 和事件顺序；涉及构建或发布时，额外执行 packed artifact smoke 和 bundle budget。

## 7. 结论

当前根级质量门禁和本地阅读 smoke 已经具备可用基线。最需要优先处理的是两个可达的异步竞态：open 晚到覆盖和 resource 晚到回填。随后修复包级测试隔离和 CI 漂移，可以让现有测试资产真正形成稳定门禁。

runtime 已经完成物理文件拆分，但 500 行 host、双层内部 facade 和大量 pass-through 表明接口成本偏高。下一步适合做收敛，不适合继续增加 controller。性能方面先建立完整影响链和数据预算，再选择执行策略，可以保持功能范围和使用方式稳定。
