import fs from "node:fs/promises"
import path from "node:path"
import { chromium } from "@playwright/test"

const BOOK_DIR = process.env.BOOK_DIR ?? "/Users/xyf/Downloads/books"
const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:4173/"
const OUTPUT_DIR =
  process.env.QA_OUTPUT_DIR ?? "/Users/xyf/xyfProject/yves-epub/tmp/qa-real-books"
const BOOK_LIMIT = Number(process.env.BOOK_LIMIT ?? "0")
const INTERACTION_TIMEOUT_MS = Number(process.env.INTERACTION_TIMEOUT_MS ?? "25000")

await fs.mkdir(OUTPUT_DIR, { recursive: true })

const allBookPaths = (await fs.readdir(BOOK_DIR))
  .filter((entry) => entry.endsWith(".epub"))
  .sort()
  .map((entry) => path.join(BOOK_DIR, entry))
const bookPaths = BOOK_LIMIT > 0 ? allBookPaths.slice(0, BOOK_LIMIT) : allBookPaths

const browser = await chromium.launch({ headless: true })
const summary = {
  appUrl: APP_URL,
  bookDir: BOOK_DIR,
  testedAt: new Date().toISOString(),
  books: []
}

try {
  for (const bookPath of bookPaths) {
    const slug = sanitizeSlug(path.basename(bookPath, ".epub"))
    const screenshotsDir = path.join(OUTPUT_DIR, slug)
    await fs.mkdir(screenshotsDir, { recursive: true })

    const bookResult = {
      bookPath,
      slug,
      issues: [],
      interactions: [],
      diagnostics: {}
    }

    try {
      console.log(`BOOK_START ${slug}`)
      const initialSession = await openBookSession(browser, bookPath)
      bookResult.diagnostics.initial = await getReaderSnapshot(initialSession.page)
      const visualIssues = await detectVisibleTextIssues(initialSession.page)
      for (const issue of visualIssues) {
        bookResult.issues.push(issue)
      }
      bookResult.diagnostics.searchQuery = await deriveSearchQuery(initialSession.page)
      await closeBookSession(initialSession)

      await runInteraction(browser, bookPath, bookResult, "info-drawer", async (page) => {
        await page.getByRole("button", { name: "Info" }).click()
        await expectVisible(page.locator(".reader-diagnostics"))
        const text = await page.locator(".reader-diagnostics").textContent()
        if (!text?.includes("Backend")) {
          throw new Error("Diagnostics panel did not render backend details")
        }
      })

      await runInteraction(browser, bookPath, bookResult, "toc-navigation", async (page) => {
        await page.getByRole("button", { name: "TOC" }).click()
        await expectVisible(page.locator(".reading-drawer"))
        const tocLinks = page.locator(".toc-link")
        const count = await tocLinks.count()
        if (count < 2) {
          throw new Error(`TOC has only ${count} selectable entries`)
        }
        const before = await getReaderSnapshot(page)
        await tocLinks.nth(Math.min(3, count - 1)).click()
        await page.waitForTimeout(1200)
        const after = await getReaderSnapshot(page)
        if (
          before.pagination.currentPage === after.pagination.currentPage &&
          Math.abs(before.scrollTop - after.scrollTop) < 40
        ) {
          throw new Error("Selecting a non-initial TOC item did not move the reading position")
        }
      })

      await runInteraction(browser, bookPath, bookResult, "search-open-result-clear", async (page) => {
        await page.getByRole("button", { name: "Find" }).click()
        const input = page.getByPlaceholder("Search current book")
        await input.fill(bookResult.diagnostics.searchQuery)
        await page.getByRole("button", { name: "Search" }).click()
        const cards = page.locator(".search-card")
        await expectVisible(cards.first())
        const resultCount = await cards.count()
        bookResult.diagnostics.searchResultCount = resultCount
        if (resultCount < 1) {
          throw new Error("Search returned no results")
        }
        const before = await getReaderSnapshot(page)
        await cards.first().click()
        await page.waitForTimeout(1500)
        const after = await getReaderSnapshot(page)
        const overlayCount = await page.locator(".reader-viewport-overlay-rect.is-search-hit").count()
        if (
          overlayCount === 0 &&
          before.pagination.currentPage === after.pagination.currentPage &&
          Math.abs(before.scrollTop - after.scrollTop) < 40
        ) {
          throw new Error("Clicking the first search result did not navigate or expose a hit overlay")
        }

        await page.getByRole("button", { name: "Find" }).click()
        await page.locator(".drawer-search-stack").getByRole("button", { name: "Clear" }).click()
        await page.waitForTimeout(300)
        if (await cards.count()) {
          throw new Error("Search clear left stale result cards visible")
        }
      })

      await runInteraction(browser, bookPath, bookResult, "settings", async (page) => {
        await page.getByRole("button", { name: "Tune" }).click()
        await chooseSelect(page, "Theme", "Night")
        await chooseSelect(page, "Font Family", "Georgia")
        await chooseSelect(page, "Publisher Styles", "Disabled")
        await chooseSelect(page, "Experimental RTL", "Enabled")
        await setRangeByLabel(page, "Font Size", "22")
        await setRangeByLabel(page, "Letter Spacing", "1")
        await setRangeByLabel(page, "Word Spacing", "4")
        await expectReaderStable(page)
        await chooseSelect(page, "Experimental RTL", "Disabled")
        await chooseSelect(page, "Publisher Styles", "Enabled")
      })

      await runInteraction(browser, bookPath, bookResult, "paginated-navigation-bookmark", async (page) => {
        await page.getByRole("button", { name: "Tune" }).click()
        await chooseSelect(page, "Mode", "Paginated")
        await withTimeout(waitForMode(page, "paginated"), 10000, "Mode switch to paginated did not settle")
        await closeDrawerIfOpen(page)

        const initial = await getReaderSnapshot(page)
        if (initial.pagination.totalPages <= 1) {
          throw new Error("Book exposes only one paginated page")
        }

        const targetPage = Math.min(3, initial.pagination.totalPages)
        await page.locator(".page-input").fill(String(targetPage))
        await page.getByRole("button", { name: "Go" }).click()
        await withTimeout(waitForPage(page, targetPage), 10000, `Go did not land on page ${targetPage}`)
        await page.getByRole("button", { name: "Save" }).click()

        const jumpPage = Math.min(targetPage + 1, initial.pagination.totalPages)
        if (jumpPage === targetPage && targetPage > 1) {
          await page.getByRole("button", { name: "Previous" }).click()
          await withTimeout(
            waitForPage(page, targetPage - 1),
            10000,
            `Previous did not land on page ${targetPage - 1}`
          )
        } else if (jumpPage !== targetPage) {
          await page.getByRole("button", { name: "Next" }).click()
          await withTimeout(waitForPage(page, jumpPage), 10000, `Next did not land on page ${jumpPage}`)
        }

        await page.getByRole("button", { name: "Restore" }).click()
        await withTimeout(waitForPage(page, targetPage), 10000, `Restore did not return to page ${targetPage}`)

        const bookmarkStatus = await page.locator(".reading-surface-status").textContent()
        if (!bookmarkStatus?.includes("Bookmark restored")) {
          throw new Error(`Unexpected bookmark restore status: ${bookmarkStatus ?? "<empty>"}`)
        }
      })

      await runInteraction(browser, bookPath, bookResult, "selection-copy-highlight-clear", async (page) => {
        await navigateToContentPage(page)
        await selectVisibleText(page)
        await expectVisible(page.locator(".reader-selection-toolbar"))
        const selectedText = await page.evaluate(() => window.getSelection()?.toString() ?? "")
        if (selectedText.trim().length < 3) {
          throw new Error(`Selection too short: "${selectedText}"`)
        }

        await page.getByRole("button", { name: "Copy" }).click()
        await page.waitForTimeout(250)
        const clipboardText = await page.evaluate(async () => navigator.clipboard.readText())
        if (!clipboardText.includes(selectedText.trim().slice(0, 3))) {
          throw new Error(`Clipboard mismatch after copy: "${clipboardText}"`)
        }

        await selectVisibleText(page)
        await expectVisible(page.locator(".reader-selection-toolbar"))
        await page.locator(".reader-selection-toolbar").getByRole("button", { name: "Highlight" }).click()
        await page.waitForTimeout(500)
        const status = await page.locator(".reading-surface-status").textContent()
        if (!status?.includes("Highlight saved")) {
          throw new Error(`Highlight status missing after selection highlight: ${status ?? "<empty>"}`)
        }

        await page.getByRole("button", { name: "Clear" }).click()
        await page.waitForTimeout(250)
        const cleared = await page.locator(".reading-surface-status").textContent()
        if (!cleared?.includes("Highlights cleared")) {
          throw new Error(`Clear did not reset highlight status: ${cleared ?? "<empty>"}`)
        }
      })

      await runInteraction(browser, bookPath, bookResult, "return-to-scroll", async (page) => {
        await page.getByRole("button", { name: "Tune" }).click()
        await chooseSelect(page, "Mode", "Scroll")
        await waitForMode(page, "scroll")
        await expectReaderStable(page)
      })
    } catch (error) {
      bookResult.issues.push({
        kind: "fatal",
        message: normalizeError(error)
      })
    } finally {
      console.log(`BOOK_END ${slug}`)
      summary.books.push(bookResult)
    }
  }
} finally {
  await browser.close()
}

