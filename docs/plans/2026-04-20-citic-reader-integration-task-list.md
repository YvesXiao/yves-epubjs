# yves-epub 接入 citicpub-enterprise-rn Task 文档

**来源计划**：[2026-04-20-citic-reader-integration-implementation-plan.md](./2026-04-20-citic-reader-integration-implementation-plan.md)

**执行原则**
1. 严格按任务顺序执行
2. 每个任务完成后先做定向验证
3. 定向验证通过后再进入下一个任务
4. 全部任务完成后执行回归测试

---

## Task 1: 核心 contract 补齐

**状态**：`completed`

**目标**
- 新增 `ReadingProgressSnapshot`
- 新增 `TocTarget`
- 新增 `SectionRenderedEvent`
- 新增 `SectionRelocatedEvent`
- 扩展 `ReaderOptions`
- 为 `EpubReader` 增加新的 public API 签名

**文件**
- `packages/core/src/model/types.ts`
- `packages/core/src/runtime/reader.ts`
- `packages/core/test/reader-compat.test.ts`

**验证**
```powershell
pnpm typecheck
pnpm --filter @yves-epub/core test -- reader-compat.test.ts
```

**结果**
- contract 已补齐
- 定向测试已通过

## Task 2: 阅读进度 API

**状态**：`completed`

**目标**
- 实现 `getReadingProgress()`
- 实现 `goToProgress()`
- 保持 `scroll` / `paginated` 两种模式下的进度语义稳定

**文件**
- `packages/core/src/runtime/reader.ts`
- `packages/core/test/reader-hybrid-progress.test.ts`
- `packages/core/test/reader-navigation.test.ts`
- `packages/core/test/reader-runtime-navigation.test.ts`

**验证**
```powershell
pnpm --filter @yves-epub/core test -- reader-hybrid-progress.test.ts
pnpm --filter @yves-epub/core test -- reader-navigation.test.ts
pnpm --filter @yves-epub/core test -- reader-runtime-navigation.test.ts
```

**结果**
- 进度快照可用于 UI 展示、续读和百分比跳转
- 定向测试已通过

## Task 3: href 导航与 TOC 目标

**状态**：`completed`

**目标**
- 实现 `goToHref()`
- 公开 `resolveHrefLocator()`
- 实现 `getTocTargets()`
- 统一 TOC 跳转与内部链接解析链路

**文件**
- `packages/core/src/runtime/reader.ts`
- `packages/core/src/runtime/navigation-target.ts`
- `packages/core/test/navigation-target.test.ts`
- `packages/core/test/reader-navigation.test.ts`
- `packages/core/test/reader-hybrid-navigation.test.ts`

**验证**
```powershell
pnpm --filter @yves-epub/core test -- navigation-target.test.ts
pnpm --filter @yves-epub/core test -- reader-navigation.test.ts
pnpm --filter @yves-epub/core test -- reader-hybrid-navigation.test.ts
```

**结果**
- `href -> locator` 路径已经稳定可用
- 定向测试已通过

## Task 4: 章节生命周期 hook

**状态**：`completed`

**目标**
- 实现 `onSectionRendered`
- 实现 `onSectionRelocated`
- 做 hook 错误隔离，保持阅读器主流程稳定

**文件**
- `packages/core/src/model/types.ts`
- `packages/core/src/runtime/reader.ts`
- `packages/core/test/reader-runtime-navigation.test.ts`
- `packages/core/test/reader-chapter-render-routing.test.ts`
- `packages/core/test/dom-chapter-renderer.test.ts`

**验证**
```powershell
pnpm --filter @yves-epub/core test -- reader-runtime-navigation.test.ts
pnpm --filter @yves-epub/core test -- reader-chapter-render-routing.test.ts
pnpm --filter @yves-epub/core test -- dom-chapter-renderer.test.ts
```

**结果**
- DOM 和 Canvas 两条路径都能稳定发出生命周期事件
- hook 失败不会打断主流程

## Task 5: citic 宿主适配

**状态**：`completed`

**目标**
- 宿主层完成 `base64 -> Uint8Array`
- 进度链路切换到 `getReadingProgress()` / `goToProgress()`
- TOC 链路切换到 `goToHref()` / `getTocTargets()`
- 图片与封面补丁切换到 `onSectionRendered` / `onSectionRelocated`

**文件**
- `C:\xyfProject\citicpub-enterprise-rn\src\components\Web\EbookReader\index.tsx`
- `C:\xyfProject\citicpub-enterprise-rn\src\components\Web\EbookReader\components\ProgressPanel.tsx`
- `C:\xyfProject\citicpub-enterprise-rn\src\components\Web\EbookReader\components\TableOfContents.tsx`
- `C:\xyfProject\citicpub-enterprise-rn\src\store\useEbookReaderStore.ts`
- `C:\xyfProject\citicpub-enterprise-rn\package.json`
- `C:\xyfProject\citicpub-enterprise-rn\package-lock.json`

**验证**
```powershell
npm run build:web:test
```

**结果**
- `citic` 宿主已经不再依赖 `epub.js` 的 progress / cfi / rendition 语义
- Expo Web 构建通过
- 本地 `@yves-epub/core` 通过 tarball 安装到 `citic`，避免 `file:` junction 与 Metro / pnpm 联动解析问题

## Task 6: 文档回填

**状态**：`completed`

**目标**
- 回填最终接口
- 回填宿主接入方式
- 更新需求文档与架构文档

**文件**
- `docs/plans/2026-04-20-citic-reader-integration-requirements.md`
- `docs/project-architecture.md`

**验证**
- 文档内容与最终实现一致

**结果**
- 文档已回填
- 可作为后续接入和维护依据

## 回归测试

**状态**：`completed`

**验证命令**
```powershell
pnpm typecheck
pnpm --filter @yves-epub/core test
pnpm --filter @yves-epub/demo build
```

**补充验证**
```powershell
cd C:\xyfProject\citicpub-enterprise-rn
npm run build:web:test
```

**完成标准**
- core、demo 回归通过
- citic 宿主构建通过
- 可以进入最终交付

**结果**
- `pnpm typecheck` 通过
- `pnpm --filter @yves-epub/demo build` 通过
- `C:\xyfProject\citicpub-enterprise-rn` 的 `npm run build:web:test` 通过
- `pnpm --filter @yves-epub/core test` 未全绿，当前仍有 4 个既有失败：
  - `packages/core/test/reader-decoration.test.ts`
  - `packages/core/test/reader-hybrid-search.test.ts`
  - `packages/core/test/reader-spread.test.ts` 中 2 个用例
