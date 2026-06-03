# Reader Runtime Decomposition Completion Implementation Plan

**Goal:** 将 `packages/core/src/runtime/reader.ts` 从 6000 多行收敛到 1200 到 2000 行，同时保持 `EpubReader` 公开 API 和现有阅读行为不变。

**Architecture:** `EpubReader` 收敛为 public facade 和生命周期装配器。渲染、DOM 交互、分页、滚动定位、selection、annotation activation 等高内聚行为迁移到 runtime controller/service，session 继续保存状态。

**Tech Stack:** TypeScript strict mode, Vitest, pnpm workspace, existing runtime services.

---

## 拆分判断

当前 `reader.ts` 主要剩余职责：

- public API：打开书籍、渲染、导航、偏好、搜索、标注、选择、销毁。
- 状态代理：`ReaderDocumentSession`、`ReaderViewSession`、`ReaderNavigationSession`、`ReaderRenderSession`、`ReaderSelectionSession`、`ReaderAnnotationSession` 的 getter/setter。
- 渲染副作用：DOM/CANVAS render、主题、资源 URL、viewport 测量。
- 交互副作用：resize、scroll、selectionchange、pointer、keyboard、link activation。
- 派生计算：page/spread、locator/viewport 映射、scroll anchor、annotation viewport rect。

接口成本低于继续保持单类内聚成本，原因：

- 现有 session 已经把核心状态分组，控制器可以按 session 边界读取状态。
- 已有 `ReaderNavigationController`、`ReaderInteractionController`、`ReaderRenderOrchestrator`、`ReaderDomPaginationService`，说明项目已经接受 controller/service 分层。
- 留在 `EpubReader` 内的多数方法通过明确输入输出和 DOM 容器副作用连接，适合迁移到 controller。

接受保留在 `reader.ts` 的职责：

- constructor 和依赖装配。
- 公开 API 的兼容签名。
- 事件订阅/转发。
- 少量跨控制器协调逻辑。

不接受的拆分：

- 只把代码搬到一个 `legacy-reader.ts`。
- 通过关闭 TypeScript 检查完成迁移。
- 把所有私有状态暴露成 public API。

## 状态 × 操作 → 结果矩阵

| 状态               | 用户/系统操作                          | 期望结果                                                               | 副作用边界                       |
| ------------------ | -------------------------------------- | ---------------------------------------------------------------------- | -------------------------------- |
| 未打开书籍         | `render/next/prev/goToLocation/search` | 空操作或返回空结果，保持当前兼容行为                                   | 不触发 DOM 渲染                  |
| 已打开未渲染       | `render`                               | 建立 section 输入、渲染当前 section、同步 locator/page                 | render controller                |
| scroll 模式        | 滚动容器                               | 根据 scrollTop 同步 section、locator、visible bounds，必要时刷新 slice | scroll controller                |
| paginated 模式     | `next/prev/goToPage`                   | 更新 page/spread，滚动 DOM page 或渲染 canvas page                     | pagination/navigation controller |
| 模式切换中         | `setMode`                              | 捕获旧 locator，切换偏好，重新 render，再恢复定位                      | facade 协调 render + navigation  |
| DOM selection 存在 | selectionchange                        | 生成 selection snapshot 和 highlight state                             | selection controller             |
| annotation 已设置  | render 或 selection 变化               | 同步 decoration、viewport snapshot、activation payload                 | annotation controller            |
| 外链点击           | DOM click                              | 触发 external link 回调或返回 resolved locator                         | interaction controller           |
| 图片资源晚到       | image load promise 完成                | 延迟刷新渲染，并保持 scroll anchor                                     | render/scroll controller         |
| destroy 后         | 任何异步晚到回调                       | 不再写 DOM，不再 emit reader event                                     | facade 生命周期屏障              |

## 可执行任务列表

### Task 1: 建立 reader 内部 host 和控制器边界

**Files:**

- Create: `packages/core/src/runtime/reader-runtime-host.ts`
- Modify: `packages/core/src/runtime/reader.ts`

**Steps:**

1. 定义内部 host 类型，表达 controller 需要访问的状态和副作用入口。
2. 将 controller 依赖保持为内部类型，不导出到 package public API。
3. 运行 `pnpm --filter @yves-epub/core typecheck`。

**Done:** 新类型只服务 runtime 内部，未改变 `EpubReader` 公开 API。

### Task 2: 抽出 render 和 DOM render side effects

**Files:**

- Create: `packages/core/src/runtime/reader-render-controller.ts`
- Modify: `packages/core/src/runtime/reader.ts`

**Steps:**

1. 迁移 `renderCurrentSection` 到 `getFontFamily` 范围内的渲染、资源、viewport 方法。
2. `EpubReader.render()` 委派给 render controller。
3. 保留现有 `ReaderRenderSession` 状态。
4. 运行 reader render/navigation 相关测试。

**Done:** `reader.ts` 不再持有大段 DOM/CANVAS render 实现。

### Task 3: 抽出 interaction listener 和 click handling

**Files:**

