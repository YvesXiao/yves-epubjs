# 测试资源说明

## 1. 目标

本文档说明 `test-fixtures` 目录的用途、命名规则与后续扩展方式。

## 2. 目录结构

```text
test-fixtures/
  README.md
  books/
    README.md
    minimal-book/
      README.md
      fixture-info.json
    reflowable-compat/
      README.md
      fixture-info.json
      chapters/
        *.xhtml
  snapshots/
    README.md
```

## 3. 命名规则

- 样本书目录：`kebab-case`
- 快照文件：`模块名.场景名.snap.json`
- 说明文件：统一 `README.md`

## 4. 使用规则

- 所有 fixture 必须能脱离网络独立使用
- 真实 `.epub` 样本后续放入 `books/` 子目录中
- 新增 fixture 时必须说明它覆盖的任务与需求点
- 快照优先保存结构化 JSON，不优先使用截图

## 5. 当前状态

当前已建立：

- 样本书目录约定
- 最小占位样本 `minimal-book`
- 兼容增强章节样本 `reflowable-compat`
- 快照目录约定
- 自动化测试对 fixture 读取能力的校验

后续在真实样本接入前，优先沿用 `reflowable-compat` 这组最小章节样本做 parser、layout、renderer 与 reader 回归。
