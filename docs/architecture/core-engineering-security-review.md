# Core 工程化与安全审查报告

日期：2026-06-02

范围：`packages/core` 源码、测试、包配置、依赖审计。重点查看 EPUB 输入、zip 资源容器、XHTML/CSS 解析、DOM/canvas 渲染、Reader runtime 状态流、生命周期清理和 public API 面。

## Findings

### High 1. DOM 后端保留高风险标签，且复杂章节会主动路由到 DOM

证据：

- `packages/core/src/runtime/chapter-preprocess.ts:132` 只把 `script` 识别为 unsafe tag。
- `packages/core/src/runtime/chapter-preprocess.ts:100` 到 `113` 只过滤 `on*` 事件属性，其余标签和属性继续进入 `PreprocessedChapterNode`。
- `packages/core/src/renderer/dom-chapter-renderer.ts:267` 会按原 tagName 拼回 HTML，并通过 `container.innerHTML` 注入。
- `packages/core/src/runtime/canvas-backlog-boundary.ts:23` 到 `38` 将 `svg`、`math`、`iframe` 归入 DOM 路由信号。

风险：

不可信 EPUB 可以携带 `iframe`、`object`、`embed`、`form`、`input`、复杂 SVG 等主动内容。当前策略把这些内容从 canvas 能力边界移出，但没有对应的 DOM 安全边界。`iframe` 会形成嵌入浏览上下文，`object/embed` 可能触发外部资源加载，SVG 内部也可能携带脚本型或外链型载荷。基础 HTML attribute 转义能防止字符串拼接型 XSS，但不能替代 DOM 标签和属性级 sanitizer。

建议修整：

建立 DOM 后端专用 sanitizer，使用 allowlist 而不是只 drop `script`。建议先允许 EPUB 阅读所需的文本、结构、图片、表格、注释相关标签；默认移除 `iframe`、`object`、`embed`、`form`、`input`、`button`、`textarea`、`select`、`video`、`audio`、`canvas`。SVG 需要单独策略：要么禁用交互与外链后保留一个最小 SVG 子集，要么在 DOM 后端默认降级为占位内容。

测试入口：

- `chapter-preprocess.test.ts` 增加高风险标签 drop/allowlist 用例。
- `dom-chapter-renderer.test.ts` 增加 sanitizer 后 markup 不含主动标签的用例。
- `reader-chapter-render-routing.test.ts` 明确高风险标签触发 DOM fidelity 与安全清洗是两步逻辑。

### High 2. 远程嵌入资源的阻断策略没有覆盖 canvas 和 presentation image 路径

证据：

- `packages/core/src/model/types.ts:766` 提供 `allowExternalEmbeddedResources` 配置。
- DOM 普通资源属性会经过 `sanitizeEmbeddedResourceUrl`，见 `packages/core/src/runtime/dom-render-input-factory.ts:296` 到 `310`。
- `packages/core/src/runtime/reader.ts:2924` 到 `2936` 的 canvas 资源路径直接进入 `RenderableResourceManager`。
- `packages/core/src/runtime/renderable-resource-manager.ts:29` 到 `35` 在资源容器没有 binary 或浏览器 API 不可用时直接返回原始 path。
- `packages/core/src/container/resource-path.ts:22` 到 `24` 保留 `http`、`https`、`data`、`blob`、protocol-relative URL。
- `packages/core/src/runtime/dom-render-input-factory.ts:147` 到 `158` 的 presentation image 直接调用 `resolveDomResourceUrl`，绕过 `sanitizeEmbeddedResourceUrl`。

风险：

README 描述默认远程图片会替换为 `data:,`，但当前阻断主要覆盖 DOM 普通资源属性。canvas display list 和 fixed-layout/cover presentation image 可能在 `allowExternalEmbeddedResources` 为 false 时仍把 `https://...` 交给浏览器加载。结果是 untrusted EPUB 可以触发跨域远程请求，暴露用户 IP、阅读行为、User-Agent，也可能造成内容混淆。

建议修整：

把嵌入资源解析收敛为一个统一策略函数，例如 `resolveEmbeddedResourceUrl(value, { consumer, allowExternalEmbeddedResources })`。所有入口都走同一策略：DOM 普通属性、DOM presentation image、canvas image、CSS `url()`、SVG image/use。默认只允许包内资源、`data:`、`blob:`；显式开启时允许 `http:`、`https:`、protocol-relative。对 `javascript:` 等 scheme 继续替换为 `data:,`。

测试入口：

