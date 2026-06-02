# Citic Reader Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 `yves-epub` 补齐接入 `citicpub-enterprise-rn` Web 阅读器所需的核心 API，并给出宿主侧替换路径。

**Architecture:** 这次实现分两层推进。核心层负责补“阅读器语义”，包括进度、`href` 导航、TOC 目标和章节生命周期 hook。宿主层负责输入适配、UI 绑定和业务上报，避免把 citic 的产品逻辑反向塞进 `yves-epub`。

**Tech Stack:** TypeScript, Vitest, `packages/core` runtime/parser/renderer, `citicpub-enterprise-rn` Web React 宿主

---

## 总体策略

### 目标边界

本轮实现只做 Web 阅读器接入所需的最小核心能力：

1. `getReadingProgress()` 和 `goToProgress()`
2. `goToHref()`、`resolveHrefLocator()`、`getTocTargets()`
3. `onSectionRendered` 和 `onSectionRelocated`

`base64` 直开保持为二期评估项。本轮优先由 citic 适配层把 `base64` 转成 `Uint8Array` 后再调用 `open()`。

### 验证原则

- 先补公共 contract，再补行为
- 先补单元测试，再补 reader 行为
- 每个阶段都要覆盖 `scroll` 和 `paginated`
- DOM 路径与 Canvas 路径都要有回归验证

### 总体验收命令

```powershell
pnpm --filter @yves-epub/core test
pnpm typecheck
pnpm --filter @yves-epub/demo build
```

备注：当前仓库已有无关失败时，执行阶段应改为跑受影响的定向测试文件。

## Task 1: 补公共类型与 Reader 对外 contract

**Files:**
- Modify: `packages/core/src/model/types.ts`
- Modify: `packages/core/src/runtime/reader.ts`
- Test: `packages/core/test/reader-compat.test.ts`

**目标**

先把后续实现要依赖的公共接口定义稳定下来，避免边写逻辑边改签名。

**需要新增的类型**

```ts
export type ReadingProgressSnapshot = {
  overallProgress: number
  sectionProgress: number
  spineIndex: number
  sectionId: string
  sectionHref: string
  currentPage?: number
  totalPages?: number
}

export type TocTarget = {
  id: string
  label: string
  href: string
  depth: number
  parentId?: string
  locator: Locator
}

export type SectionRenderedEvent = {
  spineIndex: number
  sectionId: string
  sectionHref: string
  mode: ReadingMode
  backend: "dom" | "canvas"
  diagnostics: RenderDiagnostics | null
  containerElement?: HTMLElement
  contentElement?: HTMLElement
  isCurrent: boolean
}

export type SectionRelocatedEvent = {
  spineIndex: number
  sectionId: string
  sectionHref: string
  locator: Locator | null
  mode: ReadingMode
  backend: "dom" | "canvas"
  diagnostics: RenderDiagnostics | null
  containerElement?: HTMLElement
  contentElement?: HTMLElement
}
```

**Reader 需要新增的方法与选项**

```ts
getReadingProgress(): ReadingProgressSnapshot | null
goToProgress(progress: number): Promise<Locator | null>
goToHref(href: string): Promise<Locator | null>
resolveHrefLocator(href: string): Locator | null
getTocTargets(): TocTarget[]
```

```ts
type ReaderOptions = {
  ...
  onSectionRendered?: (event: SectionRenderedEvent) => void | Promise<void>
  onSectionRelocated?: (event: SectionRelocatedEvent) => void | Promise<void>
}
```

**Step 1: 写 contract 测试**

- 在 `packages/core/test/reader-compat.test.ts` 增加最小 public API shape 断言
- 验证 reader 实例存在新增方法
- 验证 `ReaderOptions` 可接受新增 hook

**Step 2: 在 `types.ts` 补类型**

- 新增 4 个对外类型
- 保持命名与现有 `ReaderOptions`、`ReaderEventMap` 风格一致

**Step 3: 在 `reader.ts` 补方法签名和占位实现**

- 先返回 `null` 或空数组占位
- 不做最终逻辑，只保证类型可编译

**Step 4: 跑类型与 contract 测试**

```powershell
pnpm typecheck
pnpm --filter @yves-epub/core test -- reader-compat.test.ts
```

**完成标准**

- 新接口签名稳定
- 不破坏现有 `EpubReader` 构造和已有 public API

## Task 2: 实现阅读进度 API

