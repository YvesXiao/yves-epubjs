import type { ReadingMode } from "../model/types"

type ScrollCoordinatorOptions = {
  container?: HTMLElement | null | undefined
  onScrollFrame: (emitEvent: boolean) => void
  onDeferredScrollRefresh: () => void
  onDeferredResourceRenderRefresh: () => void
  onDeferredAnchorRealignment: () => void
}

export class ScrollCoordinator {
  private isProgrammaticScroll = false
  private scrollSyncFrame: number | null = null
  private scrollRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private resourceRenderRefreshTimer: ReturnType<typeof setTimeout> | null =
    null
  private anchorRealignTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly options: ScrollCoordinatorOptions) {}

  reset(): void {
    this.clearAll()
    this.isProgrammaticScroll = false
  }

  clearAll(): void {
    this.clearScrollFrame()
    this.clearDeferredScrollRefresh()
    this.clearDeferredResourceRenderRefresh()
    this.clearDeferredAnchorRealignment()
  }

  handleScrollEvent(mode: ReadingMode): void {
    if (!this.options.container || mode !== "scroll") {
      return
    }

    const emitEvent = !this.isProgrammaticScroll
    if (
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      this.options.onScrollFrame(emitEvent)
      this.scheduleDeferredScrollRefresh(mode)
      this.isProgrammaticScroll = false
      return
    }

    if (this.scrollSyncFrame !== null) {
      return
    }

    this.scrollSyncFrame = window.requestAnimationFrame(() => {
      this.scrollSyncFrame = null
      this.options.onScrollFrame(emitEvent)
      this.scheduleDeferredScrollRefresh(mode)
      this.isProgrammaticScroll = false
    })
  }

  scheduleDeferredScrollRefresh(mode: ReadingMode): void {
    if (!this.options.container || mode !== "scroll") {
      return
    }

    this.clearDeferredScrollRefresh()
    this.scrollRefreshTimer = setTimeout(() => {
      this.scrollRefreshTimer = null
      this.options.onDeferredScrollRefresh()
    }, 90)
  }

  clearDeferredScrollRefresh(): void {
    if (this.scrollRefreshTimer !== null) {
      clearTimeout(this.scrollRefreshTimer)
      this.scrollRefreshTimer = null
    }
  }

  scheduleDeferredResourceRenderRefresh(): void {
    if (!this.options.container || this.resourceRenderRefreshTimer !== null) {
      return
    }

    this.resourceRenderRefreshTimer = setTimeout(() => {
      this.resourceRenderRefreshTimer = null
      this.options.onDeferredResourceRenderRefresh()
    }, 48)
  }

  clearDeferredResourceRenderRefresh(): void {
    if (this.resourceRenderRefreshTimer !== null) {
      clearTimeout(this.resourceRenderRefreshTimer)
      this.resourceRenderRefreshTimer = null
    }
  }

  scheduleDeferredAnchorRealignment(): void {
    if (!this.options.container || this.anchorRealignTimer !== null) {
      return
    }

    this.anchorRealignTimer = setTimeout(() => {
      this.anchorRealignTimer = null
      this.options.onDeferredAnchorRealignment()
    }, 32)
  }

  clearDeferredAnchorRealignment(): void {
    if (this.anchorRealignTimer !== null) {
      clearTimeout(this.anchorRealignTimer)
      this.anchorRealignTimer = null
    }
  }

  setProgrammaticScrollTop(nextScrollTop: number): void {
    if (!this.options.container) {
      return
    }

    const target = Math.max(0, nextScrollTop)
    const current = this.options.container.scrollTop
    if (Math.abs(current - target) < 1) {
      this.options.container.scrollTop = target
      this.isProgrammaticScroll = false
      return
    }

    this.isProgrammaticScroll = true
    this.options.container.scrollTop = target
  }

  private clearScrollFrame(): void {
    if (this.scrollSyncFrame !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(this.scrollSyncFrame)
      this.scrollSyncFrame = null
    }
  }
}