const outputPath = path.join(OUTPUT_DIR, "summary.json")
await fs.writeFile(outputPath, JSON.stringify(summary, null, 2))
console.log(JSON.stringify({ outputPath, books: summary.books.length }, null, 2))

async function runInteraction(browser, bookPath, bookResult, name, fn) {
  const entry = { name, status: "passed", details: null }
  const session = await openBookSession(browser, bookPath)
  try {
    console.log(`INTERACTION_START ${bookResult.slug} ${name}`)
    await closeDrawerIfOpen(session.page)
    await withTimeout(fn(session.page), INTERACTION_TIMEOUT_MS, `${name} timed out after ${INTERACTION_TIMEOUT_MS}ms`)
    await closeDrawerIfOpen(session.page)
    console.log(`INTERACTION_PASS ${bookResult.slug} ${name}`)
  } catch (error) {
    entry.status = "failed"
    entry.details = normalizeError(error)
    console.log(`INTERACTION_FAIL ${bookResult.slug} ${name} ${entry.details}`)
    bookResult.issues.push({
      kind: "interaction",
      interaction: name,
      message: entry.details
    })
    const screenshotPath = path.join(OUTPUT_DIR, bookResult.slug, `${name}.png`)
    await session.page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {})
    await closeDrawerIfOpen(session.page).catch(() => {})
  } finally {
    await closeBookSession(session)
  }
  bookResult.interactions.push(entry)
}

