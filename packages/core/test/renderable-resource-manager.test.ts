import { afterEach, describe, expect, it, vi } from "vitest"
import { RenderableResourceManager } from "../src/runtime/renderable-resource-manager"

const originalCreateObjectUrl = URL.createObjectURL
const originalRevokeObjectUrl = URL.revokeObjectURL

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe("RenderableResourceManager", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl
    })
  })

  it("marks canvas resources as ready and notifies the canvas callback when binaries resolve", async () => {
    const originalCreateObjectUrl = URL.createObjectURL
    const originalRevokeObjectUrl = URL.revokeObjectURL
    const createObjectUrl = vi.fn(() => "blob:canvas-resource")
    const revokeObjectUrl = vi.fn(() => undefined)
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl
    })

    let canvasResolvedCount = 0
    const manager = new RenderableResourceManager({
      getContainer: () => null,
      readBinary: async () => new Uint8Array([1, 2, 3]),
      shouldTrackDomLayoutChanges: () => false,
      onCanvasResourceResolved: () => {
        canvasResolvedCount += 1
      },
      onDomLayoutChange: () => undefined
    })

    expect(manager.resolveUrl("OPS/image.png", "canvas")).toBe("OPS/image.png")
    await Promise.resolve()
    await Promise.resolve()

    expect(manager.isReady("OPS/image.png")).toBe(true)
    expect(canvasResolvedCount).toBe(1)

    manager.revokeAll()
    expect(createObjectUrl).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:canvas-resource")

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl
    })
  })

  it("patches rendered dom resources and triggers dom layout callbacks when needed", async () => {
    const originalCreateObjectUrl = URL.createObjectURL
    const originalRevokeObjectUrl = URL.revokeObjectURL
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:dom-resource")
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(() => undefined)
    })

    const container = document.createElement("div")
    container.innerHTML = `
      <div class="epub-dom-section">
        <style data-epub-dom-source="OPS/pattern.css">.demo { background-image: url(OPS/pattern.png) }</style>
      </div>
    `

    let domLayoutChangeCount = 0
    const manager = new RenderableResourceManager({
      getContainer: () => container,
      readBinary: async () => new Uint8Array([4, 5, 6]),
      shouldTrackDomLayoutChanges: () => true,
      onCanvasResourceResolved: () => undefined,
      onDomLayoutChange: () => {
        domLayoutChangeCount += 1
      }
    })

    manager.resolveUrl("OPS/pattern.png", "dom")
    await Promise.resolve()
    await Promise.resolve()

    const patchedSourceStyle = container.querySelector<HTMLStyleElement>(
      "style[data-epub-dom-source]"
    )

    expect(patchedSourceStyle?.textContent).toContain("blob:dom-resource")
    expect(domLayoutChangeCount).toBeGreaterThan(0)

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl
    })
  })

  it("skips missing resources without invoking binary reads", async () => {
    const readBinary = vi.fn(async () => new Uint8Array([7, 8, 9]))
    const manager = new RenderableResourceManager({
      getContainer: () => null,
      readBinary,
      hasBinary: () => false,
      shouldTrackDomLayoutChanges: () => false,
      onCanvasResourceResolved: () => undefined,
      onDomLayoutChange: () => undefined
    })

    expect(manager.resolveUrl("OPS/missing.png", "dom")).toBe("OPS/missing.png")
    await Promise.resolve()
    expect(readBinary).not.toHaveBeenCalled()
    expect(manager.isReady("OPS/missing.png")).toBe(false)
  })

  it("ignores a deferred canvas resource after revokeAll", async () => {
    const pending = createDeferred<Uint8Array>()
    const createObjectUrl = vi.fn(() => "blob:stale")
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    })
    const onCanvasResourceResolved = vi.fn()
    const manager = new RenderableResourceManager({
      getContainer: () => null,
      readBinary: () => pending.promise,
      shouldTrackDomLayoutChanges: () => false,
      onCanvasResourceResolved,
      onDomLayoutChange: () => undefined
    })

    manager.resolveUrl("OPS/stale.png", "canvas")
    manager.revokeAll()
    pending.resolve(new Uint8Array([1, 2, 3]))
    await Promise.resolve()
    await Promise.resolve()

    expect(createObjectUrl).not.toHaveBeenCalled()
    expect(onCanvasResourceResolved).not.toHaveBeenCalled()
    expect(manager.isReady("OPS/stale.png")).toBe(false)
  })

  it("notifies every consumer sharing the same pending resource", async () => {
    const pending = createDeferred<Uint8Array>()
    const readBinary = vi.fn<[string], Promise<Uint8Array>>(
      () => pending.promise
    )
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:shared-consumers")
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    })
    const container = document.createElement("div")
    container.innerHTML = `
      <div class="epub-dom-section">
        <style data-epub-dom-source="OPS/shared.css">.demo { background-image: url(OPS/shared.png) }</style>
      </div>
    `
    const onCanvasResourceResolved = vi.fn()
    const onDomLayoutChange = vi.fn()
    const manager = new RenderableResourceManager({
      getContainer: () => container,
      readBinary,
      shouldTrackDomLayoutChanges: () => true,
      onCanvasResourceResolved,
      onDomLayoutChange
    })

    manager.resolveUrl("OPS/shared.png", "canvas")
    manager.resolveUrl("OPS/shared.png", "dom")
    pending.resolve(new Uint8Array([1, 2, 3]))
    await vi.waitFor(() =>
      expect(onCanvasResourceResolved).toHaveBeenCalledTimes(1)
    )

    expect(readBinary).toHaveBeenCalledTimes(1)
    expect(container.querySelector("style")?.textContent).toContain(
      "blob:shared-consumers"
    )
    expect(onDomLayoutChange).toHaveBeenCalled()
  })

  it("resolves the same path for the current generation only", async () => {
    const stale = createDeferred<Uint8Array>()
    const current = createDeferred<Uint8Array>()
    const readBinary = vi
      .fn<[string], Promise<Uint8Array>>()
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(current.promise)
    const createObjectUrl = vi
      .fn<[Blob], string>()
      .mockReturnValueOnce("blob:current")
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    })
    const onCanvasResourceResolved = vi.fn()
    const manager = new RenderableResourceManager({
      getContainer: () => null,
      readBinary,
      shouldTrackDomLayoutChanges: () => false,
      onCanvasResourceResolved,
      onDomLayoutChange: () => undefined
    })

    manager.resolveUrl("OPS/shared.png", "canvas")
    manager.revokeAll()
    manager.resolveUrl("OPS/shared.png", "canvas")
    current.resolve(new Uint8Array([2]))
    await Promise.resolve()
    stale.resolve(new Uint8Array([1]))
    await Promise.resolve()
    await Promise.resolve()

    expect(createObjectUrl).toHaveBeenCalledTimes(1)
    expect(manager.resolveUrl("OPS/shared.png", "canvas")).toBe("blob:current")
    expect(manager.isReady("OPS/shared.png")).toBe(true)
    expect(onCanvasResourceResolved).toHaveBeenCalledTimes(1)
  })

  it("does not patch rendered dom resources from a revoked generation", async () => {
    const stale = createDeferred<Uint8Array>()
    const current = createDeferred<Uint8Array>()
    const readBinary = vi
      .fn<[string], Promise<Uint8Array>>()
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(current.promise)
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:stale-dom")
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    })
    const container = document.createElement("div")
    container.innerHTML = `
      <div class="epub-dom-section">
        <img src="OPS/stale.png" />
      </div>
    `
    const onDomLayoutChange = vi.fn()
    const manager = new RenderableResourceManager({
      getContainer: () => container,
      readBinary,
      shouldTrackDomLayoutChanges: () => true,
      onCanvasResourceResolved: () => undefined,
      onDomLayoutChange
    })

    manager.resolveUrl("OPS/stale.png", "dom")
    manager.revokeAll()
    manager.resolveUrl("OPS/stale.png", "dom")
    stale.resolve(new Uint8Array([1, 2, 3]))
    await Promise.resolve()
    await Promise.resolve()

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "OPS/stale.png"
    )
    expect(onDomLayoutChange).not.toHaveBeenCalled()
  })
})
