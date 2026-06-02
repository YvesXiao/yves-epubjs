# Canvas 复杂 CSS Backlog 冻结清单

## 1. 文档目标

本文档用于回答 `P2-T1` 的核心问题：

- 哪些复杂 CSS / 复杂结构能力不再默认进入 `canvas` backlog
- 当前 analyzer 已经把哪些信号视为 DOM 专属
- 后续若要改变这条边界，应修改哪里、补哪些测试

这不是一份“理论建议”，而是当前仓库的冻结清单。

代码单一事实来源：

- [canvas-backlog-boundary.ts](/Users/xyf/xyfProject/yves-epub/packages/core/src/runtime/canvas-backlog-boundary.ts)

## 2. 冻结原则

- `canvas` 继续服务于阅读器内核能力，不继续吞复杂 CSS fidelity
- 复杂结构和复杂布局默认归 `dom`
- 新需求若试图把下列项重新拉回 `canvas`，必须先修改冻结清单与 analyzer 对齐测试

## 3. 冻结信号

### 3.1 高风险标签

以下标签默认视为 DOM 专属，不再进入 `canvas` 复杂兼容 backlog：

- `table`
- `svg`
- `math`
- `iframe`

### 3.2 复杂布局样式

以下布局信号默认视为 DOM 专属，不再进入 `canvas` 复杂兼容 backlog：

- `float`
- `text-indent`
- `position`
- `flex`
- `grid`

补充说明：

- `flex` / `grid` 只在命中 `display:flex` / `display:grid` 时触发
- 普通 `display:block` / `display:inline-block` 不属于冻结信号

## 4. 变更规则

若后续确实需要改变这条边界，必须同时修改：

1. `canvas-backlog-boundary.ts`
2. `chapter-render-analyzer.ts`
3. `canvas-backlog-boundary.test.ts`
4. 本文档与任务文档

未同时完成这四项，不视为有效边界变更。
