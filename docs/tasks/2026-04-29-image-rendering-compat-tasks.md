# 图片渲染兼容任务文档

来源需求：`docs/requirements/2026-04-29-image-rendering-compat.md`

目标：按图片语义分类统一 DOM 与 Canvas 两条路径的图片行为，并保证分页、进度、定位、搜索和标注相关状态在图片晚加载后收敛。

## 状态总览

- [x] 任务 1：固化图片分类模型与 fixture
- [x] 任务 2：完善 DOM 图片样式兼容与 FXL 保护
- [x] 任务 3：调整 DOM 分页 media band 过滤
- [x] 任务 4：增加 DOM 图片就绪屏障与重分页
- [x] 任务 5：对齐 Canvas 图片尺寸与资源晚到重排
- [x] 任务 6：补齐导航、进度、搜索相关回归测试
- [x] 最终验证

## 任务 1：固化图片分类模型与 fixture

行为约束：

| 状态                                           | 操作               | 结果           |
| ---------------------------------------------- | ------------------ | -------------- |
| 图片处于 footnote/noteref/sup/sub/small 上下文 | DOM 或 Canvas 分类 | `inline`       |
| 图片处于 figure 或单图段落                     | DOM 或 Canvas 分类 | `block`        |
| section 为 cover/image-page                    | DOM 或 Canvas 分类 | `presentation` |
| section 为 pre-paginated                       | DOM 或 Canvas 分类 | `fxl`          |

实现范围：

- 新增或修改：`packages/core/src/runtime/image-render-classification.ts`
- 修改：`packages/core/src/index.ts`
- 测试：`packages/core/test/image-render-classification.test.ts`

验收命令：

`pnpm.cmd --filter @yves-epub/core test -- packages/core/test/image-render-classification.test.ts`

## 任务 2：完善 DOM 图片样式兼容与 FXL 保护

行为约束：

| 状态                 | 操作     | 结果                                  |
| -------------------- | -------- | ------------------------------------- |
| 普通 reflowable 大图 | DOM 渲染 | block、居中、受最大宽高约束           |
| inline 语义图片      | DOM 渲染 | inline-block、随文本排版              |
| presentation image   | DOM 渲染 | 保持 presentation 专用规则            |
| FXL 图片             | DOM 渲染 | 不套用 reflowable 大图 block 居中规则 |

实现范围：

- 修改：`packages/core/src/renderer/dom-chapter-style.ts`
- 测试：`packages/core/test/dom-chapter-renderer.test.ts`

验收命令：

`pnpm.cmd --filter @yves-epub/core test -- packages/core/test/dom-chapter-renderer.test.ts`

## 任务 3：调整 DOM 分页 media band 过滤

行为约束：

| 状态                                          | 操作         | 结果                         |
| --------------------------------------------- | ------------ | ---------------------------- |
| inline image 已包含在文本 range line bands 中 | DOM 分页测量 | 不再作为独立 media band      |
| block image 或 figure                         | DOM 分页测量 | 继续作为 media band          |
| FXL/presentation section                      | DOM 分页同步 | 跳过普通 reflowable 分页同步 |

实现范围：

- 修改：`packages/core/src/runtime/reader-dom-pagination-service.ts`
- 测试：`packages/core/test/reader-dom-pagination-service.test.ts`

验收命令：

`pnpm.cmd --filter @yves-epub/core test -- packages/core/test/reader-dom-pagination-service.test.ts`

## 任务 4：增加 DOM 图片就绪屏障与重分页

行为约束：

| 状态                                     | 操作                       | 结果                        |
| ---------------------------------------- | -------------------------- | --------------------------- |
| DOM 图片 URL patch 完成但图片未 complete | 分页测量                   | 等待 load/decode 或超时兜底 |
| DOM 图片 load/error 晚到                 | 当前 render version 仍有效 | 触发当前 section 重新测量   |
| DOM 图片 load/error 晚到                 | 当前 render version 已失效 | 忽略晚到结果                |
| FXL DOM 图片晚到                         | URL patch                  | 不触发 reflowable 重分页    |

实现范围：

- 修改：`packages/core/src/runtime/renderable-resource-manager.ts`
- 修改：`packages/core/src/runtime/reader.ts`
- 测试：`packages/core/test/reader-image.test.ts`

验收命令：

`pnpm.cmd --filter @yves-epub/core test -- packages/core/test/reader-image.test.ts`

## 任务 5：对齐 Canvas 图片尺寸与资源晚到重排

行为约束：

| 状态                                | 操作             | 结果                         |
| ----------------------------------- | ---------------- | ---------------------------- |
| inline image 无 intrinsic size      | Canvas layout    | 使用字体 em fallback         |
| inline image 有 CSS 或 width/height | Canvas layout    | 使用显式尺寸优先             |
| block image intrinsic size 晚到     | Canvas paginated | 清缓存、重建 layout 和 pages |
| image URL ready 但尺寸不变          | Canvas redraw    | 重绘，不强制重排             |

实现范围：

- 修改：`packages/core/src/layout/layout-engine.ts`
- 修改：`packages/core/src/renderer/display-list-text.ts`
- 修改：`packages/core/src/utils/image-layout.ts`
- 测试：`packages/core/test/pretext-layout.test.ts`
- 测试：`packages/core/test/image-layout.test.ts`

验收命令：

`pnpm.cmd --filter @yves-epub/core test -- packages/core/test/pretext-layout.test.ts packages/core/test/image-layout.test.ts`

## 任务 6：补齐导航、进度、搜索相关回归测试

行为约束：

| 状态                          | 操作        | 结果                                      |
| ----------------------------- | ----------- | ----------------------------------------- |
| 图片加载后页数变化            | 翻页/定位   | 当前页按 locator 或 section/page 语义收敛 |
| 图片加载后 scroll height 变化 | scroll 模式 | 恢复 scroll anchor                        |
| 图片加载后搜索结果跳转        | 搜索跳转    | 目标 block 可见                           |
| 图片加载后标注或命中区域变化  | 点击/标注   | hit region 与视觉位置一致                 |

实现范围：

- 修改：`packages/core/test/reader-hybrid-navigation.test.ts`
- 修改：`packages/core/test/reader-hybrid-search.test.ts`
- 修改：`packages/core/test/reader-annotation.test.ts`

验收命令：

`pnpm.cmd --filter @yves-epub/core test -- packages/core/test/reader-hybrid-navigation.test.ts packages/core/test/reader-hybrid-search.test.ts packages/core/test/reader-annotation.test.ts`

## 最终验证

执行：

- `pnpm.cmd --filter @yves-epub/core typecheck`
- `pnpm.cmd --filter @yves-epub/core test`

若涉及 demo 可视行为，再执行：

- `pnpm.cmd --filter @yves-epub/demo build`
