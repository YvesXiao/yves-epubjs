import fs from "node:fs/promises"
import path from "node:path"
import { chromium } from "@playwright/test"

const APP_URL = "http://127.0.0.1:4174/"
const BOOK_DIR = "/Users/xyf/Downloads/books"
const OUT_PATH = "/Users/xyf/xyfProject/yves-epub/tmp/stress-reader-flow-2026-04-19.json"

function parsePositionChip(text) {
  const match = text.match(/\/\s*(page|section)\s+(\d+)\s+of\s+(\d+)/i)
  if (!match) {
    return null
  }

  return {
    unit: match[1].toLowerCase(),
    current: Number.parseInt(match[2], 10),
    total: Number.parseInt(match[3], 10)
  }
}

async function closeDrawerIfPresent(page) {
  const scrim = page.locator(".reading-drawer-scrim")
  if (await scrim.count()) {
    await scrim.click({ force: true })
    await page.waitForTimeout(200)
  }
}

async function setMode(page, label) {
  await page.getByRole("button", { name: "Tune" }).click()
  const field = page.locator(".field-shell").filter({ hasText: "Mode" })
  await field.locator(".custom-select-trigger").click()
  await field.locator(".custom-select-option", { hasText: label }).click()
  await page.waitForTimeout(500)
  await closeDrawerIfPresent(page)
}

async function readState(page) {
  return page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll(".reading-fact-chip")).map((node) =>
      node.textContent?.trim() ?? ""
    )
    const positionChip = chips.find((text) => /\/\s*(page|section)\s+\d+\s+of\s+\d+/i.test(text)) ?? ""
    const visibleTextCount = Array.from(
      document.querySelectorAll(
        ".epub-text-run, .reader-root p, .reader-root li, .reader-root td, .reader-root th, .reader-root h1, .reader-root h2, .reader-root h3, .reader-root h4, .reader-root h5, .reader-root h6, .reader-root blockquote, .reader-root span"
      )
    )
      .filter((node) => node instanceof HTMLElement)
      .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter((text) => text.length > 0).length
    const root = document.querySelector(".reader-root")
    return {
      mode: chips[0] ?? "",
      positionChip,
      visibleTextCount,
      scrollTop: root instanceof HTMLElement ? root.scrollTop : 0
    }
  })
}

async function openBook(page, bookPath) {
  await page.goto(APP_URL)
  await page.locator('input[type="file"]').setInputFiles(bookPath)
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll(".reading-fact-chip")).some((node) =>
        /\/\s*(page|section)\s+\d+\s+of\s+\d+/i.test(node.textContent ?? "")
      ),
    undefined,
    { timeout: 30000 }
  )
  await page.waitForTimeout(1200)
}

async function stressPaginated(page) {
  await setMode(page, "Paginated")
  const steps = []

  for (let index = 0; index < 12; index += 1) {
    const state = await readState(page)
    steps.push(state)
    await page.getByRole("button", { name: "Next" }).click()
    await page.waitForTimeout(350)
  }

  for (let index = 0; index < 4; index += 1) {
    const state = await readState(page)
    steps.push(state)
    await page.getByRole("button", { name: "Previous" }).click()
    await page.waitForTimeout(350)
  }

  return steps
}

async function stressScroll(page) {
  await setMode(page, "Scroll")
  const steps = []

  for (let index = 0; index < 12; index += 1) {
    const state = await readState(page)
    steps.push(state)
    await page.evaluate(() => {
      const root = document.querySelector(".reader-root")
      if (root instanceof HTMLElement) {
        root.scrollTop += Math.max(180, root.clientHeight * 0.8)
        root.dispatchEvent(new Event("scroll"))
      }
    })
    await page.waitForTimeout(350)
  }

  return steps
}

function summarizeSequence(steps) {
  const parsed = steps
    .map((step) => ({
      ...step,
      parsed: parsePositionChip(step.positionChip)
    }))
    .filter((step) => step.parsed !== null)

  const unit = parsed[0]?.parsed.unit ?? null
  const monotonicDrops = []
  for (let index = 1; index < parsed.length; index += 1) {
    const previous = parsed[index - 1]?.parsed.current ?? 0
    const current = parsed[index]?.parsed.current ?? 0
    if (current < previous) {
      monotonicDrops.push({ index, previous, current })
    }
  }

  return {
    unit,
    first: parsed[0]?.parsed.current ?? null,
    last: parsed.at(-1)?.parsed.current ?? null,
    total: parsed[0]?.parsed.total ?? null,
    emptyVisibleSteps: steps
      .map((step, index) => ({ index, visibleTextCount: step.visibleTextCount }))
      .filter((step) => step.visibleTextCount === 0),
    monotonicDrops
  }
}

const bookPaths = (await fs.readdir(BOOK_DIR))
  .filter((name) => name.toLowerCase().endsWith(".epub"))
  .slice(0, 6)
  .map((name) => path.join(BOOK_DIR, name))

const browser = await chromium.launch({ headless: true })
const results = []

try {
  for (const bookPath of bookPaths) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 2
    })
    const page = await context.newPage()
    const pageErrors = []
    const consoleErrors = []
    page.on("pageerror", (error) => {
      pageErrors.push(String(error))
    })
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text())
      }
    })

    await openBook(page, bookPath)
    const paginatedSteps = await stressPaginated(page)
    const scrollSteps = await stressScroll(page)

    results.push({
      bookPath,
      paginated: {
        summary: summarizeSequence(paginatedSteps),
        steps: paginatedSteps
      },
      scroll: {
        summary: summarizeSequence(scrollSteps),
        steps: scrollSteps
      },
      pageErrors,
      consoleErrors
    })

    await page.close()
    await context.close()
  }
} finally {
  await browser.close()
}

await fs.writeFile(OUT_PATH, `${JSON.stringify(results, null, 2)}\n`, "utf8")
console.log(OUT_PATH)
