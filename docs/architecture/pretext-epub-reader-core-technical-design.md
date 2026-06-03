# 基于 Pretext 的 EPUB 阅读器核心技术文档

## 1. 文档目标

本文档用于将《需求文档》落到具体技术实现层，明确以下内容：

- 技术栈选型与选型理由
- 第三方依赖与使用边界
- 项目分层与目录结构
- 核心数据流与模块职责
- 自动化测试、构建、发布与工程规范

本文档面向工程落地，默认目标产物为可发布到 npm 的 EPUB 阅读器核心库。

关联文档：

- [需求文档](./需求文档.md)

## 2. 技术目标与设计原则

### 2.1 技术目标

- 以 `pretext` 作为文本布局内核，构建可重排的 EPUB 阅读能力
- 在浏览器环境中提供高性能滚动阅读与基础分页阅读
- 提供框架无关的核心 API，并具备稳定的 TypeScript 类型
- 通过清晰分层降低 EPUB 解析、布局、渲染、状态管理之间的耦合
- 具备面向 npm 发布的构建、测试与 CI 能力

### 2.2 设计原则

- 解析与渲染分离：EPUB 结构解析不直接依赖具体 UI 层
- 文本与非文本分离：文本走 Pretext，图片/表格/代码块等走块级布局模型
- 宿主与内核分离：核心库不内置业务 UI
- 增量计算优先：避免整本书、整章节全量同步排版
- 可测试优先：关键模块必须可在无浏览器 UI 的前提下进行单测

## 3. 技术栈选型

### 3.1 语言与运行时

- `TypeScript`
- `Node.js 20+`
- 浏览器运行时优先，Node 主要承担构建、测试、打包与部分解析测试

选型理由：

- EPUB 解析、布局、状态建模都需要清晰的类型边界
- 未来 npm 发布必须提供稳定 `.d.ts`
- TypeScript 更适合处理复杂领域模型与公开 API

### 3.2 包管理与构建工具

- 包管理：`pnpm`
- 构建工具：`tsup`
- TypeScript 编译：`tsc`

选型理由：

- `pnpm` 适合 monorepo / 多包管理，安装速度和磁盘占用更稳定
- `tsup` 对库构建足够轻量，支持 ESM、CJS、类型声明、sourcemap
- `tsc --noEmit` 可单独用于类型校验

### 3.3 文档与示例

- 文档：Markdown + README
- Demo：`Vite`

选型理由：

- 当前阶段核心目标是内核库，而不是文档站点
- `Vite` 足以支撑本地调试、示例演示与手工验收

### 3.4 测试框架

- 单元测试：`Vitest`
- DOM 环境测试：`Vitest + jsdom`
- 端到端交互测试：`Playwright`
- 覆盖率：`@vitest/coverage-v8`

选型理由：

- `Vitest` 与 `Vite/tsup` 生态兼容，启动快
- `jsdom` 足以覆盖大部分解析与 DOM 容器集成测试
- `Playwright` 适合验证真实浏览器中的排版、翻页、搜索与定位恢复

### 3.5 代码质量工具

- 格式化：`Prettier`
- 代码检查：`ESLint`
- Git Hooks：`Husky`
- 提交前检查：`lint-staged`

选型理由：

- 保持代码风格稳定
- 阻止明显问题进入主分支
- 将质量门槛前移到开发机本地

## 4. 第三方依赖选型

### 4.1 生产依赖

#### 4.1.1 核心依赖

- `@chenglou/pretext`

职责：

- 文本测量
- 多语言换行
- 行布局与高度预测

使用边界：

- 只承担文本相关排版
- 不承担 EPUB 结构解析、DOM 树渲染和 CSS 全量兼容

#### 4.1.2 EPUB 容器与 XML 解析

- `fflate`
- `fast-xml-parser`

职责：

- `fflate`：解压 EPUB ZIP 容器
- `fast-xml-parser`：解析 `container.xml`、OPF、NAV、NCX 等 XML/XHTML

选型理由：

- `fflate` 体积小、浏览器友好
- `fast-xml-parser` 性能足够，使用简单，适合受控解析场景