async function openBookSession(browser, bookPath) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2
  })
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: APP_URL
  })
  const page = await context.newPage()
  await page.goto(APP_URL)
  await page.locator('input[type="file"]').setInputFiles(bookPath)
  await waitForReaderReady(page)
  return { context, page }
}

async function closeBookSession(session) {
  await session.page.close().catch(() => {})
  await session.context.close().catch(() => {})
}

async function waitForReaderReady(page) {
  await page.waitForFunction(() => {
    const chips = Array.from(document.querySelectorAll(".reading-fact-chip"))
      .map((node) => node.textContent?.trim() ?? "")
    const pageChip = chips.find((text) => /page\s+\d+\s+of\s+\d+/i.test(text))
    return Boolean(pageChip && document.querySelector(".reader-root"))
  }, undefined, { timeout: 30000 })
  await page.waitForTimeout(1200)
}

async function getReaderSnapshot(page) {
  return page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll(".reading-fact-chip"))
      .map((node) => node.textContent?.trim() ?? "")
    const pageChip = chips.find((text) => /page\s+\d+\s+of\s+\d+/i.test(text)) ?? ""
    const match = pageChip.match(/page\s+(\d+)\s+of\s+(\d+)/i)
    const root = document.querySelector(".reader-root")
    return {
      mode: chips[0] ?? "",
      pagination: {
        currentPage: match ? Number(match[1]) : 0,
        totalPages: match ? Number(match[2]) : 0
      },
      scrollTop: root instanceof HTMLElement ? root.scrollTop : 0,
      renderBackend: pageChip.split("/")[0]?.trim() ?? "",
      searchOverlayCount: document.querySelectorAll(".reader-viewport-overlay-rect.is-search-hit").length
    }
  })
}

