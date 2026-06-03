import { expect, test } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

const DEBUG_BOOK_PATH = process.env.DEBUG_BOOK_PATH
const DEBUG_OUTPUT_DIR = path.resolve(process.cwd(), "artifacts")
const DEBUG_SCREENSHOT_PATH = path.join(DEBUG_OUTPUT_DIR, "canvas-selection-debug.png")
const DEBUG_METRICS_PATH = path.join(DEBUG_OUTPUT_DIR, "canvas-selection-debug.json")
const DEBUG_QUERY = process.env.DEBUG_QUERY ?? "二维数组中没有查找的数字"

test.skip(
  !DEBUG_BOOK_PATH,
  "DEBUG_BOOK_PATH is required for canvas selection debug capture"
)

test("captures canvas selection alignment on the debug epub", async ({ page }) => {
  fs.mkdirSync(DEBUG_OUTPUT_DIR, { recursive: true })

  await page.goto("/")
  await page.locator('input[type="file"]').setInputFiles(DEBUG_BOOK_PATH)

  await page.getByRole("button", { name: "Find" }).click()
  await page.getByRole("searchbox").fill(DEBUG_QUERY)
  await page.getByRole("button", { name: "Search" }).click()
  await page.locator(".search-card").first().click()

  const textRun = page
    .locator(".epub-text-run")
    .filter({ hasText: "二维数组中没有查找的数字" })
    .first()
  await expect(textRun).toBeVisible({ timeout: 30_000 })

  const metrics = await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll(".epub-text-run")).find((node) =>
      node.textContent?.includes("二维数组中没有查找的数字")
    )
    if (!(target instanceof HTMLElement) || !target.firstChild) {
      return null
    }

    const fullText = target.textContent ?? ""
    const start = fullText.indexOf("查找的数字")
    const range = document.createRange()
    range.setStart(target.firstChild, Math.max(0, start))
    range.setEnd(target.firstChild, fullText.length)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    const textRect = target.getBoundingClientRect()
    const style = window.getComputedStyle(target)
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")
    let measured = null
    if (context) {
      context.font = style.font
      const metrics = context.measureText(fullText)
      measured = {
        actualBoundingBoxAscent: metrics.actualBoundingBoxAscent,
        actualBoundingBoxDescent: metrics.actualBoundingBoxDescent,
        fontBoundingBoxAscent: metrics.fontBoundingBoxAscent,
        fontBoundingBoxDescent: metrics.fontBoundingBoxDescent
      }
    }
    const rangeRects = Array.from(range.getClientRects()).map((rect) => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    }))
    return {
      backend: document.querySelector(".epub-canvas") ? "canvas" : "unknown",
      textRunRect: {
        x: textRect.x,
        y: textRect.y,
        width: textRect.width,
        height: textRect.height
      },
      font: style.font,
      lineHeight: style.lineHeight,
      measured,
      rangeRects,
      text: fullText
    }
  })

  expect(metrics).not.toBeNull()
  await expect(page.locator(".reader-selection-toolbar")).toBeVisible()

  const clipRect = await textRun.boundingBox()
  expect(clipRect).not.toBeNull()
  const clip = {
    x: Math.max(0, clipRect.x - 48),
    y: Math.max(0, clipRect.y - 120),
    width: Math.min(1200, clipRect.width + 360),
    height: Math.min(700, clipRect.height + 220)
  }

  await page.screenshot({
    path: DEBUG_SCREENSHOT_PATH,
    clip
  })
  fs.writeFileSync(DEBUG_METRICS_PATH, JSON.stringify(metrics, null, 2), "utf8")
  console.log(`canvas-selection-debug screenshot: ${DEBUG_SCREENSHOT_PATH}`)
  console.log(`canvas-selection-debug metrics: ${DEBUG_METRICS_PATH}`)
  console.log(JSON.stringify(metrics, null, 2))
})
