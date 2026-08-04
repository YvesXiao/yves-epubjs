import { afterEach, describe, expect, it, vi } from "vitest"
import { ScrollCoordinator } from "../src/runtime/scroll-coordinator"

describe("ScrollCoordinator", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("marks programmatic scrolls so the next scroll frame is treated as non-user input", () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0
    })

    const scrollFrames: boolean[] = []
    const originalRequestAnimationFrame = window.requestAnimationFrame
    const originalCancelAnimationFrame = window.cancelAnimationFrame

    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    }) as typeof window.requestAnimationFrame
    window.cancelAnimationFrame = (() =>
      undefined) as typeof window.cancelAnimationFrame

    try {
      const coordinator = new ScrollCoordinator({
        container,
        onScrollFrame: (emitEvent) => {
          scrollFrames.push(emitEvent)
        },
        onDeferredScrollRefresh: () => undefined,
        onDeferredResourceRenderRefresh: () => undefined,
        onDeferredAnchorRealignment: () => undefined
      })

      coordinator.setProgrammaticScrollTop(120)
      coordinator.handleScrollEvent("scroll")
      coordinator.handleScrollEvent("paginated")

      expect(container.scrollTop).toBe(120)
      expect(scrollFrames).toEqual([false])
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame
      window.cancelAnimationFrame = originalCancelAnimationFrame
    }
  })

  it("clears pending deferred callbacks when reset is requested", () => {
    vi.useFakeTimers()

    const container = document.createElement("div")
    let deferredScrollRefreshCount = 0
    let deferredResourceRefreshCount = 0
    let deferredAnchorRealignCount = 0

    const coordinator = new ScrollCoordinator({
      container,
      onScrollFrame: () => undefined,
      onDeferredScrollRefresh: () => {
        deferredScrollRefreshCount += 1
      },
      onDeferredResourceRenderRefresh: () => {
        deferredResourceRefreshCount += 1
      },
      onDeferredAnchorRealignment: () => {
        deferredAnchorRealignCount += 1
      }
    })

    coordinator.scheduleDeferredScrollRefresh("scroll")
    coordinator.scheduleDeferredResourceRenderRefresh()
    coordinator.scheduleDeferredAnchorRealignment()
    coordinator.reset()
    vi.runAllTimers()

    expect(deferredScrollRefreshCount).toBe(0)
    expect(deferredResourceRefreshCount).toBe(0)
    expect(deferredAnchorRealignCount).toBe(0)
  })
})