async function deriveSearchQuery(page) {
  const candidate = await page.evaluate(() => {
    const textSelectors = [
      ".epub-text-run",
      ".reader-root p",
      ".reader-root li",
      ".reader-root td",
      ".reader-root th",
      ".reader-root h1",
      ".reader-root h2",
      ".reader-root h3",
      ".reader-root h4",
      ".reader-root h5",
      ".reader-root h6",
      ".reader-root blockquote",
      ".reader-root span"
    ]

    const texts = Array.from(document.querySelectorAll(textSelectors.join(",")))
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((text) => text.length >= 4)

    for (const text of texts) {
      const cjk = text.replace(/[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, "")
      if (cjk.length >= 4) {
        return cjk.slice(0, 4)
      }
      const latinWord = text.match(/[A-Za-z][A-Za-z0-9#.+-]{3,}/)?.[0]
      if (latinWord) {
        return latinWord
      }
    }

    return texts[0] ?? "第1章"
  })

  return candidate
}

async function chooseSelect(page, label, optionLabel) {
  const shell = page.locator(".field-shell", {
    has: page.locator(".field-label", { hasText: label })
  })
  await shell.locator(".custom-select-trigger").click()
  await shell.locator(".custom-select-option", { hasText: optionLabel }).click()
  await page.waitForTimeout(300)
}

async function setRangeByLabel(page, label, value) {
  const shell = page.locator(".field-shell", {
    has: page.locator(".field-label", { hasText: label })
  })
  await shell.locator('input[type="range"]').evaluate((input, nextValue) => {
    input.value = String(nextValue)
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new Event("change", { bubbles: true }))
  }, value)
  await page.waitForTimeout(400)
}

async function waitForMode(page, expectedMode) {
  await page.waitForFunction((value) => {
    const chip = document.querySelector(".reading-fact-chip")
    return chip?.textContent?.trim() === value
  }, expectedMode, { timeout: 10000 })
  await page.waitForTimeout(600)
}

async function waitForPage(page, expectedPage) {
  await page.waitForFunction((pageNumber) => {
    const chips = Array.from(document.querySelectorAll(".reading-fact-chip"))
      .map((node) => node.textContent?.trim() ?? "")
    const pageChip = chips.find((text) => /page\s+\d+\s+of\s+\d+/i.test(text))
    if (!pageChip) {
      return false
    }
    const match = pageChip.match(/page\s+(\d+)\s+of\s+\d+/i)
    return match ? Number(match[1]) === pageNumber : false
  }, expectedPage, { timeout: 10000 })
  await page.waitForTimeout(400)
}

async function expectReaderStable(page) {
  await page.waitForFunction(() => {
    const chip = Array.from(document.querySelectorAll(".reading-fact-chip"))
      .map((node) => node.textContent?.trim() ?? "")
      .find((text) => /page\s+\d+\s+of\s+\d+/i.test(text))
    return Boolean(chip && document.querySelector(".reader-root"))
  }, undefined, { timeout: 10000 })
}

async function expectVisible(locator) {
  await locator.waitFor({ state: "visible", timeout: 10000 })
}

async function selectVisibleText(page) {
  const selected = await page.evaluate(() => {
    const root = document.querySelector(".reader-root")
    if (!(root instanceof HTMLElement)) {
      return ""
    }

    const findFirstTextNode = (node) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
      let current = walker.nextNode()
      while (current) {
        const value = current.textContent?.trim() ?? ""
        if (value.length >= 6) {
          return current
        }
        current = walker.nextNode()
      }
      return null
    }

    const rootRect = root.getBoundingClientRect()
    const uiSelectors = [
      ".reading-topbar",
      ".reading-drawer",
      ".reader-toolbar",
      ".reading-action-rail"
    ]
    const candidateSelectors = [
      ".epub-text-run",
      ".reader-root p",
      ".reader-root li",
      ".reader-root td",
      ".reader-root th",
      ".reader-root h1",
      ".reader-root h2",
      ".reader-root h3",
      ".reader-root h4",
      ".reader-root h5",
      ".reader-root h6",
      ".reader-root blockquote",
      ".reader-root span"
    ]
    const target = Array.from(document.querySelectorAll(candidateSelectors.join(","))).find((node) => {
      if (!(node instanceof HTMLElement)) {
        return false
      }
      if (uiSelectors.some((selector) => node.closest(selector))) {
        return false
      }
      const text = node.textContent?.trim() ?? ""
      const rect = node.getBoundingClientRect()
      return (
        text.length >= 6 &&
        rect.width > 40 &&
        rect.bottom > rootRect.top + 40 &&
        rect.top < rootRect.bottom - 40
      )
    })

    if (!(target instanceof HTMLElement)) {
      return ""
    }

    const textNode = findFirstTextNode(target)
    if (!textNode) {
      return ""
    }

    const rawText = textNode.textContent ?? ""
    const endOffset = Math.min(rawText.length, 6)
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, endOffset)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    return selection?.toString() ?? ""
  })

  if (!selected) {
    throw new Error("Failed to create a visible text selection")
  }

  await page.waitForTimeout(400)
}