说明：

- 若后续发现 XHTML 结构保真要求更高，可在内容层引入更细粒度 HTML 解析方案

#### 4.1.3 工具依赖

- `nanoid`
- `eventemitter3`

职责：

- `nanoid`：内部对象唯一 ID
- `eventemitter3`：轻量事件总线

说明：

- 事件系统也可后续替换为自研极简实现；初期优先减少工程成本

### 4.2 开发依赖

- `typescript`
- `tsup`
- `vite`
- `vitest`
- `jsdom`
- `playwright`
- `eslint`
- `prettier`
- `husky`
- `lint-staged`

### 4.3 暂不引入的依赖

- 不引入重量级状态管理库
- 不引入 React 作为核心库运行时依赖
- 不引入完整浏览器排版引擎替代方案
- 不引入大型 UI 组件库

原因：

- 核心包必须保持轻量、通用、无框架绑定

## 5. 架构设计

### 5.1 总体分层

建议采用六层架构：

1. `container`：EPUB 容器读取与资源访问
2. `parser`：OPF/NAV/内容文档解析
3. `model`：统一领域模型与内容抽象
4. `layout`：基于 Pretext 的文本布局与块布局
5. `runtime`：阅读状态、事件、导航、搜索、主题
6. `renderer`：宿主容器渲染与可视区域管理

### 5.2 模块职责

#### `container`

负责：

- 打开 `.epub` 二进制输入
- 解压 ZIP
- 提供按路径读取资源内容的方法
- 标准化资源 MIME 类型和绝对路径解析

对外接口示例：

```ts
interface ResourceContainer {
  readText(path: string): Promise<string>
  readBinary(path: string): Promise<Uint8Array>
  resolvePath(base: string, relative: string): string
  exists(path: string): boolean
}
```

#### `parser`

负责：

- 解析 `container.xml`
- 解析 OPF `metadata / manifest / spine`
- 解析 NAV / NCX
- 解析章节 XHTML 并转为统一中间表示

输出原则：

- 输出统一模型，不向上层泄漏底层 XML 结构细节

#### `model`

负责：

- 定义 `Book`、`SpineItem`、`SectionDocument`、`BlockNode`、`InlineNode`、`Locator` 等类型
- 统一文本块与非文本块的数据结构
- 为布局层提供稳定输入格式

#### `layout`

负责：

- 将文本块送入 Pretext 进行段落布局
- 处理段间距、图片占位、高度汇总
- 生成滚动模式下的段落/块位置映射
- 生成分页模式下的 page slice 数据

关键子模块：

- `text-layout`：对接 Pretext
- `block-layout`：处理图片、表格、分隔块等
- `pagination`：分页切片
- `cache`：布局缓存

#### `runtime`

负责：

- 打开书籍与章节
- 管理当前阅读模式、主题、字号、行高
- 维护当前 locator
- 触发重排
- 执行搜索、目录跳转、位置恢复

#### `renderer`

负责：

- 将布局结果渲染到浏览器容器
- 管理可视区域与虚拟化
- 响应滚动、尺寸变化、交互事件

说明：

- `renderer` 只依赖布局输出，不直接参与 EPUB 解析

## 6. 核心数据模型

### 6.1 书籍模型

```ts
type Book = {
  metadata: BookMetadata
  manifest: ManifestItem[]
  spine: SpineItem[]
  toc: TocItem[]
}
```

### 6.2 内容模型

建议使用统一块模型：

```ts
type BlockNode =
  | TextBlock
  | HeadingBlock
  | ImageBlock
  | QuoteBlock
  | CodeBlock
  | ListBlock
  | TableBlock
  | ThematicBreakBlock

type TextBlock = {
  id: string
  kind: 'text'
  inlines: InlineNode[]
  style: TextStyle
}
```

行内模型：

```ts
type InlineNode =
  | { kind: 'text'; text: string }
  | { kind: 'emphasis'; children: InlineNode[] }
  | { kind: 'strong'; children: InlineNode[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: InlineNode[] }
  | { kind: 'image'; src: string; alt?: string }
```

### 6.3 定位模型