- canvas 路径：构造 `img src="https://cdn.example.com/a.png"`，验证 display list 或 canvas image src 为 `data:,`。
- presentation 路径：cover/image-page 的 `presentationImageSrc` 远程 URL 默认为 `data:,`，显式开启才保留。
- DOM 路径：保留现有 `dom-render-input-factory.test.ts` 的远程资源测试，并补充 presentation 覆盖。

### Medium 1. zip 解压缺少资源上限，存在浏览器端 DoS 面

证据：

- `packages/core/src/container/resource-container.ts:65` 到 `76` 使用 `fflate.unzipSync(input)` 一次性解压。
- `ZipResourceContainer` 构造函数只归一化 path 并存入 `Map`，见 `packages/core/src/container/resource-container.ts:50` 到 `62`。
- 当前测试覆盖非法 zip 和基本索引，见 `packages/core/test/resource-container.test.ts:39` 到 `64`，没有 entry 数、总解压字节、单文件大小或压缩比限制。

风险：

EPUB 是用户输入。同步全量解压会阻塞主线程，zip bomb 或超大 EPUB 会造成内存膨胀和 UI 卡死。这个问题属于可用性安全风险，也会影响宿主应用稳定性。

建议修整：

给 `ZipResourceContainer.fromZip` 增加限制参数和默认值：最大压缩输入大小、最大 entry 数、最大总解压字节、单 entry 最大字节数。超限时抛出明确错误。后续如果继续面向浏览器主线程，优先评估异步解压或 worker 化。

### Medium 2. `fast-xml-parser` 生产依赖存在已知漏洞

证据：

- `pnpm audit --prod` 报告 1 个 moderate 漏洞：`fast-xml-parser XMLBuilder: XML Comment and CDATA Injection via Unescaped Delimiters`，受影响版本 `<5.7.0`，当前路径 `packages/core > fast-xml-parser@4.5.6`。
- 代码只使用 `XMLParser`，未使用 `XMLBuilder`，见 `packages/core/src/parser/container-parser.ts:1`、`opf-parser.ts:1`、`nav-parser.ts:1`、`ncx-parser.ts:1`。
- advisory：`https://github.com/advisories/GHSA-gh4j-gqv2-49f6`

风险：

当前实际调用面受影响较小，因为没有构造 XML 输出。但安全审计和下游依赖扫描会把包标记为 vulnerable。作为公开 npm 包，生产依赖的 audit 噪声会传导到宿主项目。

建议修整：

评估升级到 `fast-xml-parser@^5.7.0`。升级前跑 parser 测试，重点覆盖 OPF、NCX、NAV、container XML 的属性命名、数组行为、text node 行为。如果 v5 行为变化较大，可以先记录 audit waiver，说明本包只使用 `XMLParser`，再安排升级。

### Medium 3. `EpubReader` 状态集中度过高，后续修整成本偏高

证据：

- `packages/core/src/runtime/reader.ts:217` 起定义 `EpubReader`，私有状态和协作者集中在 `reader.ts:218` 到 `296`。
- 同一文件包含打开、渲染、导航、DOM 点击、分页、滚动窗口、选择、高亮、资源加载等多类职责，文件行号延伸到 5900 行以上。
- 既有需求文档已经记录同类问题：`docs/requirements/core-architecture-engineering-refactor.md:38`、`:44`、`:50`、`:56`。

风险：

状态多源写入会提高回归风险。特别是分页、滚动、DOM render、资源晚到刷新、模式切换和 selection 都依赖共享字段。当前已有 `renderVersion` 和 controller 拆分，说明方向正确，但主状态机仍集中在一个类里，后续修复安全边界时容易牵动渲染路径。

建议修整：

按状态域拆，而不是按文件长度拆。优先抽离：

- EmbeddedResourcePolicy：资源 URL 安全策略。
- DomSanitizer：章节 DOM 安全策略。
- RenderSession：`renderVersion`、render backend、late result guard、resource refresh。
- NavigationSession：locator/currentSection/currentPage 的状态迁移。

拆分前要先定义接口成本。接口成本高于内聚成本的部分继续留在 `EpubReader`。

### Low 1. public API 面偏宽，内部模块通过 compatibility exports 暴露

证据：

- `packages/core/test/public-api-surface.test.ts:7` 到 `53` 把大量 parser、layout、renderer 模块列为 root exports。
- `packages/core/test/architecture-boundaries.test.ts:7` 到 `50` 也把这些模块纳入预期 root exports。
- `packages/core/src/index.ts` 当前导出面与这些测试绑定。

风险：

