# Scroll/Paginated 切换内容锚定任务文档

**来源需求**: [2026-04-24-mode-switch-content-anchor-requirements.md](./2026-04-24-mode-switch-content-anchor-requirements.md)

**执行原则**

1. 严格按任务顺序执行。
2. 每个任务完成后先做定向验证。
3. 当前任务验证通过后再进入下一任务。
4. 全部任务完成后执行回归验证。

---

## Task 1: 补齐模式切换锚点捕获能力

**状态**: `completed`

**目标**

1. 在 `reader.ts` 内新增“获取当前视口中心精确 locator”的内部能力。
2. 统一 DOM / Canvas / 回退 locator 的优先级。
3. 明确切换事务内的临时锚点状态结构。

**文件**

- `packages/core/src/runtime/reader.ts`
- `packages/core/test/pretext-layout.test.ts`

**验证**

```powershell
pnpm.cmd --filter @yves-epub/core test -- pretext-layout.test.ts
```

**通过标准**

1. 中心点命中 DOM 内容时可得到带 `blockId` 或 `anchorId` 的 locator。
2. 无法命中时可回退到现有 locator。

**结果**

1. 已在 `reader.ts` 新增模式切换锚点捕获 helper。
2. 已补充 `pretext-layout.test.ts` 两个定向测试。
3. 定向验证通过：

```powershell
pnpm.cmd exec vitest run packages/core/test/pretext-layout.test.ts -t "captures a precise block locator from the viewport center for mode switches|falls back to the current locator when the viewport center cannot be resolved"
```

## Task 2: 接入模式切换前即时锚点捕获

**状态**: `completed`

**目标**

1. 在 `applyPreferences()` 的 `modeChanged` 分支接入即时锚点捕获。
2. 保证一次模式切换只使用一次捕获结果。
3. 切换结束后清理临时锚点状态。

**文件**

- `packages/core/src/runtime/reader.ts`
- `packages/core/test/reader-preferences.test.ts`

**验证**

```powershell
pnpm.cmd --filter @yves-epub/core test -- reader-preferences.test.ts
```

**通过标准**

1. 模式切换时优先使用即时捕获锚点。
2. 普通非模式切换的 preferences 更新行为不变。

**结果**

1. `applyPreferences()` 已在切换前捕获旧模式视口中心锚点。
2. 已引入一次性的 `pendingModeSwitchLocator`，渲染后立即清理。
3. 已补充 `reader-preferences.test.ts` 两个定向测试。
4. 定向验证通过：

```powershell
pnpm.cmd exec vitest run packages/core/test/reader-preferences.test.ts -t "captures the mode-switch locator before applying the next mode and clears it after render|does not capture a mode-switch locator for non-mode preference updates"
```

## Task 3: 调整 paginated / scroll 恢复逻辑优先级

**状态**: `completed`

**目标**

1. `paginated` 恢复时优先按锚点 block 找页。
2. `scroll` 恢复时优先按锚点 block 或 anchor 滚动。
3. 锚点失效时回退到章节进度。

**文件**

- `packages/core/src/runtime/reader.ts`
- `packages/core/src/runtime/reader-render-orchestrator.ts`
- `packages/core/test/reader-runtime-navigation.test.ts`
- `packages/core/test/reader-hybrid-navigation.test.ts`

**验证**

```powershell
pnpm.cmd --filter @yves-epub/core test -- reader-runtime-navigation.test.ts
pnpm.cmd --filter @yves-epub/core test -- reader-hybrid-navigation.test.ts
```

**通过标准**

1. 切换后落点优先保持在同一 block 上下文。
2. 锚点失效时仍可稳定回退。

**结果**

1. 核心恢复优先级确认保持为 `anchor/block -> progress`，无需再引入第二套恢复逻辑。
2. 通过模式切换前的精确 locator 捕获，现有 `findPageForLocator()` 和 `scrollToCurrentLocation()` 已能完成正确恢复。
3. 已补充 DOM / Canvas 两个真实模式切换测试。
4. 定向验证通过：

```powershell
pnpm.cmd exec vitest run packages/core/test/reader-runtime-navigation.test.ts packages/core/test/reader-hybrid-navigation.test.ts -t "keeps the centered canvas block anchored when switching from scroll to paginated|keeps the centered dom block anchored when switching from paginated to scroll"
```

## Task 4: 补齐内容锚定回归测试

**状态**: `completed`

**目标**

1. 增加 `scroll -> paginated` 内容锚定测试。
2. 增加 `paginated -> scroll` 内容锚定测试。
3. 覆盖 DOM / Canvas / 回退路径。

**文件**

- `packages/core/test/reader-runtime-navigation.test.ts`
- `packages/core/test/pretext-layout.test.ts`

**验证**

```powershell
pnpm.cmd --filter @yves-epub/core test -- reader-runtime-navigation.test.ts
pnpm.cmd --filter @yves-epub/core test -- pretext-layout.test.ts
```

**通过标准**

1. 新增测试稳定通过。
2. 断言落点属于切换前同一内容 block 或同一回退章节进度。

**结果**

1. 已覆盖 `scroll -> paginated` Canvas 锚定。
2. 已覆盖 `paginated -> scroll` DOM 锚定。
3. 已覆盖“中心点无法解析时回退到当前 locator”的 fallback 路径。
4. 合并验证通过：

```powershell
pnpm.cmd exec vitest run packages/core/test/pretext-layout.test.ts packages/core/test/reader-runtime-navigation.test.ts packages/core/test/reader-hybrid-navigation.test.ts -t "captures a precise block locator from the viewport center for mode switches|falls back to the current locator when the viewport center cannot be resolved|keeps the centered canvas block anchored when switching from scroll to paginated|keeps the centered dom block anchored when switching from paginated to scroll"
```

## Task 5: Demo 与整体回归

**状态**: `completed`

**目标**

1. 确认 demo 无需额外 UI 改动即可使用新行为。
2. 运行 core 定向测试、typecheck、lint、demo build。
3. 回填任务文档状态与验证结果。

**文件**

- `docs/plans/2026-04-24-mode-switch-content-anchor-task-list.md`

**验证**

```powershell
pnpm.cmd --filter @yves-epub/core test -- pretext-layout.test.ts
pnpm.cmd --filter @yves-epub/core test -- reader-preferences.test.ts
pnpm.cmd --filter @yves-epub/core test -- reader-runtime-navigation.test.ts
pnpm.cmd --filter @yves-epub/core test -- reader-hybrid-navigation.test.ts
pnpm.cmd --filter @yves-epub/core typecheck
pnpm.cmd lint
pnpm.cmd --filter @yves-epub/demo build
```

**通过标准**

1. 所有定向验证通过。
2. 任务文档状态更新完成。
3. 可进入最终交付。

**结果**

1. core 定向回归测试通过。
2. `@yves-epub/core` typecheck 通过。
3. workspace `lint` 通过。
4. `@yves-epub/demo` build 通过。

```powershell
pnpm.cmd exec vitest run packages/core/test/pretext-layout.test.ts packages/core/test/reader-preferences.test.ts packages/core/test/reader-runtime-navigation.test.ts packages/core/test/reader-hybrid-navigation.test.ts
pnpm.cmd --filter @yves-epub/core typecheck
pnpm.cmd lint
pnpm.cmd --filter @yves-epub/demo build
```