**Files:**
- Modify: `packages/core/src/runtime/reader.ts`
- Modify: `packages/core/src/model/types.ts`
- Test: `packages/core/test/reader-hybrid-progress.test.ts`
- Test: `packages/core/test/reader-navigation.test.ts`
- Test: `packages/core/test/reader-runtime-navigation.test.ts`

**目标**

提供 citic 可直接消费的全书进度快照与百分比跳转能力。

**设计约束**

- `overallProgress` 固定为 `0 ~ 1`
- `goToProgress()` 必须 `clamp`
- `paginated` 模式优先使用全书 page number / total pages
- `scroll` 模式使用章节累计权重 + 当前章节偏移
- DOM 章节与 Canvas 章节共用同一套进度语义

**实现建议**

1. 在 `reader.ts` 增加内部 helper：
   - `buildReadingProgressSnapshot()`
   - `resolveOverallProgressForPaginated()`
   - `resolveOverallProgressForScroll()`
   - `resolveLocatorForOverallProgress()`

2. 复用现有状态：
   - `this.currentSectionIndex`
   - `this.currentPageNumber`
   - `this.pages`
   - `this.sectionEstimatedHeights`
   - `this.locator`

3. 先保证一致性，再追求高精度：
   - `scroll` 模式第一版接受“稳定估算”
   - 只要单调、可恢复、跨章节不跳变，就可进入集成阶段

**状态 × 操作 → 结果**

| 状态 | 操作 | 结果 |
| --- | --- | --- |
| 未打开 | `getReadingProgress()` | `null` |
| 已打开未渲染 | `getReadingProgress()` | `null` 或首章稳定值 |
| 已渲染 | `getReadingProgress()` | 返回快照 |
| 已渲染 | `goToProgress(0)` | 书开头 |
| 已渲染 | `goToProgress(1)` | 书末尾 |
| 跳转中 | 再次 `goToProgress(y)` | 后一次覆盖前一次 |

**Step 1: 先写失败测试**

- 在 `reader-hybrid-progress.test.ts` 增加：
  - scroll 模式整体进度单调递增
  - paginated 模式整体进度受页号驱动
  - `goToProgress(0)` 与 `goToProgress(1)` 的边界跳转
- 在 `reader-navigation.test.ts` 增加：
  - 多章节分页时 `overallProgress` 随章节变化递增

**Step 2: 在 `reader.ts` 实现 `getReadingProgress()`**

- 组装 `ReadingProgressSnapshot`
- 未打开书时返回 `null`

**Step 3: 在 `reader.ts` 实现 `goToProgress()`**

- 先归一化到 `0 ~ 1`
- 解析目标章节或目标页
- 调用已有 `goToLocation()` 或内部定位链路

**Step 4: 跑定向测试**

```powershell
pnpm --filter @yves-epub/core test -- reader-hybrid-progress.test.ts
pnpm --filter @yves-epub/core test -- reader-navigation.test.ts
pnpm --filter @yves-epub/core test -- reader-runtime-navigation.test.ts
```

**完成标准**

- 续读进度、拖动进度、阅读上报都能只依赖 `overallProgress`
- DOM/Canvas 混合章节下进度语义不跳变

## Task 3: 实现 href 导航和 TOC 目标暴露

**Files:**
- Modify: `packages/core/src/runtime/reader.ts`
- Modify: `packages/core/src/runtime/navigation-target.ts`
- Modify: `packages/core/src/model/types.ts`
- Test: `packages/core/test/navigation-target.test.ts`
- Test: `packages/core/test/reader-navigation.test.ts`
- Test: `packages/core/test/reader-hybrid-navigation.test.ts`

**目标**

让宿主层从 `setLocation(href)` 平滑切到 `goToHref(href)`，并用 `getTocTargets()` 替代自行拼装 TOC CFI。

**设计约束**

- `goToHref()` 支持 `chapter.xhtml`
- 支持 `chapter.xhtml#anchor`
- 支持 `#anchor`
- 找不到目标时返回 `null` 或 no-op
- `getTocTargets()` 返回扁平列表，保留层级深度

**实现建议**

1. 在 `navigation-target.ts` 增加 TOC 扁平化 helper：

```ts
flattenTocTargets(book: Book): TocTarget[]
```

2. 公开 `reader.resolveHrefLocator()`：

- 直接复用现有私有 `resolveHrefLocator()`
- 调整为 public，避免宿主层重复实现 `href -> locator`

