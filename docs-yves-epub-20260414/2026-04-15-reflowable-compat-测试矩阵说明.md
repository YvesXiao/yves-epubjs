# Reflowable EPUB 兼容测试矩阵说明

## 1. 目标

本文档说明 “覆盖 90% 常见 reflowable EPUB 文本书” 兼容增强的回归矩阵，明确 parser、style、layout、renderer、reader 与 demo smoke 的对应关系。

## 2. 样本与覆盖关系

| 样本 | 主要场景 | 主要覆盖层 |
| --- | --- | --- |
| `novel-inline.xhtml` | 行内语义、`mark`、`sup`、inline image | parser / layout / renderer / reader |
| `figure-note.xhtml` | `figure`、`figcaption`、`aside` | parser / layout / renderer / reader |
| `nested-list.xhtml` | 嵌套列表、marker、缩进 | parser / layout / renderer |
| `table-data.xhtml` | 表格标题、表头、网格单元格 | parser / layout / renderer / reader |
| `footnotes.xhtml` | 同章脚注跳转、锚点 | parser / reader / toc |
| `definition-list.xhtml` | `dl/dt/dd` | parser / renderer / reader |

## 3. 自动化测试入口

- parser / 样本读取：`packages/core/test/compat-fixtures.test.ts`
- 样式解析：`packages/core/test/style-resolver.test.ts`
- 布局与绘制：`packages/core/test/image-layout.test.ts`、`packages/core/test/structured-layout.test.ts`
- reader 运行时：`packages/core/test/reader-compat.test.ts`、`packages/core/test/reader-pagination-compat.test.ts`
- canvas 主链路：`packages/core/test/pretext-layout.test.ts`
- demo smoke：`packages/demo/e2e/smoke.spec.ts`

## 4. 显式回归要求

- 未知标签与未知样式继续保留独立回归，不仅依赖样本书
- 新增样本必须同步进入 `fixture-info.json` 与至少一条自动化测试
- 后续若引入真实 `.epub` 样本，优先作为 smoke fixture，不替代当前最小 XHTML 章节样本
