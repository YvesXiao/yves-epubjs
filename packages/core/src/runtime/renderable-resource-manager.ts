import { getMimeTypeFromPath } from "../container/resource-mime"

export type RenderableResourceConsumer = "canvas" | "dom"

type RenderableResourceManagerOptions = {
  getContainer: () => HTMLElement | null | undefined
  readBinary: (path: string) => Promise<Uint8Array> | null
  hasBinary?: (path: string) => boolean | null | undefined
  shouldTrackDomLayoutChanges: () => boolean
  onCanvasResourceResolved: () => void
  onDomLayoutChange: (element: HTMLElement | null) => void
}

export class RenderableResourceManager {
  private readonly objectUrls = new Map<string, string>()
  private readonly pendingConsumers = new Map<
    string,
    Set<RenderableResourceConsumer>
  >()
  private generation = 0

  constructor(private readonly options: RenderableResourceManagerOptions) {}

  isReady(path: string): boolean {
    const resolved = this.objectUrls.get(path)
    return typeof resolved === "string" && resolved.startsWith("blob:")
  }

  resolveUrl(path: string, consumer: RenderableResourceConsumer): string {
    const generation = this.generation
    if (this.options.hasBinary?.(path) === false) {
      return path
    }

    const cached = this.objectUrls.get(path)
    if (cached) {
      if (!cached.startsWith("blob:")) {
        this.trackConsumer(path, consumer)
      }
      return cached
    }

    const readBinary = this.options.readBinary(path)
    if (
      !readBinary ||
      typeof Blob === "undefined" ||
      typeof URL === "undefined"
    ) {
      return path
    }

    this.trackConsumer(path, consumer)
    const mimeType = getMimeTypeFromPath(path) ?? "application/octet-stream"
    const placeholder = path

    readBinary
      .then((binary) => {
        if (generation !== this.generation) {
          return
        }
        if (typeof URL.createObjectURL !== "function") {
          return
        }

        const bytes = new Uint8Array(binary.byteLength)
        bytes.set(binary)
        const objectUrl = URL.createObjectURL(
          new Blob([bytes.buffer as ArrayBuffer], { type: mimeType })
        )
        if (generation !== this.generation) {
          URL.revokeObjectURL?.(objectUrl)
          return
        }
        const previous = this.objectUrls.get(path)
        if (
          previous &&
          previous !== path &&
          typeof URL.revokeObjectURL === "function"
        ) {
          URL.revokeObjectURL(previous)
        }
        this.objectUrls.set(path, objectUrl)
        const consumers = this.pendingConsumers.get(path)
        if (consumers?.has("dom")) {
          this.patchRenderedDomResource(path, objectUrl)
        }
        if (consumers?.has("canvas")) {
          this.options.onCanvasResourceResolved()
        }
        this.pendingConsumers.delete(path)
      })
      .catch(() => {
        if (generation === this.generation) {
          this.pendingConsumers.delete(path)
        }
      })

    this.objectUrls.set(path, placeholder)
    return placeholder
  }

  revokeAll(): void {
    this.generation += 1
    if (
      typeof URL === "undefined" ||
      typeof URL.revokeObjectURL !== "function"
    ) {
      this.objectUrls.clear()
      this.pendingConsumers.clear()
      return
    }

    for (const value of this.objectUrls.values()) {
      if (value.startsWith("blob:")) {
        URL.revokeObjectURL(value)
      }
    }

    this.objectUrls.clear()
    this.pendingConsumers.clear()
  }

  private trackConsumer(
    path: string,
    consumer: RenderableResourceConsumer
  ): void {
    const consumers =
      this.pendingConsumers.get(path) ?? new Set<RenderableResourceConsumer>()
    consumers.add(consumer)
    this.pendingConsumers.set(path, consumers)
  }

  private patchRenderedDomResource(path: string, objectUrl: string): boolean {
    const container = this.options.getContainer()
    if (!container) {
      return false
    }

    const candidates = container.querySelectorAll<HTMLElement>(
      ".epub-dom-section img, .epub-dom-section source, .epub-dom-section image, .epub-dom-section use, .epub-dom-section [style*='url('], style[data-epub-dom-source]"
    )
    let patched = false

    for (const element of candidates) {
      if (element.tagName.toLowerCase() === "style") {
        if (element.textContent?.includes(path)) {
          element.textContent = element.textContent.replaceAll(path, objectUrl)
          this.trackDomLayoutChange(null)
          patched = true
        }
        continue
      }

      if (element.getAttribute("src") === path) {
        element.setAttribute("src", objectUrl)
        this.trackDomLayoutChange(element)
        patched = true
      }

      if (element.getAttribute("href") === path) {
        element.setAttribute("href", objectUrl)
        this.trackDomLayoutChange(element)
        patched = true
      }

      if (element.getAttribute("xlink:href") === path) {
        element.setAttribute("xlink:href", objectUrl)
        this.trackDomLayoutChange(element)
        patched = true
      }

      const style = element.getAttribute("style")
      if (style?.includes(path)) {
        element.setAttribute("style", style.replaceAll(path, objectUrl))
        this.trackDomLayoutChange(element)
        patched = true
      }
    }

    return patched
  }

  private trackDomLayoutChange(element: HTMLElement | null): void {
    if (!this.options.shouldTrackDomLayoutChanges()) {
      return
    }

    if (element instanceof HTMLImageElement) {
      if (element.complete) {
        this.options.onDomLayoutChange(element)
        return
      }

      let notified = false
      const notify = () => {
        if (notified) {
          return
        }
        notified = true
        this.options.onDomLayoutChange(element)
      }

      element.addEventListener("load", notify, { once: true })
      element.addEventListener("error", notify, { once: true })
      if (typeof element.decode === "function") {
        element.decode().then(notify).catch(notify)
      }
      return
    }

    this.options.onDomLayoutChange(element)
  }
}