- Create: `packages/core/src/runtime/reader-dom-interaction-controller.ts`
- Modify: `packages/core/src/runtime/reader.ts`

**Steps:**

1. 迁移 resize、scroll、selectionchange、pointer、keyboard listener 的 attach/detach。
2. 迁移 DOM click、paginated click、center tap、point conversion。
3. 保持 listener 注册和释放路径由 `EpubReader.destroy()` 统一触发。
4. 运行 external link、navigation、selection 相关测试。

**Done:** DOM 事件副作用集中在 interaction controller。

### Task 4: 抽出 pagination 和 viewport mapping

**Files:**

- Create: `packages/core/src/runtime/reader-pagination-controller.ts`
- Modify: `packages/core/src/runtime/reader.ts`

**Steps:**

1. 迁移 page/spread 解析、measured DOM pagination、locator/viewport 映射。
2. `getPaginationInfo`、`goToPage`、`mapLocatorToViewport`、`mapViewportToLocator` 委派。
3. 保持 `ReaderNavigationSession` 和 `ReaderRenderSession` 为状态来源。
4. 运行 pagination、spread、hybrid navigation 相关测试。

**Done:** page/spread 计算从 facade 移出。

### Task 5: 抽出 scroll relocation 和 scroll window

**Files:**

- Create: `packages/core/src/runtime/reader-scroll-controller.ts`
- Modify: `packages/core/src/runtime/reader.ts`

**Steps:**

1. 迁移 locator scroll、anchor capture/restore、scroll window refresh。
2. 保留 programmatic scroll 屏障，防止滚动事件回写旧 locator。
3. 保持 image resource late refresh 走显式调度入口。
4. 运行 scroll mode、bookmark、progress 相关测试。

**Done:** scroll 定位和 slice 刷新逻辑从 facade 移出。

### Task 6: 抽出 selection 和 annotation activation 编排

**Files:**

- Create: `packages/core/src/runtime/reader-selection-controller.ts`
- Create or extend: `packages/core/src/runtime/reader-annotation-controller.ts`
- Modify: `packages/core/src/runtime/reader.ts`

**Steps:**

1. 迁移 selection target、endpoint、snapshot、highlight state。
2. 迁移 annotation range、quote、viewport rect、activation payload。
3. public selection/annotation API 保持原签名，由 facade 委派。
4. 运行 annotation、decoration、selection session 相关测试。

**Done:** selection/annotation 行为不再挤在 `reader.ts` 尾部。

### Task 7: 收敛 facade 并验证行数

**Files:**

- Modify: `packages/core/src/runtime/reader.ts`

**Steps:**

1. 删除被 controller 取代的私有 getter/setter 代理。
2. 将公开 API 控制在短委派方法。
3. 验证 `reader.ts` 行数在 1200 到 2000。
4. 运行 `pnpm ci:check`。

**Done:** `reader.ts` 是装配和 public facade，行为主体在 controller/service。

## 回归风险

- 模式切换恢复定位：旧 locator 可能在 render 后被 scroll 同步覆盖。
- paginated DOM click：RTL、spread slot 和 center tap 事件容易回归。
- selectionchange：DOM selection 晚到可能覆盖 pinned selection。
- image resource late refresh：异步图片尺寸回调可能触发过期 render。
- destroy：resize/scroll/resource 延迟任务必须释放。

## 验证命令

```bash
pnpm --filter @yves-epub/core typecheck
pnpm --filter @yves-epub/core test
pnpm ci:check
```

## 实际拆分结果

本轮实现按职责收敛为以下 runtime 模块：

- `reader.ts`: 保留 `EpubReader` 构造装配、session getter/setter、公开 API 和私有桥接方法，具体行为委派给 runtime controller。
- `reader-runtime-controller.ts`: 组合门面，保留 `ReaderRuntimeHost` 契约和对子 controller 的转发。
- `reader-runtime-api-controller.ts`: 打开书籍、阅读导航、偏好设置、搜索、书签、事件 hook、可访问性快照等公开 API 主路径。
- `reader-runtime-interaction-controller.ts`: hit test、DOM/canvas 坐标映射、事件监听、点击导航、搜索结果重定位。
- `reader-runtime-render-controller.ts`: DOM/canvas 渲染、资源解析、阅读语言和 spread 上下文、容器主题同步。
- `reader-runtime-pagination-controller.ts`: 页列表生成、页码/spread 映射、分页进度。
- `reader-runtime-scroll-controller.ts`: scroll 定位、滚动窗口、延迟刷新、section 索引。
- `reader-runtime-selection-annotation-controller.ts`: selection、annotation、highlight/underline 派生 decoration 和激活事件。
- `reader-runtime-helpers.ts`: runtime 内部纯 helper。

最终行数核对：

- `reader.ts`: 1958
- `reader-runtime-controller.ts`: 1854
- 最大职责模块为 `reader-runtime-selection-annotation-controller.ts`: 1216

最终验证：`pnpm ci:check` 通过，覆盖 recursive typecheck、package boundaries、lint、Vitest 464 tests、workspace build。