```ts
type Locator = {
  spineIndex: number
  blockId?: string
  inlineOffset?: number
  cfi?: string
  progressInSection?: number
}
```

设计要求：

- 对外暴露通用 locator
- 对内保留更细粒度布局偏移，用于快速恢复和搜索定位

## 7. 渲染与布局实现方案

### 7.1 内容处理流程

建议数据流如下：

1. 读取 EPUB 文件
2. 解压并解析 OPF/NAV
3. 读取章节 XHTML
4. 转为统一 `BlockNode`/`InlineNode`
5. 文本块交给 Pretext 布局
6. 非文本块计算占位高度
7. 汇总为 section layout
8. 输出到滚动模式或分页模式渲染器

### 7.2 滚动模式

实现策略：

- 章节为基本布局单元
- 视口附近章节保留完整布局结果
- 远离视口的章节只保留估算高度与关键锚点
- 使用 `ResizeObserver` 监听容器尺寸变化并触发节流重排

### 7.3 分页模式

实现策略：

- 以章节布局结果为输入，再按页高切片
- 页边界优先落在块边界，不足时再落到行边界
- 文本分页使用 Pretext 的逐行结果进行切分

### 7.4 图片与非文本块

初期策略：

- 图片采用“已知尺寸优先、未知尺寸占位回填”模式
- 表格与复杂代码块先按 DOM 测量或保守块高度策略处理
- 非文本块先满足可读性，再逐步优化排版精度

### 7.5 字体加载

要求：

- 字体变化必须触发对应章节重排
- 在字体未加载完成时，允许先使用回退字体布局
- 字体加载完成后进行二次精确布局

## 8. 搜索与导航方案

### 8.1 搜索

MVP 方案：

- 基于章节原始文本建立轻量索引
- 返回 `spineIndex + blockId + text range`
- 搜索结果跳转后由布局层转换为可视定位

后续优化：

- Worker 中建立全文索引
- 支持大小写、规范化、分词优化

### 8.2 目录与内链跳转

- NAV 优先，NCX 兜底
- 统一解析为 `TocItem[]`
- href 跳转先解析到 `spineIndex`，再映射到 block/anchor

### 8.3 阅读位置恢复

采用双重策略：

- 首选内部高性能 locator
- 回退到 CFI 或 href+anchor 重新定位

## 9. 项目结构设计

建议采用单仓库结构，预留后续拆包能力。

```text
yves-epub/
  package.json
  pnpm-workspace.yaml
  tsconfig.json
  tsup.config.ts
  vitest.config.ts
  playwright.config.ts
  .eslintrc.cjs
  .prettierrc
  docs-yves-epub-20260414/
    需求文档.md
    技术文档.md
  packages/
    core/
      src/
        index.ts
        container/
        parser/
        model/
        layout/
        runtime/
        renderer/
        utils/
      test/
      package.json
      tsconfig.json
    demo/
      index.html
      src/
      package.json
  test-fixtures/
    books/
    snapshots/
```

### 9.1 目录说明

- `packages/core`：核心 npm 包
- `packages/demo`：示例阅读器，用于手工验证与 Playwright 测试
- `test-fixtures/books`：测试 EPUB 样本
- `test-fixtures/snapshots`：布局结果或截图基线

## 10. 工程规范

### 10.1 TypeScript 规范

- 开启 `strict`
- 开启 `noUncheckedIndexedAccess`
- 开启 `exactOptionalPropertyTypes`
- 禁止对外导出 `any`

### 10.2 API 设计规范

- 公共 API 显式导出
- 事件名与类型集中定义
- 错误类型可分类：解析错误、资源错误、布局错误、运行时错误
- 版本升级时遵循 semver

### 10.3 性能规范

- 章节布局必须支持缓存
- 搜索不得阻塞主线程过久
- 容器 resize 与滚动监听必须节流/防抖
- 重排以 section 为最小代价单元

## 11. 自动化测试方案

### 11.1 测试分层

#### 单元测试

覆盖对象：

- 路径解析
- OPF/NAV/NCX 解析
- XHTML 到中间模型转换
- locator 序列化与恢复
- 布局缓存键生成