3. 实现 `reader.goToHref()`：

- 先 `resolveHrefLocator()`
- 成功后复用 `goToLocation()`

**状态 × 操作 → 结果**

| 状态 | 操作 | 结果 |
| --- | --- | --- |
| 已打开 | `goToHref("chapter.xhtml")` | 跳到章节开头 |
| 已打开 | `goToHref("chapter.xhtml#a")` | 跳到锚点 |
| 已打开 | `goToHref("#a")` | 当前书内解析 |
| 已打开 | `goToHref("missing.xhtml")` | `null` 或 no-op |
| 已打开 | `getTocTargets()` | 返回扁平 TOC |

**Step 1: 先写失败测试**

- `navigation-target.test.ts`：
  - `href` 与 `href#anchor` 解析
  - 当前章节 `#anchor` 解析
- `reader-navigation.test.ts`：
  - `goToHref()` 基本跳转
- `reader-hybrid-navigation.test.ts`：
  - DOM 章节和 Canvas 章节都能经由 `href` 跳转
  - `getTocTargets()` 返回稳定 `locator`

**Step 2: 改 `navigation-target.ts`**

- 保持 `resolveBookHrefLocator()` 作为底层单点
- 新增 TOC 扁平化逻辑，避免在 `reader.ts` 手工遍历树

**Step 3: 改 `reader.ts`**

- 暴露 public `resolveHrefLocator()`
- 增加 `goToHref()`
- 增加 `getTocTargets()`

**Step 4: 跑定向测试**

```powershell
pnpm --filter @yves-epub/core test -- navigation-target.test.ts
pnpm --filter @yves-epub/core test -- reader-navigation.test.ts
pnpm --filter @yves-epub/core test -- reader-hybrid-navigation.test.ts
```

**完成标准**

- 宿主层不再需要拼 `cfi`
- 目录跳转和内部链接跳转走同一条核心链路

## Task 4: 实现章节生命周期 hook

**Files:**
- Modify: `packages/core/src/model/types.ts`
- Modify: `packages/core/src/runtime/reader.ts`
- Optional Modify: `packages/core/src/renderer/dom-chapter-renderer.ts`
- Test: `packages/core/test/reader-runtime-navigation.test.ts`
- Test: `packages/core/test/reader-chapter-render-routing.test.ts`
- Test: `packages/core/test/dom-chapter-renderer.test.ts`

**目标**

替换 citic 当前对 `rendition.on('rendered')` 与 `rendition.on('relocated')` 的依赖。

**设计约束**

- 第一版优先保证 DOM 路径
- Canvas 路径允许只返回 metadata
- hook 抛错后主流程继续
- 渲染完成回调必须晚于 DOM 挂载

**实现建议**

1. 在 `reader.ts` 中新增内部方法：
   - `notifySectionRendered()`
   - `notifySectionRelocated()`
   - `resolveRenderedSectionElements(sectionId)`

2. 首选最小改动方案：
   - DOM 场景通过容器内 `querySelector` 获取 `.epub-dom-section`
   - 如查询链不稳定，再改 `dom-chapter-renderer.ts` 返回元素引用

3. 触发点建议：
   - `renderCurrentSection()` 成功完成章节渲染后触发 `onSectionRendered`
   - 所有 `this.events.emit("relocated"... )` 的关键路径统一走 `notifySectionRelocated()`

**状态 × 操作 → 结果**

| 状态 | 操作 | 结果 |
| --- | --- | --- |
| DOM 章节完成渲染 | `onSectionRendered` | 提供 DOM 引用 |
| Canvas 章节完成渲染 | `onSectionRendered` | 提供 metadata |
| 章节重定位 | `onSectionRelocated` | 提供当前 locator |
| hook 抛错 | 阅读器继续运行 | 错误被隔离 |

**Step 1: 先写失败测试**

- `reader-runtime-navigation.test.ts`：
  - `onSectionRelocated` 在真实跳转后被调用
  - hook 抛错不影响 reader 状态
- `reader-chapter-render-routing.test.ts`：
  - DOM 章节渲染后能收到 `contentElement`
  - Canvas 章节渲染后至少收到 `backend` 与 `sectionId`

**Step 2: 在 `reader.ts` 实现 hook 调度**

- 统一包一层错误隔离
- 避免每条重定位分支手工重复拼事件对象

**Step 3: 只在需要时改 `dom-chapter-renderer.ts`**