async function detectVisibleTextIssues(page) {
  return page.evaluate(() => {
    const issues = []
    const root = document.querySelector(".reader-root")
    if (!(root instanceof HTMLElement)) {
      return issues
    }
    const containerRect = root.getBoundingClientRect()
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")
    if (!context) {
      return issues
    }

    const visibleRuns = Array.from(document.querySelectorAll(".epub-text-run"))
      .filter((node) => node instanceof HTMLElement)
      .map((node) => {
        if (!(node instanceof HTMLElement)) {
          return null
        }
        const rect = node.getBoundingClientRect()
        return {
          text: node.textContent ?? "",
          left: rect.left,
          top: rect.top,
          width: rect.width,
          font: node.style.font
        }
      })
      .filter(Boolean)
      .filter((run) => run.top < containerRect.bottom && run.top + 20 > containerRect.top)

    for (const run of visibleRuns) {
      context.font = run.font
      const measuredWidth = context.measureText(run.text).width
      const overflow = measuredWidth - run.width
      if (overflow > 4) {
        issues.push({
          kind: "render",
          message: `Visible text width overflow ${overflow.toFixed(2)}px for "${run.text.slice(0, 40)}"`
        })
        break
      }
    }

    const duplicates = []
    for (let index = 0; index < visibleRuns.length; index += 1) {
      const current = visibleRuns[index]
      for (let nextIndex = index + 1; nextIndex < visibleRuns.length; nextIndex += 1) {
        const next = visibleRuns[nextIndex]
        if (
          current.text &&
          current.text === next.text &&
          Math.abs(current.left - next.left) < 1 &&
          Math.abs(current.top - next.top) < 0.5
        ) {
          duplicates.push(current.text)
          break
        }
      }
    }
    if (duplicates.length) {
      issues.push({
        kind: "render",
        message: `Near-duplicate visible text runs detected: ${duplicates.slice(0, 3).join(" | ")}`
      })
    }

    return issues
  })
}

async function closeDrawerIfOpen(page) {
  const closeButton = page.getByRole("button", { name: "Close drawer" })
  if (await closeButton.count()) {
    const visible = await closeButton.first().isVisible().catch(() => false)
    if (visible) {
      await closeButton.first().click()
      await page.waitForTimeout(250)
    }
  }
}

async function navigateToContentPage(page) {
  const tocButton = page.getByRole("button", { name: "TOC" })
  if (!(await tocButton.isVisible().catch(() => false))) {
    return
  }

  await tocButton.click()
  await expectVisible(page.locator(".reading-drawer"))
  const tocLinks = page.locator(".toc-link")
  const count = await tocLinks.count()
  if (count >= 2) {
    await tocLinks.nth(Math.min(3, count - 1)).click()
    await page.waitForTimeout(1200)
    return
  }

  await closeDrawerIfOpen(page)
}

function normalizeError(error) {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function sanitizeSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

async function withTimeout(promise, timeoutMs, message) {
  let timeoutId
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
      })
    ])
  } finally {
    clearTimeout(timeoutId)
  }
}
