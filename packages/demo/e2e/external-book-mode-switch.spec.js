import { expect, test } from "@playwright/test"

const BOOK_PATH = process.env.BOOK_PATH

test.skip(
  !BOOK_PATH,
  "BOOK_PATH is required for external EPUB mode-switch validation"
)

test("keeps visible content stable when switching scroll and paginated modes", async ({
  page
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.locator('input[type="file"]').setInputFiles(BOOK_PATH)
  await expect(page.locator(".reader-root article").first()).toBeVisible()

  await page.locator(".reader-root").evaluate((node) => {
    if (node instanceof HTMLElement) {
      node.scrollTop = 9000
      node.dispatchEvent(new Event("scroll", { bubbles: true }))
    }
  })

  await expect
    .poll(async () => (await captureReaderState(page)).scrollTop, {
      timeout: 10000
    })
    .toBeGreaterThan(1000)
  await expect
    .poll(async () => await captureReaderState(page), { timeout: 10000 })
    .toMatchObject({
      mode: "scroll"
    })

  const before = await captureReaderState(page)
  console.log("MODE_SWITCH_BEFORE", JSON.stringify(before, null, 2))
  expect(before.overlapCount).toBe(0)

  await page.getByRole("button", { name: "Paginated" }).click()
  await expect(page.locator(".reader-root")).toHaveAttribute(
    "data-mode",
    "paginated"
  )
  await expect
    .poll(async () => (await captureReaderState(page)).mode)
    .toBe("paginated")

  const paginated = await captureReaderState(page)
  console.log("MODE_SWITCH_PAGINATED", JSON.stringify(paginated, null, 2))
  expect(paginated.overlapCount).toBe(0)

  await page.getByRole("button", { name: "Scroll" }).click()
  await expect(page.locator(".reader-root")).toHaveAttribute(
    "data-mode",
    "scroll"
  )
  await expect
    .poll(async () => (await captureReaderState(page)).mode)
    .toBe("scroll")

  const after = await captureReaderState(page)
  console.log("MODE_SWITCH_AFTER", JSON.stringify(after, null, 2))
  expect(after.overlapCount).toBe(0)

  expect(hasMeaningfulOverlap(before.centerText, paginated.visibleText)).toBe(
    true
  )
  expect(hasMeaningfulOverlap(before.centerText, after.visibleText)).toBe(true)
})

async function captureReaderState(page) {
  return await page.locator(".reader-root").evaluate((node) => {
    if (!(node instanceof HTMLElement)) {
      return {
        mode: "",
        pageStatus: "",
        locatorText: "",
        centerText: "",
        visibleText: "",
        scrollTop: 0,
        overlapCount: 0,
        overlaps: []
      }
    }

    const root = node
    const rect = root.getBoundingClientRect()
    const centerY = rect.top + rect.height / 2
    const centerX = rect.left + rect.width / 2
    const candidates = Array.from(
      root.querySelectorAll(
        "p, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, .epub-text-run"
      )
    )
      .map((element) => {
        const elementRect = element.getBoundingClientRect()
        const text = (element.textContent ?? "").replace(/\s+/g, " ").trim()
        return { elementRect, text }
      })
      .filter(({ elementRect, text }) => {
        return (
          text &&
          elementRect.bottom >= rect.top &&
          elementRect.top <= rect.bottom &&
          elementRect.right >= rect.left &&
          elementRect.left <= rect.right
        )
      })

    const centerCandidate =
      candidates.find(({ elementRect }) => {
        return (
          centerX >= elementRect.left &&
          centerX <= elementRect.right &&
          centerY >= elementRect.top &&
          centerY <= elementRect.bottom
        )
      }) ??
      candidates
        .map((entry) => {
          const y =
            centerY < entry.elementRect.top
              ? entry.elementRect.top
              : centerY > entry.elementRect.bottom
                ? entry.elementRect.bottom
                : centerY
          return {
            ...entry,
            distance: Math.abs(y - centerY)
          }
        })
        .sort((left, right) => left.distance - right.distance)[0]
    const visibleText = candidates
      .map((entry) => entry.text)
      .join(" ")
      .slice(0, 1000)
    const overlaps = []
    const visibleBoxes = candidates
      .map((entry) => ({
        text: entry.text.slice(0, 60),
        left: entry.elementRect.left,
        right: entry.elementRect.right,
        top: entry.elementRect.top,
        bottom: entry.elementRect.bottom,
        width: entry.elementRect.width,
        height: entry.elementRect.height
      }))
      .filter((entry) => entry.width > 20 && entry.height > 8)

    for (let index = 0; index < visibleBoxes.length; index += 1) {
      for (
        let nextIndex = index + 1;
        nextIndex < visibleBoxes.length;
        nextIndex += 1
      ) {
        const left = visibleBoxes[index]
        const right = visibleBoxes[nextIndex]
        const verticalOverlap =
          Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top)
        const horizontalOverlap =
          Math.min(left.right, right.right) - Math.max(left.left, right.left)
        if (
          verticalOverlap > Math.min(left.height, right.height) * 0.45 &&
          horizontalOverlap > 40 &&
          left.text !== right.text
        ) {
          overlaps.push({ left, right, verticalOverlap, horizontalOverlap })
          if (overlaps.length >= 5) {
            break
          }
        }
      }
      if (overlaps.length >= 5) {
        break
      }
    }

    const diagnosticsText =
      document.querySelector(".reader-diagnostics")?.textContent ?? ""
    const locatorMatch = diagnosticsText.match(/Locator\s+([^]*?)Restore/)
    const pageStatus = document.querySelector(".page-status")?.textContent ?? ""

    return {
      mode: root.dataset.mode ?? "",
      pageStatus: pageStatus.replace(/\s+/g, " ").trim(),
      locatorText: (locatorMatch?.[1] ?? "").replace(/\s+/g, " ").trim(),
      centerText: centerCandidate?.text.slice(0, 300) ?? "",
      visibleText,
      scrollTop: root.scrollTop,
      overlapCount: overlaps.length,
      overlaps
    }
  })
}

function hasMeaningfulOverlap(source, target) {
  const sourceTokens = tokenize(source)
  const targetText = target.replace(/\s+/g, "")
  return sourceTokens.some((token) => targetText.includes(token))
}

function tokenize(text) {
  const normalized = text.replace(/\s+/g, "")
  const tokens = []
  for (let index = 0; index < normalized.length; index += 8) {
    const token = normalized.slice(index, index + 12)
    if (token.length >= 8) {
      tokens.push(token)
    }
  }
  return tokens
}
