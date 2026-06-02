# yves-epub 接入 citicpub-enterprise-rn 需求文档

**文档日期**：2026-04-20

## 1. 目标

明确 `yves-epub` 为 `citicpub-enterprise-rn` Web 阅读器接入时需要提供的核心能力、适配层职责、接口边界和验收标准。

这份文档面向两个对象：

1. `yves-epub` 核心库维护者
2. `citicpub-enterprise-rn` Web 阅读器宿主接入方

## 2. 背景

`citicpub-enterprise-rn` 现有 Web 阅读器基于 `react-reader` 和 `epub.js`。业务层已经围绕以下四类语义形成稳定依赖：

1. 解密后的 `base64 EPUB` 输入
2. 全书百分比进度
3. 基于 `href/cfi` 的目录跳转与高亮
4. 基于 `rendition.on('rendered'/'relocated')` 的章节渲染补丁

`yves-epub` 原有能力已经覆盖 EPUB 打开、分页、Canvas/DOM 混合渲染、目录、书签、偏好设置，但在宿主集成语义上存在缺口：

1. 没有对外稳定暴露的全书百分比进度模型
2. 没有公开的 `href -> locator` 导航接口
3. 没有章节渲染完成与重定位的宿主 hook
4. 没有为 citic 明确界定的输入适配边界

## 3. 分层原则

这次接入遵守一个核心原则：阅读器语义进核心，业务语义留宿主。

应进入 `yves-epub/core` 的能力：

1. 阅读进度快照与百分比跳转
2. `href` 导航与 TOC 目标暴露
3. 章节生命周期 hook

应保留在 citic 宿主层的能力：

1. `base64 -> Uint8Array`
2. 面板 UI
3. 业务上报
4. 续读弹窗

## 4. 必须补充的核心能力

### 4.1 阅读进度

目标：提供统一、稳定、可恢复的全书进度模型。

接口：

```ts
export type ReadingProgressSnapshot = {
  overallProgress: number
  sectionProgress: number
  spineIndex: number
  sectionId: string
  sectionHref: string
  currentPage?: number
  totalPages?: number
}

getReadingProgress(): ReadingProgressSnapshot | null

goToProgress(progress: number): Promise<Locator | null>
```

要求：

1. `overallProgress` 取值固定为 `0 ~ 1`
2. `paginated` 模式优先按全书页号计算
3. `scroll` 模式按章节权重与章节内偏移估算
4. `goToProgress()` 自动做输入 clamp

### 4.2 href 导航与 TOC

目标：让宿主从 `href/cfi` 平滑迁移到 `href/locator`。

接口：

```ts
export type TocTarget = {
  id: string
  label: string
  href: string
  depth: number
  parentId?: string
  locator: Locator
}

goToHref(href: string): Promise<Locator | null>

resolveHrefLocator(href: string): Locator | null

getTocTargets(): TocTarget[]
```

要求：

1. 支持 `chapter.xhtml`
2. 支持 `chapter.xhtml#anchor`
3. 支持 `#anchor`
4. 无法解析时返回 `null` 或 `no-op`

### 4.3 生命周期 hook

目标：替代宿主对 `epub.js rendition` 的直接依赖。

接口：

```ts
export type SectionRenderedEvent = {
  spineIndex: number
  sectionId: string
  sectionHref: string
  mode: ReadingMode
  backend: "dom" | "canvas"
  diagnostics: RenderDiagnostics | null
  containerElement?: HTMLElement
  contentElement?: HTMLElement
  isCurrent: boolean
}

export type SectionRelocatedEvent = {
  spineIndex: number
  sectionId: string
  sectionHref: string
  locator: Locator | null
  mode: ReadingMode
  backend: "dom" | "canvas"
  diagnostics: RenderDiagnostics | null
  containerElement?: HTMLElement
  contentElement?: HTMLElement
}

export type ReaderOptions = {
  onSectionRendered?: (event: SectionRenderedEvent) => void | Promise<void>
  onSectionRelocated?: (event: SectionRelocatedEvent) => void | Promise<void>
}
```

要求：

1. DOM 路径优先保证元素引用可用
2. Canvas 路径允许只回调 metadata
3. hook 抛错不得中断主流程

