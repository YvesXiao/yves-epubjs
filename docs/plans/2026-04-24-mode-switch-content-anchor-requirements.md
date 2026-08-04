# Scroll/Paginated 切换内容锚定需求文档

**文档日期**: 2026-04-24

## 1. 目标

在 `scroll` 与 `paginated` 两种阅读模式互相切换时，阅读器应优先锚定当前视口中心附近的实际课件内容，而不是仅按 `progressInSection` 做近似跳转。

目标结果是：

1. 模式切换后，用户看到的内容仍然属于切换前正在阅读的同一段上下文。
2. 对可识别的 DOM / Canvas 内容，优先保持同一 `blockId` 或同一精确 `locator`。
3. 仅在无法提取精确锚点时，才回退到现有的章节进度定位逻辑。

## 2. 问题定义

当前模式切换链路是：

`UI handleModeChange()` -> `reader.submitPreferences({ mode })` -> `applyPreferences()` -> `renderCurrentSection("relocate")`

现有逻辑依赖以下状态恢复位置：

1. `currentSectionIndex`
2. `locator.spineIndex`
3. `locator.progressInSection`
4. `pages` 和 `currentPageNumber`

这条链路可以保持“同章节、相近进度”，但不能稳定保持“同一段正文内容”。在以下场景中，体验会出现明显偏移：

1. `scroll` 模式下用户停留在章节中部某段文字，切到 `paginated` 后落到前后相邻页。
2. `paginated` 模式下用户当前页中心内容对应到 `scroll` 的段落时，因为只按页内比例恢复，落点偏到相邻段落。
3. 图片加载、字体变化、DOM 高度变化后，章节进度与实际内容映射继续漂移。

## 3. 范围

本次需求覆盖：

1. `packages/core/src/runtime/reader.ts` 内部定位与偏好切换链路。
2. `scroll -> paginated`
3. `paginated -> scroll`
4. DOM 渲染路径
5. Canvas 渲染路径
6. 缺失精确锚点时的回退逻辑

本次需求不覆盖：

1. 普通前进后退翻页逻辑
2. TOC、搜索、书签恢复逻辑
3. 固定版式 `pre-paginated` 页面的位置精确对齐策略优化
4. 独立新增对外 public API

## 4. 当前行为

### 4.1 Scroll 模式当前位置来源

`syncPositionFromScroll(false/true)` 使用容器视口中点计算：

1. 当前 section
2. 当前 section 内 `progressInSection`
3. 可选保留已有 `blockId` / `anchorId`

这意味着滚动模式的“当前位置”主要是进度值，不是当前视口中心的精确内容锚点。

### 4.2 Paginated 模式当前位置来源

`findPageForLocator(locator)` 优先按 `blockId` 找页。找不到时按 `progressInSection` 映射到章节页序。

### 4.3 模式切换行为

`applyPreferences()` 在 `modeChanged` 时清空 `pages`，随后执行 `renderCurrentSection("relocate")`。`renderCurrentSection()` 会使用当前 `locator` 重新定位。当前 `locator` 如果只包含章节进度，就只能得到近似落点。

## 5. 目标行为

### 5.1 核心原则

模式切换前先捕获当前视口中心的内容锚点。模式切换后优先按该锚点恢复。恢复优先级如下：

1. `anchorId`
2. `blockId + spineIndex + progressInSection`
3. `spineIndex + progressInSection`

### 5.2 锚点捕获原则

在执行 `submitPreferences({ mode })` 导致的模式切换前，阅读器应主动取容器视口中心点，生成一个“切换锚点 locator”。

生成规则：

1. DOM 内容：使用已有 DOM point -> locator 映射能力，优先拿到 `blockId` / `anchorId`。
2. Canvas 内容：使用已有 `hitTest()` 与交互区域映射能力，尽量拿到 `blockId`。
3. 如果中心点未命中有效内容，可向附近做有限探测，仍失败则回退到当前 `locator`。

### 5.3 恢复原则

切换后重新渲染时：

1. `paginated` 模式优先按锚点 `blockId` 找到对应页。
2. `scroll` 模式优先滚到锚点 `anchorId` 或 `blockId`。
3. 若锚点失效，回退到同章节 `progressInSection`。

### 5.4 一致性约束

锚点捕获是一次性切换事务的一部分。捕获完成后，本次模式切换使用同一份锚点数据，不再依赖后续异步滚动事件重新估算。

## 6. 状态 × 操作 → 结果

### 6.1 模式切换主路径

| 状态                                | 操作                   | 结果                                  |
| ----------------------------------- | ---------------------- | ------------------------------------- |
| 未打开图书                          | 切到另一模式           | 无崩溃，无额外副作用                  |
| 已打开，中心点可解析出 `anchorId`   | `scroll <-> paginated` | 切换后落到该锚点所在内容              |
| 已打开，中心点可解析出 `blockId`    | `scroll <-> paginated` | 切换后落到包含该 block 的页或滚动位置 |
| 已打开，中心点只有 section progress | `scroll <-> paginated` | 回退到同章节相近进度                  |
| 已打开，中心点未命中任何内容        | `scroll <-> paginated` | 回退到切换前 `locator`                |

### 6.2 异步与竞态

| 状态                                      | 操作         | 结果                         |
| ----------------------------------------- | ------------ | ---------------------------- |
| Scroll 刚发生滚动，尚未触发下一次位置同步 | 立即切模式   | 以本次即时捕获的中心锚点为准 |
| 模式切换后资源重新布局                    | 重新渲染完成 | 若锚点仍有效，保持锚点优先级 |
| 锚点 block 在新布局不可解析               | 渲染完成     | 回退到同章节进度，不中断渲染 |

### 6.3 渲染后可见性

| 状态                             | 操作     | 结果                                             |
| -------------------------------- | -------- | ------------------------------------------------ |
| `paginated` 渲染完成且命中 block | 定位完成 | 当前页包含该 block                               |
| `scroll` 渲染完成且命中 block    | 定位完成 | 对应 block 出现在视口中                          |
| 固定版式页面                     | 切模式   | 维持现有版式定位语义，不额外承诺正文段落精确一致 |

## 7. 设计约束

1. 优先复用现有能力：`hitTest()`、`mapDomViewportPointToLocator()`、`findPageForLocator()`、`scrollToCurrentLocation()`。
2. 改动尽量收敛在 `reader.ts`，避免扩散 public surface。
3. 不新增仅供 demo 使用的模式切换专用 API。
4. 模式切换锚点应是内部临时状态，用后清理，避免污染常规导航链路。

## 8. 回归风险

1. `progressInSection` 更新路径可能被更精确 locator 覆盖，需要确认不影响普通 `scroll` 同步。
2. `paginated` DOM 章节在重排后重新测量，可能覆盖锚点位置，需要验证渲染后状态收敛。
3. Canvas 章节的 hit 区域依赖最近一次渲染结果，切换前必须基于当前已渲染内容采样。
4. `anchorId` 与 `blockId` 并存时需要固定优先级，避免恢复到错误位置。

## 9. 验收标准

1. `scroll -> paginated`：切换前视口中心所在段落，在切换后对应页仍包含该段落所属 block。
2. `paginated -> scroll`：切换前当前页中心所在段落，在切换后仍出现在 scroll 视口内。
3. DOM 与 Canvas 路径都可通过定向测试验证。
4. 缺失精确锚点时保持当前行为回退，不新增崩溃和空白页。
5. 现有 `typecheck`、目标 core 测试、demo build 保持通过。