执行工具：

- `vitest`

#### 集成测试

覆盖对象：

- 打开 EPUB 到生成 `Book` 模型
- 单章节布局
- 字号变化后的重排
- 搜索结果到定位映射

执行工具：

- `vitest + jsdom`

#### 端到端测试

覆盖对象：

- 打开 demo 并加载测试 EPUB
- 目录跳转
- 翻页或滚动阅读
- 搜索并跳转
- 主题切换
- 位置恢复

执行工具：

- `playwright`

### 11.2 测试数据策略

至少准备以下测试书籍：

- 纯文本 EPUB
- 中英文混排 EPUB
- 含图片 EPUB
- 含脚注/目录跳转 EPUB
- 长章节 EPUB

### 11.3 快照策略

建议使用两类快照：

- 结构快照：解析输出 JSON
- 布局快照：section layout JSON

说明：

- 不建议一开始大量依赖像素级截图快照
- 截图快照只用于关键交互路径的端到端回归

### 11.4 覆盖率目标

MVP 阶段建议目标：

- 语句覆盖率 >= 80%
- 核心解析模块覆盖率 >= 90%
- layout/runtime 关键路径覆盖率 >= 85%

## 12. CI/CD 方案

### 12.1 CI

建议使用 `GitHub Actions`，至少包含以下任务：

1. 安装依赖
2. 类型检查
3. ESLint
4. 单元与集成测试
5. Playwright 冒烟测试
6. 构建产物校验

### 12.2 发布流程

建议流程：

1. 合并到主分支
2. 运行完整 CI
3. 生成 changelog
4. 手动或半自动发版
5. 发布到 npm

推荐工具：

- `changesets`

选型理由：

- 适合库项目进行版本管理和变更记录
- 可支持后续多包场景

## 13. 构建与发布设计

### 13.1 输出格式

建议输出：

- `ESM`
- `CJS`
- `d.ts`
- `sourcemap`

### 13.2 `package.json` 关键字段

必须包含：

- `name`
- `version`
- `type`
- `main`
- `module`
- `types`
- `exports`
- `files`
- `sideEffects`

### 13.3 发布约束

- 核心运行时依赖数量尽量少
- 生产包避免携带测试与 demo 资源
- 对浏览器 API 依赖要在 README 中说明最低环境要求

## 14. 安全与兼容策略

### 14.1 内容安全

- 禁止执行 EPUB 内嵌脚本
- 外部资源加载默认关闭或需要显式开启
- 对章节内容渲染进行白名单化

### 14.2 浏览器兼容

- 以现代浏览器为目标，不额外兼容 IE
- 若使用 `ResizeObserver`、`IntersectionObserver`，需在 README 中声明环境要求

## 15. 开发里程碑建议

### Milestone 1：基础解析链路

- 建立仓库工程骨架
- 打通 EPUB 解压、OPF/NAV 解析
- 输出标准 `Book` 模型

### Milestone 2：滚动阅读 MVP

- 建立内容模型
- 接入 Pretext 文本布局
- 支持滚动阅读、目录跳转、位置恢复

### Milestone 3：分页与搜索

- 支持分页模式
- 支持全文搜索与搜索定位
- 增强缓存与重排性能

### Milestone 4：发布准备

- 完善类型与 API 文档
- 补齐 Playwright 冒烟测试
- 完成 npm 发版配置

## 16. 推荐命令约定

```json
{
  "scripts": {
    "dev": "pnpm --filter demo dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "test:e2e": "playwright test",
    "release": "changeset publish"
  }
}
```

## 17. 结论

从技术实现上看，本项目最关键的不是单纯“解析 EPUB”，而是建立一条稳定的数据链路：

- EPUB 文档结构 -> 统一内容模型 -> Pretext 文本布局 -> 阅读器定位与渲染

因此工程实现应优先确保以下三件事：

- 内容模型设计稳定
- 定位模型与重排策略稳定
- 测试样本和自动化回归机制尽早建立

只要这三部分成立，后续分页、搜索、书签、高亮和 npm 发布都会顺畅得多。

