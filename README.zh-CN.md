# Yves EPUB Reader Engine

[English](README.md) | 简体中文

`yves-epubjs` 是一个浏览器 EPUB 阅读器引擎和验证工作区。它提供 EPUB 解析、统一书籍模型、混合渲染、阅读定位、搜索、书签、批注、偏好设置和诊断能力。

宿主应用负责产品层：书架、账号、文件来源、持久化、权限、外链策略和界面。

## 包结构

这个仓库是 `pnpm` workspace，主要包含两个包：

- `packages/core`：可复用阅读器引擎，发布为 `@yves-epub/core`。
- `packages/demo`：Vite 和 React 浏览器 demo，用于手工验证和 Playwright smoke tests。

`dist/`、coverage、Playwright report 等生成产物不应手工修改。

## 核心能力

- 输入：支持 `File`、`Blob`、`ArrayBuffer`、`Uint8Array`。
- 解析：支持 `container.xml`、OPF、NAV、NCX、XHTML、manifest、spine、metadata、TOC。
- 模型：输出 `Book`、`SectionDocument`、`Locator`、`Bookmark`、`Annotation` 等领域对象。
- 阅读模式：支持 `scroll` 和 `paginated`。
- 渲染：按章节选择 `canvas` 或 `dom` 后端。简单 reflowable 章节优先使用 `canvas`，复杂结构、固定版式、封面和单图页可以回退到 `dom`。
- 导航：支持前后翻页、页码跳转、目录跳转、href 跳转、搜索结果跳转和进度跳转。
- 运行时状态：支持阅读进度、分页信息、偏好设置、书签恢复和位置恢复诊断。
- 标注：支持 decorations、搜索高亮、文本选区快照、批注创建和批注视口快照。
- 诊断：暴露渲染后端、路由原因、布局来源、交互模型和可见章节诊断。

## 快速开始

环境要求：

- Node.js `>= 18.17.0`
- `pnpm@10`

安装依赖：

```bash
pnpm install
```

启动 demo：

```bash
pnpm dev
```

常用检查：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm ci:check
```

指定包运行：

```bash
pnpm -F @yves-epub/core test
pnpm -F @yves-epub/demo build
```

## 最小浏览器接入

```ts
import { EpubReader } from "@yves-epub/core";

const container = document.getElementById("reader");
const file = fileInput.files?.[0];

if (!container || !file) {
  throw new Error("Missing reader container or EPUB file");
}

const reader = new EpubReader({
  container,
  preferences: {
    mode: "scroll",
    publisherStyles: "enabled",
    typography: {
      fontSize: 18,
      lineHeight: 1.6
    }
  },
  allowExternalEmbeddedResources: true,
  onExternalLink: ({ href }) => {
    window.open(href, "_blank", "noopener,noreferrer");
  }
});

