# yves-epub 项目架构文档

## 1. 文档目标

描述当前仓库的实际工程结构、核心模块边界和运行时职责，回答三个问题：

1. 仓库由哪些包组成
2. EPUB 从输入到可阅读状态经过哪些核心模块
3. 阅读器运行时由谁负责解析、编排、渲染和宿主交互

## 2. Monorepo 结构

仓库是一个 `pnpm` workspace，主要由两个 package 组成：

1. `packages/core`
   - EPUB 容器读取、解析、统一内容模型、布局、运行时、渲染器
   - 对外发布包：`@yves-epub/core`
2. `packages/demo`
   - 基于 `Vite + React` 的浏览器宿主
   - 用于验证 `EpubReader` 的真实交互链路

配套目录：

1. `test-fixtures`
   - 测试 EPUB 样本与章节样本
2. `docs`
   - 当前仓库文档

## 3. Core 分层

`packages/core/src` 主要分为以下层：

### 3.1 `container`

职责：

1. 接收 EPUB 输入
2. 解压 ZIP 容器
3. 读取文本和二进制资源
4. 统一资源路径与 MIME 处理

### 3.2 `parser`

职责：

1. 解析 `container.xml`
2. 解析 OPF、manifest、spine
3. 解析 NAV / NCX
4. 解析 XHTML 与样式资源
5. 输出统一 `Book` 和 `SectionDocument`

### 3.3 `model`

职责：

1. 定义核心领域类型
2. 隔离 parser、runtime、renderer 的公共 contract

关键类型：

1. `Book`
2. `SectionDocument`
3. `Locator`
4. `ReaderPreferences`
5. `ReadingProgressSnapshot`
6. `TocTarget`
7. `SectionRenderedEvent`
8. `SectionRelocatedEvent`

### 3.4 `layout`

职责：

1. 将 `SectionDocument` 中适合文本布局的块交给 Pretext
2. 生成统一 `LayoutResult`
3. 为分页与 Canvas 渲染提供稳定输入

### 3.5 `runtime`

职责：

1. 维护阅读器状态
2. 处理打开、渲染、翻页、滚动、跳转、搜索、恢复位置
3. 处理偏好、书签、批注、可访问性和诊断信息
4. 决定章节走 `canvas` 还是 `dom`

中心对象：`EpubReader`

### 3.6 `renderer`

职责：

1. 将 runtime 产物转成可见输出
2. 提供 `canvas` 与 `dom` 两条渲染路径
3. 提供 display list、交互区域、阅读样式 profile

## 4. 运行时中心：EpubReader

`EpubReader` 是当前核心运行时的唯一入口。它协调以下能力：

1. `BookParser`
2. `LayoutEngine`
3. `DisplayListBuilder`
4. `CanvasRenderer`
5. `DomChapterRenderer`
6. `ChapterRenderDecisionCache`

它维护的关键状态包括：

1. 当前 `book`
2. 当前章节索引
3. 当前 `locator`
4. 当前阅读模式
5. 当前分页结果
6. 当前章节渲染决策
7. 当前主题、排版和偏好

从职责上看，`EpubReader` 同时承担：

1. 打开器
2. 状态机
3. 编排入口
4. 宿主 API
5. 诊断信息汇总点

## 5. 关键领域对象

### 5.1 `Book`

由 parser 输出，代表整本书的统一结构。

### 5.2 `SectionDocument`

代表一个章节或 spine item 的标准化内容。

### 5.3 `Locator`

代表阅读器内部统一位置。目录跳转、搜索、书签、批注都围绕它工作。

### 5.4 `LayoutResult`

代表布局层输出，包含：

1. 布局后的 block 列表
2. 文本行信息
3. native block 高度估算
4. `locatorMap`

### 5.5 `SectionDisplayList`

代表 Canvas 渲染的中间结果，包含：

1. 绘制指令
2. 交互区域
3. 章节尺寸信息

## 6. 混合渲染策略

项目不是全 DOM，也不是全 Canvas，而是章节级混合路由：

1. 简单的 reflowable 章节优先走 `canvas`
2. 固定版式、封面、单图页强制走 `dom`
3. 复杂结构章节通过 analyzer 评估后回退到 `dom`

这样做的目标是把复杂 EPUB 的兼容成本集中在 `dom` 路径，而不是无限扩张 Canvas 的 CSS 支持边界。

## 7. 对外宿主接口

`yves-epub` 现在已经具备一组面向宿主的稳定接口，特别用于像 `citicpub-enterprise-rn` 这样的外部阅读宿主：

1. 输入：
   - `open(File | Blob | ArrayBuffer | Uint8Array)`
2. 导航：
   - `goToHref(href)`
   - `resolveHrefLocator(href)`
   - `getTocTargets()`
3. 进度：
   - `getReadingProgress()`
   - `goToProgress(progress)`
4. 生命周期：
   - `onSectionRendered`
   - `onSectionRelocated`
5. 其他：
   - `getPaginationInfo()`
   - `submitPreferences()`
   - `createBookmark()` / `restoreBookmark()`

这组接口的作用，是把宿主从 `epub.js` 私有对象、CFI 细节和内部渲染对象里解耦出来。

## 8. Demo 与外部宿主的关系

`packages/demo` 不是第二套阅读器实现，而是 `EpubReader` 的浏览器宿主示例。

它负责：

1. 创建和销毁 `EpubReader`
2. 把 React 状态与 reader 状态同步
3. 调用 `open / render / next / prev / search / bookmark` 等 API
4. 把诊断、overlay、selection、bookmark 状态映射到 UI

同理，`citicpub-enterprise-rn` 的 Web 阅读器也属于宿主层。它可以复用 `core` 提供的公共语义，但不应该反向依赖 `core` 的内部实现细节。

## 9. citic 接入约束

`citicpub-enterprise-rn` 的接入方式已经验证通过，但有一个工程约束必须记录：

1. 本地联调阶段不推荐直接用 `file:` 目录依赖引用 `@yves-epub/core`
2. 在 Expo Web + Metro + `pnpm` 组合下，`file:` 依赖会形成指向工作区外部的 `junction`
3. Metro 对这个外部 `junction` 的依赖解析不稳定

当前稳定方案是：

1. 在 `packages/core` 先构建 `dist`
2. 打包生成 tarball
3. 在宿主项目中安装该 tarball

这样 `@yves-epub/core` 会作为普通 npm 包进入宿主 `node_modules`，Metro 的解析路径最稳定。

## 10. 测试结构

测试分三层：

1. `packages/core/test`
   - parser、layout、runtime、导航、进度、混合渲染
2. `packages/demo`
   - 浏览器宿主构建与交互验证
3. 外部宿主验证
   - 例如 `citicpub-enterprise-rn` 的 `npm run build:web:test`

## 11. 建议阅读顺序

如果要从代码层面理解架构，建议按下面顺序读：

1. `packages/core/src/model/types.ts`
2. `packages/core/src/parser/book-parser.ts`
3. `packages/core/src/runtime/reader.ts`
4. `packages/core/src/layout/layout-engine.ts`
5. `packages/core/src/runtime/chapter-render-analyzer.ts`
6. `packages/core/src/runtime/paginated-render-plan.ts`
7. `packages/core/src/runtime/scroll-render-plan.ts`
8. `packages/core/src/renderer/display-list-builder.ts`
9. `packages/core/src/renderer/canvas-renderer.ts`
10. `packages/core/src/renderer/dom-chapter-renderer.ts`