## 5. 宿主适配层职责

citic 宿主层需要完成以下替换：

1. 将 `decryptEbook()` 输出从 `base64 string` 转为 `Uint8Array`
2. 用 `reader.getReadingProgress()` 替代 `locations.generate()` 百分比链路
3. 用 `reader.goToProgress()` 替代进度条 seek
4. 用 `reader.goToHref()` / `reader.getTocTargets()` 替代 `setLocation(href)` 和 CFI 生成
5. 将图片和封面补丁迁移到 `onSectionRendered` / `onSectionRelocated`

## 6. 状态矩阵

### 6.1 阅读进度

| 状态 | 操作 | 结果 |
| --- | --- | --- |
| 未打开书籍 | `getReadingProgress()` | `null` |
| 已渲染 | `getReadingProgress()` | 返回 `0~1` 进度快照 |
| 已渲染 | `goToProgress(-0.2)` | 跳到开头 |
| 已渲染 | `goToProgress(1.2)` | 跳到末尾 |
| 正在跳转 | 再次 `goToProgress(y)` | 后一次请求生效 |

### 6.2 href 导航

| 状态 | 操作 | 结果 |
| --- | --- | --- |
| 已打开 | `goToHref("chapter.xhtml")` | 跳到章节开头 |
| 已打开 | `goToHref("chapter.xhtml#anchor")` | 跳到锚点 |
| 已打开 | `goToHref("#anchor")` | 在书内解析当前上下文锚点 |
| 已打开 | `goToHref("missing.xhtml")` | `null` 或 `no-op` |
| 未打开 | `getTocTargets()` | 空数组 |

### 6.3 生命周期 hook

| 状态 | 操作 | 结果 |
| --- | --- | --- |
| DOM 章节完成渲染 | 触发 `onSectionRendered` | 提供元素引用与元数据 |
| Canvas 章节完成渲染 | 触发 `onSectionRendered` | 提供元数据 |
| 定位变化 | 触发 `onSectionRelocated` | 提供当前位置与章节信息 |
| hook 内部异常 | 阅读器继续运行 | 主流程不崩溃 |

## 7. 验收标准

接口层：

1. `citicpub-enterprise-rn` Web 阅读器可以用 `yves-epub` 打开解密后的 EPUB
2. 目录点击可按 `href` 正确跳转
3. 可读取当前全书百分比进度
4. 进度条可按百分比稳定跳转
5. 章节渲染后宿主可接管图片和封面补丁

行为层：

1. 续读 30%、50%、90% 能稳定落到对应章节附近
2. TOC 高亮可基于 `href` 或 `locator` 实现
3. hook 失败不导致阅读器崩溃

兼容层：

1. 文字为主的书继续优先走 Canvas
2. 复杂图文章节允许回退到 DOM
3. 宿主接入不再依赖 `epub.js` 私有对象

## 8. 实现回填

截至 `2026-04-20`，上述能力已经落地：

1. `yves-epub/core` 已公开以下能力：
   - `getReadingProgress()`
   - `goToProgress()`
   - `goToHref()`
   - `resolveHrefLocator()`
   - `getTocTargets()`
   - `onSectionRendered`
   - `onSectionRelocated`
2. `citicpub-enterprise-rn` Web 宿主已完成：
   - `base64 -> Uint8Array`
   - 百分比进度与跳转切换到 `yves-epub`
   - TOC 切换到 `href + locator`
   - 图片与封面补丁切换到新 hook

本地联调阶段，`citic` 推荐通过 tarball 安装 `@yves-epub/core`，而不是直接使用 `file:` 目录依赖。

原因：

1. `file:` 目录依赖在 `citic` 中会形成指向工作区外部的 `junction`
2. Expo Web 的 Metro 对外部 `junction` 与 `pnpm` 依赖树的组合解析不稳定
3. tarball 安装后，`@yves-epub/core` 会作为普通 npm 包落入 `citic/node_modules`

推荐链路：

1. 在 `packages/core` 执行构建
2. 生成 tarball
3. 在 `citicpub-enterprise-rn` 中安装 tarball
4. 通过 `npm run build:web:test` 验证宿主构建链