await reader.open(file);
await reader.render();
```

## 推荐宿主封装

产品接入时建议把 `EpubReader` 包在宿主侧 controller 后面，不要把实例散落在多个 UI 组件里。

1. 生命周期层：创建 reader、订阅事件、打开书籍、首次渲染、销毁实例。
2. 状态同步层：把 `getCurrentLocation()`、`getPaginationInfo()`、`getRenderMetrics()`、`getSettings()` 同步到宿主状态。
3. 持久化层：按 `publicationId` 保存 preferences、bookmark、last locator、annotations。
4. UI 动作层：把工具栏、目录、搜索、排版、主题和批注控件映射为 reader 方法。
5. 错误边界层：捕获 `open()`、`render()`、位置恢复、搜索和偏好切换中的异常。

React demo controller 可参考：[packages/demo/src/use-reader-controller.ts](packages/demo/src/use-reader-controller.ts)。

## 主要 API

生命周期：

- `open(input)`：打开 EPUB 输入并返回 `Book`。
- `render()`：渲染当前位置。
- `destroy()`：销毁实例并清理资源。
- `getBook()`：返回当前 `Book`。
- `getPublicationId()`：返回推导出的书籍身份。

导航和定位：

- `next()` 和 `prev()`：前后翻页。scroll 模式下按章节移动。
- `goToPage(pageNumber)`：跳转到分页页码。
- `goToLocation(locator)`：跳转到精确位置。
- `restoreLocation(locator)`：从 `Locator` 或 `SerializedLocator` 恢复位置。
- `goToTocItem(id)`：按 TOC id 跳转。
- `goToHref(href)`：按书内 href 跳转。
- `goToProgress(progress)`：按全书进度跳转。
- `getCurrentLocation()`：返回当前位置。
- `getReadingProgress()`：返回全书和章节进度。
- `getPaginationInfo()`：返回 `currentPage` 和 `totalPages`。

搜索、书签和批注：

- `search(query)`：全书搜索并写入搜索 decoration。
- `goToSearchResult(result)`：跳转到搜索结果。
- `createBookmark(input?)`：基于当前位置创建书签。
- `restoreBookmark(bookmark)`：恢复书签。
- `createAnnotation(input?)`：基于 locator 创建批注。
- `createAnnotationFromSelection(input?)`：基于当前文本选区创建批注。
- `setAnnotations(annotations)`：替换运行时批注。
- `getAnnotationViewportSnapshots()`：返回批注在当前视口中的映射。

偏好和诊断：

- `submitPreferences(preferences)`：合并并应用偏好。
- `restorePreferences(preferencesOrString)`：从对象或序列化字符串恢复偏好。
- `getSettings()`：返回合并默认值后的设置。
- `hitTest(point)`：把视口点位解析为链接、图片或文本块。
- `mapLocatorToViewport(locator)`：把 locator 映射为视口矩形。
- `mapViewportToLocator(point)`：把视口点位映射为 locator。
- `getRenderMetrics()`：返回渲染指标。
- `getRenderDiagnostics()`：返回当前章节渲染诊断。
- `getVisibleSectionDiagnostics()`：返回可见章节诊断。

## 最佳实践

生命周期：每个阅读容器保留一个 `EpubReader` 实例。打开新书时重新执行 `open()` 和 `render()`。React 卸载时先取消所有 `on()` 订阅，再调用 `destroy()`。

持久化：引擎只返回可持久化对象，不直接写 localStorage 或数据库。建议按 `publicationId` 保存 `preferences`、`lastLocator`、`bookmark` 和 `annotations`。

远程图片：默认只允许 EPUB 包内资源、`data:` 和 `blob:`。远程 `http:`、`https:` 图片会被替换为 `data:,`。如果需要兼容引用远程图片的 EPUB，设置 `allowExternalEmbeddedResources: true`。开启后 DOM 后端允许 `http:`、`https:` 和协议相对 URL，其他 scheme 仍会被阻断。

诊断：排查真实 EPUB 时，优先读取 `getRenderMetrics()`、`getRenderDiagnostics()`、`getVisibleSectionDiagnostics()`。

## 当前边界

- DRM 和 LCP：当前不处理授权、解密和受保护内容。
- OPDS：当前不处理在线书库发现、分发和下载协议。
- Media Overlay：当前不处理音频和文本时间轴同步。
- TTS：当前不内置朗读引擎。
- 完整书架产品：demo 只用于引擎验证。
- 完整固定版式产品体验：已有固定版式、封面、单图页和 spread 基础能力，仍需要真实书籍回归。

## 仓库结构

```text
.
├─ packages
│  ├─ core              # EPUB parsing, model, runtime, renderer, tests
│  └─ demo              # Vite + React demo and Playwright smoke tests
├─ test-fixtures        # EPUB samples and test notes
├─ docs                 # Additional project notes
├─ docs-yves-epub-20260414
│  └─ Requirements, technical notes, tasks, and capability matrix
└─ package.json
```

## 测试

- Core tests: [packages/core/test](packages/core/test)
- Demo E2E tests: [packages/demo/e2e](packages/demo/e2e)
- EPUB samples: [test-fixtures/books](test-fixtures/books)

完整本地验证：

```bash
pnpm ci:check
```

## 公开导出

`@yves-epub/core` 根入口导出稳定集成 API 和兼容模块。公开导出边界由 [packages/core/test/public-api-surface.test.ts](packages/core/test/public-api-surface.test.ts) 覆盖。