公开 parser、renderer、layout 细节会固化内部实现，后续修安全 sanitizer、资源策略、渲染 session 时需要兼容更多表面。当前测试保证“有意暴露”，但没有给每类导出定义稳定等级、弃用路径和 semver 约束。

建议修整：

保留现有导出以避免破坏兼容，同时在 `docs/architecture/core-public-api.md` 给每个 compatibility export 增加稳定等级。后续新增 API 优先通过稳定 façade 暴露，内部模块迁移到 subpath exports 或标注 deprecated。

### Low 2. 已跟踪旧版 tgz 产物污染源码包

证据：

- `git ls-files packages/core/*.tgz` 返回 `packages/core/yves-epub-core-0.1.17.tgz`。
- `.gitignore:2` 忽略 `dist`，但 `.gitignore` 没有忽略 `*.tgz`。
- `packages/core/package.json:35` 到 `37` 的 npm `files` 只发布 `dist`，所以该 tgz 主要是仓库维护风险。

风险：

旧包产物会干扰审查、搜索和后续发布判断。它不是源码，也不是测试 fixture。

建议修整：

从 git 中移除该 tgz，并在 `.gitignore` 增加 `*.tgz`。如果确实需要包级 fixture，应移动到明确的 `test-fixtures` 并改名说明用途。

## 正向机制

- public API 和架构边界已有测试保护：`public-api-surface.test.ts`、`architecture-boundaries.test.ts`。
- DOM 资源普通属性已具备 scheme 清洗：`sanitizeEmbeddedResourceUrl` 默认阻断远程和 unsafe scheme。
- 外部链接点击路径已有安全分类：`reader-external-link.test.ts` 覆盖 `javascript:` 链接阻断。
- DOM 和 canvas 渲染都有 `renderVersion` late result guard：`reader.ts:2157`、`:2198`、`:2624`、`:2660`。
- `destroy()` 清理事件、timer、object URL、ResizeObserver 和容器内容，见 `reader.ts:1683` 到 `1728`。
- `ScrollCoordinator` 对 RAF 和 timer 有集中清理，见 `scroll-coordinator.ts:20` 到 `29`。

## 状态与副作用矩阵

| 状态 | 操作 | 当前结果 | 风险判断 |
| --- | --- | --- | --- |
| 未打开 | `open(input)` | normalize input，parse EPUB，重置 reader 状态，不自动 render | 主路径清晰 |
| 已打开 | `render()` | 等待 `document.fonts.ready`，再 `renderCurrentSection()` | fonts ready 没有超时，低优先级风险 |
| renderVersion 已过期 | DOM/canvas render callback | callback 返回，不写 DOM/canvas | 屏障有效 |
| DOM 普通图片，远程 URL，默认配置 | create DOM render input | `sanitizeEmbeddedResourceUrl` 替换为 `data:,` | 已覆盖 |
| canvas 图片，远程 URL，默认配置 | display list resolve image URL | 资源不存在时 `RenderableResourceManager` 返回原 URL | 高风险 |
| cover/image-page presentation image，远程 URL，默认配置 | create DOM render input | 直接 `resolveDomResourceUrl`，可能返回原 URL | 高风险 |
| DOM 章节含 `iframe`/`object` | preprocess + render | `script` 被移除，其他高风险标签可能保留并注入 | 高风险 |
| destroy 后 | 已注册事件、timer、object URL | 大部分资源清理完整 | 正向机制 |

## 建议修整顺序

1. 先做统一 embedded resource policy，覆盖 DOM、canvas、presentation image、CSS URL。这个改动收敛安全边界，接口成本低，收益最高。
2. 再做 DOM sanitizer。先用 allowlist 解决主动标签和属性问题，SVG 作为单独策略处理。
3. 增加 zip 解压上限。默认值要可配置，错误信息要明确。
4. 处理 `fast-xml-parser` audit。优先升级，升级成本高时先写明 waiver。
5. 按既有架构文档继续拆 `EpubReader`，先拆资源策略和 render session，再拆导航和选择状态。
6. 清理 tracked tgz，并补 `.gitignore`。

## 验证记录

- `rtk pnpm --filter @yves-epub/core test`：90 个 test files 通过，446 个 tests 通过。
- `rtk pnpm exec tsc -p packages/core/tsconfig.json --noEmit`：exit code 0。
- `rtk pnpm audit --prod`：发现 1 个 moderate vulnerability，`fast-xml-parser <5.7.0`。
- `rtk git status --short`：审查前已有未跟踪 `.agents/` 和 `skills-lock.json`，本报告未修改这些文件。