- 如果现有 DOM 查询已稳定，保持不动
- 如果需要更明确的元素引用，再扩展 render 返回值

**Step 4: 跑定向测试**

```powershell
pnpm --filter @yves-epub/core test -- reader-runtime-navigation.test.ts
pnpm --filter @yves-epub/core test -- reader-chapter-render-routing.test.ts
pnpm --filter @yves-epub/core test -- dom-chapter-renderer.test.ts
```

**完成标准**

- citic 的封面归一化和图片重排逻辑有稳定挂点
- hook 不引入新的渲染竞态

## Task 5: citic 宿主适配改造

**Files:**
- Modify: `C:\xyfProject\citicpub-enterprise-rn\src\components\Web\EbookReader\index.tsx`
- Modify: `C:\xyfProject\citicpub-enterprise-rn\src\components\Web\EbookReader\components\ProgressPanel.tsx`
- Modify: `C:\xyfProject\citicpub-enterprise-rn\src\components\Web\EbookReader\components\TableOfContents.tsx`
- Optional Modify: `C:\xyfProject\citicpub-enterprise-rn\src\store\useEbookReaderStore.ts`

**目标**

把 citic 从 `react-reader/epub.js` 依赖迁到 `yves-epub` 的新接口。

**替换清单**

1. 输入：
   - `decryptEbook()` 输出的 `base64 string`
   - 改为适配层内转 `Uint8Array`
   - 调用 `reader.open(uint8Array)`

2. 进度：
   - 删除 `locations.generate(1650)`
   - 删除 `percentageFromCfi` / `cfiFromPercentage`
   - 改用 `reader.getReadingProgress()` 和 `reader.goToProgress()`

3. 目录：
   - 删除 `setLocation(href)`
   - 改用 `reader.goToHref(href)`
   - 用 `reader.getTocTargets()` 驱动目录 UI

4. 生命周期：
   - 删除 `rendition.on('rendered')`
   - 删除 `rendition.on('relocated')`
   - 改用 `onSectionRendered` 和 `onSectionRelocated`

**Step 1: 做输入适配**

- 把 base64 解码逻辑收口在 citic 组件内部
- 不把 `base64` 能力反推到核心层

**Step 2: 替换进度面板**

- `ProgressPanel.tsx` 只消费 `overallProgress`
- 拖动完成后只调用 `goToProgress()`

**Step 3: 替换目录面板**

- `TableOfContents.tsx` 只消费 `getTocTargets()` 的结果
- 章节高亮优先按 `sectionHref` 或 `locator`

**Step 4: 迁移图片/封面补丁**

- 将现有 `rendered/relocated` 补丁迁到新 hook

**Step 5: 做一次真实书籍冒烟**

- 选择 1 本纯文本书
- 选择 1 本文字为主、少量图片书
- 选择 1 本图片/封面敏感书

**完成标准**

- 宿主层不再依赖 `epub.js` 的 locations/cfi/rendition 私有语义
- 原有续读、进度条、目录、图片补丁都能继续工作

## Task 6: 文档与发布说明

**Files:**
- Modify: `docs/plans/2026-04-20-citic-reader-integration-requirements.md`
- Modify: `docs/project-architecture.md`
- Optional Modify: `packages/demo/src/*`

**目标**

把新 API 写进仓库文档，避免后续接入者再读源码反推语义。

**Step 1: 更新需求文档**

- 把最终落地的 TS 签名回填到需求文档
- 关闭已解决的开放问题

**Step 2: 更新架构文档**

- 补一节“宿主集成 API”
- 说明哪些能力属于核心层，哪些属于适配层

**Step 3: 如有必要，补 demo 示例**

- 提供 `goToHref()`、`goToProgress()`、hook 的最小示例

## 风险检查清单

实施过程中，每个任务都要额外检查以下风险：

1. `scroll` 与 `paginated` 的进度定义是否一致
2. `goToHref()`、内部链接点击、TOC 点击是否复用同一解析路径
3. hook 触发时机是否晚于 DOM 挂载
4. DOM 与 Canvas 混合章节切换时，定位事件是否重复触发
5. 新增 public API 是否破坏已有测试基线

## 建议执行顺序

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6

## 交付检查表

- `yves-epub` 核心层新增 API 已通过类型检查
- 进度、导航、hook 三条能力链都有测试覆盖
- citic 宿主层替换点清晰且不依赖 `epub.js` 私有对象
- 文档已回填最终接口与使用方式
