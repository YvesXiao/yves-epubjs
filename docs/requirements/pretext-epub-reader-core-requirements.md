# 基于 Pretext 的 EPUB 阅读器核心需求文档

## 1. 文档目标

本文档用于定义一个基于 [`@chenglou/pretext`](https://github.com/chenglou/pretext) 构建的 EPUB 阅读器核心（以下简称“本项目”）的产品需求与技术范围，目标成果为：

- 实现一个可嵌入 Web 应用的 EPUB 阅读器核心库，而不是单一站点或 App。
- 充分利用 Pretext 的文本测量与排版能力，构建高性能、可虚拟化、可定制的阅读渲染层。
- 最终以 npm 包形式发布，供 React/Vue/Vanilla Web 等宿主集成。

本文档同时回答两个问题：

- `pretext` 适合承担什么职责。
- 一个可用的 EPUB 阅读器核心还必须补齐哪些能力。

## 2. 项目定位

### 2.1 产品定位

本项目是一个“EPUB 阅读器核心引擎”，而非完整阅读产品。它应向宿主应用提供以下基础能力：

- EPUB 文件解析与资源管理
- 阅读章节装载与分页/滚动排版
- 阅读位置、目录、主题、搜索等核心阅读能力
- 面向宿主的稳定 API、事件模型和状态模型

### 2.2 目标用户

- 需要在 Web 端集成 EPUB 阅读能力的前端团队
- 教育、出版、知识库、文档阅读类产品
- 需要二次定制阅读器 UI，而不希望从零实现排版和解析内核的开发者

### 2.3 发布形态

- npm 包，优先提供 ESM
- 支持 TypeScript 类型定义
- 提供无框架核心包，必要时补充轻量适配层
- 提供最小可运行 demo 与 API 文档

## 3. Pretext 核心能力梳理

基于 `chenglou/pretext` 当前公开文档与包定义，可以确认其核心定位是“多语言文本测量与行布局引擎”，不是 EPUB 解析器，也不是完整浏览器排版引擎。

### 3.1 已具备的能力

- 无需依赖 DOM 回流即可预测多行文本高度
- 将一次性文本预处理与高频布局计算分离
- 支持多语言文本测量与换行，包括 CJK、阿拉伯语等复杂文本场景
- 支持 `whiteSpace: normal | pre-wrap`
- 支持 `wordBreak: normal | keep-all`
- 支持输出逐行布局结果，而不只是总高度
- 支持流式逐行布局，适合动态宽度、障碍物绕排、虚拟化
- 可用于 DOM、Canvas、SVG，且设计上面向更广义渲染后端
- 提供 `rich-inline` 辅助能力，适合行内富文本、mention、chip 一类的 inline 布局

### 3.2 对本项目的价值

Pretext 可作为 EPUB 阅读器的“文本排版核心”，主要带来：

- 更可控的分页/滚动布局计算
- 降低基于 DOM 真实测量导致的重排与性能抖动
- 为章节虚拟化、预估高度、定位恢复、搜索结果定位提供基础
- 为多语言排版提供比简单字符估算更可靠的底层能力

### 3.3 明确不属于 Pretext 的能力

以下能力不应假设由 Pretext 直接提供：

- `.epub` ZIP 容器解析
- `container.xml`、OPF、NCX、NAV 文档解析
- 章节资源寻址与资源重写
- 图片、字体、音视频、MathML、SVG 资源加载
- CSS 级完整排版与浏览器样式兼容
- 分页规则、阅读位置模型、书签、注释、搜索索引
- DRM、版权保护、云同步、账号体系
- 可访问性 UI、阅读器工具栏、宿主业务界面

结论：Pretext 适合作为阅读器中的“文本布局引擎”，但阅读器仍需独立实现 EPUB 解析、资源管理、阅读状态与交互系统。

## 4. EPUB 阅读器核心能力需求

### 4.1 文件与容器层

系统必须支持：

- 导入本地 `.epub` 文件或二进制流
- 解压 ZIP 容器并读取 `META-INF/container.xml`
- 解析 OPF package document
- 识别 manifest、spine、metadata、guide/nav
- 解析 EPUB 3 导航文档，必要时兼容 NCX
- 建立资源路径解析与相对路径重写能力

系统暂不要求：

- DRM 保护 EPUB
- 多 rendition 高级特性
- 所有实验性 EPUB 扩展

### 4.2 内容解析层

系统必须支持：

- XHTML/HTML 内容文档解析
- 基础语义元素渲染：标题、段落、列表、引用、代码块、表格、图片
- 内链跳转、脚注/注释跳转
- 基础 CSS 读取与白名单化样式应用
- 字体资源识别与加载

系统应优先支持“重排型 EPUB（reflowable）”，并将固定版式内容作为后续阶段能力。

### 4.3 文本排版与渲染层

系统必须支持：

- 基于 Pretext 的段落测量与行布局
- 按章节进行版面计算
- 两种阅读模式：
  - 连续滚动模式
  - 分页模式
- 响应容器尺寸、字体、行高、边距变化后的重新排版
- 章节级或段落级虚拟化渲染
- 章节预估高度与惰性布局

系统应支持：

- 中英文混排
- CJK `keep-all` 策略
- `pre-wrap` 场景下的文本保真
- 图片占位后的重排
- 搜索命中项与高亮区域的定位

系统后续可扩展：

- 双栏/多栏排版
- 障碍物绕排
- Canvas/SVG 自定义渲染路径
- Fixed Layout EPUB

### 4.4 阅读交互层

系统必须支持：

- 目录展示与跳转
- 上一章/下一章导航
- 分页前进/后退或滚动定位
- 阅读位置保存与恢复
- 字体大小、行高、页边距、主题切换
- 选中文本
- 全书搜索

系统应支持：

- 书签
- 文本高亮
- 批注数据结构预留
- 键盘导航
- 触摸与鼠标双端交互

### 4.5 状态与数据层

系统必须支持：

- Book、SpineItem、Section、Location、Theme、SearchResult 等核心领域模型
- 阅读状态序列化与恢复
- 基于 CFI、href+offset 或自定义 locator 的位置表达
- 事件机制，用于通知宿主阅读位置变化、章节加载完成、重排完成、搜索完成

建议的数据原则：

- 解析层与渲染层分离
- 书籍数据缓存与版面缓存分离
- 可在不销毁整本书实例的情况下重复布局

### 4.6 宿主集成层

系统必须支持：

- 稳定的 JavaScript/TypeScript API
- 生命周期管理：load、render、destroy
- 宿主驱动式配置更新
- 事件订阅/取消订阅
- 自定义资源加载器接口
- 自定义主题与样式注入接口

系统应支持：

- React/Vue/Vanilla 统一可接入
- SSR 友好的接口边界说明
- Worker 化预处理的扩展点

## 5. 核心能力拆分：Pretext 负责什么，阅读器负责什么

| 领域 | Pretext 负责 | 本项目负责 |
| --- | --- | --- |
| 文本测量 | 段落预处理、宽度测量、行布局 | 调用时机、缓存策略、字体同步 |
| 多语言断行 | 提供多语言文本换行能力 | 将其应用到 EPUB 段落和章节内容 |
| 视图布局 | 输出高度、行信息、逐行范围 | 分页、滚动、虚拟化、定位恢复 |
| 富文本 | 提供有限 inline rich layout 辅助 | 解析 XHTML、构建文本片段模型 |
| 资源系统 | 不负责 | ZIP 解包、资源寻址、媒体加载 |
| 阅读器交互 | 不负责 | 目录、搜索、书签、主题、选区、事件 |
| 规范兼容 | 文本布局相关 | EPUB 3.x 结构兼容与阅读系统行为 |

## 6. 功能范围定义

### 6.1 MVP 范围

第一阶段必须完成：

- 加载标准无 DRM 的 reflowable EPUB
- 解析 metadata、manifest、spine、toc/nav
- 渲染纯文本为主的章节内容
- 支持图片、基本内联样式、基础块级结构
- 连续滚动模式
- 基础分页模式
- 字体大小/行高/主题切换
- 阅读位置保存与恢复
- 全书目录导航
- 全书文本搜索
- npm 包发布
- 提供 demo 与基础文档

### 6.2 Phase 2 范围

- 书签、高亮、批注
- 更完整的 CSS 支持策略
- 更复杂的表格与代码块渲染
- 章节预加载与更强的虚拟化
- 更精细的搜索命中定位
- React 适配包

### 6.3 Phase 3 范围

- Fixed Layout EPUB
- 音视频与媒体覆盖
- TTS / Read Aloud 扩展能力
- 无障碍增强模式
- Worker 并行解析与布局

## 7. 非功能需求

### 7.1 性能

- 首次打开中等体量 EPUB 的可阅读时间应可接受
- 字号、行高、容器宽度变化后的重排应保持流畅
- 长章节不能依赖全量 DOM 渲染
- 搜索、目录跳转、位置恢复不能出现明显卡顿

### 7.2 兼容性

- 现代桌面浏览器优先：Chrome、Safari、Firefox 最新稳定版
- 移动浏览器应具备基本可用性
- 与 Pretext 当前公开能力保持一致的字体与文本测量策略

### 7.3 可维护性

- 核心模块职责清晰：解析、资源、布局、渲染、状态、宿主接口分层
- TypeScript 编写并导出类型
- 可对关键布局逻辑进行单元测试与回归测试
- 保留基准测试与示例书籍测试机制

### 7.4 可访问性

- 目录、搜索、主题等关键控件具备可键盘操作性
- 内容区域支持语义化结构输出
- 提供字号、间距、对比度调节能力
- 不让阅读流程依赖单一输入方式

### 7.5 安全性

- 默认禁用 EPUB 中潜在危险脚本执行
- 对外链、资源 URL、内嵌样式进行白名单或隔离处理
- 防范宿主环境中的 XSS 注入路径

## 8. 关键技术决策

### 8.1 渲染策略

建议采用“两层架构”：

- 解析层：负责 EPUB 容器、OPF、NAV、资源与章节 DOM 的抽象
- 布局渲染层：将章节内容转为可被 Pretext 消费的文本块与渲染块，再进行滚动或分页布局

### 8.2 内容模型

建议将章节内容拆成：

- 文本块：交由 Pretext 计算
- 行内富文本块：映射到 Pretext `rich-inline` 或自定义片段
- 非文本块：图片、分隔线、代码块、表格、媒体等，以占位高度参与版面流

### 8.3 定位模型

建议同时支持两种位置表达：

- 规范友好的位置标识：EPUB CFI 或兼容抽象
- 工程友好的位置标识：`spineIndex + blockIndex + line/offset`

这样既便于对外兼容，也便于内部高性能恢复。

### 8.4 npm 包拆分建议

建议初期采用单包，后续再拆分：

- `yves-epub`：核心包，包含解析、布局、状态、渲染接口

后续如复杂度上升，可拆为：

- `yves-epub-core`
- `yves-epub-react`
- `yves-epub-demo`

## 9. API 需求草案

建议至少暴露以下能力：

```ts
type ReaderOptions = {
  container: HTMLElement
  mode?: 'scroll' | 'paginated'
  theme?: Partial<Theme>
}

type OpenInput = File | ArrayBuffer | Uint8Array | Blob | string

interface EpubReader {
  open(input: OpenInput): Promise<Book>
  render(): Promise<void>
  destroy(): void

  next(): Promise<void>
  prev(): Promise<void>
  goToTocItem(id: string): Promise<void>
  goToLocation(locator: Locator): Promise<void>

  setTheme(theme: Partial<Theme>): Promise<void>
  setTypography(options: TypographyOptions): Promise<void>

  search(query: string): Promise<SearchResult[]>
  getCurrentLocation(): Locator | null
  on(event: ReaderEvent, handler: (...args: any[]) => void): () => void
}
```

说明：

- API 必须以宿主可控为原则，不把 UI 逻辑硬编码到内核
- 布局、搜索、导航应为可异步操作
- 事件名与返回数据结构应稳定、可版本化

## 10. 验收标准

### 10.1 MVP 验收

以下条件全部满足，才视为 MVP 完成：

- 能成功打开并渲染主流标准 EPUB 书籍
- 目录导航可用，章节跳转正确
- 支持滚动与分页两种基础阅读模式
- 字号、行高、主题切换后内容可正确重排
- 阅读位置可准确恢复
- 能执行全书搜索并跳转命中位置
- 长章节阅读性能可接受，无明显整页白屏或严重掉帧
- npm 包可独立安装、导入、运行
- 提供最小 demo、README、类型定义

### 10.2 发布验收

- 包名、导出结构、构建产物清晰
- ESM 可正常使用
- TypeScript 类型完整
- 至少覆盖核心解析与布局链路测试
- 提供 semver 版本策略与变更日志

## 11. 风险与边界

### 11.1 主要风险

- EPUB 内容天然异构，完整兼容成本高
- Pretext 解决的是文本布局，不是完整 CSS 排版，复杂文档需要降级策略
- 图片、表格、脚注、注释、脚本化内容会拉高内容模型复杂度
- 搜索定位与分页定位在重排场景下容易失稳
- 浏览器字体加载时序会直接影响测量结果

### 11.2 解决策略

- 明确“兼容优先级”，先服务 reflowable、文本型 EPUB
- 将复杂 CSS 归入白名单/降级策略，而不是追求浏览器等价渲染
- 通过缓存和增量布局降低重排成本
- 将定位模型设计为“规范标识 + 内部高性能标识”双轨
- 建立示例书籍与回归测试集

## 12. 不做什么

当前阶段不纳入必做范围：

- DRM
- 云同步与账号体系
- 原生 App 壳
- 编辑器能力
- 完整浏览器级 CSS 实现
- 全部 EPUB 扩展特性的完全兼容

## 13. 实施建议

建议按以下顺序推进：

1. 先做 EPUB 解析与统一内容模型。
2. 再做基于 Pretext 的文本块布局与滚动阅读。
3. 随后补齐分页、定位恢复、搜索。
4. 最后稳定 API、补文档、打包并发布 npm。

原因：

- 先验证“内容模型是否能稳定落到 Pretext 布局”是成败关键。
- 阅读器最难的不是 ZIP 解压，而是内容模型、定位模型和增量重排。
- npm 发布应在 API 边界稳定后进行，避免早期破坏性变更过多。

## 14. 参考资料

- Pretext GitHub: <https://github.com/chenglou/pretext>
- Pretext README: <https://raw.githubusercontent.com/chenglou/pretext/main/README.md>
- Pretext package.json: <https://raw.githubusercontent.com/chenglou/pretext/main/package.json>
- Pretext CHANGELOG: <https://raw.githubusercontent.com/chenglou/pretext/main/CHANGELOG.md>
- Pretext STATUS: <https://raw.githubusercontent.com/chenglou/pretext/main/STATUS.md>
- W3C EPUB 3.3: <https://www.w3.org/TR/epub-33/>
- W3C EPUB Overview: <https://w3c.github.io/epub-specs/epub33/overview/>
- W3C EPUB Reading Systems: <https://w3c.github.io/epub-specs/epub34/rs/>

