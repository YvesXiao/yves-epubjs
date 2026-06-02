# DOM Fallback 阈值评估结论

## 1. 结论

本轮 `P2-T2` 评估结论：

- 当前 `domThreshold = 20` 保持不变
- 不建议上调 DOM fallback 收敛力度

这不是“暂时不动”，而是基于当前代码、chapter routing 回归和真实 EPUB 样本得到的明确结论。

## 2. 评估依据

### 2.1 当前阈值语义稳定

当前 analyzer 计分逻辑下：

- 单个高风险标签：`20`
  - 例如 `table`
  - 直接进入 `dom`
- 单个冻结复杂样式信号：`15`
  - 例如 `float`
  - 仍留在 `canvas`
- 两个冻结复杂样式信号：`30`
  - 例如 `float + text-indent`
  - 进入 `dom`

这意味着当前阈值已经形成一条稳定边界：

- 不会因为单个弱信号把普通章节过度推向 `dom`
- 也不会错过已经被真实书籍验证过的出版社复杂排版章节

### 2.2 真实 EPUB 结果不支持继续上调阈值

依据 [真实 EPUB 交互测试结果](./2026-04-17-真实EPUB交互测试结果.md)：

- `S1 国家为什么会破产...epub`
  - 复杂出版社样式章节已稳定进入 `dom`
  - 关键原因包括：
    - `complex-style:float`
    - `complex-style:text-indent`
    - `complex-style:flex`
    - `complex-style:grid`

这说明当前阈值至少已经覆盖了一个高价值真实样本。如果继续上调阈值，会提高把出版社复杂样式重新压回 `canvas` 的风险。

### 2.3 现有 chapter routing 回归已经锁住关键边界

当前仓库已有并补强了以下边界：

- 单个 `float` 信号不会直接触发 `dom`
- `table/svg/math/iframe` 等高风险标签仍直接走 `dom`
- `float + text-indent` 这类出版社排版组合仍走 `dom`
- 普通 `display:block / inline-block` 不会被误升级成 `flex / grid`

因此，本轮没有证据支持“当前阈值过于激进”。

## 3. 本轮决定

本轮不做以下变更：

- 不提高 `domThreshold`
- 不收缩 `table/svg/math/iframe` 的 DOM 路由
- 不把出版社复杂样式组合重新压回 `canvas`

本轮实际交付是：

- 把 `20` 的阈值语义显式写进测试
- 把“不上调阈值”的判断写进文档
- 让未来任何阈值调整都必须先经过相同维度的证据校验

## 4. 未来再评估条件

只有出现以下证据之一，才重新考虑上调阈值：

1. 真实 EPUB 样本中出现大量“普通章节被误判为 `dom`”
2. `dom` 路径在真实书中成为明显性能瓶颈
3. 新增 chapter routing 回归显示当前阈值导致大面积误回退

在没有这些证据前，`domThreshold = 20` 视为当前稳定基线。
